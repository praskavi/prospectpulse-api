create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  alert_type text not null,
  severity text not null default 'warning',
  status text not null default 'open',
  title text not null,
  message text not null,
  source_table text,
  source_id text,
  source_url text,
  metadata jsonb,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  notified_at timestamptz,
  notification_status text not null default 'not_sent',
  notification_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_alerts_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint admin_alerts_status_check check (status in ('open', 'acknowledged', 'resolved')),
  constraint admin_alerts_notification_status_check check (notification_status in ('not_sent', 'sent', 'failed', 'skipped'))
);

alter table public.admin_alerts enable row level security;

drop policy if exists "service only" on public.admin_alerts;

create policy "service only"
on public.admin_alerts
using (false)
with check (false);

create index if not exists admin_alerts_status_idx
on public.admin_alerts (status, severity, last_seen_at desc);

create index if not exists admin_alerts_type_idx
on public.admin_alerts (alert_type, last_seen_at desc);

create index if not exists admin_alerts_source_idx
on public.admin_alerts (source_table, source_id);

create or replace function public.set_admin_alerts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_admin_alerts_updated_at on public.admin_alerts;

create trigger set_admin_alerts_updated_at
before update on public.admin_alerts
for each row
execute function public.set_admin_alerts_updated_at();

comment on table public.admin_alerts is
  'Internal operational alerts generated from existing observability signals. Backend service-role access only.';

comment on policy "service only" on public.admin_alerts is
  'Deny anon/authenticated access. Service role bypasses RLS and admin APIs are the only read/update path.';
