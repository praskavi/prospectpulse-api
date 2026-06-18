# DigitalOcean Pre-Production Deployment Runbook

Last updated: 2026-06-18

This runbook deploys ProspectPulse to a DigitalOcean App Platform pre-production environment.

## Recommended Architecture

Use DigitalOcean App Platform because ProspectPulse is currently a static frontend plus Node/Express API in one repository.

Components:

| Component | DigitalOcean type | Command |
| --- | --- | --- |
| Web/API/static frontend | Web service | `npm start` |
| Stripe webhook worker | Worker | `npm run worker:billing` |
| Operational alert scanner | Scheduled job | `npm run alerts:scan` |
| Redis/BullMQ backend | Managed database | Valkey/Redis |
| Primary database/auth | External service | Existing Supabase project |
| Search/support/alert workflows | External service | n8n |
| Billing | External service | Stripe sandbox/pre-prod |

DigitalOcean App Platform supports GitHub deployments, environment variables, services, workers, jobs, and app-spec based automation. App Platform services must bind to the public HTTP port on `0.0.0.0`; this app uses Express `app.listen(port)`, which is suitable for that.

## Files Added

Template app spec:

```text
.do/app-preprod.template.yaml
```

This is a template. Replace placeholder values or set encrypted variables in the DigitalOcean UI before creating the app.

## Required Accounts and Access

Before deploying:

1. DigitalOcean account with App Platform access.
2. GitHub access to `praskavi/prospectpulse-api`.
3. Access to the existing Supabase project used by ProspectPulse.
4. Stripe sandbox/pre-production account.
5. Published n8n-dev workflows:
   - Search workflow
   - Support contact workflow
   - Admin alert workflow
6. Gmail/n8n credentials already working.

## Required DigitalOcean Resources

Create:

1. App Platform app named `prospectpulse-preprod`.
2. Managed Valkey/Redis database or App Platform dev database for pre-production.
3. Web service component.
4. Worker component.
5. Scheduled job component.

Recommended region:

```text
sgp
```

This is close to the current Supabase pooler region and suitable for Australia/Sydney testing.

## Environment Variables

Set these at app level so web, worker, and scheduled job share the same configuration.

General:

```text
NODE_ENV=production
APP_URL=https://<preprod-domain>
PORT=3000
```

Supabase:

```text
SUPABASE_URL=https://yeaiazjvuxkytxkfjfzj.supabase.co
SUPABASE_ANON_KEY=<existing-project-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<existing-project-service-role-key>
```

Pre-production uses the same Supabase project as the current environment. Treat DigitalOcean pre-prod as a new compute environment against shared data, not as an isolated database.

Safety rules when sharing Supabase:

- Use only seeded `@prospectpulse.test` accounts for smoke testing.
- Keep Stripe in test/sandbox mode.
- Do not run destructive cleanup against broad customer tables.
- Confirm support/search/admin tests do not create real customer-facing data.
- Review `admin_alerts`, `support_tickets`, `searches`, and `credit_transactions` after smoke tests.

Redis/Valkey:

```text
REDIS_URL=<digitalocean-managed-valkey-or-redis-url>
```

Stripe sandbox/pre-production:

```text
STRIPE_SECRET_KEY=<stripe-test-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-signing-secret-for-preprod-url>
STRIPE_PRICE_STARTER=<starter-test-price-id>
STRIPE_PRICE_GROWTH=<growth-test-price-id>
```

n8n:

```text
N8N_PROSPECTPULSE_WEBHOOK_URL=https://n8n-dev.jobscapeai.com/webhook/prospectpulse-scan
N8N_SUPPORT_CONTACT_WEBHOOK_URL=https://n8n-dev.jobscapeai.com/webhook/prospectpulse/support/contact
N8N_SUPPORT_CONTACT_TIMEOUT_MS=15000
N8N_ADMIN_ALERT_WEBHOOK_URL=https://n8n-dev.jobscapeai.com/webhook/prospectpulse/admin/alerts
N8N_ADMIN_ALERT_TIMEOUT_MS=10000
```

Pre-production n8n MCP project:

```text
MCP server: https://n8n-dev.jobscapeai.com/mcp-server/http
Project ID: cWL7i659OfapHqNZ
Project: Prashant Dittakavi <dittprashant@gmail.com>
```

Verified active ProspectPulse workflows on `n8n-dev`:

