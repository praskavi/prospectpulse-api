# ProspectPulse Production Readiness Smoke Test

Last updated: 2026-06-18

Use this checklist before enabling real customer traffic or after any production deployment that touches auth, billing, search, support, admin, webhooks, or alerts.

## Goal

Confirm the complete customer and operator journey works in the deployed environment:

- Login
- Search
- Contact unlock
- Stripe checkout
- Stripe webhook processing
- Admin dashboard
- Support form
- Customer support ticket visibility
- Operational alert scan

## Pass Criteria

Production is smoke-test ready only when:

- All required environment variables are present.
- Supabase migrations are applied.
- API, n8n, Stripe webhook forwarding, and alert scanner are running for the chosen deployment mode.
- Billing processing mode is confirmed:
  - persistent server: BullMQ worker and Redis running
  - Vercel pre-production: `STRIPE_WEBHOOK_PROCESSING_MODE=sync`
- All smoke-test scenarios below pass.
- No new failed Stripe webhooks, failed support notifications, stuck searches, or critical admin alerts remain open.

Stop the release if any billing, credit deduction, auth, webhook, or data-isolation test fails.

## Preconditions

1. Deploy the latest `main` branch.
2. Apply Supabase migrations:

```bash
npx supabase db push
```

3. Set production environment variables:

```text
APP_URL=https://<production-domain>
SUPABASE_URL=https://yeaiazjvuxkytxkfjfzj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<production-service-role-key>
REDIS_URL=<production-redis-url>
STRIPE_WEBHOOK_PROCESSING_MODE=queue
STRIPE_SECRET_KEY=<production-or-sandbox-secret-key-for-test>
STRIPE_WEBHOOK_SECRET=<current-webhook-secret>
STRIPE_PRICE_STARTER=<starter-price-id>
STRIPE_PRICE_GROWTH=<growth-price-id>
N8N_PROSPECTPULSE_WEBHOOK_URL=https://n8n-dev.jobscapeai.com/webhook/prospectpulse-scan
N8N_SUPPORT_CONTACT_WEBHOOK_URL=https://n8n-dev.jobscapeai.com/webhook/prospectpulse/support/contact
N8N_ADMIN_ALERT_WEBHOOK_URL=https://n8n-dev.jobscapeai.com/webhook/prospectpulse/admin/alerts
```

For Vercel pre-production, use this override:

```text
STRIPE_WEBHOOK_PROCESSING_MODE=sync
CRON_SECRET=<long-random-secret-for-manual-alert-scan-test>
```

`REDIS_URL` and the billing worker are not required for Vercel pre-production sync webhook mode.

4. Confirm n8n workflows are active:

| Workflow | Production path |
| --- | --- |
| Search workflow | `/webhook/prospectpulse-scan` |
| Support contact workflow | `/webhook/prospectpulse/support/contact` |
| Admin alert workflow | `/webhook/prospectpulse/admin/alerts` |

5. Start required services for persistent-server deployments:

```bash
npm start
npm run worker:billing
```

For Vercel pre-production, the API is a Vercel Function through `api/index.js`; do not start `npm run worker:billing`.

6. Schedule or manually run alerts:

```bash
npm run alerts:scan
```

For Vercel pre-production, alert scan runs through Vercel Cron at `/api/cron/alerts-scan`. Manual check:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<vercel-preprod-domain>/api/cron/alerts-scan
```

7. Confirm automated tests passed before deployment:

```bash
npm test
```

Expected current baseline:

```text
9 test files passing
72 tests passing
```

Shared Supabase note:

Pre-production uses the same Supabase project as the current environment. Run smoke tests only with seeded test accounts and Stripe test mode. Do not use real customer accounts for checkout, cancellation, support, or credit tests.

## Test Users

Use production-safe test accounts, not real customer accounts. In sandbox/beta, the existing seeded accounts are:

| Email | Purpose |
| --- | --- |
| `test-free@prospectpulse.test` | Free user checkout and search testing |
| `test-starter@prospectpulse.test` | Paid search and unlock testing |
| `test-growth@prospectpulse.test` | Growth plan/admin visibility testing |
| `test-zerocredits@prospectpulse.test` | Insufficient credit guard testing |
| `test-cancelled@prospectpulse.test` | Cancellation/lockout testing |

Known test password:

```text
TestPass123!
```

## Evidence To Capture

For each deployment, record:

- Deployment version or git commit SHA
- Test date/time
- Tester
- Stripe webhook endpoint used
- n8n workflow IDs and execution IDs for support/alerts
- Stripe event IDs for checkout/webhook tests
- Any failed test and fix applied

## Smoke Test Matrix

### ST-01 Login

Steps:

1. Open `https://<production-domain>/login.html`.
2. Log in as `test-free@prospectpulse.test`.
3. Confirm redirect to `app.html`.
4. Confirm avatar dropdown shows the logged-in email.
5. Confirm plan badge and credits load.

