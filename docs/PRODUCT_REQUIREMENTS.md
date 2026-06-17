# ProspectPulse Product Requirements

Last updated: 2026-06-17

## Maintenance Rule

Update this document whenever a new feature is implemented, materially changed, deprecated, or moved out of scope. Every feature change should also update the relevant supporting document:

- `BUSINESS_RULES.md` for plan, credit, billing, cancellation, and entitlement rules
- `docs/adr/` for long-lived product or architecture decisions
- `test-cases.html` and/or automated tests for expected behavior
- Feature-specific docs such as `docs/admin-dashboard-requirements.md`

This PRD is the master view of what ProspectPulse currently does and what each feature is expected to achieve.

## Product Summary

ProspectPulse is a credit-based lead generation product for Australian SMB-focused prospecting. Users search for local businesses, receive structured business results, and can unlock richer contact data depending on plan entitlement and credit balance.

The product combines:

- A customer-facing search app
- Stripe subscription billing
- Supabase auth and persistence
- n8n/Apify-powered search and support workflows
- Admin operations tooling
- Compliance and support pages

## Target Users

### Primary Customers

Australian SMB operators, sales teams, founders, and agencies who need local business lead lists without buying a large enterprise sales database.

### Internal Users

The ProspectPulse operator/admin, initially:

```text
dittprashant@gmail.com
```

Internal users need visibility into users, billing, credits, searches, webhooks, and support requests.

## Product Goals

1. Let customers find local business leads quickly.
2. Make credit usage transparent and based on delivered output.
3. Support Free, Starter, and Growth plans with clear upgrade paths.
4. Prevent free-credit abuse through trial and cancellation lockouts.
5. Provide reliable Stripe billing and webhook processing.
6. Give the operator enough admin visibility to support real customers.
7. Provide public trust, compliance, FAQ, and contact surfaces before production launch.

## Current Release Scope

The current product is a production-beta candidate, not yet a fully hardened production SaaS.

Implemented scope includes:

- Authenticated customer app
- Credit-based search and contact unlock flows
- Plan entitlement enforcement
- Stripe checkout, portal, webhook, cancellation, upgrade, and downgrade handling
- Admin dashboard
- Support ticket intake and admin retry
- Operational alerting
- Public FAQ/compliance pages
- Automated API test suite

Production launch still requires final deployment validation, email credential confirmation, compliance review, and operational monitoring.

## Implemented Features

### 1. Authentication and Profiles

Status: Implemented

Users can sign up, log in, reset passwords, and access authenticated app features through Supabase Auth.

Implemented capabilities:

- Signup
- Login
- Logout
- Password reset request
- Password reset completion
- `GET /api/me`
- Profile plan and credit metadata
- Authenticated API access via bearer token

Acceptance criteria:

- Valid users can log in and reach `app.html`.
- Invalid login attempts fail cleanly.
- Protected APIs reject missing or invalid JWTs.
- `GET /api/me` returns current plan, credits, and entitlement metadata.

Supporting tests:

- `tests/01-auth.test.js`

### 2. Plan Model and Entitlements

Status: Implemented

ProspectPulse supports three plans:

| Plan | Monthly credits | Max results | Contact features |
| --- | ---: | ---: | --- |
| Free | 100 | 10 | No contact unlock/enrichment |
| Starter | 1,000 | 25 | Contact unlock/enrichment available |
| Growth | 4,000 | 50 | Higher search limits and enrichment capacity |

Implemented capabilities:

- Frontend plan-aware controls
- Backend plan enforcement
- Free user upgrade eligibility
- Starter/Growth feature gates
- Search payload clamping/rejection on the backend

Acceptance criteria:

- Free users cannot use paid-only enrichment/contact unlock features.
- Free users can upgrade to Starter or Growth.
- Starter users can upgrade to Growth.
- Growth users can downgrade to Starter.
- Backend remains authoritative even if frontend controls are bypassed.

Supporting docs:

- `BUSINESS_RULES.md`
- `docs/adr/0002-plan-limits-and-entitlements.md`

### 3. Credit Model

Status: Implemented

Credits are the product currency. Credit deduction is based on actual delivered output, not merely the user input selection.

Implemented rates:

| Action | Credits |
| --- | ---: |
| Business result returned | 2 |
| Contact unlock | 15 |
| People/email enrichment rules | Documented for current/future enrichment behavior |

