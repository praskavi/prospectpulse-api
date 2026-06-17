# ADR 0012: Public Pricing And Signup Flow

Date: 2026-06-17

## Status

Accepted.

## Context

ProspectPulse needs a clearer customer journey from public pricing to account creation, login, selected plan, and Stripe checkout. The public pricing page previously sent all plan actions to a generic login page, losing the customer's intended plan.

The product also needs pricing copy that matches implemented credit and plan-change rules.

## Decision

Public paid-plan CTAs pass the intended plan to login:

```text
login.html?mode=signup&plan=starter
login.html?mode=signup&plan=growth
```

The login page stores the pending plan in `localStorage.pp_pending_plan`. After successful login, the user is redirected to:

```text
upgrade.html?plan=<pending_plan>
```

The upgrade page remains responsible for starting Stripe checkout.

Pricing and upgrade pages now state:

- Business results cost 2 credits each.
- Contact unlocks cost 15 credits.
- Failed searches do not deduct credits.
- Starter to Growth adds the Growth credit allocation to remaining balance.
- Growth to Starter resets to the Starter allocation.

The upgrade page requires a terms/refund/acceptable-use acknowledgement before checkout.

## Consequences

Positive:

- Customers do not lose their selected plan during login/signup.
- Paid conversion path is clearer.
- Pricing language matches implemented business rules.
- Checkout has a visible policy acknowledgement.

Tradeoffs:

- Pending plan is stored client-side, so it remains a convenience signal, not an authorization mechanism.
- The actual allowed plan change still must be enforced by backend billing rules.

## Follow-Ups

- Add browser-level tests for public CTA to login to upgrade flow.
- Replace static pricing with backend-rendered or hydrated plan config if a frontend framework is introduced.
- Add analytics events for pricing CTA clicks and checkout starts when an analytics policy is approved.
