-- Phase C1, staged only: private student contact profiles and document checklist.
-- Student records are preserved; no backfill, attachments, public document URLs or demo records.
begin;
create table if not exists public.school_student_profiles (
  student_id uuid primary key,
  institution_id uuid not null,
  guardian_name text,
  guardian_relationship text,
  guardian_phone text,
  guardian_email text,
  alternate_contact_name text,
  alternate_contact_phone text,
  address_line text,
  city text,
  postal_code text,
  admission_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bn_student_profile_student_school_fk foreign key(student_id,institution_id)
    references public.school_students(id,institution_id) on delete restrict,
  constraint bn_student_profile_guardian_len check(guardian_name is null or char_length(btrim(guardian_name)) between 2 and 150),
  constraint bn_student_profile_phone_len check(guardian_phone is null or char_length(btrim(guardian_phone)) between 7 and 20),
  constraint bn_student_profile_email_len check(guardian_email is null or char_length(guardian_email)<=200),
  constraint bn_student_profile_address_len check(address_line is null or char_length(address_line)<=400),
  constraint bn_student_profile_city_len check(city is null or char_length(city)<=100)
);
create index if not exists bn_student_profiles_school_idx on public.school_student_profiles(institution_id);

create table if not exists public.school_student_document_checks (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  student_id uuid not null,
  document_type text not null,
  status text not null default 'not_received',
  notes text,
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bn_student_doc_school_fk foreign key(student_id,institution_id)
    references public.school_students(id,institution_id) on delete restrict,
  constraint bn_student_doc_type_check check (document_type in (
    'birth_certificate','address_proof','previous_school_tc','student_photo',
    'guardian_id','admission_form','other')),
  constraint bn_student_doc_status_check check (status in ('not_received','received','verified')),
  constraint bn_student_doc_notes_length check (notes is null or char_length(notes)<=300),
  constraint bn_student_doc_verified_audit check (
    (status='verified' and checked_by is not null and checked_at is not null)
    or (status<>'verified' and checked_by is null and checked_at is null)),
  constraint bn_student_doc_unique unique (institution_id,student_id,document_type)
);
create index if not exists bn_student_doc_school_student_idx
  on public.school_student_document_checks(institution_id,student_id);

alter table public.school_student_profiles enable row level security;
alter table public.school_student_document_checks enable row level security;
revoke all on table public.school_student_profiles from anon,authenticated;
revoke all on table public.school_student_document_checks from anon,authenticated;
grant select,insert on table public.school_student_profiles to authenticated;
grant update (guardian_name,guardian_relationship,guardian_phone,guardian_email,
  alternate_contact_name,alternate_contact_phone,address_line,city,postal_code,admission_on,updated_at)
  on table public.school_student_profiles to authenticated;
grant select,insert on table public.school_student_document_checks to authenticated;
grant update (status,notes,checked_by,checked_at,updated_at)
  on table public.school_student_document_checks to authenticated;

create policy bn_student_profiles_owner_read on public.school_student_profiles
  for select to authenticated
  using (school_private.has_role(institution_id,array['school_admin'::text]));
create policy bn_student_profiles_owner_insert on public.school_student_profiles
  for insert to authenticated
  with check(school_private.has_role(institution_id,array['school_admin'::text]));
create policy bn_student_profiles_owner_update on public.school_student_profiles
  for update to authenticated
  using(school_private.has_role(institution_id,array['school_admin'::text]))
  with check(school_private.has_role(institution_id,array['school_admin'::text]));

create policy bn_student_documents_owner_read on public.school_student_document_checks
  for select to authenticated
  using(school_private.has_role(institution_id,array['school_admin'::text]));
create policy bn_student_documents_owner_insert on public.school_student_document_checks
  for insert to authenticated
  with check(school_private.has_role(institution_id,array['school_admin'::text]) and
    (status<>'verified' or checked_by=(select auth.uid())));
create policy bn_student_documents_owner_update on public.school_student_document_checks
  for update to authenticated
  using(school_private.has_role(institution_id,array['school_admin'::text]))
  with check(school_private.has_role(institution_id,array['school_admin'::text]) and
    (status<>'verified' or checked_by=(select auth.uid())));
commit;