| Workflow | ID | Production webhook |
| --- | --- | --- |
| ProspectPulse V2 - Prashant Business Scraper | `faF8BL6Ve35JNeLC` | `https://n8n-dev.jobscapeai.com/webhook/prospectpulse-scan` |
| ProspectPulse - Customer Support Contact Intake | `K23ULmQFQA56OuxX` | `https://n8n-dev.jobscapeai.com/webhook/prospectpulse/support/contact` |
| ProspectPulse - Admin Operational Alerts | `gCDYIWjhioY8J5H1` | `https://n8n-dev.jobscapeai.com/webhook/prospectpulse/admin/alerts` |

Do not set `DEV_USER_ID` in pre-production.

## Deployment Option A: DigitalOcean Control Panel

Use this first if you want the lowest-friction pre-production setup.

1. Push latest `main`.
2. Open DigitalOcean Control Panel.
3. Create > App Platform.
4. Choose GitHub.
5. Select repository:

```text
praskavi/prospectpulse-api
```

6. Branch:

```text
main
```

7. Configure the first component:

```text
Type: Web Service
Name: prospectpulse-web
Build command: npm ci
Run command: npm start
HTTP port: 3000
Instance size: apps-s-1vcpu-1gb
Instance count: 1
Route: /
Health check path: /health
```

8. Add a worker component:

```text
Type: Worker
Name: prospectpulse-billing-worker
Build command: npm ci
Run command: npm run worker:billing
Instance size: apps-s-1vcpu-1gb
Instance count: 1
```

9. Add a scheduled job:

```text
Type: Job
Name: prospectpulse-alert-scan
Kind: Scheduled
Schedule: */5 * * * *
Timezone: Australia/Sydney
Build command: npm ci
Run command: npm run alerts:scan
Instance size: apps-s-1vcpu-0.5gb
```

10. Add Managed Valkey/Redis and set `REDIS_URL`.
11. Add environment variables.
12. Deploy.

## Deployment Option B: App Spec

Use this once the control panel setup is understood.

1. Copy the template:

```bash
copy .do\app-preprod.template.yaml .do\app-preprod.yaml
```

2. Replace placeholder values.
3. Install and authenticate `doctl`.
4. Create the app:

```bash
doctl auth init
doctl apps create --spec .do/app-preprod.yaml
```

If using this path, do not commit `.do/app-preprod.yaml` if it contains real secrets.

## Supabase Migration Step

Before smoke testing:

```bash
npx supabase db push
```

Confirm these tables exist:

- `admin_users`
- `admin_alerts`
- `support_tickets`
- `stripe_webhook_events`
- `free_trial_enrollments`

Because pre-production shares the existing Supabase project, run migrations only after reviewing the pending SQL files. Do not repair or reset migration history from the DigitalOcean deployment unless you have confirmed the impact.

## Stripe Webhook Setup

Create a Stripe webhook endpoint:

```text
https://<preprod-domain>/api/billing/webhook
```

Required event families:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_succeeded`

After creating the endpoint, copy the signing secret into:

```text
STRIPE_WEBHOOK_SECRET
```

Redeploy or restart the App Platform app after changing the secret.

## Post-Deploy Verification

1. Open health endpoint:

```text
https://<preprod-domain>/health
```

Expected:

```json
{
  "status": "ok"
}
```

2. Open login page:

```text
https://<preprod-domain>/login.html
```

3. Check worker logs:

```text
prospectpulse-billing-worker
```

4. Check alert job logs:

```text
prospectpulse-alert-scan
```

5. Run the full smoke test:

```text
docs/production-smoke-test.md
```

## Pre-Production Smoke Test Order

Run in this order:

1. Health endpoint
2. Login
3. Admin dashboard access
4. Search
5. Contact unlock
6. Stripe checkout
7. Stripe webhook processing
8. Support form
9. My Support Tickets
10. Alert scan
11. Zero-credit guard

## Go / No-Go

Go if:

- App deploy is live.
- Worker is running.
- Alert job is running.
- Redis/Valkey connection is healthy.
- Stripe webhook events reach `processed`.
- n8n support and alert workflows send Gmail.
- `docs/production-smoke-test.md` passes.

No-go if:

- Webhooks fail signature verification.
- Worker cannot connect to Redis.
- Checkout succeeds but profile plan/credits do not update.
- Support tickets are lost or invisible to the customer.
- Admin dashboard exposes data to non-admin users.

## Notes

- Use Stripe test keys for pre-production unless this environment is intentionally connected to live Stripe.
- Keep Supabase service role key backend-only.
- Encrypt all secret environment variables in DigitalOcean.
- Remove `DEV_USER_ID` from App Platform environments.
- Update `APP_URL` to the final DigitalOcean URL before testing checkout redirects.
