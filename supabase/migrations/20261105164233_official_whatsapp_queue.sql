-- Additive. Credentials and queue are accessible only to the Edge service role.
create table public.school_whatsapp_connections (
 institution_id uuid primary key references public.institutions(id), phone_number_id text not null unique,
 waba_id text not null, secret_id uuid not null, api_version text not null default 'v24.0',
 template_map jsonb not null default '{}', verify_hash text not null unique, webhook_verified_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.school_whatsapp_batches (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id),
 request_key uuid not null, created_by uuid not null, kind text not null check(kind in ('fee','absent','ptm')),
 template jsonb not null, created_at timestamptz not null default now(),
 unique(id,institution_id), unique(institution_id,request_key),
 foreign key(created_by,institution_id) references public.school_users(id,institution_id)
);
create table public.school_whatsapp_recipients (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null, institution_id uuid not null,
 student_id uuid not null, phone text not null check(phone ~ '^91[6-9][0-9]{9}$'), parameters jsonb not null,
 state text not null default 'queued' check(state in ('queued','processing','accepted','sent','delivered','read','failed','unknown','blocked')),
 attempt_id uuid, claimed_at timestamptz, provider_message_id text unique, error_code text,
 updated_at timestamptz not null default now(), unique(batch_id,student_id),
 foreign key(batch_id,institution_id) references public.school_whatsapp_batches(id,institution_id),
 foreign key(student_id,institution_id) references public.school_students(id,institution_id)
);
create index school_wa_recipients_batch_state on public.school_whatsapp_recipients(batch_id,state);
create table public.school_whatsapp_events (
 provider_message_id text not null, institution_id uuid not null references public.institutions(id),
 state text not null check(state in ('sent','delivered','read','failed')), event_time text not null,
 primary key(provider_message_id,state,event_time)
);
create or replace function public.school_wa_save_connection(p_school uuid,p_phone text,p_waba text,p_secrets text,p_hash text,p_templates jsonb,p_version text)
returns void language plpgsql security invoker set search_path='' as $$
declare sid uuid;begin
 select secret_id into sid from public.school_whatsapp_connections where institution_id=p_school for update;
 if sid is null then select vault.create_secret(p_secrets) into sid;
 else perform vault.update_secret(sid,p_secrets); end if;
 insert into public.school_whatsapp_connections(institution_id,phone_number_id,waba_id,secret_id,verify_hash,template_map,api_version)
 values(p_school,p_phone,p_waba,sid,p_hash,p_templates,p_version)
 on conflict(institution_id) do update set phone_number_id=excluded.phone_number_id,waba_id=excluded.waba_id,secret_id=excluded.secret_id,verify_hash=excluded.verify_hash,template_map=excluded.template_map,api_version=excluded.api_version,webhook_verified_at=null,updated_at=now();
end $$;
create or replace function public.school_wa_secret(p_school uuid) returns text language sql security invoker set search_path='' as $$
 select v.decrypted_secret from public.school_whatsapp_connections c join vault.decrypted_secrets v on v.id=c.secret_id where c.institution_id=p_school;
$$;
create or replace function public.school_wa_create_batch(p_school uuid,p_user uuid,p_key uuid,p_kind text,p_template jsonb,p_rows jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare bid uuid;begin
 if jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>50 then raise exception 'Select 1 to 50 recipients';end if;
 insert into public.school_whatsapp_batches(institution_id,created_by,request_key,kind,template) values(p_school,p_user,p_key,p_kind,p_template) on conflict(institution_id,request_key) do nothing returning id into bid;
 if bid is null then select id into bid from public.school_whatsapp_batches where institution_id=p_school and request_key=p_key;return bid;end if;
 insert into public.school_whatsapp_recipients(batch_id,institution_id,student_id,phone,parameters)
 select bid,p_school,(r->>'studentId')::uuid,r->>'phone',r->'parameters' from jsonb_array_elements(p_rows) r;
 return bid;
end $$;
create or replace function public.school_wa_claim(p_school uuid,p_batch uuid)
returns setof public.school_whatsapp_recipients language plpgsql security invoker set search_path='' as $$
declare rid uuid;begin
 -- A crash after a provider request is ambiguous: never automatically resend it.
 update public.school_whatsapp_recipients set state='unknown',error_code='WORKER_INTERRUPTED',updated_at=now() where institution_id=p_school and batch_id=p_batch and state='processing' and claimed_at<now()-interval '2 minutes';
 select id into rid from public.school_whatsapp_recipients where institution_id=p_school and batch_id=p_batch and state='queued' order by id for update skip locked limit 1;
 return query update public.school_whatsapp_recipients set state='processing',attempt_id=gen_random_uuid(),claimed_at=now(),updated_at=now() where id=rid returning *;
end $$;
create or replace function public.school_wa_event(p_school uuid,p_message text,p_state text,p_time text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.school_whatsapp_events values(p_message,p_school,p_state,p_time) on conflict do nothing;
 update public.school_whatsapp_recipients set state=case
 when state='read' or state='delivered' and p_state<>'read' then state
 when p_state='read' then 'read' when p_state='delivered' then 'delivered'
 when p_state='failed' then 'failed' when p_state='sent' and state in ('accepted','processing','unknown') then 'sent' else state end,updated_at=now()
 where institution_id=p_school and provider_message_id=p_message;
end $$;
-- Privileged RPCs have no anonymous/authenticated access, including default PUBLIC EXECUTE.
revoke all on public.school_whatsapp_connections, public.school_whatsapp_batches, public.school_whatsapp_recipients, public.school_whatsapp_events from public,anon,authenticated;
grant all on public.school_whatsapp_connections, public.school_whatsapp_batches, public.school_whatsapp_recipients, public.school_whatsapp_events to service_role;
alter table public.school_whatsapp_connections enable row level security;
alter table public.school_whatsapp_batches enable row level security;
alter table public.school_whatsapp_recipients enable row level security;
alter table public.school_whatsapp_events enable row level security;
create policy service_only on public.school_whatsapp_connections to service_role using(true) with check(true);
create policy service_only on public.school_whatsapp_batches to service_role using(true) with check(true);
create policy service_only on public.school_whatsapp_recipients to service_role using(true) with check(true);
create policy service_only on public.school_whatsapp_events to service_role using(true) with check(true);
revoke all on function public.school_wa_save_connection(uuid,text,text,text,text,jsonb,text),public.school_wa_secret(uuid),public.school_wa_create_batch(uuid,uuid,uuid,text,jsonb,jsonb),public.school_wa_claim(uuid,uuid),public.school_wa_event(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.school_wa_save_connection(uuid,text,text,text,text,jsonb,text),public.school_wa_secret(uuid),public.school_wa_create_batch(uuid,uuid,uuid,text,jsonb,jsonb),public.school_wa_claim(uuid,uuid),public.school_wa_event(uuid,text,text,text) to service_role;
