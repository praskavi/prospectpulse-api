alter table public.profiles
  add column if not exists subscription_cancel_at timestamptz;

comment on column public.profiles.subscription_cancel_at is
  'When a paid subscription is scheduled to cancel. Access and credits remain unchanged until Stripe sends customer.subscription.deleted.';