Implemented capabilities:

- Credit balance display
- Insufficient credit protection
- Search credit deduction
- Unlock credit deduction
- Idempotent contact unlock
- Credit transaction history

Acceptance criteria:

- Zero-credit users receive `402` on paid actions.
- Failed or blocked actions do not deduct credits.
- Search deductions match returned result count.
- Unlocking the same contact twice does not deduct twice.
- Credit transactions are visible and ordered newest-first.

Supporting tests:

- `tests/02-search.test.js`
- `tests/03-unlock.test.js`
- `tests/04-credits.test.js`

Supporting docs:

- `BUSINESS_RULES.md`
- `docs/adr/0001-credit-based-billing-model.md`

### 4. Search Workflow

Status: Implemented

Users can run business searches by category and location. In development, `DEV_STUB=true` can return deterministic stub data for automated tests and local testing.

Implemented capabilities:

- Search form
- Plan-aware limits
- Backend validation
- n8n webhook integration for live search workflow
- Dev stub mode for repeatable testing
- Search history
- Search result listing
- CSV export for search results
- Failed search handling

Acceptance criteria:

- Search requests validate required fields.
- Free/Starter/Growth limits are enforced.
- Search results render without blank screen failures.
- Search history can be loaded.
- CSV download is available for results.
- n8n/Apify failure returns an actionable error and does not charge incorrectly.

Supporting tests:

- `tests/02-search.test.js`

### 5. Contact Unlock

Status: Implemented

Paid users can unlock contact details on search results when available.

Implemented capabilities:

- Unlock contact endpoint
- 15-credit deduction
- Plan gate for Free users
- Insufficient-credit guard
- Idempotent re-unlock
- Inline contact reveal
- Credit history refresh after unlock

Acceptance criteria:

- Starter/Growth users can unlock contacts if they have enough credits.
- Free users are blocked with a plan/upgrade message.
- Zero-credit users receive `402`.
- A second unlock of the same result does not deduct again.
- Credit transaction row is recorded with type `unlock`.

Supporting tests:

- `tests/03-unlock.test.js`
- `tests/04-credits.test.js`

### 6. Credit History

Status: Implemented

Users can inspect credit transactions and filter by transaction type.

Implemented capabilities:

- `GET /api/me/transactions`
- Credit history page
- Summary cards
- Transaction table
- Filters for searches, unlocks, and subscriptions
- Positive/negative credit styling
- Lazy loading and cache refresh after unlock

Acceptance criteria:

- Transactions return as an array ordered newest-first.
- Each item includes id, transaction type, credits, description, and created timestamp.
- Summary cards reflect current balance and totals.
- Filters hide/show rows correctly.
- Unlocking a contact refreshes history on next open.

Supporting tests:

- `tests/04-credits.test.js`

### 7. Stripe Billing

Status: Implemented

Stripe is used for subscriptions, checkout, billing portal, and webhook-driven account updates.

Implemented capabilities:

- Billing plans endpoint
- Stripe Checkout session creation
- Stripe Customer Portal session creation
- Stripe customer reuse
- Stripe profile linking
- Billing success page
- Stripe webhook endpoint
- Webhook signature verification
- BullMQ queued webhook processing
- Webhook observability table
- Worker processing for relevant events

Handled business events include:

- Checkout/session completion
- Invoice/payment success
- Subscription updates
- Scheduled cancellation
- Actual cancellation/deletion

Acceptance criteria:

- Checkout creates Stripe sessions for valid plans.
- Portal returns a valid Stripe billing portal URL for paid users with a Stripe customer.
- Webhook signatures are verified.
- Webhook events are queued before processing.
- Webhook failures are observable in admin.

Supporting tests:

- `tests/05-billing.test.js`
- `tests/06-webhooks.test.js`

Supporting ADRs:

- `docs/adr/0005-disable-stripe-proration-for-plan-changes.md`
- `docs/adr/0006-app-controlled-upgrade-and-downgrade-flow.md`
- `docs/adr/0007-stripe-webhook-processing-with-bullmq.md`
- `docs/adr/0008-stripe-customer-reuse-and-profile-linking.md`

### 8. Upgrade and Downgrade Rules

Status: Implemented

The app controls plan changes and uses Stripe for payment/billing operations.

Implemented rules:

