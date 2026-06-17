# ADR 0003: Free Trial Re-Entry Lockout

## Status

Accepted

## Date

2026-06-16

## Context

Free trial credits can be abused if the same person repeatedly creates or reuses accounts to receive another free credit bundle.

The product still needs a low-friction Free plan, but repeated free-credit grants should be limited.

## Decision

Grant Free trial credits once per normalized email address per 30 days at profile enrollment time.

If an email is eligible, create the Free profile with 100 credits and record the enrollment.

If the same normalized email enrolls again before the eligibility timestamp, create the Free profile with 0 credits.

Track trial eligibility in `free_trial_enrollments`.

## Consequences

The rule reduces repeated free-credit abuse while still allowing users back onto Free after the lockout window.

The app must normalize emails consistently before trial checks.

The backend service role must be able to read and write enrollment records.
