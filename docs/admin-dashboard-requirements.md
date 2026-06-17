# Admin Dashboard Requirements

Date: 2026-06-17

## Phase

Phase 2: Admin Dashboard

## Purpose

The admin dashboard is an internal support and operations tool for ProspectPulse. It should help the owner/operator quickly understand user state, billing state, credit movement, search health, and integration failures without querying Supabase, Stripe, Redis, or n8n manually.

The dashboard is not a customer-facing feature. It is a production beta prerequisite because billing, credits, webhook processing, and search workflows need operator visibility before real customers are onboarded.

## Goals

1. Give a single place to inspect user accounts, plans, credits, Stripe linkage, and cancellation state.
2. Make failed or stuck searches visible and actionable.
3. Make credit movements auditable without manually querying `credit_transactions`.
4. Make Stripe/Supabase mismatches obvious.
5. Provide enough operational visibility to support private beta customers.
6. Reduce time spent debugging from terminals, Supabase SQL editor, and Stripe dashboard.

## Non-Goals

1. This is not a public customer dashboard.
2. This is not a replacement for the Stripe Dashboard.
3. This is not a full analytics/BI product.
4. This should not allow broad destructive admin actions in the first version.
5. This should not expose service-role access to the browser.

## Users

### Primary User

The ProspectPulse operator/admin.

First admin:

```text
dittprashant@gmail.com
```

Needs:

- Diagnose customer support issues.
- Verify credits and plan state.
- Check whether a search failed, completed, or is stuck.
- Check whether Stripe webhooks updated a user correctly.
- Review recent credit transactions.

### Future Users

Support/admin team members.

Future needs:

- Role-based access.
- Audit logs for admin actions.
- Safer workflows for refunds, credit grants, and account corrections.

## Access Control Requirements

Admin access must be protected server-side.

Minimum v1 rules:

1. Only authenticated users listed as admins can access admin APIs.
2. Admin authorization must not rely only on hiding frontend links.
3. Admin APIs must reject non-admin users with `403`.
4. Admin pages must redirect unauthenticated users to login.
5. Service-role Supabase keys must remain backend-only.

Recommended admin identification:

- Add an `is_admin` boolean or `role` column to `profiles`, or create a separate `admin_users` table.

Recommended v1 approach:

```text
admin_users
- user_id uuid primary key
- email text
- role text -- owner, support
- created_at timestamptz
```

The backend should check this table in an `requireAdmin` middleware.

## Information Architecture

Recommended v1 pages:

1. Admin Overview
2. Users
3. User Detail
4. Searches
5. Search Detail
6. Credit Transactions
7. Billing / Stripe Health
8. Webhook / Worker Health

For the current static frontend, these can start as:

```text
admin.html
admin-user.html?id=<user_id>
admin-search.html?id=<search_id>
```

When moving to Next.js later, convert them into protected admin routes.

## Functional Requirements

### 1. Admin Overview

The overview page should show high-signal operational metrics.

Required cards:

- Total users
- Active paid users
- Free users
- Cancelled/restricted users
- Searches in last 24 hours
- Failed searches in last 24 hours
- Running/stuck searches
- Credits spent in last 24 hours
- Recent Stripe webhook failures, if available

Required tables:

- Latest failed searches
- Latest credit transactions
- Latest subscription/cancellation events

Acceptance criteria:

- Admin can open the dashboard and see current system health without running SQL.
- Failed/stuck searches are visible.
- Latest credit movements are visible.
- Metrics load from backend admin APIs, not hardcoded data.

### 2. Users List

The users list should allow quick lookup by email and plan state.

Required columns:

- Email
- User ID
- Plan
- Credits remaining
- Stripe customer ID
- Last paid plan
- Cancellation state
- Free plan eligible date
- Created date, if available

Required filters:

- Email search
- Plan: Free, Starter, Growth
- Has Stripe customer ID
- Cancelled/restricted
- Low or zero credits

Acceptance criteria:

- Admin can find a user by email.
- Admin can identify users with `credits_remaining = 0`.
- Admin can identify profiles with missing or fake Stripe customer IDs.
- Admin can identify cancellation lockout users.

Current implementation:

- Users list supports email, plan, Stripe customer presence, zero-credit, cancelled, and lockout filters.

### 3. User Detail

User detail should show the full operational state for one user.

Required sections:

- Profile summary
- Current plan and credits
- Stripe linkage
- Cancellation/lockout metadata
- Recent searches
- Recent search results summary
- Recent credit transactions
- Recent billing events, if available

Profile summary fields:

- User ID
- Email, if available from auth/admin lookup
- Plan code
- Credits remaining
- Stripe customer ID
- Last paid plan code
- `subscription_cancelled_at`
- `subscription_cancel_at`
- `free_plan_eligible_at`

Acceptance criteria:

