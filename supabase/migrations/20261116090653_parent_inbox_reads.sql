create table public.school_parent_inbox_reads (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null,
  item_kind text not null check (item_kind in ('homework', 'notice', 'attendance')),
  item_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (auth_user_id, institution_id, student_id, item_kind, item_id),
  foreign key (student_id, institution_id) references public.school_students(id, institution_id) on delete cascade
);

alter table public.school_parent_inbox_reads enable row level security;
revoke all on public.school_parent_inbox_reads from public, anon, authenticated;
grant select on public.school_parent_inbox_reads to authenticated;
grant insert (auth_user_id, institution_id, student_id, item_kind, item_id)
  on public.school_parent_inbox_reads to authenticated;

create policy parent_inbox_read_own on public.school_parent_inbox_reads
  for select to authenticated using (
    auth_user_id = (select auth.uid())
    and school_private.parent_of(student_id, institution_id)
  );

create policy parent_inbox_record_own on public.school_parent_inbox_reads
  for insert to authenticated with check (
    auth_user_id = (select auth.uid())
    and school_private.parent_of(student_id, institution_id)
    and exists (
      select 1 from public.school_students s
      where s.id = school_parent_inbox_reads.student_id and s.institution_id = school_parent_inbox_reads.institution_id
        and s.status = 'active'
        and case item_kind
          when 'notice' then exists (
            select 1 from public.school_notices n
            where n.id = item_id and n.institution_id = s.institution_id
          )
          when 'homework' then exists (
            select 1 from public.school_homework h
            where h.id = item_id and h.institution_id = s.institution_id and h.class_id = s.class_id
          )
          when 'attendance' then exists (
            select 1 from public.school_attendance a
            where a.id = item_id and a.institution_id = s.institution_id
              and a.student_id = s.id and a.status = 'absent'
          )
          else false
        end
    )
  );
