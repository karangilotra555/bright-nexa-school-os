-- Keep actual Firebase acceptance when the device changes after the send starts.
-- The worker checks the live registration before sending and reports the outcome.
begin;

create or replace function public.bn_finish_urgent_circular_alert(
  p_installation uuid,p_portal text,p_binding uuid,p_token text,p_notice uuid,p_invalid boolean
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_invalid then
    delete from school_private.bn_urgent_circular_devices d where d.installation=p_installation
      and d.portal=p_portal and d.binding=p_binding and d.token=p_token;
  else
    update school_private.bn_urgent_circular_deliveries q set accepted_at=now()
     where q.notice_id=p_notice and q.installation=p_installation and q.portal=p_portal
       and q.binding=p_binding and q.accepted_at is null;
  end if;
end $$;

revoke all on function public.bn_finish_urgent_circular_alert(uuid,text,uuid,text,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.bn_finish_urgent_circular_alert(uuid,text,uuid,text,uuid,boolean)
  to service_role;

commit;
