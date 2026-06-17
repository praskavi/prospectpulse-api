# ADR 0007: Stripe Webhook Processing With BullMQ

## Status

Accepted

## Date

2026-06-16

## Context

Stripe expects webhook endpoints to respond quickly. Billing updates can require Supabase writes, credit transaction logging, and profile state changes. Doing all work synchronously in the webhook request increases the chance of timeouts or duplicate processing pain.

## Decision

Accept Stripe webhook events in Express, verify the signature, enqueue the event through BullMQ, and process billing side effects in a worker.

Supported webhook endpoints:

```text
/api/billing/webhook
/api/webhooks/stripe
```

Primary billing events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`

## Consequences

Webhook HTTP responses stay fast.

Redis must be available for queue processing.

Billing correctness depends on the worker being running and able to process queued jobs.

Testing must check both Stripe CLI delivery and worker logs.
