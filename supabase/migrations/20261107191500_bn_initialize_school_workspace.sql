-- Initialize only a missing ERP snapshot from a verified school's canonical cloud records.
-- Existing students, classes, attendance, fee and portal rows are not deleted or overwritten.
CREATE OR REPLACE FUNCTION public.bn_initialize_school_workspace(p_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $fn$
DECLARE
  v_school public.institutions%ROWTYPE;
  v_session text;
  v_students integer;
  v_teachers integer;
  v_operations jsonb;
  v_initial jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT school_private.has_role(p_institution_id, ARRAY['school_admin']) THEN
    RAISE EXCEPTION 'Active school administrator required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_school FROM public.institutions
    WHERE id=p_institution_id AND status IN ('active','trial');
  IF NOT FOUND THEN RAISE EXCEPTION 'No active school available' USING ERRCODE='42501'; END IF;

  SELECT c.academic_year INTO v_session
    FROM public.school_classes c WHERE c.institution_id=p_institution_id
    ORDER BY c.academic_year DESC LIMIT 1;
  SELECT count(*) INTO v_students FROM public.school_students s
    WHERE s.institution_id=p_institution_id AND s.status='active';
  SELECT count(*) INTO v_teachers FROM public.school_users u
    WHERE u.institution_id=p_institution_id AND u.role='teacher' AND u.status='active';

  v_operations := jsonb_build_object(
    'teachers','[]'::jsonb,'classes','[]'::jsonb,'attendance','[]'::jsonb,
    'attendanceFollowUps','[]'::jsonb,'staffAttendance','[]'::jsonb,
    'holidays','[]'::jsonb,'feeStructures','[]'::jsonb,'feePayments','[]'::jsonb,
    'feeAccounts','[]'::jsonb,'classFeeCharges','[]'::jsonb,'studentFeeDues','[]'::jsonb,
    'expenses','[]'::jsonb,'expenseVendors','[]'::jsonb,'expenseBudgets','[]'::jsonb,
    'recurringExpenses','[]'::jsonb,'exams','[]'::jsonb,'marks','[]'::jsonb,
    'homework','[]'::jsonb,'notices','[]'::jsonb,'opportunities','[]'::jsonb,
    'achievements','[]'::jsonb,'audit','[]'::jsonb,'nonTeachingStaff','[]'::jsonb,
    'vehicles','[]'::jsonb,'transportPeople','[]'::jsonb,'transportRoutes','[]'::jsonb,
    'vehicleMaintenance','[]'::jsonb,'infrastructureAssets','[]'::jsonb
  );
  v_initial := jsonb_build_object(
    'institution',jsonb_build_object(
      'language','en','role','OWNER','connectivity','online',
      'institution',jsonb_build_object(
        'id',p_institution_id::text,'name',v_school.name,'city','',
        'session',coalesce(v_session,'2026-2027'),
        'students',v_students,'teachers',v_teachers,
        'attendancePercent',0,'feeCollected',0,'feePending',0,
        'qualityScore',0,'institutionType','School',
        'address','','state','','pinCode','','contactNumber','','email','',
        'boardType','','schoolLevel','Secondary','medium','English',
        'directorName','','principalName',''
      ),'services','[]'::jsonb
    ),'students','[]'::jsonb,'operations',v_operations
  );
  INSERT INTO public.school_workspaces(institution_id) VALUES(p_institution_id)
    ON CONFLICT (institution_id) DO NOTHING;
  -- Idempotent and never replace already initialized snapshots.
  UPDATE public.school_workspaces
  SET snapshot=v_initial, updated_at=now()
  WHERE institution_id=p_institution_id AND snapshot IS NULL;
  -- Existing canonical student and class rows are overlaid by this vetted RPC.
  RETURN public.school_workspace_pull(p_institution_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.bn_initialize_school_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bn_initialize_school_workspace(uuid) TO authenticated;
