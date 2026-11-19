-- Observe a Firebase cooldown without letting an obsolete attempt change the current claim.
begin;

create function public.bn_defer_urgent_circular_alert(
  p_installation uuid,p_portal text,p_binding uuid,p_notice uuid,p_claim_until timestamptz,p_retry_at timestamptz
)
returns void language sql security definer set search_path='' as $$
  update school_private.bn_urgent_circular_deliveries q set lease_until=least(q.expires_at,p_retry_at)
   where q.installation=p_installation and q.portal=p_portal and q.binding=p_binding
     and q.notice_id=p_notice and q.lease_until=p_claim_until and q.accepted_at is null
     and q.expires_at>now() and least(q.expires_at,p_retry_at)>q.lease_until
     and p_retry_at is not null
$$;

revoke all on function public.bn_defer_urgent_circular_alert(uuid,text,uuid,uuid,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.bn_defer_urgent_circular_alert(uuid,text,uuid,uuid,timestamptz,timestamptz)
  to service_role;

commit;
