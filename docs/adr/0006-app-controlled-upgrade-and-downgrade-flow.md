# ADR 0006: App-Controlled Upgrade and Downgrade Flow

## Status

Accepted

## Date

2026-06-16

## Context

The app needs custom credit behavior for plan changes:

- Starter to Growth adds Growth credits to remaining Starter credits.
- Growth to Starter resets credits to Starter allocation.
- Plan changes should not use Stripe proration.

Stripe Billing Portal is useful, but its default subscription-change behavior can differ from the app's credit rules.

## Decision

Use the app upgrade page and backend billing endpoint for plan upgrades and downgrades.

Use Stripe Checkout for new paid subscriptions.

Use Stripe Billing Portal for billing management tasks such as invoices, receipts, payment methods, and cancellation management.

Remove direct upgrade buttons from the account card and route avatar/dropdown upgrade actions to the app upgrade page.

## Consequences

The app can enforce product-specific credit rules reliably.

Customers still have access to Stripe-hosted billing management.

The upgrade page must stay in sync with plan configuration returned by `GET /api/billing/plans`.
