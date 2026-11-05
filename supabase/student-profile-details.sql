alter table public.school_student_profiles add column if not exists details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object');
create policy school_parent_profile_read on public.school_student_profiles for select to authenticated using(school_private.parent_of(student_id,institution_id));
create or replace function public.school_save_student_profile(p_student_id uuid,p_dob date,p_profile jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare school uuid; d jsonb;
begin
 select institution_id into school from public.school_students where id=p_student_id;
 if school is null or (select auth.uid()) is null or not school_private.has_role(school,array['school_admin']) then raise exception 'School administrator access required' using errcode='42501'; end if;
 if p_profile is null or jsonb_typeof(p_profile)<>'object' or octet_length(p_profile::text)>65536 then raise exception 'Invalid profile'; end if;
 d:=coalesce(p_profile->'details','{}'::jsonb);
 if jsonb_typeof(d)<>'object' then raise exception 'Invalid profile details'; end if;
 if p_dob>current_date then raise exception 'Date of birth cannot be in the future'; end if;
 update public.school_students set dob=p_dob,updated_at=now() where id=p_student_id and institution_id=school;
 insert into public.school_student_profiles(student_id,institution_id,guardian_name,guardian_relationship,guardian_phone,guardian_email,alternate_contact_name,alternate_contact_phone,address_line,city,postal_code,admission_on,details)
 values(p_student_id,school,nullif(p_profile->>'guardian_name',''),nullif(p_profile->>'guardian_relationship',''),nullif(p_profile->>'guardian_phone',''),nullif(p_profile->>'guardian_email',''),nullif(p_profile->>'alternate_contact_name',''),nullif(p_profile->>'alternate_contact_phone',''),nullif(p_profile->>'address_line',''),nullif(p_profile->>'city',''),nullif(p_profile->>'postal_code',''),nullif(p_profile->>'admission_on','')::date,d)
 on conflict(student_id) do update set guardian_name=excluded.guardian_name,guardian_relationship=excluded.guardian_relationship,guardian_phone=excluded.guardian_phone,guardian_email=excluded.guardian_email,alternate_contact_name=excluded.alternate_contact_name,alternate_contact_phone=excluded.alternate_contact_phone,address_line=excluded.address_line,city=excluded.city,postal_code=excluded.postal_code,admission_on=excluded.admission_on,details=excluded.details,updated_at=now();
end $$;
revoke all on function public.school_save_student_profile(uuid,date,jsonb) from public,anon;
grant execute on function public.school_save_student_profile(uuid,date,jsonb) to authenticated;
-- Preserve identity-column restrictions; only the new editable details column needs an additional grant.
grant update(details) on public.school_student_profiles to authenticated;
