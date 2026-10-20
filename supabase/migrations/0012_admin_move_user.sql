-- Elevate Campus Hub — 0012 move a person to another campus / change their role (Super Admin)
--
-- One atomic step for the sensitive part of editing a user: changing their campus and/or role. It
--   * refuses Super Admins, students becoming staff (or the reverse), and inactive/unknown campuses,
--   * refuses while the person has an open batch (they must finish it first),
--   * ends their active facilitator<->student assignments, because those only make sense inside one campus
--     and with the same role, and
--   * then changes the role and campus.
-- Nothing else about the person changes, and their history stays with the campus it happened in.
--
-- Only the server (service-role key) may call it, after checking that the caller is a Super Admin.

create or replace function public.admin_move_user(p_user uuid, p_role text, p_campus uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles%rowtype;
  v_ended int := 0;
begin
  select * into v from public.profiles where id = p_user for update;
  if not found then raise exception 'That person could not be found.'; end if;

  if v.role = 'super_admin' then
    raise exception 'A Super Admin''s role and campus can''t be changed here.';
  end if;
  if p_role not in ('campus_head', 'facilitator', 'student') then
    raise exception 'Pick Campus Head, Facilitator or Student.';
  end if;
  if (v.role = 'student') <> (p_role = 'student') then
    raise exception 'A student can''t become staff (or the other way round). Create a new account instead.';
  end if;
  if not exists (select 1 from public.campuses where id = p_campus and is_active) then
    raise exception 'Pick an active campus.';
  end if;
  if p_role in ('facilitator', 'student') and v.gender is null then
    raise exception 'Set their gender first: it decides who they can chat with.';
  end if;

  if v.role = p_role and v.campus_id = p_campus then
    return jsonb_build_object('changed', false, 'ended_assignments', 0);
  end if;

  if exists (select 1 from public.engagement_batches where facilitator_id = p_user and status = 'open') then
    raise exception '% has an open batch. Finish it first, then move them.', v.first_name;
  end if;
  if exists (
    select 1
    from public.batch_students bs
    join public.engagement_batches b on b.id = bs.batch_id
    where bs.student_id = p_user and b.status = 'open'
  ) then
    raise exception '% is in a batch that is still open. Finish the batch first, then move them.', v.first_name;
  end if;

  update public.facilitator_students
  set is_active = false
  where is_active and (facilitator_id = p_user or student_id = p_user);
  get diagnostics v_ended = row_count;

  update public.profiles set role = p_role, campus_id = p_campus where id = p_user;

  return jsonb_build_object('changed', true, 'ended_assignments', v_ended);
end;
$$;

revoke execute on function public.admin_move_user(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_move_user(uuid, text, uuid) to service_role;
