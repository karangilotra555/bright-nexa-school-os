-- Bright Nexa verified school owner settings. No school records are migrated or reset.
-- Reduce the previous broad authenticated UPDATE grant on institutions to name only.
begin;
revoke update on table public.institutions from authenticated;
grant update (name) on table public.institutions to authenticated;
create policy bn_owner_verified_school_name_update
 on public.institutions for update to authenticated
 using (school_private.has_role(id,ARRAY['school_admin'::text]))
 with check (
   school_private.has_role(id,ARRAY['school_admin'::text])
   and char_length(btrim(name)) between 3 and 120
 );
-- Contact registration email is immutable here; only a verified owner may update contact_mobile.
grant update (contact_mobile) on table public.school_contact_profiles to authenticated;
create policy bn_owner_verified_contact_phone_update
 on public.school_contact_profiles for update to authenticated
 using (school_private.has_role(institution_id,ARRAY['school_admin'::text]))
 with check (
   school_private.has_role(institution_id,ARRAY['school_admin'::text])
   and (contact_mobile is null or contact_mobile ~ '^[+0-9() -]{7,20}$')
 );
commit;