- Free users can upgrade to Starter or Growth.
- Starter users upgrading to Growth keep remaining Starter credits and receive Growth credits.
- Growth users downgrading to Starter receive Starter credits only. No Growth rollover.
- Stripe proration is disabled for app-controlled plan changes.
- Account card direct upgrade links were removed in favor of a separate upgrade page.
- Avatar dropdown routes to the upgrade page instead of directly to Stripe.

Acceptance criteria:

- Upgrade page reflects current plan and limits.
- Upgrade checkout redirects to Stripe.
- After successful payment/webhook, profile plan and credits update correctly.
- Downgrade behavior follows the no-rollover Growth-to-Starter rule.

Supporting docs:

- `BUSINESS_RULES.md`
- `docs/adr/0005-disable-stripe-proration-for-plan-changes.md`
- `docs/adr/0006-app-controlled-upgrade-and-downgrade-flow.md`

### 9. Free Trial and Cancellation Lockout

Status: Implemented

Free credits are protected against repeated abuse.

Implemented capabilities:

- `free_trial_enrollments` tracking
- One free trial grant per normalized email per 30 days
- Free plan eligibility metadata
- Paid cancellation lockout
- Scheduled cancellation tracking
- Actual cancellation handling

Rules:

- New Free users receive 100 credits only if eligible.
- If the same email re-enrolls within 30 days, the Free profile is created with 0 credits.
- Paid subscription cancellation moves user to Free permission tier with 0 credits.
- Cancelled paid users do not receive a new Free credit bundle for 30 days.

Acceptance criteria:

- Free trial re-entry within 30 days does not grant another 100 credits.
- Actual cancellation forfeits remaining paid credits.
- Scheduled cancellation does not prematurely downgrade the user.
- Cancelled users can still see upgrade options.

Supporting migrations:

- `202606160005_add_free_plan_reentry_lockout.sql`
- `202606160006_add_free_trial_enrollment_rules.sql`
- `202606160007_add_scheduled_cancellation_tracking.sql`
- `202606160008_enable_rls_on_free_trial_enrollments.sql`

Supporting ADRs:

- `docs/adr/0003-free-trial-reentry-lockout.md`
- `docs/adr/0004-paid-subscription-cancellation-lockout.md`
- `docs/adr/0009-free-trial-enrollments-rls.md`

### 10. Admin Dashboard

Status: Implemented

The admin dashboard gives the operator visibility into users, searches, billing, webhooks, system health, credit transactions, and support tickets.

Implemented pages:

- `admin.html`
- `admin-user.html`
- `admin-search.html`

Implemented APIs:

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `GET /api/admin/searches`
- `GET /api/admin/searches/:id`
- `GET /api/admin/transactions`
- `GET /api/admin/billing/health`
- `GET /api/admin/webhooks`
- `GET /api/admin/system/health`
- `GET /api/admin/support-tickets`
- `GET /api/admin/support-tickets/:id`
- `PATCH /api/admin/support-tickets/:id`
- `POST /api/admin/support-tickets/:id/retry-workflow`
- `GET /api/admin/alerts`
- `POST /api/admin/alerts/scan`
- `PATCH /api/admin/alerts/:id`

Implemented capabilities:

- Admin-only access through `admin_users`
- Overview metrics
- User list/detail
- Search list/detail
- Transaction list
- Billing health anomalies
- Stripe webhook observability
- System health
- Support ticket management
- n8n retry action for support tickets
- Operational alert scanning and acknowledgement
- Audit logging for admin write actions

Acceptance criteria:

- Unauthenticated users receive `401`.
- Authenticated non-admin users receive `403`.
- Admin users can access dashboard data.
- Admin can find users by email/plan/credit/Stripe/cancellation state.
- Admin can inspect failed/stuck searches.
- Admin can inspect credit transactions.
- Admin can retry failed support workflow forwarding.
- Admin can scan for failed webhooks, failed/stuck searches, failed support notifications, and failed queue jobs.
- Admin can acknowledge, resolve, and reopen operational alerts.

Supporting tests:

- `tests/07-admin.test.js`

Supporting docs:

- `docs/admin-dashboard-requirements.md`
- `docs/admin-operating-manual.md`

### 11. Operational Alerts

Status: Implemented

Operational alerts turn existing observability signals into proactive admin notifications.

Implemented capabilities:

