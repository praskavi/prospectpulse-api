# Billing Findings and Learnings

Date: 2026-06-16

## Scope

This note captures the Stripe sandbox, Supabase, billing rules, test users, endpoint behavior, and local process findings from the billing/subscription testing session.

## Current Billing Rules

### Free to Starter or Growth

- Free users can upgrade to either Starter or Growth.
- Checkout should be created through the app upgrade flow.
- A successful subscription payment updates the profile to the selected paid plan.
- Paid plan credits are assigned by plan:
  - Starter: 1000 credits
  - Growth: 4000 credits

### Starter to Growth

- Stripe proration is disabled in the app's custom plan-change flow.
- The Growth billing cycle starts immediately.
- The subscription is updated with `billing_cycle_anchor: 'now'`.
- Credits follow the product credit rule, not Stripe proration:
  - New balance = remaining Starter credits + Growth allocation.
  - Example: 1000 remaining Starter credits + 4000 Growth credits = 5000 credits.

### Growth to Starter

- Stripe proration is disabled.
- No rollover from Growth to Starter.
- Credits reset to the Starter allocation.
- Example: 2500 Growth credits remaining becomes 1000 Starter credits.

### Cancellation

- When a paid subscription is cancelled and Stripe sends `customer.subscription.deleted`, the app moves the user to Free with 0 credits.
- The user is locked out from receiving another free trial/free-plan credit grant for 30 days.
- Cancellation metadata is stored in profile fields when the billing migrations are present:
  - `subscription_cancelled_at`
  - `subscription_cancel_at`
  - `free_plan_eligible_at`
  - `last_paid_plan_code`

## Stripe Proration Learning

Stripe's default subscription update behavior can show confusing invoice previews for credit-based products.

Observed preview for Starter to Growth:

- Prorated credit from Starter: `-$29.00`
- Prorated charge for Growth: `$78.99`
- Next full Growth cycle: `$79.00`
- Total shown: `$128.99`

This happened because the app was previously using `proration_behavior: 'create_prorations'` for Starter to Growth.

Decision:

- Do not use Stripe proration for the current credit-based product model.
- Use the app's custom credit rules instead.
- Avoid routing plan changes through Stripe Billing Portal when custom upgrade/downgrade rules are required, because Portal can apply its own proration settings.

## Implemented App Behavior

### Upgrade Page

- Added a separate upgrade page/endpoint.
- The navbar/avatar Upgrade Plan link should route to the app upgrade page, not directly to Stripe.
- Account card upgrade buttons were removed.

### Billing Plans Endpoint

- `GET /api/billing/plans` returns plan limits and feature settings for the upgrade page.

### Checkout and Plan Changes

- New paid subscriptions use Stripe Checkout.
- Existing subscriptions are updated by the app backend.
- Existing Stripe customers are reused by `stripe_customer_id` or by email lookup.
- Checkout uses `customer: customer.id`, not `customer_email`, to avoid duplicate customers.
- Subscription metadata includes:
  - `plan`
  - `userId`

### Webhook Endpoint

Valid webhook routes:

- `/api/billing/webhook`
- `/api/webhooks/stripe`

The alias route was added because Stripe CLI was previously forwarding to `/api/webhooks/stripe` and receiving `404`.

## Tested Endpoint Behavior

### Billing Portal

Endpoint:

```text
POST /api/billing/portal
Authorization: Bearer <jwt>
```

Starter user result:

- Status: `200`
- `success: true`
- `url` is a valid Stripe Billing Portal URL.
- URL host: `billing.stripe.com`

Free user with no Stripe customer result:

- Tested with `test-zerocredits@prospectpulse.test`.
- Status: `400`
- Message: `No active subscription found. Please upgrade first.`

## Stripe Sandbox Test Customers

### test-starter

Email:

```text
test-starter@prospectpulse.test
```

Supabase user ID:

```text
aaaaaaaa-0002-0002-0002-000000000002
```

Stripe:

- Customer: `cus_UiLrHEiABOd9SP`
- Subscription: `sub_1TivE3RsHEJQJEoNQWRZip16`
- Status: `active`
- Price: `price_1TijaQRsHEJQJEoNVkKjBrOK`
- Plan: Starter

Supabase profile:

- `plan_code`: `starter`
- `credits_remaining`: `1000`
- `stripe_customer_id`: `cus_UiLrHEiABOd9SP`
- `last_paid_plan_code`: `starter`

### test-growth

Email:

```text
test-growth@prospectpulse.test
```

