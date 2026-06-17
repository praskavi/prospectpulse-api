alter table public.free_trial_enrollments enable row level security;

drop policy if exists "service only" on public.free_trial_enrollments;

create policy "service only"
on public.free_trial_enrollments
using (false)
with check (false);

comment on policy "service only" on public.free_trial_enrollments is
  'Deny anon/authenticated access. Service role bypasses RLS and is the only writer used by the API.';
