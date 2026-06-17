# ADR 0005: Disable Stripe Proration for Plan Changes

## Status

Accepted

## Date

2026-06-16

## Context

ProspectPulse is credit-based. Stripe's default proration is money-based. When Stripe prorates a Starter to Growth change, it can show a credit for unused Starter time, a charge for Growth for the remaining period, and the next full Growth cycle together.

Observed Stripe preview:

```text
Prorated credit from Starter: -$29.00
Prorated charge for Growth: $78.99
Next Growth cycle: $79.00
Total: $128.99
```

This is confusing because the app also applies credit-balance rules.

## Decision

Disable Stripe proration for app-controlled plan changes.

For Starter to Growth:

- Use `proration_behavior: 'none'`.
- Use `billing_cycle_anchor: 'now'`.
- Apply app credit rule: remaining Starter credits plus Growth allocation.

For Growth to Starter:

- Use `proration_behavior: 'none'`.
- Reset credits to Starter allocation.

## Consequences

Customers see simpler billing behavior.

The app must clearly own upgrade and downgrade rules.

Stripe Billing Portal should not be the primary place for custom plan changes unless portal settings are confirmed to match these rules.
