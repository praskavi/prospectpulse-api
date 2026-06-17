# ProspectPulse Admin Operating Manual

Date: 2026-06-17

## Purpose

This manual explains how an admin user should operate the ProspectPulse admin dashboard during beta and early production.

The admin dashboard is an internal support and operations tool. It is currently read-only. Use it to inspect users, credits, billing state, search health, and system health. Do not use it as a replacement for Stripe, Supabase, Redis, or n8n when deeper investigation is required.

## Access

Admin URL:

```text
http://localhost:3000/admin.html
```

Production URL will use the deployed domain:

```text
https://<production-domain>/admin.html
```

Current first admin:

```text
dittprashant@gmail.com
```

Access requirements:

- User must be logged in.
- User must exist in the `admin_users` table.
- Non-admin authenticated users receive `403`.
- Unauthenticated users are redirected to login or receive `401` from the API.

If admin access fails:

1. Confirm the user can log in normally.
2. Confirm the user exists in Supabase Auth.
3. Confirm the user has a profile row.
4. Confirm the user is present in `public.admin_users`.
5. Confirm the backend has access to the Supabase service role key.

## Starting The App Locally

From the project root:

```bash
npm run start
```

Then open:

```text
http://localhost:3000/admin.html
```

For development with auto-restart:

```bash
npm run dev
```

## Admin Dashboard Sections

### Overview

Use Overview as the daily first check.

Shows:

- Total users
- Paid users
- Free users
- Zero-credit users
- Searches in the last 24 hours
- Failed searches in the last 24 hours
- Searches stuck in `running`
- Latest failed searches
- Latest webhook failures
- Latest credit transactions

What to look for:

- Failed searches increasing suddenly
- Stuck running searches greater than zero
- Unexpected jump in zero-credit users
- Credit transactions that do not match recent subscription/search activity
- Webhook failures after Stripe payment or subscription activity

Definition of stuck search:

```text
search_status = running
created_at older than 15 minutes
```

### Users

Use Users to inspect account, plan, credit, and Stripe linkage state.

Columns:

- Email
- Plan
- Credits
- Stripe customer ID
- Last paid plan
- Cancellation / lockout date

Common checks:

- Is the customer on the expected plan?
- Does the customer have the expected credit balance?
- Does a paid customer have a real Stripe customer ID?
- Is a cancelled customer restricted from receiving a free trial again?
- Does the user have zero credits?

Available filters:

- Email contains
- Plan
- Has or missing Stripe customer ID
- Zero credits
- Cancelled
- Lockout

Click a user email or user ID to open the user detail page:

```text
admin-user.html?id=<user_id>
```

Important business interpretation:

- `plan_code = free` means the app currently treats the user as Free.
- `credits_remaining = 0` means the user should be blocked from paid-credit actions.
- `stripe_customer_id` should exist for users who have paid through Stripe.
- `free_plan_eligible_at` indicates when a previously paid/cancelled user may become eligible for a free plan/trial again.
- `last_paid_plan_code` helps explain downgrade/cancellation history.

### Searches

Use Searches to inspect lead search workflow health.

Columns:

- Search ID
- User
- Category
- Location
- Status
- Estimated credits
- Actual credits
- Businesses found
- Created date

Search statuses:

- `running`: search was created and is expected to be processing.
- `completed`: search finished and results were stored.
- `failed`: search failed and should not have deducted credits.

Common checks:

- A search failed but credits were deducted: investigate immediately.
- A search is still `running` after 15 minutes: check worker/n8n/backend logs.
- `actual_credits` should align with businesses returned.
- `businesses_found = 0` with `completed` usually means no matching data was found, not necessarily a system failure.

Available filters:

- Status
- User ID
- Category contains
- Location contains
- Failed only
- Stuck

Click a search ID to open the search detail page:

```text
admin-search.html?id=<search_id>
```

### User Detail

Use User Detail when investigating one customer.

Shows:

- Email
- User ID
- Plan
- Credits remaining
- Stripe customer ID
- Cancellation and free eligibility dates
- Recent searches
- Recent credit transactions

Support actions:

- Copy user ID.
- Copy Stripe customer ID.
- Open Stripe customer in the Stripe Dashboard.
- Open linked search detail pages.

### Search Detail

Use Search Detail when investigating one search.

Shows:

- Search status
- Linked user
- Category and location
- Max results
- Estimated credits
- Actual credits
- Businesses and contacts found
- Result preview
- Contact unlock state

Support actions:

- Copy search ID.
- Copy user ID.
- Open linked user detail page.

