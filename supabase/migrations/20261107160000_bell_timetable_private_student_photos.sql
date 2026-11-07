-- Bright Nexa: tenant-scoped school timetable, publish boundary and private student photos.
-- Additive DDL only. Does not touch existing student, class, fee or profile rows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.school_timetable_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id),
 academic_year text NOT NULL CHECK (char_length(btrim(academic_year)) BETWEEN 3 AND 24),
 weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 6),
 slot_index smallint NOT NULL CHECK (slot_index BETWEEN 1 AND 16),
 label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 60),
 kind text NOT NULL CHECK (kind IN ('period','break','assembly','lunch','activity')),
 starts_at time NOT NULL,
 ends_at time NOT NULL,
 CHECK(ends_at > starts_at),
 UNIQUE(institution_id,academic_year,weekday,slot_index),
 UNIQUE(id,institution_id)
);

CREATE TABLE IF NOT EXISTS public.school_timetable_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id),
 class_id uuid NOT NULL,
 slot_id uuid NOT NULL,
 academic_year text NOT NULL,
 subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 100),
 teacher_user_id uuid,
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes)<=250),
 CONSTRAINT bn_draft_class_tenant FOREIGN KEY(class_id,institution_id)
   REFERENCES public.school_classes(id,institution_id),
 CONSTRAINT bn_draft_slot_tenant FOREIGN KEY(slot_id,institution_id)
   REFERENCES public.school_timetable_slots(id,institution_id),
 CONSTRAINT bn_draft_teacher FOREIGN KEY(teacher_user_id,institution_id)
   REFERENCES public.school_users(id,institution_id),
 UNIQUE (institution_id,class_id,slot_id),
 UNIQUE (institution_id,slot_id,teacher_user_id)
);

CREATE TABLE IF NOT EXISTS public.school_timetable_subject_loads (
 institution_id uuid NOT NULL REFERENCES public.institutions(id),
 class_id uuid NOT NULL,
 academic_year text NOT NULL,
 teacher_user_id uuid NOT NULL,
 subject text NOT NULL CHECK(char_length(btrim(subject)) BETWEEN 1 AND 100),
 periods_per_week smallint NOT NULL CHECK(periods_per_week BETWEEN 1 AND 72),
 FOREIGN KEY(class_id,institution_id) REFERENCES public.school_classes(id,institution_id),
 FOREIGN KEY(teacher_user_id,institution_id) REFERENCES public.school_users(id,institution_id),
 PRIMARY KEY(institution_id,class_id,academic_year,teacher_user_id,subject)
);

CREATE TABLE IF NOT EXISTS public.school_timetable_published (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id),
 class_id uuid NOT NULL,
 slot_id uuid NOT NULL,
 academic_year text NOT NULL,
 subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 100),
 teacher_user_id uuid,
 notes text NOT NULL DEFAULT '',
 published_at timestamptz NOT NULL DEFAULT now(),
 published_by uuid,
 CONSTRAINT bn_pub_class_tenant FOREIGN KEY(class_id,institution_id)
   REFERENCES public.school_classes(id,institution_id),
 CONSTRAINT bn_pub_slot_tenant FOREIGN KEY(slot_id,institution_id)
   REFERENCES public.school_timetable_slots(id,institution_id),
 CONSTRAINT bn_pub_teacher FOREIGN KEY(teacher_user_id,institution_id)
   REFERENCES public.school_users(id,institution_id),
 UNIQUE (institution_id,class_id,slot_id),
 UNIQUE (institution_id,slot_id,teacher_user_id)
);

CREATE INDEX IF NOT EXISTS bn_timetable_drafts_class ON public.school_timetable_drafts(institution_id,class_id);
CREATE INDEX IF NOT EXISTS bn_timetable_published_class ON public.school_timetable_published(institution_id,class_id);
CREATE INDEX IF NOT EXISTS bn_timetable_published_teacher ON public.school_timetable_published(institution_id,teacher_user_id);