- `admin_alerts` table with RLS enabled and service-role-only policy
- Alert scanner service
- Optional n8n alert webhook forwarding via `N8N_ADMIN_ALERT_WEBHOOK_URL`
- Published n8n admin alert workflow: `Fg1Bmv4PyN9VLnRV`
- Scheduled scanner command: `npm run alerts:scan`
- Admin Alerts tab
- Admin alert list/filter API
- Admin scan-now API
- Admin acknowledge/resolve/reopen API
- Audit logging for alert scan and status changes

Alert sources:

- Failed Stripe webhook events in `stripe_webhook_events`
- Failed searches in `searches`
- Searches stuck in `running` for more than 15 minutes
- Failed support workflow notifications in `support_tickets.n8n_status`
- Failed or unreachable BullMQ Stripe webhook queue

Acceptance criteria:

- The scanner deduplicates repeated problems by stable `alert_key`.
- New alerts are persisted as open alerts.
- Resolved alerts reopen if the same issue is detected again.
- Notification forwarding is skipped safely if no n8n alert webhook is configured.
- Admin can manually run a scan from the dashboard.
- Admin can acknowledge, resolve, and reopen alerts.

Supporting migration:

- `202606170012_create_admin_alerts.sql`

### 12. Support Contact and Ticketing

Status: Implemented

Customers can submit support requests through the public contact page.

Implemented capabilities:

- Public `contact.html` support form
- `POST /api/support/contact`
- Backend-first Supabase ticket creation
- `support_tickets` table
- Best-effort n8n workflow forwarding
- n8n Supabase-node support workflow
- n8n Gmail internal notification
- Customer confirmation email
- Admin Support tab
- Admin retry of n8n workflow
- Customer-facing support ticket visibility page

Current architecture:

```text
Customer form
-> Backend /api/support/contact
-> Supabase support_tickets insert
-> n8n support workflow best-effort
-> Supabase n8n_status update
-> Gmail notification to support
```

Reliability rule:

- Supabase is the source of truth for support tickets.
- If n8n is down, the customer ticket still exists in Supabase.
- Failed n8n notification is recorded with `n8n_status = failed`.
- Admin can retry n8n from the Support tab.

Acceptance criteria:

- Valid support form submissions create a ticket.
- Invalid submissions return validation errors.
- Admin can see support tickets.
- Admin can change ticket status.
- Admin can retry n8n forwarding.
- Logged-in customers can view support tickets submitted with their account email or profile id.
- Logged-in customers cannot view another user's support tickets.
- n8n can create/update Supabase tickets via Supabase node.
- Gmail notification sends after workflow success when credential is available.

Customer page:

- `support-tickets.html`

Customer APIs:

- `GET /api/me/support-tickets`
- `GET /api/me/support-tickets/:ticketId`

Supporting migration:

- `202606170011_create_support_tickets.sql`

### 13. Public Pricing and Signup Flow

Status: Implemented

The public landing/pricing path routes users into signup and upgrade flows.

Implemented capabilities:

- Landing page pricing CTA links
- Signup mode on login page
- Pending plan preservation through login/signup
- Redirect to upgrade page for selected paid plan
- Upgrade page with terms checkbox
- Free-credit lockout messaging

Acceptance criteria:

- Free CTA opens signup.
- Starter/Growth CTAs preserve selected plan through auth.
- Authenticated users can start Stripe Checkout from upgrade page.
- Terms must be accepted before checkout.

Supporting ADR:

- `docs/adr/0012-public-pricing-and-signup-flow.md`

### 14. Public FAQ and Compliance Pages

Status: Implemented

Public trust and support pages exist for customers and launch readiness.

Implemented pages:

- `faq.html`
- `privacy.html`
- `terms.html`
- `refund.html`
- `acceptable-use.html`
- `data-handling.html`
- `contact.html`

Implemented content covers:

- Credits
- Rollover behavior
- Filters
- Search usage
- Billing
- Refund expectations
- Privacy/data handling
- Acceptable use
- Support contact paths

Acceptance criteria:

- Public users can view FAQ and policy pages without login.
- App and landing pages link to relevant trust pages.
- Contact page supports real ticket submission.

Supporting ADR:

- `docs/adr/0011-public-compliance-and-trust-pages.md`

### 15. Automated Test Suite

Status: Implemented

The app has a Vitest/Supertest integration test suite covering core business flows.