### Transactions

Use Transactions as the credit ledger.

Columns:

- User
- Transaction type
- Credits
- Description
- Related search ID
- Created date

Transaction types currently used:

- `subscription`: credits granted through subscription/payment lifecycle.
- `search`: credits deducted for returned search output.
- `unlock`: credits deducted for unlocking a contact.
- Cancellation/forfeiture rows may also appear depending on event handling.

How to read credit movement:

- Positive credits increase the user's balance.
- Negative credits reduce the user's balance.
- Search deductions should correspond to completed search output.
- Unlock deductions should be exactly 15 credits.
- Unlocking the same contact again should not create a second deduction.

When investigating a credit complaint:

1. Open the user's row in Users.
2. Note current `credits_remaining`.
3. Open Transactions.
4. Filter mentally or via API by user ID if needed.
5. Sum positive and negative credit movements.
6. Cross-check any `related_search_id` with the Searches section.

Available filters:

- User ID
- Transaction type
- Positive credits
- Negative credits

### Billing Health

Use Billing Health to find Stripe/Supabase mismatches.

Buckets:

- Paid users missing Stripe customer
- Free users with Stripe customer
- Fake Stripe customer IDs
- Cancellation / free lockout users

How to interpret buckets:

- Paid users missing Stripe customer: likely broken test data or failed billing linkage.
- Free users with Stripe customer: can be normal after cancellation, but verify if unexpected.
- Fake Stripe customer IDs: should not exist in production.
- Cancellation / free lockout users: expected for users who cancelled recently and should not receive a fresh free trial immediately.

When a billing mismatch appears:

1. Check the user's profile in Supabase.
2. Check the customer/subscription in Stripe.
3. Check recent webhook delivery in Stripe CLI or Stripe dashboard.
4. Check backend/worker logs for webhook processing errors.
5. Do not manually change production credits/plans unless a documented correction process exists.

### Webhooks

Use Webhooks to inspect Stripe webhook receipt and worker processing.

Columns:

- Stripe event ID
- Event type
- Status
- BullMQ job ID
- Attempts
- Error message
- Received date
- Processed date

Webhook statuses:

- `received`: signature was verified and the event was recorded.
- `queued`: event was added to the BullMQ webhook queue.
- `processing`: worker started processing the event.
- `processed`: worker completed a supported event.
- `ignored`: worker received an unsupported or intentionally ignored event type.
- `failed`: worker failed while processing the event.

Common checks:

- A Stripe payment exists but user plan did not update: look for the related `checkout.session.completed` event.
- A subscription changed but credits did not update: look for `customer.subscription.updated`.
- A cancellation occurred but app state did not update: look for `customer.subscription.deleted`.
- Events stuck in `received` or `queued` usually indicate a queue/worker issue.
- Events with `failed` status should be checked against the worker logs.

Available filters:

- Status
- Event type

Persisted table:

```text
stripe_webhook_events
```

Important:

This table is an internal audit log. It is only accessible from backend service-role code. Do not expose raw payloads to customer-facing pages.

### System

Use System for basic API/database health.

Shows:

- API status
- Database status
- Profile count
- Search count
- Transaction count
- BullMQ `stripe-webhooks` queue counts when Redis is reachable

Current limitation:

Redis/BullMQ health shows queue counts only. If webhook or queue processing is suspected, still check Redis and worker terminals manually.

## Daily Operating Checklist

Run this once per day during beta:

1. Open Admin Dashboard.
2. Confirm Overview loads without error.
3. Check failed searches in the last 24 hours.
4. Check stuck running searches.
5. Check Billing Health for paid users missing Stripe customers.
6. Check fake Stripe customer IDs.
7. Check Webhooks for failed or stuck Stripe events.
8. Review latest credit transactions for unusual deductions.
9. Confirm System shows API and database as `ok`.

## Customer Support Playbooks

### Customer says: "My credits are wrong"

Steps:

1. Open Users and find the customer by email.
2. Confirm plan and `credits_remaining`.
3. Open Transactions.
4. Review subscription grants, search deductions, unlock deductions, and cancellation forfeitures.
5. Check whether any failed searches deducted credits.
6. Check whether unlocks were deducted more than once.
7. If Stripe payment exists but subscription credits are missing, inspect Stripe webhooks and worker logs.

Expected rules:

- Search credits are based on output returned, not only the input selection.
- Unlock contact costs 15 credits.
- Re-unlocking the same contact should not deduct again.
- Failed searches should not deduct credits.