Expected:

- Login succeeds.
- `GET /api/me` returns `200`.
- No console blank-screen error.
- Protected pages redirect unauthenticated users to login.

Fail conditions:

- Login loops.
- Profile cannot be loaded.
- API returns `401` for a valid session.

### ST-02 Search

Steps:

1. Log in as a paid test user, preferably `test-starter@prospectpulse.test`.
2. Run a small search, for example:

```text
Category: cafes
Location: Sydney NSW
Max results: 5
```

3. Wait for results.
4. Refresh the app and open search history.
5. Check Supabase `searches` and `search_results`.

Expected:

- Search is created with `search_status = running`, then becomes `completed`.
- Results render in the UI.
- `actual_credits = 2 * businesses_found`.
- Credits are deducted only after completed output is processed.
- Search history can reload the search.

Fail conditions:

- Search stays `running` longer than 15 minutes.
- Results exist in Supabase but do not render.
- Credits are deducted for a failed or empty workflow error.

### ST-03 Unlock Contact

Steps:

1. Use a Starter or Growth user with at least 15 credits.
2. Open a result with locked contact details.
3. Click `Unlock Contact`.
4. Note credits before and after.
5. Click unlock again on the same result.

Expected:

- First unlock deducts exactly 15 credits.
- `search_results.contact_unlocked = true`.
- `credit_transactions` has one `unlock` row with `credits = -15`.
- Second unlock does not deduct again.

Fail conditions:

- Duplicate deduction.
- UI unlocks without backend state changing.
- Free or zero-credit user can unlock.

### ST-04 Stripe Checkout

Steps:

1. Log in as `test-free@prospectpulse.test`.
2. Open avatar dropdown.
3. Click `Upgrade Plan`.
4. Select Starter.
5. Accept required terms.
6. Start checkout.
7. Complete payment with Stripe test card:

```text
4242 4242 4242 4242
Any future expiry
Any CVC
Any postcode
```

8. Confirm redirect to `billing-success.html`.

Expected:

- Checkout redirects to Stripe.
- Payment succeeds.
- User returns to app success page.
- Stripe customer and subscription are created or reused.

Fail conditions:

- Checkout page does not open.
- Wrong price appears.
- Success redirect fails.
- Stripe creates duplicate unwanted customer records for the same profile.

### ST-05 Stripe Webhook

Steps:

1. Confirm Stripe webhook endpoint points to:

```text
https://<production-domain>/api/billing/webhook
```

2. Complete ST-04 checkout.
3. Open Admin Dashboard > Webhooks.
4. Find the related `checkout.session.completed` event.
5. Confirm it was processed by the configured deployment mode.
6. Check Supabase profile for the user.

Expected:

- Webhook row exists in `stripe_webhook_events`.
- Persistent-server mode: event moves through received/queued/processing to `processed`.
- Vercel sync mode: event is received and processed during the webhook request.
- Profile plan becomes Starter.
- Credits match Starter entitlement plus any applicable business rule.
- `stripe_customer_id` is populated.
- No failed BullMQ job remains in queue mode.
- No failed webhook event remains in sync mode.

Fail conditions:

- Webhook signature failure.
- Event remains queued/processing indefinitely.
- Stripe payment succeeds but app entitlement does not update.

### ST-06 Admin Dashboard

Steps:

1. Log in as the admin user:

```text
dittprashant@gmail.com
```

