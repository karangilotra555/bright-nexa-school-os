begin;

create table school_private.student_card_signing_key (
  singleton boolean primary key default true check (singleton),
  secret bytea not null
);
revoke all on school_private.student_card_signing_key from public, anon, authenticated;
insert into school_private.student_card_signing_key(secret) values(extensions.gen_random_bytes(32));

create function public.bn_issue_student_card_signatures(p_school uuid)
returns table(admission_number text, signature text)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not school_private.has_role(p_school,array['school_admin']) then
    raise exception 'School admin required' using errcode='42501';
  end if;
  return query select s.admission_number,
    encode(extensions.hmac(convert_to('student-id:v1:'||s.institution_id::text||':'||s.id::text||':'||s.admission_number,'UTF8'),k.secret,'sha256'),'hex')
  from public.school_students s cross join school_private.student_card_signing_key k
  where s.institution_id=p_school and s.status='active' and s.class_id is not null;
end;
$$;

create function public.bn_verify_student_card(p_school uuid,p_admission text,p_signature text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('verified',true,'status','OFFICIALLY_VERIFIED','algorithm','HMAC-SHA256',
      'student',jsonb_build_object('name',s.name,'admissionNumber',s.admission_number,'className',c.name,'section',c.section))
    from public.school_students s
    join public.institutions i on i.id=s.institution_id and i.status in ('active','trial')
    join public.school_classes c on c.id=s.class_id and c.institution_id=s.institution_id
    cross join school_private.student_card_signing_key k
    where s.institution_id=p_school and s.admission_number=p_admission and s.status='active'
      and p_signature ~ '^[0-9a-f]{64}$'
      and extensions.digest(convert_to(p_signature,'UTF8'),'sha256')=
          extensions.digest(convert_to(encode(extensions.hmac(convert_to('student-id:v1:'||s.institution_id::text||':'||s.id::text||':'||s.admission_number,'UTF8'),k.secret,'sha256'),'hex'),'UTF8'),'sha256')),
    jsonb_build_object('verified',false,'status','SIGNATURE_MISMATCH'));
$$;

revoke all on function public.bn_issue_student_card_signatures(uuid), public.bn_verify_student_card(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.bn_issue_student_card_signatures(uuid) to authenticated;
grant execute on function public.bn_verify_student_card(uuid,text,text) to anon, authenticated;
commit;
