# ADR 0002: Plan Limits and Entitlements

## Status

Accepted

## Date

2026-06-16

## Context

ProspectPulse has three current plans: Free, Starter, and Growth. Each plan controls monthly credits and feature access, including max results, category terms, company contacts, people enrichment, email verification, search history retention, and saved searches.

Plan limits affect both user experience and backend cost exposure.

## Decision

Represent plan limits in application configuration and enforce them in two layers:

- Frontend: disable or hide unavailable controls.
- Backend: clamp or reject requests that exceed the user's plan, regardless of what the frontend sends.

Current plan credit allocations:

| Plan | Credits |
| --- | ---: |
| Free | 100 |
| Starter | 1000 |
| Growth | 4000 |

## Consequences

The UI can guide users toward valid actions, while the backend remains protected from manually edited requests.

Any future plan change must update both the displayed plan data and backend enforcement.

The backend remains the final authority for entitlement checks.
