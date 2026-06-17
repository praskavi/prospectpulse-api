create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique,
  status text not null default 'open',
  priority text not null default 'normal',
  category text not null default 'general',
  email text not null,
  name text,
  subject text not null,
  message text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  source text,
  n8n_status text not null default 'not_sent',
  n8n_error text,
  n8n_sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_status_check check (status in ('open', 'in_progress', 'resolved', 'closed')),
  constraint support_tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint support_tickets_n8n_status_check check (n8n_status in ('not_sent', 'sent', 'failed', 'skipped'))
);

alter table public.support_tickets enable row level security;

drop policy if exists "service only" on public.support_tickets;

create policy "service only"
on public.support_tickets
using (false)
with check (false);

create index if not exists support_tickets_status_idx
on public.support_tickets (status, created_at desc);

create index if not exists support_tickets_email_idx
on public.support_tickets (lower(email), created_at desc);

create index if not exists support_tickets_category_idx
on public.support_tickets (category, created_at desc);

create or replace function public.set_support_tickets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_support_tickets_updated_at on public.support_tickets;

create trigger set_support_tickets_updated_at
before update on public.support_tickets
for each row
execute function public.set_support_tickets_updated_at();

comment on table public.support_tickets is
  'Customer support contact tickets submitted through the public contact form. Backend service-role access only.';

comment on policy "service only" on public.support_tickets is
  'Deny anon/authenticated access. Service role bypasses RLS and admin APIs are the only read/update path.';
