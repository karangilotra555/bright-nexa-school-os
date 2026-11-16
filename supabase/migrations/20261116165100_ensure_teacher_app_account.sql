-- Complete a new Teacher App membership and its roster links in one transaction.
CREATE OR REPLACE FUNCTION public.bn_create_teacher_app_membership(
  p_school uuid, p_actor uuid, p_auth_user uuid, p_revision bigint,
  p_email text, p_staff jsonb, p_assignments jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  member_id uuid;
BEGIN
  PERFORM 1 FROM public.school_users
    WHERE id = p_actor AND institution_id = p_school AND role = 'school_admin' AND status = 'active'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active school administrator is required.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.school_workspaces
    WHERE institution_id = p_school AND revision = p_revision
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The faculty record changed. Retry Save Teacher.' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.school_users (institution_id, email, role, status, auth_user_id, display_name)
  VALUES (p_school, p_email, 'teacher', 'active', p_auth_user, p_staff->>'display_name')
  RETURNING id INTO member_id;

  INSERT INTO public.school_staff_profiles (
    institution_id, school_user_id, display_name, staff_category, designation,
    employment_type, contact_email, contact_mobile, contract_end_on, days_per_week,
    hours_per_day, visits_per_month, notes
  )
  SELECT p_school, member_id, s.display_name, 'teaching', s.designation,
    s.employment_type, p_email, s.contact_mobile, s.contract_end_on, s.days_per_week,
    s.hours_per_day, s.visits_per_month, s.notes
  FROM jsonb_to_record(p_staff) AS s(
    display_name text, designation text, employment_type text, contact_mobile text,
    contract_end_on date, days_per_week integer, hours_per_day numeric, visits_per_month integer, notes text
  );

  INSERT INTO public.school_teacher_assignments (
    institution_id, school_user_id, class_id, subject, assignment_type, active,
    can_view_roster, can_take_attendance, can_assign_homework, can_enter_marks
  )
  SELECT p_school, member_id, a.class_id, a.subject, 'subject_teacher', true,
    true, true, true, true
  FROM jsonb_to_recordset(p_assignments) AS a(class_id uuid, subject text);

  INSERT INTO public.school_audit_events(institution_id, actor_id, action, entity, entity_id)
  VALUES (p_school, p_actor, 'staff.teacher_provisioned', 'school_users', member_id);
  RETURN member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bn_create_teacher_app_membership(uuid, uuid, uuid, bigint, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bn_create_teacher_app_membership(uuid, uuid, uuid, bigint, text, jsonb, jsonb)
  TO service_role;