ALTER TABLE public.school_timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_timetable_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_timetable_subject_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_timetable_published ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_timetable_slots TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_timetable_drafts TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_timetable_subject_loads TO authenticated;
GRANT SELECT ON public.school_timetable_published TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.school_timetable_published FROM authenticated,anon,public;

CREATE POLICY bn_tt_slots_read ON public.school_timetable_slots FOR SELECT TO authenticated USING (
 school_private.has_role(institution_id,ARRAY['school_admin','principal','teacher'])
 OR EXISTS (SELECT 1 FROM public.school_students s
    WHERE s.institution_id=school_timetable_slots.institution_id
      AND school_private.parent_of(s.id,s.institution_id))
);
CREATE POLICY bn_tt_slots_admin_insert ON public.school_timetable_slots FOR INSERT TO authenticated WITH CHECK (
 school_private.has_role(institution_id,ARRAY['school_admin'])
);
CREATE POLICY bn_tt_slots_admin_update ON public.school_timetable_slots FOR UPDATE TO authenticated
 USING(school_private.has_role(institution_id,ARRAY['school_admin']))
 WITH CHECK(school_private.has_role(institution_id,ARRAY['school_admin']));
CREATE POLICY bn_tt_slots_admin_delete ON public.school_timetable_slots FOR DELETE TO authenticated
 USING(school_private.has_role(institution_id,ARRAY['school_admin']));

CREATE POLICY bn_tt_load_owner ON public.school_timetable_subject_loads FOR ALL TO authenticated
 USING(school_private.has_role(institution_id,ARRAY['school_admin']))
 WITH CHECK(school_private.has_role(institution_id,ARRAY['school_admin']));

CREATE POLICY bn_tt_draft_owner_read ON public.school_timetable_drafts FOR SELECT TO authenticated USING(
 school_private.has_role(institution_id,ARRAY['school_admin'])
);
CREATE POLICY bn_tt_draft_owner_insert ON public.school_timetable_drafts FOR INSERT TO authenticated WITH CHECK(
 school_private.has_role(institution_id,ARRAY['school_admin'])
);
CREATE POLICY bn_tt_draft_owner_update ON public.school_timetable_drafts FOR UPDATE TO authenticated
 USING(school_private.has_role(institution_id,ARRAY['school_admin']))
 WITH CHECK(school_private.has_role(institution_id,ARRAY['school_admin']));
CREATE POLICY bn_tt_draft_owner_delete ON public.school_timetable_drafts FOR DELETE TO authenticated
 USING(school_private.has_role(institution_id,ARRAY['school_admin']));

CREATE POLICY bn_tt_published_read ON public.school_timetable_published FOR SELECT TO authenticated USING(
 school_private.has_role(institution_id,ARRAY['school_admin','principal'])
 OR EXISTS (SELECT 1 FROM public.school_students s
    WHERE s.institution_id=school_timetable_published.institution_id
      AND s.class_id=school_timetable_published.class_id
      AND school_private.parent_of(s.id,s.institution_id))
 OR school_private.teacher_can(institution_id,class_id,'roster.read','')
);

-- Do not allow any slot to overlap another on the same weekday.
CREATE OR REPLACE FUNCTION public.bn_timetable_check_slot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('timetable:'||NEW.institution_id::text||':'||NEW.academic_year||':'||NEW.weekday::text));
 IF TG_OP='UPDATE' AND (
     OLD.starts_at IS DISTINCT FROM NEW.starts_at OR OLD.ends_at IS DISTINCT FROM NEW.ends_at
     OR OLD.weekday IS DISTINCT FROM NEW.weekday OR OLD.academic_year IS DISTINCT FROM NEW.academic_year
     OR OLD.kind IS DISTINCT FROM NEW.kind
   ) AND (
     EXISTS(SELECT 1 FROM public.school_timetable_drafts d WHERE d.slot_id=OLD.id)
     OR EXISTS(SELECT 1 FROM public.school_timetable_published p WHERE p.slot_id=OLD.id)
   )
 THEN RAISE EXCEPTION 'Bell slot is used in a timetable. Clear its draft/approved lessons before changing timings.' USING errcode='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_timetable_slots s
           WHERE s.institution_id=NEW.institution_id AND s.academic_year=NEW.academic_year
             AND s.weekday=NEW.weekday AND s.id<>NEW.id
             AND s.starts_at<NEW.ends_at AND s.ends_at>NEW.starts_at)
 THEN RAISE EXCEPTION 'Bell timings overlap another slot' USING errcode='23514'; END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS bn_tt_slot_overlap ON public.school_timetable_slots;
