# ADR 0004: Paid Subscription Cancellation Lockout

## Status

Accepted

## Date

2026-06-16

## Context

A paid user who cancels could otherwise immediately return to Free and receive another 100-credit allocation. This would allow cycling between paid cancellation and free-credit grants.

Stripe also has multiple cancellation states. A subscription can be scheduled to cancel later, or it can actually be deleted/cancelled.

## Decision

Treat scheduled cancellation and actual cancellation differently.

For scheduled cancellation:

- Keep the current paid plan unchanged.
- Keep credits unchanged.
- Store the scheduled cancellation timestamp in `subscription_cancel_at`.

For actual cancellation via `customer.subscription.deleted`:

- Set `plan_code = 'free'`.
- Set `credits_remaining = 0`.
- Set `subscription_cancelled_at`.
- Clear `subscription_cancel_at`.
- Set `free_plan_eligible_at = subscription_cancelled_at + 30 days`.
- Store the last paid plan in `last_paid_plan_code`.

## Consequences

Customers retain paid access until the subscription actually ends.

Cancelled users cannot immediately collect another Free credit bundle.

Webhook processing must distinguish `customer.subscription.updated` with cancellation scheduling from `customer.subscription.deleted`.
