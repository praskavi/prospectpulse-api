# ADR 0011: Public Compliance And Trust Pages

Date: 2026-06-17

## Status

Accepted as production-readiness draft.

## Context

ProspectPulse handles account data, billing events, credit transactions, search inputs, business lead results, and enriched contact fields. Before a public beta or production launch, customers need clear public information about privacy, terms, acceptable use, refunds, data handling, and support.

The product also needs visible trust links near pricing and billing decisions so customers can review terms before subscribing.

## Decision

Create public draft compliance and trust pages:

- `privacy.html`
- `terms.html`
- `refund.html`
- `acceptable-use.html`
- `data-handling.html`
- `contact.html`

Expose these pages from:

- Landing page navigation/footer
- FAQ footer
- App footer
- Upgrade/pricing page footer

These pages are public and indexable. Admin pages remain `noindex`.

## Important Legal Caveat

These pages are templates for product readiness and should not be treated as legal advice. Before production launch, the final policies should be reviewed by a qualified lawyer, especially because ProspectPulse processes business lead data, contact data, billing records, and exported prospecting lists.

## Consequences

Positive:

- Customers can review privacy, terms, refunds, data handling, and acceptable use before upgrading.
- Support has a clear public reference for billing, credit, and data questions.
- The product looks more credible for private beta and paid testing.

Tradeoffs:

- Draft policies must be kept aligned with actual product behaviour.
- Any legal commitments in these pages create operational expectations.
- A real support inbox should be configured before production.

## Follow-Ups

- Replace placeholder support inbox if needed.
- Add company/legal entity details before public production.
- Add cookie policy if analytics, advertising pixels, or non-essential cookies are introduced.
- Add legal review before broader customer launch.
