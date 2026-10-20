-- Elevate Campus Hub — 0010 students see their facilitator's name only
--
-- Until now a student could read the COMPLETE profile row of their assigned facilitator: email, phone, birthday,
-- church, religion and more, not just what the "Your facilitator" card showed. Hiding fields in the page isn't
-- enough (anyone signed in can query the API directly), so the database stops handing them out.
--
-- What students actually need is the facilitator's name (the card and the chat header) and gender (to tell whether
-- chat is allowed). `my_facilitator()` returns exactly that and nothing else. Chat itself is unaffected: the
-- same-gender rule runs inside `can_chat()`, which is SECURITY DEFINER and never needed the student to read the row.

-- Same policy as before, minus the last branch ("A student sees their assigned facilitator").
drop policy profiles_select on public.profiles;

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.auth_role() = 'super_admin'
    -- Campus Head sees everyone in the campus; facilitators see the campus's students.
    or (
      campus_id = public.auth_campus_id()
      and (
        public.auth_role() = 'campus_head'
        or (public.auth_role() = 'facilitator' and role = 'student')
      )
    )
  );

-- The signed-in student's assigned facilitator: id, name and gender only. Empty for anyone without one.
create or replace function public.my_facilitator()
returns table (id uuid, first_name text, last_name text, gender text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.first_name, f.last_name, f.gender
  from public.facilitator_students fs
  join public.profiles f on f.id = fs.facilitator_id
  where fs.student_id = auth.uid() and fs.is_active
$$;

revoke execute on function public.my_facilitator() from public, anon;
grant execute on function public.my_facilitator() to authenticated;
