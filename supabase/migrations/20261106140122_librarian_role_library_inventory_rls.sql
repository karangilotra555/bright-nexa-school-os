-- Dedicated tenant-isolated library permission boundary for School OS.
ALTER TABLE public.school_users DROP CONSTRAINT school_users_role_check;
ALTER TABLE public.school_users ADD CONSTRAINT school_users_role_check
CHECK (role IN ('school_admin','principal','teacher','accountant','receptionist','transport_staff','librarian'));

ALTER TABLE public.school_role_module_permissions DROP CONSTRAINT school_role_module_permissions_role_check;
ALTER TABLE public.school_role_module_permissions ADD CONSTRAINT school_role_module_permissions_role_check
CHECK (role IN ('teacher','accountant','receptionist','transport_staff','librarian'));
INSERT INTO public.school_role_module_permissions(institution_id,role,module_key,enabled)
SELECT id,'librarian',item,false FROM public.institutions
CROSS JOIN (VALUES('classes'),('attendance'),('homework'),('notices'),('profiles')) keys(item)
ON CONFLICT (institution_id,role,module_key) DO NOTHING;

-- Librarians need a minimal student lookup for issuing books; the record
-- remains tenant-scoped, and profiles, fees and attendance remain denied.
DROP POLICY role_guard_students_read ON public.school_students;
CREATE POLICY role_guard_students_read ON public.school_students
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
 school_private.staff_module_enabled(institution_id,'classes')
 OR school_private.staff_module_enabled(institution_id,'attendance')
 OR school_private.staff_module_enabled(institution_id,'profiles')
 OR school_private.has_role(institution_id,ARRAY['librarian'])
);
CREATE POLICY school_librarian_student_lookup ON public.school_students
FOR SELECT TO authenticated USING (school_private.has_role(institution_id,ARRAY['librarian']));

CREATE TABLE public.school_library_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
 accession_no text NOT NULL CHECK (length(btrim(accession_no)) BETWEEN 1 AND 64),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
 author text NOT NULL DEFAULT '',
 isbn text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(institution_id,id), UNIQUE(institution_id,accession_no)
);
CREATE TABLE public.school_library_loans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL,
 student_id uuid NOT NULL,
 issued_on date NOT NULL DEFAULT current_date,
 due_on date NOT NULL,
 returned_on date,
 issued_by uuid NOT NULL,
 returned_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (due_on >= issued_on),
 CHECK (returned_on IS NULL OR returned_on >= issued_on),
 CHECK ((returned_on IS NULL AND returned_by IS NULL) OR (returned_on IS NOT NULL AND returned_by IS NOT NULL)),
 FOREIGN KEY(item_id,institution_id) REFERENCES public.school_library_items(id,institution_id) ON DELETE RESTRICT,
 FOREIGN KEY(student_id,institution_id) REFERENCES public.school_students(id,institution_id) ON DELETE RESTRICT,
 FOREIGN KEY(issued_by,institution_id) REFERENCES public.school_users(id,institution_id) ON DELETE RESTRICT,
 FOREIGN KEY(returned_by,institution_id) REFERENCES public.school_users(id,institution_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX school_library_one_active_loan ON public.school_library_loans(item_id) WHERE returned_on IS NULL;
CREATE INDEX school_library_loans_student_idx ON public.school_library_loans(institution_id,student_id);
CREATE INDEX school_library_loans_due_idx ON public.school_library_loans(institution_id,due_on) WHERE returned_on IS NULL;

ALTER TABLE public.school_library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_library_loans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_library_items,public.school_library_loans FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.school_library_items,public.school_library_loans TO authenticated;

CREATE POLICY library_items_read ON public.school_library_items FOR SELECT TO authenticated USING (
 school_private.has_role(institution_id,ARRAY['school_admin','principal','librarian'])
 OR EXISTS (SELECT 1 FROM public.school_library_loans l WHERE l.institution_id=school_library_items.institution_id AND l.item_id=school_library_items.id AND school_private.parent_of(l.student_id,l.institution_id))
);
CREATE POLICY library_items_insert ON public.school_library_items FOR INSERT TO authenticated
WITH CHECK (school_private.has_role(institution_id,ARRAY['school_admin','librarian']));
CREATE POLICY library_items_update ON public.school_library_items FOR UPDATE TO authenticated
USING (school_private.has_role(institution_id,ARRAY['school_admin','librarian']))
WITH CHECK (school_private.has_role(institution_id,ARRAY['school_admin','librarian']));

CREATE POLICY library_loans_read ON public.school_library_loans FOR SELECT TO authenticated USING (
 school_private.has_role(institution_id,ARRAY['school_admin','principal','librarian'])
 OR school_private.parent_of(student_id,institution_id)
);
CREATE POLICY library_loans_insert ON public.school_library_loans FOR INSERT TO authenticated WITH CHECK (
 school_private.has_role(institution_id,ARRAY['school_admin','librarian'])
 AND EXISTS (SELECT 1 FROM public.school_users u WHERE u.id=issued_by AND u.institution_id=school_library_loans.institution_id AND u.auth_user_id=auth.uid() AND u.status='active' AND u.role IN ('school_admin','librarian'))
);
CREATE POLICY library_loans_update ON public.school_library_loans FOR UPDATE TO authenticated
USING (school_private.has_role(institution_id,ARRAY['school_admin','librarian']))
WITH CHECK (school_private.has_role(institution_id,ARRAY['school_admin','librarian']));

-- Immutable history and return-only loan updates: an authorized user can
-- never edit the borrower, date, inventory ID, school ID or issuer afterward.
CREATE FUNCTION public.school_library_loan_insert_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.returned_on IS NOT NULL OR NEW.returned_by IS NOT NULL THEN
   RAISE EXCEPTION 'A new book loan cannot be pre-returned';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.school_library_items i WHERE i.id=NEW.item_id AND i.institution_id=NEW.institution_id AND i.status='active') THEN
   RAISE EXCEPTION 'Only an active inventory item can be issued';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.school_students s WHERE s.id=NEW.student_id AND s.institution_id=NEW.institution_id AND s.status='active') THEN
   RAISE EXCEPTION 'Only an active enrolled student can borrow a book';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER school_library_loan_insert_check BEFORE INSERT ON public.school_library_loans
