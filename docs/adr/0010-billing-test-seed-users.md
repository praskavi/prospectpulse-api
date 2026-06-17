# ADR 0010: Billing Test Seed Users

## Status

Accepted

## Date

2026-06-16

## Context

Billing behavior needs repeatable sandbox test users for Free, Starter, Growth, zero-credit, and cancelled scenarios.

Some manually seeded users existed in Supabase Auth and profiles, but not all were linked to real Stripe sandbox customers and subscriptions. Plan-change testing requires real Stripe customers.

## Decision

Maintain a small set of seeded test users for billing QA.

Known test users:

| Email | Purpose |
| --- | --- |
| `test-free@prospectpulse.test` | Free/new user and checkout testing |
| `test-starter@prospectpulse.test` | Starter upgrade testing |
| `test-growth@prospectpulse.test` | Growth downgrade testing |
| `test-zerocredits@prospectpulse.test` | 402 and no-portal negative testing |
| `test-cancelled@prospectpulse.test` | Cancelled/lockout testing |

Linked Stripe sandbox users:

| Email | Stripe customer | Stripe subscription |
| --- | --- | --- |
| `test-starter@prospectpulse.test` | `cus_UiLrHEiABOd9SP` | `sub_1TivE3RsHEJQJEoNQWRZip16` |
| `test-growth@prospectpulse.test` | `cus_UiMEunb44Q5wXF` | `sub_1TivW5RsHEJQJEoNnhWIdCtf` |

## Consequences

Billing QA can be repeated without rebuilding all state from scratch.

Test data must be kept clearly separate from production.

If Stripe sandbox records are deleted, matching Supabase `stripe_customer_id` values must be updated or cleared.