Supabase user ID:

```text
aaaaaaaa-0003-0003-0003-000000000003
```

Stripe:

- Customer: `cus_UiMEunb44Q5wXF`
- Subscription: `sub_1TivW5RsHEJQJEoNnhWIdCtf`
- Status: `active`
- Price: `price_1Tijb5RsHEJQJEoNnWWt7ydx`
- Plan: Growth

Supabase profile:

- `plan_code`: `growth`
- `credits_remaining`: `2500`
- `stripe_customer_id`: `cus_UiMEunb44Q5wXF`
- `last_paid_plan_code`: `growth`

## Seeded Test Users

Known test users:

| Email | Plan | Credits | Notes |
| --- | --- | ---: | --- |
| `test-free@prospectpulse.test` | Starter during latest test state | 1000 | Was upgraded during checkout testing |
| `test-starter@prospectpulse.test` | Starter | 1000 | Linked to real Stripe sandbox customer |
| `test-growth@prospectpulse.test` | Growth | 2500 | Linked to real Stripe sandbox customer |
| `test-zerocredits@prospectpulse.test` | Free | 0 | Good negative test for billing portal |
| `test-cancelled@prospectpulse.test` | Free | 0 | Cancelled/lockout scenario |

Common test password:

```text
TestPass123!
```

## Supabase Findings

Project ref in use:

```text
yeaiazjvuxkytxkfjfzj
```

Supabase URL:

```text
https://yeaiazjvuxkytxkfjfzj.supabase.co
```

Important findings:

- Some manually seeded Auth users initially produced `Database error querying schema` during login.
- The issue was tied to malformed Auth rows and identity metadata.
- Fixes included normalizing Auth fields and identity metadata for test users.
- Local `.env` has `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL`, but no `SUPABASE_ANON_KEY`.
- Profile schema does not have an `email` column.
- Profile schema did not accept `updated_at` in direct updates during the seed scripts.

## RLS Finding

`free_trial_enrollments` needed RLS before going live.

Migration added and pushed:

```text
supabase/migrations/202606160008_enable_rls_on_free_trial_enrollments.sql
```

Policy behavior:

- RLS enabled on `public.free_trial_enrollments`.
- A restrictive policy blocks anon/user direct access.
- Service-role backend operations continue to work.

## Stripe CLI and Webhook Findings

Correct local webhook target:

```text
http://localhost:3000/api/billing/webhook
```

Alias also supported:

```text
http://localhost:3000/api/webhooks/stripe
```

Useful Stripe CLI test:

```text
stripe trigger payment_intent.created
```

Learning:

- If Stripe CLI shows `404` for webhook events, the forwarding URL probably does not match the app route.
- Billing events that matter for this app include:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`

## Redis and Worker Findings

- Billing webhooks are queued through BullMQ.
- Redis must be running for the worker queue flow.
- `redis-cli ping` should return:

```text
PONG
```

Local ports used:

- App server: `3000`
- Redis: `6379`

At end of day, the local stack was stopped:

- App server on `localhost:3000`
- Billing worker Node processes connected to Redis
- Stripe CLI listener
- Redis listeners on `6379`

Final port check showed no listeners on `3000` or `6379`.

## Operational Gotchas

- Do not use fake Stripe customer IDs like `cus_TEST_STARTER_001` or `cus_TEST_GROWTH_001` for plan-change testing. Stripe cannot update subscriptions for customers that do not exist in the sandbox.
- To test upgrade/downgrade, Supabase profile and Stripe customer/subscription must agree.
- Billing Portal is useful for invoices and payment methods, but app-controlled upgrade/downgrade is safer when custom credit behavior is required.
- If the app updates an existing subscription directly, make sure the webhook worker receives `customer.subscription.updated` and applies the credit rule.
- If plan changes appear correct in Stripe but not in Supabase, check the worker terminal and the latest webhook queue execution.

## Recommended Next Tests

1. Log in as `test-starter@prospectpulse.test`.
2. Upgrade to Growth through the app upgrade page.
3. Confirm Stripe subscription changes from Starter price to Growth price.
4. Confirm Supabase profile changes to:
   - `plan_code = growth`
   - `credits_remaining = previous_remaining + 4000`
5. Log in as `test-growth@prospectpulse.test`.
6. Downgrade to Starter through the app flow.
7. Confirm Supabase profile changes to:
   - `plan_code = starter`
   - `credits_remaining = 1000`
8. Confirm Stripe does not show prorated charges/credits for app-controlled plan changes.