Implemented test files:

- `tests/01-auth.test.js`
- `tests/02-search.test.js`
- `tests/03-unlock.test.js`
- `tests/04-credits.test.js`
- `tests/05-billing.test.js`
- `tests/06-webhooks.test.js`
- `tests/07-admin.test.js`
- `tests/08-support.test.js`

Implemented coverage:

- Auth
- Search plan limits
- Credit guards
- Contact unlock
- Credit history
- Billing plans and checkout
- Stripe webhooks
- Admin APIs
- Support ticket admin/retry flow
- Customer support ticket visibility

Current latest known result:

```text
67 tests passed
```

Acceptance criteria:

- `npm test` should pass before production deployment or commit/push of meaningful changes.
- Network-backed tests require Supabase and n8n/Stripe mocks or sandbox reachability depending on suite area.

### 16. Project Documentation and ADRs

Status: Implemented and ongoing

Implemented documentation:

- `BUSINESS_RULES.md`
- `BILLING_FINDINGS_AND_LEARNINGS.md`
- `docs/admin-dashboard-requirements.md`
- `docs/admin-operating-manual.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/adr/`

Implemented ADRs:

- Credit model
- Plan limits
- Free trial lockout
- Paid cancellation lockout
- Stripe proration
- App-controlled upgrade/downgrade
- BullMQ webhook processing
- Stripe customer reuse
- Free trial RLS
- Billing test users
- Public compliance pages
- Public pricing/signup flow

Acceptance criteria:

- New feature decisions should be recorded in ADRs when they affect product behavior, data model, billing, security, or integrations.
- PRD should remain current with implemented features.

## Non-Functional Requirements

### Security

- Service-role Supabase key must stay backend-only.
- Admin APIs must require both authentication and admin authorization.
- Stripe webhooks must verify signatures.
- RLS must be enabled for internal tracking tables where appropriate.
- Public support form must validate input server-side.

### Reliability

- Stripe webhooks are queued through BullMQ.
- Support tickets are created in Supabase before n8n forwarding.
- n8n failures are captured through ticket `n8n_status`.
- Admin can retry support workflow forwarding.
- Operational alerts are deduplicated and persisted in `admin_alerts`.
- `npm run alerts:scan` can be scheduled by the hosting platform for proactive checks.

### Observability

- Admin dashboard exposes users, searches, transactions, webhook events, billing health, system health, and support tickets.
- Stripe webhook events are persisted in `stripe_webhook_events`.
- Admin audit logs are written for admin support ticket write actions.
- Admin alerts expose operational failures before the operator has to inspect raw tables.

### Compliance and Trust

- Public legal/trust pages exist.
- FAQ explains credits, filters, billing, rollover, support, and usage.
- Product must not be considered production-ready until privacy/compliance content receives final review.

## Out of Scope / Not Yet Implemented

The following are not yet complete production features:

- Full production deployment hardening
- Next.js frontend migration
- Full CRM integrations
- Advanced analytics/BI reporting
- Refund automation
- Manual admin credit grants
- Direct admin plan mutation
- Search retry from admin
- Full role-based admin permissions beyond owner/support
- Dedicated email deliverability provider such as Postmark/SendGrid
- Full customer onboarding flow
- Backup enrichment provider for LinkedIn/Apify risk

## Production Readiness Checklist

Before charging real customers in production:

1. Deploy backend with production environment variables.
2. Verify Supabase migrations are applied.
3. Verify Stripe production prices and webhook endpoint.
4. Verify Redis/BullMQ worker is running.
5. Verify n8n workflows are active and credentials are production-safe.
6. Configure `N8N_ADMIN_ALERT_WEBHOOK_URL` or confirm alert notifications are intentionally skipped.
7. Schedule `npm run alerts:scan`.
8. Verify Gmail/support notification deliverability.
9. Run `npm test`.
10. Run manual smoke tests for signup, search, unlock, checkout, cancellation, admin, support, and alerts.
11. Review privacy, terms, refund, acceptable use, and data handling pages.
12. Confirm admin user access and non-admin denial.

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-17 | Added operational alert scanning, admin alert visibility, and optional n8n alert forwarding. |
| 2026-06-17 | Added customer support ticket visibility to support feature scope. |
| 2026-06-17 | Created PRD and documented implemented auth, credits, search, billing, admin, support, compliance, and test suite features. |