- Admin can answer: "What plan is this user on?"
- Admin can answer: "Why does this user have this credit balance?"
- Admin can answer: "Is this user linked to a real Stripe customer?"
- Admin can answer: "Is this user blocked by cancellation/free-trial lockout?"

Current implementation:

- User detail is available at `admin-user.html?id=<user_id>`.
- Users can be opened from Users, Transactions, Billing Health, and Search Detail.
- The page includes copy support actions and Stripe customer links.

### 4. Searches List

The searches list should make workflow health visible.

Required columns:

- Search ID
- User ID
- User email, if available
- Business category
- Location
- Max results
- Search status
- Estimated credits
- Actual credits
- Businesses found
- Contacts found
- Created at

Required filters:

- Status: running, completed, failed
- Created date range
- User email / user ID
- Failed only
- Stuck running searches

Current implementation:

- Searches list supports status, user ID, category, location, failed-only, and stuck filters.

Definition of stuck:

```text
search_status = running
created_at older than 15 minutes
```

Acceptance criteria:

- Admin can identify failed searches.
- Admin can identify searches stuck in `running`.
- Admin can open a search detail view from the list.
- Admin can see estimated versus actual credit usage.

### 5. Search Detail

Search detail should help debug one search.

Required sections:

- Search metadata
- User profile summary
- Search result count
- Contact count
- Credit calculation summary
- Raw result preview
- Error/failure information, if available

Useful fields:

- `searches.id`
- `searches.user_id`
- `searches.business_category`
- `searches.location`
- `searches.max_results`
- `searches.search_status`
- `searches.estimated_credits`
- `searches.actual_credits`
- `searches.businesses_found`
- `searches.contacts_found`
- `searches.created_at`
- `searches.expires_at`

Acceptance criteria:

- Admin can inspect why a search charged a specific amount.
- Admin can see whether results were inserted.
- Admin can distinguish a no-result search from a failed workflow.

Current implementation:

- Search detail is available at `admin-search.html?id=<search_id>`.
- Searches can be opened from Searches, Transactions, Overview failed searches, and User Detail.
- The page includes search metadata, linked user, result preview, and contact unlock state.

### 6. Credit Transactions

The transactions page should provide a searchable audit log.

Required columns:

- Transaction ID
- User ID
- User email, if available
- Transaction type
- Credits
- Description
- Related search ID
- Created at

Required filters:

- User email / user ID
- Type: subscription, search, unlock
- Positive credits
- Negative credits
- Date range

Current implementation:

- Transactions list supports user ID, transaction type, positive credits, and negative credits filters.
- Date range filtering is still pending.

Acceptance criteria:

- Admin can trace a user's credit balance.
- Admin can find all transactions for a search.
- Admin can confirm that failed searches did not deduct credits.
- Admin can confirm unlocks only deducted once.

### 7. Billing / Stripe Health

The billing page should show Stripe/Supabase alignment.

Required checks:

- Profiles with paid plan but missing `stripe_customer_id`
- Profiles with fake/test placeholder Stripe customer IDs
- Profiles with `stripe_customer_id` but Free plan
- Profiles with cancellation fields set
- Profiles where `last_paid_plan_code` differs from current plan

Required fields:

- User ID
- Email, if available
- Plan code
- Credits remaining
- Stripe customer ID
- Last paid plan code
- Cancellation metadata

Acceptance criteria:

- Admin can quickly identify Stripe/profile mismatches.
- Admin can verify test users are linked to real Stripe sandbox customers.
- Admin can identify users in cancellation lockout state.

### 8. Webhook / Worker Health

The dashboard should expose webhook and worker status enough for beta operations.

Required v1 visibility:

- Latest Stripe webhook events received, if persisted
- Latest worker job status, if persisted
- Failed webhook jobs
- Queue health indicator, if available
- Redis connection health, if available

Supporting table:

```text
stripe_webhook_events
- id uuid primary key
- stripe_event_id text unique
- event_type text
- status text -- queued, processing, processed, failed, ignored
- attempts int
- error_message text
- received_at timestamptz
- processed_at timestamptz
```

Acceptance criteria:

- Admin can tell whether webhooks are being received.
- Admin can tell whether worker processing is failing.
- Admin can inspect the latest failure message.

Current implementation:

- Stripe webhook events are persisted in `stripe_webhook_events`.
- Admin can inspect recent webhook events through `/api/admin/webhooks`.
- Webhooks list supports status and event type filters.
- System health reports BullMQ queue counts when Redis is reachable.

## Backend API Requirements

Add admin-only endpoints under `/api/admin`.

Recommended v1 endpoints:

```text
GET /api/admin/overview
GET /api/admin/users
GET /api/admin/users/:id
GET /api/admin/searches
GET /api/admin/searches/:id
GET /api/admin/transactions
GET /api/admin/billing/health
GET /api/admin/system/health
```

All endpoints must use:

```text
requireAuth
requireAdmin
```