2. Open `https://<production-domain>/admin.html`.
3. Check tabs:

- Overview
- Users
- Searches
- Transactions
- Support
- Alerts
- Billing Health
- Webhooks
- System

4. Log in as a non-admin user and try `/api/admin/overview`.

Expected:

- Admin pages and APIs load for admin.
- Non-admin receives `403`.
- Unauthenticated user receives `401` or login redirect.
- Overview counts are non-error.
- System tab shows API/database ok.
- Redis queue status is shown when Redis is configured; Vercel sync mode may show queue health as unavailable without blocking this smoke test.

Fail conditions:

- Admin access is controlled only by frontend hiding.
- Non-admin can access admin data.
- Admin APIs expose service errors.

### ST-07 Support Form

Steps:

1. Open `https://<production-domain>/contact.html`.
2. Submit a support request using a logged-in test account email.
3. Open Admin Dashboard > Support.
4. Check the matching ticket.
5. Check n8n execution history.
6. Check Gmail inbox for internal notification and customer confirmation.

Expected:

- `POST /api/support/contact` returns success.
- `support_tickets` row is created.
- `n8n_status = sent` when workflow succeeds.
- Internal support email is sent.
- Customer confirmation email is sent.

Fail conditions:

- Ticket is lost if n8n is unavailable.
- Customer sees success but no Supabase ticket exists.
- Support workflow fails without `n8n_error`.

### ST-08 My Support Tickets

Steps:

1. Log in as the user who submitted ST-07.
2. Open avatar dropdown.
3. Click `Support Tickets`.
4. Confirm the ticket appears.
5. Open details.
6. Log in as another test user and open Support Tickets.

Expected:

- User sees tickets matching their profile id or account email.
- Ticket details show subject, message, status, priority, and created time.
- Another user cannot see the first user's ticket.
- Unauthenticated users are redirected to login.

Fail conditions:

- Cross-user ticket visibility.
- Ticket created from contact form does not appear for the same email.
- Missing auth still returns data.

### ST-09 Alert Scan

Steps:

1. Confirm `N8N_ADMIN_ALERT_WEBHOOK_URL` is configured.
2. Run the scanner for the deployment mode.

Persistent server:

```bash
npm run alerts:scan
```

Vercel pre-production:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<vercel-preprod-domain>/api/cron/alerts-scan
```

3. Open Admin Dashboard > Alerts.
4. Click `Scan Now`.
5. Check n8n workflow execution for `ProspectPulse - Admin Operational Alerts`.
6. Check Gmail notification if a new or reopened alert exists.

Expected:

- Command exits with `success: true`.
- Alerts are deduplicated by `alert_key`.
- Existing open alerts are updated, not duplicated.
- New or reopened alerts notify n8n.
- Admin can Ack, Resolve, and Reopen alerts.

Fail conditions:

- Alert scanner crashes on Redis/Supabase failure.
- Duplicate alerts are created for the same issue.
- Notification failure is not recorded.

### ST-10 Zero-Credit Guards

Steps:

1. Log in as `test-zerocredits@prospectpulse.test`.
2. Attempt a search.
3. Attempt to unlock a contact via UI or API.

Expected:

- Search returns `402`.
- Unlock returns `402`.
- `credits_remaining` stays `0`.
- UI shows an actionable error, not a blank screen.

Fail conditions:

- Credits go negative.
- User can start paid actions with zero credits.
- Failure creates misleading success transactions.

## Final Go / No-Go

Go only if:

- ST-01 through ST-10 pass.
- Admin Alerts has no unresolved critical alert caused by this deployment.
- Stripe webhook processing is confirmed.
- Support and alert n8n workflows are active.
- Test evidence is recorded.

No-go if:

- Billing or credits are inconsistent.
- Webhooks fail or remain unprocessed.
- Cross-user data is visible.
- Login/auth is unstable.
- Support tickets can be lost.

## Post-Test Cleanup

After testing:

1. Resolve test support tickets or mark them closed.
2. Resolve test admin alerts if they were created only for smoke testing.
3. Cancel or clean Stripe sandbox subscriptions created for the test if needed.
4. Reset seeded test user credits/plans if the next test run expects a known baseline.
