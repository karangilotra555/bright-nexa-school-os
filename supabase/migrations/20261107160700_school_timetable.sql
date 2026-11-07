-- Bright Nexa: class/teacher timetable and published student view.
-- Additive only. Does not import, overwrite, or alter existing student records.
BEGIN;
CREATE TABLE IF NOT EXISTS public.school_timetable_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
 weekday smallint NOT NULL CHECK(weekday BETWEEN 1 AND 6),
 period_no smallint NOT NULL CHECK(period_no BETWEEN 1 AND 14),
 starts_at time NOT NULL,
 ends_at time NOT NULL,
 kind text NOT NULL DEFAULT 'lesson' CHECK(kind IN ('lesson','break','assembly')),
 label text NOT NULL DEFAULT '',
 CHECK(starts_at<ends_at),
 UNIQUE(institution_id,weekday,period_no),
 UNIQUE(id,institution_id)
);
CREATE TABLE IF NOT EXISTS public.school_timetable_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
 class_id uuid NOT NULL,
 period_id uuid NOT NULL,
 subject text NOT NULL CHECK(length(btrim(subject)) BETWEEN 1 AND 90),
 teacher_user_id uuid,
 room text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(class_id,institution_id) REFERENCES public.school_classes(id,institution_id) ON DELETE CASCADE,
 FOREIGN KEY(period_id,institution_id) REFERENCES public.school_timetable_periods(id,institution_id) ON DELETE CASCADE,
 FOREIGN KEY(teacher_user_id,institution_id) REFERENCES public.school_users(id,institution_id),
 UNIQUE(institution_id,class_id,period_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bn_timetable_teacher_no_double_book
 ON public.school_timetable_slots(institution_id,period_id,teacher_user_id)
 WHERE teacher_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bn_timetable_room_no_double_book
 ON public.school_timetable_slots(institution_id,period_id,lower(btrim(room)))
 WHERE nullif(btrim(room),'') IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.school_timetable_publications (
 institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
 class_id uuid NOT NULL,
 published boolean NOT NULL DEFAULT false,
 published_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(institution_id,class_id),
 FOREIGN KEY(class_id,institution_id) REFERENCES public.school_classes(id,institution_id) ON DELETE CASCADE
);

-- School-wide period definitions cannot overlap. Advisory transaction lock
-- serializes competing edits across different periods within one school/day.
CREATE OR REPLACE FUNCTION public.bn_timetable_guard_period() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('bn_timetable_period'),hashtext(NEW.institution_id::text||':'||NEW.weekday::text));
 IF EXISTS(
  SELECT 1 FROM public.school_timetable_periods p
  WHERE p.institution_id=NEW.institution_id AND p.weekday=NEW.weekday AND p.id<>NEW.id
    AND NEW.starts_at<p.ends_at AND p.starts_at<NEW.ends_at
 ) THEN RAISE EXCEPTION 'Period overlaps another school period.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS bn_timetable_period_guard ON public.school_timetable_periods;
CREATE TRIGGER bn_timetable_period_guard BEFORE INSERT OR UPDATE ON public.school_timetable_periods
FOR EACH ROW EXECUTE FUNCTION public.bn_timetable_guard_period();

-- Timetable entries may only use lesson periods and an ACTIVE class teacher
-- or active subject teacher assigned to this same classroom and subject.
CREATE OR REPLACE FUNCTION public.bn_timetable_guard_slot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k text;
BEGIN
 SELECT p.kind INTO k FROM public.school_timetable_periods p
  WHERE p.id=NEW.period_id AND p.institution_id=NEW.institution_id;
 IF k IS DISTINCT FROM 'lesson' THEN
  RAISE EXCEPTION 'Timetable lessons must use a lesson period.' USING ERRCODE='23514';
 END IF;
 IF NEW.teacher_user_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.school_users u
  JOIN public.school_teacher_assignments a ON a.school_user_id=u.id AND a.institution_id=u.institution_id
  WHERE u.id=NEW.teacher_user_id AND u.institution_id=NEW.institution_id
    AND u.role='teacher' AND u.status='active'
    AND a.class_id=NEW.class_id AND a.active=true
    AND (a.assignment_type='class_teacher'
      OR (a.assignment_type='subject_teacher' AND lower(btrim(a.subject))=lower(btrim(NEW.subject))))
 ) THEN RAISE EXCEPTION 'Teacher is not assigned to this class and subject.' USING ERRCODE='23514'; END IF;
 NEW.updated_at=now();
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS bn_timetable_slot_guard ON public.school_timetable_slots;
CREATE TRIGGER bn_timetable_slot_guard BEFORE INSERT OR UPDATE ON public.school_timetable_slots
FOR EACH ROW EXECUTE FUNCTION public.bn_timetable_guard_slot();

-- Any slot edit unpublishes only the affected class. School-wide period edits
-- unpublish every class, so no unreviewed change reaches parents.
CREATE OR REPLACE FUNCTION public.bn_timetable_unpublish_slot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE public.school_timetable_publications SET published=false,published_at=null,updated_at=now()
 WHERE institution_id=COALESCE(NEW.institution_id,OLD.institution_id)
   AND class_id=COALESCE(NEW.class_id,OLD.class_id);
 RETURN NULL;
END;$$;
DROP TRIGGER IF EXISTS bn_timetable_slot_unpublish ON public.school_timetable_slots;
CREATE TRIGGER bn_timetable_slot_unpublish AFTER INSERT OR UPDATE OR DELETE ON public.school_timetable_slots
FOR EACH ROW EXECUTE FUNCTION public.bn_timetable_unpublish_slot();

