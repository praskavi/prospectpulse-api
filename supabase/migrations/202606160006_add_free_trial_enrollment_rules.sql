alter table public.profiles
  add column if not exists free_trial_started_at timestamptz,
  add column if not exists free_trial_eligible_at timestamptz;

create table if not exists public.free_trial_enrollments (
  email text primary key,
  user_id uuid,
  trial_started_at timestamptz not null default now(),
  trial_eligible_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_free_trial_enrollments_user_id
on public.free_trial_enrollments(user_id);

insert into public.free_trial_enrollments (
  email,
  user_id,
  trial_started_at,
  trial_eligible_at
)
select
  lower(u.email),
  p.id,
  now(),
  now() + interval '30 days'
from auth.users u
join public.profiles p on p.id = u.id
where p.plan_code = 'free'
  and u.email is not null
on conflict (email) do nothing;

update public.profiles p
set
  free_trial_started_at = coalesce(p.free_trial_started_at, e.trial_started_at),
  free_trial_eligible_at = coalesce(p.free_trial_eligible_at, e.trial_eligible_at)
from public.free_trial_enrollments e
join auth.users u on lower(u.email) = e.email
where p.id = u.id
  and p.plan_code = 'free';

comment on table public.free_trial_enrollments is
  'Tracks Free trial credit grants by normalized email so users can only receive one Free credit bundle per 30 days.';

comment on column public.profiles.free_trial_started_at is
  'When the current profile last received the Free trial credit bundle.';

comment on column public.profiles.free_trial_eligible_at is
  'When this profile/email is next eligible to receive another Free trial credit bundle.';
