-- Allow teachers and school leadership to withdraw/cancel leave before it starts.
-- Revokes any published substitute covers in school_teacher_covers automatically upon cancellation.
begin;

create or replace function public.bn_review_teacher_leave(p_school uuid,p_leave uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare
  req record;
  is_admin boolean;
  viewer uuid;
  today_kolkata date;
  time_kolkata time;
begin
  if p_status not in ('approved','declined','cancelled') or p_status is null then
    raise exception 'Invalid decision';
  end if;

  is_admin := school_private.has_role(p_school, array['school_admin','principal']);
  viewer := school_private.bn_teacher_member(p_school);

  if p_status <> 'cancelled' and not is_admin then
    raise exception 'Owner or Principal required' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('bn-tt-publish:'||p_school::text));

  select * into req from public.school_teacher_leave_requests l
   where l.institution_id = p_school and l.id = p_leave;

  if not found then
    raise exception 'The request is unavailable or already reviewed';
  end if;

  if p_status = 'cancelled' then
    if not is_admin and req.teacher_id <> viewer then
      raise exception 'Teacher can only withdraw their own leave' using errcode='42501';
    end if;

    if req.status = 'cancelled' or req.status = 'declined' then
      raise exception 'The request is unavailable or already reviewed';
    end if;

    if req.status = 'approved' then
      today_kolkata := (now() at time zone 'Asia/Kolkata')::date;
      time_kolkata := (now() at time zone 'Asia/Kolkata')::time;

      if req.starts_on < today_kolkata or (
        req.starts_on = today_kolkata and (
          (req.starts_at is not null and req.starts_at <= time_kolkata)
          or (req.starts_at is null and time_kolkata >= coalesce(
            (select min(s.starts_at) from public.school_timetable_slots s
             where s.institution_id = p_school and s.kind = 'period'
               and s.weekday = extract(dow from req.starts_on)),
            '08:00'::time
          ))
        )
      ) then
        raise exception 'Leave has already started and cannot be withdrawn';
      end if;
    end if;

    delete from public.school_teacher_covers c
     where c.institution_id = p_school and c.leave_id = p_leave;

    update public.school_teacher_leave_requests
       set status = 'cancelled', decided_at = now(), decided_by = auth.uid(), schedule_year = null
     where institution_id = p_school and id = p_leave;

    return;
  end if;

  if req.status <> 'pending' then
    raise exception 'The request is unavailable or already reviewed';
  end if;

  update public.school_teacher_leave_requests
     set status = p_status, decided_at = now(), decided_by = auth.uid(),
         schedule_year = case when p_status = 'approved' then school_private.bn_active_timetable_year(p_school) else null end
   where institution_id = p_school and id = p_leave;

end $$;

commit;