CREATE OR REPLACE FUNCTION public.bn_timetable_unpublish_period() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE public.school_timetable_publications SET published=false,published_at=null,updated_at=now()
 WHERE institution_id=COALESCE(NEW.institution_id,OLD.institution_id);
 RETURN NULL;
END;$$;
DROP TRIGGER IF EXISTS bn_timetable_period_unpublish ON public.school_timetable_periods;
CREATE TRIGGER bn_timetable_period_unpublish AFTER INSERT OR UPDATE OR DELETE ON public.school_timetable_periods
FOR EACH ROW EXECUTE FUNCTION public.bn_timetable_unpublish_period();

CREATE OR REPLACE FUNCTION public.bn_timetable_stamp_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 NEW.updated_at=now();
 NEW.published_at=CASE WHEN NEW.published THEN now() ELSE null END;
 IF NEW.published AND NOT EXISTS(
   SELECT 1 FROM public.school_timetable_slots s WHERE s.institution_id=NEW.institution_id AND s.class_id=NEW.class_id
 ) THEN RAISE EXCEPTION 'Cannot publish an empty class timetable.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS bn_timetable_publication_stamp ON public.school_timetable_publications;
CREATE TRIGGER bn_timetable_publication_stamp BEFORE INSERT OR UPDATE ON public.school_timetable_publications
FOR EACH ROW EXECUTE FUNCTION public.bn_timetable_stamp_publication();

-- All mutations confined to school administrators. Teachers get only their
-- assigned timetable entries; parents get a separate tenant+child-checked RPC.
ALTER TABLE public.school_timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_timetable_publications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bn_timetable_period_staff_read ON public.school_timetable_periods;
CREATE POLICY bn_timetable_period_staff_read ON public.school_timetable_periods FOR SELECT TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin','principal','teacher']));
DROP POLICY IF EXISTS bn_timetable_period_owner_all ON public.school_timetable_periods;
CREATE POLICY bn_timetable_period_owner_all ON public.school_timetable_periods FOR ALL TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin']))
 WITH CHECK (school_private.has_role(institution_id,ARRAY['school_admin']));
DROP POLICY IF EXISTS bn_timetable_slot_staff_read ON public.school_timetable_slots;
CREATE POLICY bn_timetable_slot_staff_read ON public.school_timetable_slots FOR SELECT TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin','principal'])
    OR EXISTS(SELECT 1 FROM public.school_users u WHERE u.id=teacher_user_id
       AND u.institution_id=school_timetable_slots.institution_id
       AND u.auth_user_id=(SELECT auth.uid()) AND u.status='active' AND u.role='teacher'));
DROP POLICY IF EXISTS bn_timetable_slot_owner_all ON public.school_timetable_slots;
CREATE POLICY bn_timetable_slot_owner_all ON public.school_timetable_slots FOR ALL TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin']))
 WITH CHECK (school_private.has_role(institution_id,ARRAY['school_admin']));
DROP POLICY IF EXISTS bn_timetable_publish_read ON public.school_timetable_publications;
CREATE POLICY bn_timetable_publish_read ON public.school_timetable_publications FOR SELECT TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin','principal']));
DROP POLICY IF EXISTS bn_timetable_publish_owner_all ON public.school_timetable_publications;
CREATE POLICY bn_timetable_publish_owner_all ON public.school_timetable_publications FOR ALL TO authenticated
 USING (school_private.has_role(institution_id,ARRAY['school_admin']))
 WITH CHECK (school_private.has_role(institution_id,ARRAY['school_admin']));
REVOKE ALL ON public.school_timetable_periods,public.school_timetable_slots,public.school_timetable_publications FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_timetable_periods,public.school_timetable_slots TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_timetable_publications TO authenticated;

CREATE OR REPLACE FUNCTION public.bn_portal_class_timetable(p_institution_id uuid,p_student_id uuid)
RETURNS TABLE(weekday smallint,period_no smallint,day text,starts_at time,ends_at time,
 kind text,subject text,room text,teacher_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.weekday,p.period_no,
 (ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[p.weekday]::text,
 p.starts_at,p.ends_at,p.kind,
 CASE WHEN p.kind='lesson' THEN s.subject ELSE p.label END,
 CASE WHEN p.kind='lesson' THEN s.room ELSE NULL END,
 CASE WHEN p.kind='lesson' THEN COALESCE(nullif(btrim(u.display_name),''),'Assigned teacher') ELSE NULL END
 FROM public.school_students st
 JOIN public.school_timetable_publications pub ON pub.class_id=st.class_id
   AND pub.institution_id=st.institution_id AND pub.published=true
 JOIN public.school_timetable_periods p ON p.institution_id=st.institution_id
 LEFT JOIN public.school_timetable_slots s ON s.period_id=p.id AND s.class_id=st.class_id
   AND s.institution_id=st.institution_id
 LEFT JOIN public.school_users u ON u.id=s.teacher_user_id AND u.institution_id=s.institution_id
 WHERE (SELECT auth.uid()) IS NOT NULL AND school_private.parent_of(p_student_id,p_institution_id)
   AND st.id=p_student_id AND st.institution_id=p_institution_id AND st.status='active'
   AND (p.kind<>'lesson' OR s.id IS NOT NULL)
 ORDER BY p.weekday,p.period_no;
$$;
REVOKE ALL ON FUNCTION public.bn_portal_class_timetable(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bn_portal_class_timetable(uuid,uuid) TO authenticated;
COMMIT;