FOR EACH ROW EXECUTE FUNCTION public.school_library_loan_insert_guard();
CREATE FUNCTION public.school_library_loan_update_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (NEW.institution_id,NEW.item_id,NEW.student_id,NEW.issued_on,NEW.due_on,NEW.issued_by) IS DISTINCT FROM
    (OLD.institution_id,OLD.item_id,OLD.student_id,OLD.issued_on,OLD.due_on,OLD.issued_by) THEN
   RAISE EXCEPTION 'Issued loan records are immutable except for returning the book';
 END IF;
 IF OLD.returned_on IS NOT NULL OR NEW.returned_on IS NULL THEN
   RAISE EXCEPTION 'Only a currently issued book can be returned';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.school_users u WHERE u.id=NEW.returned_by AND u.institution_id=NEW.institution_id AND u.auth_user_id=auth.uid() AND u.status='active' AND u.role IN ('school_admin','librarian')) THEN
   RAISE EXCEPTION 'Book returns require an active library staff session';
 END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER school_library_loan_return_check BEFORE UPDATE ON public.school_library_loans
FOR EACH ROW EXECUTE FUNCTION public.school_library_loan_update_guard();
CREATE FUNCTION public.school_library_item_update_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.institution_id IS DISTINCT FROM NEW.institution_id THEN
   RAISE EXCEPTION 'Library inventory identity cannot be changed';
 END IF;
 IF NEW.status='withdrawn' AND EXISTS (SELECT 1 FROM public.school_library_loans l WHERE l.item_id=OLD.id AND l.returned_on IS NULL) THEN
   RAISE EXCEPTION 'Return the borrowed book before retiring it';
 END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER school_library_item_update_check BEFORE UPDATE ON public.school_library_items
FOR EACH ROW EXECUTE FUNCTION public.school_library_item_update_guard();

COMMENT ON TABLE public.school_library_items IS 'One row per physical book copy. Supabase is authoritative. School-scoped librarians may issue books, not delete history.';
COMMENT ON TABLE public.school_library_loans IS 'Append-only loans with return-only state change; unique active loan per copy.';
