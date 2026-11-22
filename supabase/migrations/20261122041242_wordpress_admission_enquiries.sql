-- WordPress connects with a revocable, school-scoped credential that can only submit enquiries.
begin;

create table school_private.bn_wordpress_connections (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  key_hash bytea not null unique,
  connected_at timestamptz not null default now()
);

create table school_private.bn_wordpress_enquiries (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  year_group text not null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index bn_wordpress_enquiries_school_date
  on school_private.bn_wordpress_enquiries (institution_id, submitted_at desc);

alter table school_private.bn_wordpress_connections enable row level security;
alter table school_private.bn_wordpress_enquiries enable row level security;
revoke all on school_private.bn_wordpress_connections, school_private.bn_wordpress_enquiries from public, anon, authenticated;

create function school_private.bn_require_wordpress_admin(p_school uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not coalesce(school_private.has_role(p_school, array['school_admin']), false)
      or not exists (select 1 from public.institutions where id = p_school and status in ('trial', 'active')) then
    raise exception 'Active school admin access is required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function school_private.bn_require_wordpress_admin(uuid) from public, anon, authenticated;

create function public.bn_wordpress_rotate_key(p_school uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  new_key text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform school_private.bn_require_wordpress_admin(p_school);
  insert into school_private.bn_wordpress_connections(institution_id, key_hash)
  values (p_school, sha256(convert_to(new_key, 'UTF8')))
  on conflict (institution_id) do update
  set key_hash = excluded.key_hash, connected_at = now();
  return new_key;
end;
$$;

create function public.bn_wordpress_revoke_key(p_school uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform school_private.bn_require_wordpress_admin(p_school);
  delete from school_private.bn_wordpress_connections where institution_id = p_school;
end;
$$;

create function public.bn_wordpress_list_enquiries(p_school uuid, p_reviewed boolean default false)
returns table(id uuid, name text, email text, phone text, year_group text, submitted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform school_private.bn_require_wordpress_admin(p_school);
  return query
    select e.id, e.name, e.email, e.phone, e.year_group, e.submitted_at
    from school_private.bn_wordpress_enquiries e
    where e.institution_id = p_school and (e.reviewed_at is not null) = p_reviewed
    order by e.submitted_at desc, e.id
    limit 100;
end;
$$;

create function public.bn_wordpress_mark_reviewed(p_school uuid, p_enquiry uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform school_private.bn_require_wordpress_admin(p_school);
  update school_private.bn_wordpress_enquiries set reviewed_at = coalesce(reviewed_at, now())
  where institution_id = p_school and id = p_enquiry;
  if not found then raise exception 'Enquiry unavailable' using errcode = '42501'; end if;
end;
$$;

create function public.bn_wordpress_submit_enquiry(
  p_key text, p_name text, p_email text, p_phone text, p_year_group text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  school uuid;
  ref uuid;
  parent_name text := btrim(coalesce(p_name, ''));
  parent_email text := lower(btrim(coalesce(p_email, '')));
  parent_phone text := btrim(coalesce(p_phone, ''));
  year_label text := btrim(coalesce(p_year_group, ''));
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid connection' using errcode = '42501';
  end if;
  -- Serialize intake per school so retries and limits remain consistent under concurrent requests.
  select c.institution_id into school
  from school_private.bn_wordpress_connections c
  join public.institutions i on i.id = c.institution_id and i.status in ('trial', 'active')
  where c.key_hash = sha256(convert_to(p_key, 'UTF8'))
  for update of c;

  if school is null then raise exception 'Invalid connection' using errcode = '42501'; end if;
  if char_length(parent_name) not between 2 and 120 or char_length(parent_email) > 254
      or char_length(year_label) > 60 or parent_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or (parent_phone <> '' and parent_phone !~ '^\+?[0-9][0-9 ()-]{4,28}$') then
    raise exception 'Enter valid enquiry details' using errcode = '22023';
  end if;

  select e.id into ref from school_private.bn_wordpress_enquiries e
  where e.institution_id = school and e.submitted_at >= now() - interval '10 minutes'
    and (e.name, e.email, e.phone, e.year_group) = (parent_name, parent_email, parent_phone, year_label)
  order by e.submitted_at desc limit 1;
  if found then return ref; end if;
  if (select count(*) from school_private.bn_wordpress_enquiries e
      where e.institution_id = school and e.submitted_at >= now() - interval '1 hour') >= 30 then
    raise exception 'Enquiry limit reached. Try again later.' using errcode = 'P0001';
  end if;

  insert into school_private.bn_wordpress_enquiries(institution_id, name, email, phone, year_group)
  values (school, parent_name, parent_email, parent_phone, year_label) returning id into ref;
  return ref;
end;
$$;

revoke all on function public.bn_wordpress_rotate_key(uuid), public.bn_wordpress_revoke_key(uuid),
  public.bn_wordpress_list_enquiries(uuid, boolean), public.bn_wordpress_mark_reviewed(uuid, uuid),
  public.bn_wordpress_submit_enquiry(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bn_wordpress_rotate_key(uuid), public.bn_wordpress_revoke_key(uuid),
  public.bn_wordpress_list_enquiries(uuid, boolean), public.bn_wordpress_mark_reviewed(uuid, uuid) to authenticated;
grant execute on function public.bn_wordpress_submit_enquiry(text, text, text, text, text) to anon;
commit;
