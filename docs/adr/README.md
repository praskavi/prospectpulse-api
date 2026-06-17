# Architecture Decision Records

This folder tracks important product and architecture decisions for ProspectPulse.

Use ADRs for decisions that affect billing behavior, data access, security, user entitlements, integrations, or long-lived system design. Keep operational findings and test evidence in `BILLING_FINDINGS_AND_LEARNINGS.md`, and keep customer-facing rules in `BUSINESS_RULES.md`.

## ADR Format

Each ADR should include:

- Status
- Date
- Context
- Decision
- Consequences

## Records

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-credit-based-billing-model.md) | Accepted | Use credits as the product currency and deduct based on actual output |
| [0002](0002-plan-limits-and-entitlements.md) | Accepted | Enforce Free, Starter, and Growth plan limits in frontend and backend |
| [0003](0003-free-trial-reentry-lockout.md) | Accepted | Grant free trial credits once per normalized email per 30 days |
| [0004](0004-paid-subscription-cancellation-lockout.md) | Accepted | Cancelled paid users move to restricted Free with a 30-day free-credit lockout |
| [0005](0005-disable-stripe-proration-for-plan-changes.md) | Accepted | Disable Stripe proration for app-controlled plan changes |
| [0006](0006-app-controlled-upgrade-and-downgrade-flow.md) | Accepted | Use the app upgrade page for plan changes and Stripe Portal for billing management |
| [0007](0007-stripe-webhook-processing-with-bullmq.md) | Accepted | Queue Stripe webhook handling through BullMQ |
| [0008](0008-stripe-customer-reuse-and-profile-linking.md) | Accepted | Reuse Stripe customers and link them to Supabase profiles |
| [0009](0009-free-trial-enrollments-rls.md) | Accepted | Enable RLS on free trial enrollment tracking |
| [0010](0010-billing-test-seed-users.md) | Accepted | Maintain linked Stripe/Supabase sandbox test users for billing QA |
