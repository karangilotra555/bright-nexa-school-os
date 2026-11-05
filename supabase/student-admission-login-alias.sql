-- Keep the admission number displayed by an existing dashboard valid after imports.
alter table public.school_student_profiles add column if not exists admission_login_alias text;
create unique index if not exists school_student_profiles_login_alias_unique on public.school_student_profiles(institution_id,admission_login_alias) where admission_login_alias is not null;