### Customer says: "I paid but my plan did not update"

Steps:

1. Open Users and search by email.
2. Confirm current `plan_code`, credits, and `stripe_customer_id`.
3. Open Billing Health and check whether the user appears in a mismatch bucket.
4. Check Stripe customer and subscription state.
5. Check whether `checkout.session.completed` or `customer.subscription.updated` webhook was received.
6. Open Webhooks and confirm the event is `processed`.
7. Check worker terminal/logs for webhook job processing if the event is `queued`, `processing`, or `failed`.

Expected result:

- Starter plan should grant Starter credits.
- Growth plan should grant Growth credits.
- Starter to Growth upgrade should add remaining Starter credits to Growth credits.
- Growth to Starter downgrade should reset to Starter credits with no rollover.

### Customer says: "I cancelled but did not receive an email"

Steps:

1. Confirm cancellation event in Stripe.
2. Confirm `customer.subscription.deleted` or scheduled cancellation event reached the webhook endpoint.
3. Check user profile cancellation fields.
4. Check Stripe email settings separately.

Note:

Stripe cancellation emails depend on Stripe billing/customer email settings. The admin dashboard confirms app state, not whether Stripe sent an email.

### Customer says: "I cannot use Free plan again"

Steps:

1. Open Users and find the customer.
2. Check `free_plan_eligible_at`.
3. Check `subscription_cancelled_at`.
4. Explain that users who recently cancelled paid subscriptions are restricted from immediately receiving a new free allowance.

Current rule:

```text
A user should not receive a fresh Free plan/trial allowance if they were not eligible within the last 30 days.
```

### Customer says: "My search is stuck"

Steps:

1. Open Searches.
2. Find searches with status `running`.
3. If created more than 15 minutes ago, treat it as stuck.
4. Check backend logs.
5. Check n8n workflow execution.
6. Check Redis/worker health if the search relies on queued work.
7. Confirm whether credits were deducted.

Expected behavior:

- Credits should only be deducted when completed output is processed.
- Failed or stuck searches should not silently reduce the user balance.

## Direct API Checks

Use these only when debugging from a terminal or API client.

Admin overview:

```http
GET /api/admin/overview
Authorization: Bearer <admin_jwt>
```

Users:

```http
GET /api/admin/users?limit=50
Authorization: Bearer <admin_jwt>
```

Searches:

```http
GET /api/admin/searches?limit=50
Authorization: Bearer <admin_jwt>
```

Transactions:

```http
GET /api/admin/transactions?limit=50
Authorization: Bearer <admin_jwt>
```

Billing health:

```http
GET /api/admin/billing/health
Authorization: Bearer <admin_jwt>
```

Webhooks:

```http
GET /api/admin/webhooks?limit=50
Authorization: Bearer <admin_jwt>
```

System health:

```http
GET /api/admin/system/health
Authorization: Bearer <admin_jwt>
```

## Security Rules

Never expose these in browser code:

- Supabase service role key
- Stripe secret key
- Stripe webhook secret
- Redis connection secrets
- n8n credentials

Admin access must always be enforced server-side.

Do not rely on:

- Hidden frontend links
- LocalStorage flags
- Email checks in JavaScript only

Admin APIs must remain behind:

```text
requireAuth
requireAdmin
```

## Current Limitations

The current admin dashboard is read-only.

Not supported yet:

- Manual credit grants
- Manual plan changes
- Refunds
- Subscription cancellation
- Retrying failed searches
- Retrying webhook jobs
- Full Redis/BullMQ health check beyond queue counts
- Admin action audit logging in application code

Before adding write actions, implement:

- Writes to `admin_audit_log`
- Role-based permissions
- Confirmation flows
- Automated tests for each write action
- Clear rollback/correction procedures

## Recommended Next Improvements

Priority order:

1. Add full worker/Redis health to System.
2. Start writing to `admin_audit_log` before any admin write action.
3. Add safe support actions, starting with non-destructive retries.
4. Add broader Stripe subscription reconciliation.

## Verification

Admin API tests:

```bash
npm test
```

Current expected result:

```text
7 test files passing
54 tests passing
```

Admin-specific test file:

```text
tests/07-admin.test.js
```

This verifies:

- Invalid token rejected
- Non-admin user rejected
- Admin overview loads
- Users endpoint loads
- User detail endpoint loads
- Searches endpoint loads
- Search detail endpoint loads
- Transactions endpoint loads
- Billing health endpoint loads
- Webhooks endpoint loads
- System health endpoint loads