CREATE TRIGGER bn_tt_slot_overlap BEFORE INSERT OR UPDATE ON public.school_timetable_slots
 FOR EACH ROW EXECUTE FUNCTION public.bn_timetable_check_slot();

-- Draft periods require a real teaching slot, the matching academic session,
-- active staff and a verified class/subject teacher assignment.
CREATE OR REPLACE FUNCTION public.bn_timetable_check_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE slot_row record; class_row record;
BEGIN
 SELECT * INTO slot_row FROM public.school_timetable_slots WHERE id=NEW.slot_id AND institution_id=NEW.institution_id;
 SELECT * INTO class_row FROM public.school_classes WHERE id=NEW.class_id AND institution_id=NEW.institution_id;
 IF slot_row.id IS NULL OR class_row.id IS NULL OR slot_row.kind<>'period'
    OR slot_row.academic_year<>NEW.academic_year OR class_row.academic_year<>NEW.academic_year
 THEN RAISE EXCEPTION 'Class, academic year or teaching period invalid' USING errcode='23514'; END IF;
 IF NEW.teacher_user_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.school_teacher_assignments a
   JOIN public.school_users u ON u.id=a.school_user_id AND u.institution_id=a.institution_id
   WHERE a.institution_id=NEW.institution_id AND a.class_id=NEW.class_id
     AND a.school_user_id=NEW.teacher_user_id AND a.active=true AND u.status='active' AND u.role='teacher'
     AND (a.assignment_type='class_teacher'
       OR (a.assignment_type='subject_teacher' AND lower(btrim(a.subject))=lower(btrim(NEW.subject))))
 ) THEN RAISE EXCEPTION 'Teacher must be assigned to this class and subject' USING errcode='23514'; END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS bn_tt_draft_guard ON public.school_timetable_drafts;
CREATE TRIGGER bn_tt_draft_guard BEFORE INSERT OR UPDATE ON public.school_timetable_drafts
 FOR EACH ROW EXECUTE FUNCTION public.bn_timetable_check_entry();
DROP TRIGGER IF EXISTS bn_tt_published_guard ON public.school_timetable_published;
CREATE TRIGGER bn_tt_published_guard BEFORE INSERT OR UPDATE ON public.school_timetable_published
 FOR EACH ROW EXECUTE FUNCTION public.bn_timetable_check_entry();

CREATE OR REPLACE FUNCTION public.bn_timetable_check_load()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.school_classes c
  JOIN public.school_teacher_assignments a ON a.institution_id=c.institution_id AND a.class_id=c.id
  JOIN public.school_users u ON u.id=a.school_user_id AND u.institution_id=a.institution_id
  WHERE c.id=NEW.class_id AND c.institution_id=NEW.institution_id AND c.academic_year=NEW.academic_year
   AND a.school_user_id=NEW.teacher_user_id AND a.assignment_type='subject_teacher'
   AND a.active=true AND u.status='active' AND u.role='teacher'
   AND lower(btrim(a.subject))=lower(btrim(NEW.subject)))
 THEN RAISE EXCEPTION 'Weekly load requires an assigned subject teacher' USING errcode='23514'; END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER bn_tt_load_guard BEFORE INSERT OR UPDATE ON public.school_timetable_subject_loads
 FOR EACH ROW EXECUTE FUNCTION public.bn_timetable_check_load();