Pagination:

- List endpoints must support `limit` and `page` or cursor pagination.
- Default limit should be 25.
- Maximum limit should be 100.

Filtering:

- Filters must be validated with Zod.
- Unknown filters should be ignored or rejected consistently.

Acceptance criteria:

- Non-admin authenticated users receive `403`.
- Unauthenticated users receive `401`.
- Admin users receive JSON responses with `success: true`.
- List endpoints are paginated.
- Query filters are validated.

## Frontend Requirements

For the current MVP frontend, build a restrained operational interface.

Recommended first file:

```text
admin.html
```

Recommended supporting file:

```text
admin.js
```

Design principles:

- Dense but readable.
- Tables over decorative cards.
- Clear filters.
- Clear empty/loading/error states.
- No marketing copy.
- No customer-facing onboarding content.

Required UI states:

- Loading
- Empty
- Error
- Forbidden / not admin
- Data loaded

Acceptance criteria:

- Admin can load `admin.html` and see overview data.
- Non-admin users cannot see admin data.
- Tables render without text overlap on desktop and mobile.
- Links from users/searches/transactions navigate to the relevant detail view or filtered view.

## Data Requirements

Existing tables used:

- `profiles`
- `searches`
- `search_results`
- `credit_transactions`
- `free_trial_enrollments`

Auth data:

- User email may need to come from Supabase Auth Admin API, not `profiles`, because `profiles` may not have an `email` column.

Stripe data:

- v1 should show stored Stripe IDs and profile metadata.
- Direct live Stripe API lookups can be added later for subscription status reconciliation.

Potential new tables:

- `admin_users`
- `stripe_webhook_events`
- `admin_audit_log`

## Admin Actions

V1 should be read-only by default.

Allowed v1 actions:

- Refresh data
- Open user detail
- Open search detail
- Open Stripe customer link, if Stripe customer ID exists
- Copy user ID/search ID/customer ID

Do not add these in v1 unless separately approved:

- Manually changing plan
- Manually changing credits
- Deleting searches
- Retrying failed jobs
- Refunding credits
- Cancelling subscriptions

Reason:

Read-only admin reduces production risk while still solving the biggest support visibility problem.

## Security Requirements

1. No service-role key in browser code.
2. Admin APIs must be server-side only.
3. Admin authorization must be checked on every admin route.
4. Admin pages should not be indexed by search engines.
5. Avoid exposing raw payloads by default if they contain personal data.
6. Add admin audit logging before any write actions are introduced.

## Privacy and Compliance Requirements

Admin dashboard can expose business and personal contact data, so access must be limited.

Requirements:

- Only admin users can access search result details.
- Raw payloads should be collapsed/hidden by default.
- Exporting admin data is not part of v1.
- Admin use should be covered by internal policy before additional team members are added.

## Observability Requirements

The dashboard should make these conditions obvious:

- Search failed
- Search stuck running
- User has 0 credits
- Paid user has missing Stripe customer ID
- Free/cancelled user is in lockout
- Webhook worker is not processing events
- Credit transaction history does not explain a user's balance

## Acceptance Criteria Summary

Phase 2 is complete when:

1. Admin-only access control exists.
2. Non-admin users cannot access admin APIs or data.
3. Admin overview loads real operational metrics.
4. Admin can search users by email or ID.
5. Admin can inspect one user's plan, credits, Stripe ID, cancellation state, searches, and transactions.
6. Admin can list failed and stuck searches.
7. Admin can inspect credit transactions and filter by user/type/date.
8. Admin can identify Stripe/profile mismatches.
9. Admin UI has loading, empty, error, and forbidden states.
10. All admin endpoints have automated API tests for auth/admin access and basic response shape.

## Suggested Build Order

1. Add `admin_users` table and seed the owner/admin user.
2. Add `requireAdmin` middleware.
3. Add `/api/admin/overview`.
4. Add `/api/admin/users` and `/api/admin/users/:id`.
5. Add `/api/admin/searches` and `/api/admin/searches/:id`.
6. Add `/api/admin/transactions`.
7. Add `/api/admin/billing/health`.
8. Build `admin.html` overview and navigation.
9. Add users/searches/transactions tables.
10. Add automated tests for admin access control and API shape.

## Open Questions

1. Should admin access be controlled by `admin_users` or a `profiles.role` column?
3. Should v1 include direct Stripe API reconciliation or only stored Stripe metadata?
4. Should failed/stuck searches be manually retryable in v1, or read-only only?
5. Should raw Apify payloads be visible in admin search detail?
6. Should admin dashboard be built in current static frontend first, or wait for Next.js migration?

## Recommendation

Build v1 as a read-only static admin page backed by protected Express admin APIs.

Do not wait for Next.js. The admin dashboard is primarily operational infrastructure, and the current frontend can support the first read-only version. Move it to Next.js later when the product frontend is migrated.
