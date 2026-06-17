create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "service only" on public.admin_users;

create policy "service only"
on public.admin_users
using (false)
with check (false);

comment on table public.admin_users is
  'Internal admin access allowlist. Read and write only from backend service-role code.';

comment on policy "service only" on public.admin_users is
  'Deny anon/authenticated access. Service role bypasses RLS and is the only access path used by admin APIs.';

insert into public.admin_users (user_id, email, role)
select id, email, 'owner'
from auth.users
where lower(email) = lower('dittprashant@gmail.com')
on conflict (user_id) do update
set email = excluded.email,
    role = excluded.role;