-- Explicit, atomic publication: parents never see partial draft changes.
CREATE OR REPLACE FUNCTION public.bn_publish_class_timetable(
 p_institution_id uuid,p_class_id uuid,p_academic_year text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE slots_count int; conflict_count int;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT school_private.has_role(p_institution_id,ARRAY['school_admin'])
 THEN RAISE EXCEPTION 'School admin required' USING errcode='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('bn-tt-publish:'||p_institution_id::text));
 IF NOT EXISTS(SELECT 1 FROM public.school_classes
  WHERE id=p_class_id AND institution_id=p_institution_id AND academic_year=p_academic_year)
 THEN RAISE EXCEPTION 'Invalid school class/session' USING errcode='22023'; END IF;
 SELECT count(*) INTO slots_count FROM public.school_timetable_drafts d
  WHERE d.institution_id=p_institution_id AND d.class_id=p_class_id AND d.academic_year=p_academic_year;
 IF slots_count=0 THEN RAISE EXCEPTION 'Add timetable periods before publishing' USING errcode='22023'; END IF;
 IF EXISTS(
   SELECT 1 FROM public.school_timetable_slots bell
   WHERE bell.institution_id=p_institution_id AND bell.academic_year=p_academic_year
     AND bell.kind='period'
     AND NOT EXISTS(SELECT 1 FROM public.school_timetable_drafts d
       WHERE d.institution_id=p_institution_id AND d.class_id=p_class_id
         AND d.academic_year=p_academic_year AND d.slot_id=bell.id)
 ) THEN
  RAISE EXCEPTION 'Complete every teaching period before publishing the class timetable' USING errcode='22023';
 END IF;
 SELECT count(*) INTO conflict_count FROM public.school_timetable_drafts d
 JOIN public.school_timetable_published p ON p.institution_id=d.institution_id AND p.slot_id=d.slot_id
  AND p.teacher_user_id=d.teacher_user_id
 WHERE d.institution_id=p_institution_id AND d.class_id=p_class_id
   AND d.academic_year=p_academic_year AND d.teacher_user_id IS NOT NULL
   AND p.class_id<>p_class_id;
 IF conflict_count>0 THEN RAISE EXCEPTION 'Teacher is booked in another published class' USING errcode='23505'; END IF;
 -- Delete then insert occurs inside a single transaction: any exception rolls
 -- back the old published schedule. Other classes are never touched.
 DELETE FROM public.school_timetable_published
 WHERE institution_id=p_institution_id AND class_id=p_class_id AND academic_year=p_academic_year;
 INSERT INTO public.school_timetable_published
   (institution_id,class_id,slot_id,academic_year,subject,teacher_user_id,notes,published_at,published_by)
 SELECT d.institution_id,d.class_id,d.slot_id,d.academic_year,d.subject,d.teacher_user_id,d.notes,now(),(SELECT auth.uid())
 FROM public.school_timetable_drafts d
 WHERE d.institution_id=p_institution_id AND d.class_id=p_class_id AND d.academic_year=p_academic_year;
 RETURN slots_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.bn_publish_class_timetable(uuid,uuid,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bn_publish_class_timetable(uuid,uuid,text) TO authenticated;

-- Parents see only their own child's published weekly timetable, with teacher
-- names computed live from staff records so a renamed teacher updates everywhere.
CREATE OR REPLACE FUNCTION public.bn_portal_student_timetable(p_institution_id uuid,p_student_id uuid)
RETURNS TABLE(weekday smallint,slot_index smallint,kind text,label text,starts_at time,ends_at time,
 subject text,teacher_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT s.weekday,s.slot_index,s.kind,s.label,s.starts_at,s.ends_at,
        p.subject,CASE WHEN p.teacher_user_id IS NOT NULL AND u.id IS NOT NULL
          AND EXISTS(SELECT 1 FROM public.school_teacher_assignments assigned
             WHERE assigned.institution_id=p.institution_id
               AND assigned.class_id=p.class_id AND assigned.school_user_id=p.teacher_user_id
               AND assigned.active=true
               AND (assigned.assignment_type='class_teacher'
                 OR (assigned.assignment_type='subject_teacher'
                   AND lower(btrim(assigned.subject))=lower(btrim(p.subject)))))
          THEN COALESCE(NULLIF(btrim(u.display_name),''),'Assigned teacher')
          ELSE NULL END AS teacher_name
 FROM public.school_students child
 JOIN public.school_classes class ON class.id=child.class_id AND class.institution_id=child.institution_id
 JOIN public.school_timetable_slots s ON s.institution_id=child.institution_id
   AND s.academic_year=class.academic_year
 LEFT JOIN public.school_timetable_published p ON p.slot_id=s.id
   AND p.institution_id=child.institution_id AND p.class_id=child.class_id
 LEFT JOIN public.school_users u ON u.id=p.teacher_user_id AND u.institution_id=p.institution_id AND u.status='active' AND u.role='teacher'
 WHERE (SELECT auth.uid()) IS NOT NULL
   AND school_private.parent_of(p_student_id,p_institution_id)
   AND child.id=p_student_id AND child.institution_id=p_institution_id AND child.status='active'
   AND EXISTS(SELECT 1 FROM public.school_timetable_published visible
     WHERE visible.institution_id=child.institution_id
       AND visible.class_id=child.class_id AND visible.academic_year=class.academic_year)
 ORDER BY s.weekday,s.slot_index;
$function$;
REVOKE ALL ON FUNCTION public.bn_portal_student_timetable(uuid,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bn_portal_student_timetable(uuid,uuid) TO authenticated;

-- Photos are private files, not public CDN links. Restrict photo uploads to
-- school admins, and signed-file reads to that school or the linked child.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('school-student-photos','school-student-photos',false,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO NOTHING;
DO $block$
BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='school-student-photos' AND public=true)
 THEN RAISE EXCEPTION 'Student photo bucket must not be public' USING errcode='42501'; END IF;
END $block$;

CREATE POLICY bn_student_photo_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(
 bucket_id='school-student-photos'
 AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/photo-[a-zA-Z0-9_-]{8,50}\.(jpg|jpeg|png|webp)$'
 AND EXISTS(SELECT 1 FROM public.school_students s
   WHERE s.institution_id::text=split_part(name,'/',1)
     AND s.id::text=split_part(name,'/',2)
     AND school_private.has_role(s.institution_id,ARRAY['school_admin']))
);
CREATE POLICY bn_student_photo_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='school-student-photos'
 AND EXISTS(SELECT 1 FROM public.school_students s
   LEFT JOIN public.school_student_profiles pr ON pr.student_id=s.id AND pr.institution_id=s.institution_id
   WHERE s.institution_id::text=split_part(name,'/',1) AND s.id::text=split_part(name,'/',2)
     AND (school_private.has_role(s.institution_id,ARRAY['school_admin'])
       OR (pr.details->>'photo_path'=name AND school_private.parent_of(s.id,s.institution_id))
       OR (pr.details->>'photo_path'=name AND s.class_id IS NOT NULL
          AND school_private.teacher_can(s.institution_id,s.class_id,'roster.read','')))
 )
);

-- Update just the photo pointer without overwriting unrelated profile fields.
CREATE OR REPLACE FUNCTION public.bn_save_student_photo(p_student_id uuid,p_storage_path text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE tenant uuid;
BEGIN
 SELECT s.institution_id INTO tenant FROM public.school_students s WHERE s.id=p_student_id AND s.status='active';
 IF tenant IS NULL OR (SELECT auth.uid()) IS NULL OR
   NOT school_private.has_role(tenant,ARRAY['school_admin'])
 THEN RAISE EXCEPTION 'School admin and active student required' USING errcode='42501'; END IF;
 IF p_storage_path !~ ('^'||tenant::text||'/'||p_student_id::text||'/photo-[a-zA-Z0-9_-]{8,50}\.(jpg|jpeg|png|webp)$')
 OR NOT EXISTS(SELECT 1 FROM storage.objects o
   WHERE o.bucket_id='school-student-photos' AND o.name=p_storage_path)
 THEN RAISE EXCEPTION 'A valid, uploaded photo for this student is required' USING errcode='22023'; END IF;
 INSERT INTO public.school_student_profiles(student_id,institution_id,details)
 VALUES(p_student_id,tenant,jsonb_build_object('photo_path',p_storage_path))
 ON CONFLICT(student_id) DO UPDATE SET details=jsonb_set(
   coalesce(public.school_student_profiles.details,'{}'::jsonb),'{photo_path}',to_jsonb(p_storage_path),true),
   updated_at=now()
 WHERE public.school_student_profiles.institution_id=tenant;
 RETURN p_storage_path;
END;
$function$;
REVOKE ALL ON FUNCTION public.bn_save_student_photo(uuid,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bn_save_student_photo(uuid,text) TO authenticated;

-- Profile photo path is always server-controlled. Normal profile edits may
-- change academic/contact/health fields but cannot unlink a previously
-- published photo by submitting an old form.
CREATE OR REPLACE FUNCTION public.school_save_student_profile(p_student_id uuid, p_dob date, p_profile jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare school uuid; d jsonb;
begin
 select institution_id into school from public.school_students where id=p_student_id;
 if school is null or (select auth.uid()) is null or not school_private.has_role(school,array['school_admin']) then raise exception 'School administrator access required' using errcode='42501'; end if;
 if p_profile is null or jsonb_typeof(p_profile)<>'object' or octet_length(p_profile::text)>65536 then raise exception 'Invalid profile'; end if;
 d:=coalesce(p_profile->'details','{}'::jsonb);
 if jsonb_typeof(d)<>'object' then raise exception 'Invalid profile details'; end if;
 -- The only accepted photo path is published by bn_save_student_photo.
 -- A stale or modified browser profile payload cannot reset or replace it.
 d:=d - 'photo_path';
 if p_dob>current_date then raise exception 'Date of birth cannot be in the future'; end if;
 update public.school_students set dob=p_dob,updated_at=now() where id=p_student_id and institution_id=school;
 insert into public.school_student_profiles(student_id,institution_id,guardian_name,guardian_relationship,guardian_phone,guardian_email,alternate_contact_name,alternate_contact_phone,address_line,city,postal_code,admission_on,details)
 values(p_student_id,school,nullif(p_profile->>'guardian_name',''),nullif(p_profile->>'guardian_relationship',''),nullif(p_profile->>'guardian_phone',''),nullif(p_profile->>'guardian_email',''),nullif(p_profile->>'alternate_contact_name',''),nullif(p_profile->>'alternate_contact_phone',''),nullif(p_profile->>'address_line',''),nullif(p_profile->>'city',''),nullif(p_profile->>'postal_code',''),nullif(p_profile->>'admission_on','')::date,d)
 on conflict(student_id) do update set guardian_name=excluded.guardian_name,guardian_relationship=excluded.guardian_relationship,guardian_phone=excluded.guardian_phone,guardian_email=excluded.guardian_email,alternate_contact_name=excluded.alternate_contact_name,alternate_contact_phone=excluded.alternate_contact_phone,address_line=excluded.address_line,city=excluded.city,postal_code=excluded.postal_code,admission_on=excluded.admission_on,details=(excluded.details || CASE
   WHEN jsonb_typeof(public.school_student_profiles.details->'photo_path')='string'
   THEN jsonb_build_object('photo_path',public.school_student_profiles.details->>'photo_path')
   ELSE '{}'::jsonb END),updated_at=now();
end $function$;

COMMIT;
