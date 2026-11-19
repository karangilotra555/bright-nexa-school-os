begin;

-- An ERP snapshot includes attendance rows even when the user edits another
-- module. Skip identical rows so a normal save preserves recorder and time.
do $migration$
declare
  push_sql text := pg_get_functiondef('public.school_workspace_push(uuid,bigint,jsonb,jsonb)'::regprocedure);
  old_write constant text := $old$  insert into public.school_attendance(id,institution_id,class_id,student_id,day,status,recorded_by) values(target,p_institution_id,cid,sid,(e->>'day')::date,lower(e->>'status'),actor)
  on conflict(id) do update set class_id=excluded.class_id,student_id=excluded.student_id,day=excluded.day,status=excluded.status,recorded_by=actor,updated_at=now() where school_attendance.institution_id=p_institution_id;$old$;
  guarded_write constant text := $new$  if not exists (
   select 1 from public.school_attendance a
   where a.id=target and a.institution_id=p_institution_id
     and row(a.class_id,a.student_id,a.day,a.status) is not distinct from
         row(cid,sid,(e->>'day')::date,lower(e->>'status'))
  ) then
   insert into public.school_attendance(id,institution_id,class_id,student_id,day,status,recorded_by)
   values(target,p_institution_id,cid,sid,(e->>'day')::date,lower(e->>'status'),actor)
   on conflict(id) do update set class_id=excluded.class_id,student_id=excluded.student_id,
     day=excluded.day,status=excluded.status,recorded_by=actor,updated_at=now()
   where school_attendance.institution_id=p_institution_id;
  end if;$new$;
begin
  if strpos(push_sql,guarded_write)>0 then return; end if;
  if strpos(push_sql,old_write)=0 then
    raise exception 'Unexpected workspace attendance write definition. No changes applied.';
  end if;
  execute replace(push_sql,old_write,guarded_write);
end $migration$;

commit;
