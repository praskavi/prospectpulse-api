create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  status text not null default 'received',
  livemode boolean not null default false,
  stripe_created_at timestamptz,
  job_id text,
  attempts integer not null default 0,
  error_message text,
  received_at timestamptz not null default now(),
  queued_at timestamptz,
  processing_started_at timestamptz,
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  payload jsonb
);

alter table public.stripe_webhook_events enable row level security;

drop policy if exists "service only" on public.stripe_webhook_events;

create policy "service only"
on public.stripe_webhook_events
using (false)
with check (false);

create index if not exists stripe_webhook_events_status_idx
on public.stripe_webhook_events (status, updated_at desc);

create index if not exists stripe_webhook_events_type_idx
on public.stripe_webhook_events (event_type, received_at desc);

comment on table public.stripe_webhook_events is
  'Internal Stripe webhook receipt and processing audit log. Backend service-role access only.';

comment on policy "service only" on public.stripe_webhook_events is
  'Deny anon/authenticated access. Service role bypasses RLS and is the only access path used by admin APIs.';

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_email text,
  action text not null,
  target_type text not null,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

drop policy if exists "service only" on public.admin_audit_log;

create policy "service only"
on public.admin_audit_log
using (false)
with check (false);

create index if not exists admin_audit_log_admin_idx
on public.admin_audit_log (admin_user_id, created_at desc);

create index if not exists admin_audit_log_target_idx
on public.admin_audit_log (target_type, target_id, created_at desc);

comment on table public.admin_audit_log is
  'Internal audit log for admin actions. Required before enabling write actions in the admin dashboard.';

comment on policy "service only" on public.admin_audit_log is
  'Deny anon/authenticated access. Service role bypasses RLS and is the only access path used by admin APIs.';
