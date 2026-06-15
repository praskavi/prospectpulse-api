# ProspectPulse — Business Rules

Last updated: 2026-06-15

---

## 1. Credit Model Overview

ProspectPulse uses a credit-based billing system. Credits are the product currency.
Users buy or receive credits through their subscription plan. Every search action
consumes credits based on what Apify actually returns — not on what was requested.

### Core principle

> Reserve credits before the search. Deduct actuals after results arrive. Refund the difference.

---

## 2. Credit Rates

| Action | Credits | Equivalent at $0.01/cr | Notes |
|---|---|---|---|
| 1 business scraped | 2 cr | $0.02 | Includes company contact scrape attempt |
| 1 person enriched (LinkedIn) | 15 cr | $0.15 | Per person found, not per place searched |
| 1 email verified (charged result) | 15 cr | $0.15 | Only `ok`, `invalid`, `disposable` |
| 1 email verified (free result) | 0 cr | $0.00 | `catch_all`, `unknown`, `error` — not charged |

### Why 2 credits per business

Apify charges $0.004 per place scraped + $0.002 per company contact scrape attempt
= $0.006 per place. At $0.01 per credit, 2 credits ($0.02) provides a healthy margin
to cover infrastructure, storage, and n8n compute costs.

### Why 15 credits per person

Apify charges $0.10 per person enriched via LinkedIn. 15 credits × $0.01 = $0.15,
giving a $0.05 margin per enriched contact. People enrichment hit rates are typically
12–40% of places searched, so not every place incurs this cost.

### Why email verification is free for catch_all

Apify does not charge for `catch_all`, `unknown`, or `error` results. These domains
accept all email addresses indiscriminately and cannot be definitively verified.
Passing this saving to the user builds trust and reduces friction.

---

## 3. Apify Cost Reference

Underlying Apify costs per unit (as of June 2026):

| Apify Add-on | Cost |
|---|---|
| Place scraped | $0.004 |
| Company contact enrichment (per attempt) | $0.002 |
| Business leads enrichment (per person found) | $0.100 |
| Email verification — `ok`, `invalid`, `disposable` | $0.100 |
| Email verification — `catch_all`, `unknown`, `error` | $0.000 |
| Actor start | ~$0.00005 (negligible) |

---

## 4. Email Verification Rules

Email verification results and charge status:

| Result | Meaning | Charged? |
|---|---|---|
| `ok` | Valid mailbox confirmed | Yes |
| `invalid` | No mailbox exists | Yes |
| `disposable` | Temporary/throwaway address | Yes |
| `catch_all` | Domain accepts all addresses — unverifiable | **No** |
| `unknown` | Could not determine | **No** |
| `error` | Verification service error | **No** |

Email verification requires people enrichment to be enabled. If people enrichment
is off, email verification is automatically disabled.

---

## 5. Hit Rate Estimates

These are empirical estimates based on real Apify runs. Used in the credit estimator
to show realistic worst-case projections.

| Event | Estimated hit rate | Notes |
|---|---|---|
| Company contacts found | ~84% of places | Some places have no website or public contacts |
| Person found per place | ~12–40% | Depends on category and location |
| Email charged (vs free) | ~33–50% | `catch_all` is common for business domains |

The credit estimator uses worst-case (100% hit rate) for people and 50% for email
charges. Actual deductions will typically be 30–60% of the estimated maximum.

---

## 6. Credit Reservation and Deduction Flow

### Before search starts

1. Calculate worst-case credit cost:
   ```
   worst_case = (maxResults × 2)
              + (maxResults × maxLeadsPerPlace × 15)
              + (maxResults × maxLeadsPerPlace × 15 × 0.5)  [if email verify on]
   ```
2. Check user credit balance ≥ worst_case
3. If insufficient → block search, return 402 with message
4. Reserve credits (soft-hold) in the user balance

### After search completes

1. Count actuals from `search_results`:
   ```
   actual_cost = (businesses_found × 2)
               + (people_found × 15)
               + (charged_email_verifications × 15)
   ```
2. Deduct actual_cost from user balance
3. Release the difference (reserved − actual) back to the user

### On search failure

If n8n or Apify returns an error and zero results are written to `search_results`:
- Release all reserved credits (full refund)
- Set `search_status = 'failed'` in the `searches` table
- Show error to user

---

## 7. Plan Limits

| Feature | Free | Starter | Growth |
|---|---|---|---|
| Credits per month | 100 | 1,000 | 4,000 |
| Max results per search | 10 | 25 | 50 |
| Category search terms | 1 | 1 | 3 |
| Company contacts | No | Yes | Yes |
| People enrichment (max per place) | 0 | 1 | 2 |
| Email verification | No | Yes | Yes |
| Search history retention | 7 days | 30 days | 90 days |
| Saved searches | 0 | 5 | 10 |

Plan limits are enforced in two layers:
- **Frontend** — UI disables or hides controls not available to the plan
- **Backend** — `normalizeSearchPayload()` in `searches.service.js` clamps or rejects requests that exceed plan limits, regardless of what the frontend sent

---

## 8. What Is Never Charged

- Failed searches (n8n or Apify error)
- Email results that are `catch_all`, `unknown`, or `error`
- Places where no company contacts or people were found (still charged the base 2 cr for the scrape attempt)
- Searches that are blocked before reaching Apify (credit check failure, validation error)

---

## 9. Future Billing Rules (M3 — Stripe)

The following rules apply once Stripe integration is built:

### Subscription credit top-up
- Credits are granted at the start of each billing cycle
- Unused credits do not roll over to the next month (except Growth plan, TBD)
- Credits are granted immediately on successful Stripe payment

### Credit top-up packs
- Users can purchase additional credits outside their plan allowance
- Top-up credits do not expire within the current billing period

### Subscription downgrade
- If a user downgrades (Growth → Starter), excess credits are not removed immediately
- Credits are capped at the new plan's monthly allowance on the next renewal
- Search history and results are not retroactively deleted on downgrade

### Subscription expiry / cancellation
- On cancellation, a 7-day grace period begins
- After 7 days, `expires_at` is set on all searches (existing retention applies)
- After the grace period, the account is locked (read-only)
- Data is permanently deleted 30 days after grace period ends

### Stripe webhook events handled
| Event | Action |
|---|---|
| `invoice.payment_succeeded` | Grant monthly credits, extend `expires_at` on searches |
| `customer.subscription.deleted` | Begin grace period, set `expires_at` on searches |
| `customer.subscription.updated` | Update plan limits, adjust credit allowance |

---

## 10. Implementation Status

| Rule | Status | Location |
|---|---|---|
| Plan limits enforced in frontend | ✅ Done | `script.js → applyPlanToUI()` |
| Plan limits enforced in backend | ✅ Done | `searches.service.js → normalizeSearchPayload()` |
| Credit estimator (worst case) | ✅ Done | `script.js → updateCreditEstimator()` |
| Credit rates in estimator | ✅ Done | `BUSINESS_CR_RATE=2, PEOPLE_CR_RATE=15, EMAIL_CR_RATE=15` |
| Credit reservation before search | ⬜ M3 | Requires `credits` column on `profiles` table |
| Actual deduction after search | ⬜ M3 | Requires credit ledger in Supabase |
| Stripe webhook handler | ⬜ M3 | New Express route `/webhooks/stripe` |
| Free result passthrough (catch_all) | ⬜ M3 | n8n must pass `emailVerification.result` to `search_results` |
