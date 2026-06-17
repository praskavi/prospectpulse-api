alter table public.profiles
  add column if not exists subscription_cancelled_at timestamptz,
  add column if not exists subscription_cancel_at timestamptz,
  add column if not exists free_plan_eligible_at timestamptz,
  add column if not exists last_paid_plan_code text;

comment on column public.profiles.subscription_cancelled_at is
  'When the most recent paid subscription cancellation was processed.';

comment on column public.profiles.subscription_cancel_at is
  'When a paid subscription is scheduled to cancel. Access and credits remain unchanged until Stripe sends customer.subscription.deleted.';

comment on column public.profiles.free_plan_eligible_at is
  'Users who cancel a paid subscription are not eligible for the free credit bundle again until this timestamp.';

comment on column public.profiles.last_paid_plan_code is
  'Most recent non-free plan held by the user, used for billing audit and free-plan re-entry rules.';
