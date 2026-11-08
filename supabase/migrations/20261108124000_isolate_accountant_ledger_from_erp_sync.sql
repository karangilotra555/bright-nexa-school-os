-- Accountant entries remain an append-only cloud ledger. Return those entries
-- as a read-only ERP overlay, never as ERP receipt inputs. Keep the guard on
-- actual overlapping fee changes until there is an explicit allocation flow.
begin;
do $migration$
declare
 pull_sql text := pg_get_functiondef('public.school_workspace_pull(uuid)'::regprocedure);
 push_sql text := pg_get_functiondef('public.school_workspace_push(uuid,bigint,jsonb,jsonb)'::regprocedure);
 old_pull_guard constant text := $old$ if exists(select 1 from public.school_fee_entries f where f.institution_id=p_institution_id and coalesce(f.reference,'') not like 'workspace:%') then
  raise exception 'Fee reconciliation required: external ledger entries cannot be represented as local receipts automatically' using errcode='22023';
 end if;$old$;
 old_push_guard constant text := $old$  if exists(select 1 from public.school_fee_entries f where f.institution_id=p_institution_id and f.student_id=sid and coalesce(f.reference,'') not like 'workspace:%') then
   raise exception 'Existing fee ledger requires reconciliation before importing this student' using errcode='22023';
  end if;$old$;
 pull_anchor constant text := $old$ ops:=jsonb_set(ops,'{notices}',rows);$old$;
 push_anchor constant text := $old$  if delta<>0 then
   insert into public.school_fee_entries$old$;
 snapshot_anchor constant text := $old$set snapshot=p_snapshot,revision=revision+1$old$;
begin
 if strpos(pull_sql,old_pull_guard)=0 or strpos(pull_sql,pull_anchor)=0 or strpos(push_sql,old_push_guard)=0
    or strpos(push_sql,push_anchor)=0 or strpos(push_sql,snapshot_anchor)=0 then
  raise exception 'Unexpected workspace function definition. Fee sync migration cancelled.';
 end if;

 pull_sql:=replace(pull_sql,old_pull_guard,'');
 pull_sql:=replace(pull_sql,pull_anchor,pull_anchor||$overlay$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'studentId',coalesce(m.local_id,'cloud:'||f.student_id::text),
  'kind',f.kind,'amountRupees',f.amount_rupees,'reference',f.reference,
  'description',f.description,'date',f.occurred_on
 ) order by f.occurred_on,f.id),'[]'::jsonb) into rows
 from public.school_fee_entries f
 left join public.school_workspace_links m
  on m.institution_id=f.institution_id and m.entity='students' and m.cloud_id=f.student_id
 where f.institution_id=p_institution_id and coalesce(f.reference,'') not like 'workspace:%';
 ops:=jsonb_set(ops,'{externalFeeLedger}',rows);$overlay$);

 push_sql:=replace(push_sql,old_push_guard,'');
 push_sql:=replace(push_sql,push_anchor,$guard$  if delta<>0 then
   if exists(select 1 from public.school_fee_entries f
    where f.institution_id=p_institution_id and f.student_id=sid and coalesce(f.reference,'') not like 'workspace:%') then
    raise exception 'Accountant ledger entries already exist for this student. Use Staff Portal > Fees & Payments to review the balance before changing ERP fees.' using errcode='22023';
   end if;
   insert into public.school_fee_entries$guard$);
 push_sql:=replace(push_sql,snapshot_anchor,$guard$set snapshot=p_snapshot #- '{operations,externalFeeLedger}',revision=revision+1$guard$);

 execute pull_sql;
 execute push_sql;
end $migration$;
commit;
