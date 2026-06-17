# ADR 0008: Stripe Customer Reuse and Profile Linking

## Status

Accepted

## Date

2026-06-16

## Context

Duplicate Stripe customers make billing state hard to reason about. Some test users had fake customer IDs in Supabase, such as `cus_TEST_STARTER_001`, which cannot be used by Stripe for real subscription updates.

Checkout can create duplicate customers if the app sends only `customer_email` instead of an existing customer ID.

## Decision

The app should reuse Stripe customers whenever possible.

Customer resolution order:

1. Use `profiles.stripe_customer_id` if present and valid.
2. Search Stripe by user email.
3. Create a new Stripe customer only if no reusable customer exists.

When creating Checkout sessions, pass `customer: customer.id`.

Store `userId` and `plan` in Stripe metadata so webhooks can map events back to Supabase profiles.

## Consequences

Plan changes and billing portal sessions work against the correct Stripe customer.

Supabase and Stripe must be kept aligned during manual test seeding.

Fake Stripe IDs should not be used for users involved in billing tests.
