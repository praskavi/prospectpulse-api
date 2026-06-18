# Vercel Pre-Production Deployment Runbook

Last updated: 2026-06-18

This runbook deploys ProspectPulse to Vercel as a pre-production environment.

## Architecture

Vercel will run:

| Capability | Vercel mechanism |
| --- | --- |
| Static frontend files | Static assets from the repository root |
| Express API | Vercel Function via `api/index.js` |
| Stripe webhooks | Vercel Function with synchronous processing |
| Alert scanning | Vercel Cron calling `/api/cron/alerts-scan` |

Vercel will not run:

| Existing command | Reason |
| --- | --- |
| `npm run worker:billing` | Vercel does not run long-lived background workers |
| `npm run alerts:scan` directly | Vercel Cron triggers HTTP paths, not arbitrary long-running commands |

For Vercel pre-production, set:

```text
STRIPE_WEBHOOK_PROCESSING_MODE=sync
```

This makes Stripe webhook handling process events inside the webhook request instead of queueing them for BullMQ.

## Files Added

```text
api/index.js
vercel.json
src/controllers/cron.controller.js
```

`vercel.json` rewrites `/api/*` and `/health` to the Express app and schedules the alert scan endpoint every 5 minutes.

## Required Environment Variables

Set these in Vercel Project Settings > Environment Variables for the pre-production environment.

General:

```text
NODE_ENV=production
APP_URL=https://<vercel-preprod-domain>
CRON_SECRET=<long-random-secret>
STRIPE_WEBHOOK_PROCESSING_MODE=sync
```

Supabase, shared existing project:

```text
SUPABASE_URL=https://yeaiazjvuxkytxkfjfzj.supabase.co
SUPABASE_ANON_KEY=<existing-project-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<existing-project-service-role-key>
```

Stripe test/sandbox:

```text
STRIPE_SECRET_KEY=<stripe-test-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-signing-secret-for-vercel-url>
STRIPE_PRICE_STARTER=<starter-test-price-id>
STRIPE_PRICE_GROWTH=<growth-test-price-id>
```

n8n-dev:

```text
N8N_PROSPECTPULSE_WEBHOOK_URL=https://n8n-dev.jobscapeai.com/webhook/prospectpulse-scan
N8N_SUPPORT_CONTACT_WEBHOOK_URL=https://n8n-dev.jobscapeai.com/webhook/prospectpulse/support/contact
N8N_SUPPORT_CONTACT_TIMEOUT_MS=15000
N8N_ADMIN_ALERT_WEBHOOK_URL=https://n8n-dev.jobscapeai.com/webhook/prospectpulse/admin/alerts
N8N_ADMIN_ALERT_TIMEOUT_MS=10000
```

Do not set:

```text
DEV_USER_ID
REDIS_URL
```

`REDIS_URL` is not required for Vercel pre-prod when `STRIPE_WEBHOOK_PROCESSING_MODE=sync` is enabled.

## Deploy From GitHub

1. Push latest `main`.
2. Open Vercel.
3. Add New Project.
4. Import:

```text
praskavi/prospectpulse-api
```

5. Framework preset:

```text
Other
```

6. Install command:

```text
npm install
```

7. Build command:

```text
leave empty
```

8. Output directory:

```text
.
```

9. Add environment variables.
10. Deploy.

## Stripe Webhook

Create a Stripe test-mode webhook endpoint:

```text
https://<vercel-preprod-domain>/api/billing/webhook
```

Subscribe to:

```text
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_succeeded
```

Copy the signing secret into:

```text
STRIPE_WEBHOOK_SECRET
```

Redeploy after updating the secret.

## Cron Alert Scan

Vercel Cron is configured in `vercel.json`:

```json
{
  "path": "/api/cron/alerts-scan",
  "schedule": "*/5 * * * *"
}
```

The endpoint requires:

- Vercel scheduled calls with user-agent `vercel-cron/1.0`
- Manual calls with `Authorization: Bearer <CRON_SECRET>`

Manual test:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<vercel-preprod-domain>/api/cron/alerts-scan
```

Expected:

```json
{
  "success": true
}
```

## Shared Supabase Safety

Pre-production uses the existing Supabase project. Use only seeded `@prospectpulse.test` accounts and Stripe test mode.

Do not run broad cleanup SQL against:

- `profiles`
- `searches`
- `search_results`
- `credit_transactions`
- `support_tickets`
- `admin_alerts`

## Smoke Test

After deploy, run:

```text
docs/production-smoke-test.md
```

Minimum first checks:

1. `https://<vercel-preprod-domain>/health`
2. `https://<vercel-preprod-domain>/login.html`
3. Login as seeded test user.
4. Run a small search.
5. Trigger Stripe checkout.
6. Confirm webhook updates plan/credits.
7. Submit support form.
8. Open My Support Tickets.
9. Run alert scan manually with the bearer secret, then confirm the scheduled Vercel Cron run appears in Vercel logs.

## Known Vercel Trade-Off

Queue-based webhook processing is disabled in Vercel pre-production. This is acceptable for smoke testing and early pre-prod validation, but production billing reliability is stronger with a persistent worker environment.

For production scale, choose one:

1. Keep Vercel for frontend/API and run the BullMQ worker elsewhere.
2. Move to a platform that supports both web and worker processes.
3. Replace BullMQ webhook processing with a serverless-native queue.
