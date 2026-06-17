# ProspectPulse API

ProspectPulse is an MVP lead generation app for local business prospecting.

Users search by business category and location, the Express API creates a user-scoped search record in Supabase, n8n runs the Apify Google Places workflow, and results are stored in `search_results` for the user.

## Current Stack

- Frontend: static HTML, CSS, and JavaScript
- Backend: Node.js and Express
- Database: Supabase
- Auth: Supabase Auth
- Workflow automation: n8n
- Lead source: Apify Google Places actor

## Main Pages

- `index.html` - SEO landing page
- `login.html` - sign in, signup, forgot password
- `confirm.html` - email confirmation redirect handler
- `reset-password.html` - password reset form
- `app.html` - authenticated lead search app

## Database Model

The MVP uses user-scoped search records rather than a shared `leads` table.

- `profiles` extends `auth.users`
- `searches` stores each user search request and status
- `search_results` stores businesses/leads returned for a search

The deprecated tables are:

- `leads`
- `lead_runs`

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` from `.env.example`:

```bash
cp .env.example .env
```

Required environment variables:

```env
PORT=3000
APP_URL=http://localhost:3000
SUPABASE_URL=https://yeaiazjvuxkytxkfjfzj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
REDIS_URL=redis://127.0.0.1:6379
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_PRICE_STARTER=price_REPLACE_ME
STRIPE_PRICE_GROWTH=price_REPLACE_ME
N8N_PROSPECTPULSE_WEBHOOK_URL=https://local.jobscapeai.com/webhook/prospectpulse-scan
DEV_USER_ID=00000000-0000-0000-0000-000000000000
```

Run the dev server:

```bash
npm run dev
```

Run the Stripe billing worker in a second terminal:

```bash
npm run worker:billing:dev
```

Open:

```text
http://localhost:3000/index.html
```

Health check:

```text
http://localhost:3000/health
```

Production readiness smoke test:

```text
docs/production-smoke-test.md
```

## Supabase Auth Redirect URLs

In Supabase Dashboard, add these under **Authentication > URL Configuration > Redirect URLs**:

```text
http://localhost:3000/confirm.html
http://localhost:3000/reset-password.html
```

When deployed, add the production equivalents:

```text
https://yourdomain.com/confirm.html
https://yourdomain.com/reset-password.html
```

## Search Flow

1. User logs in with Supabase Auth.
2. Frontend sends `POST /api/searches`.
3. Express verifies the Supabase JWT.
4. Express creates a row in `searches`.
5. Express sends the search payload to n8n.
6. n8n runs Apify and writes rows to `search_results`.
7. Frontend polls `GET /api/searches/:id/results`.
8. Credits are deducted after the search completes.

## Stripe Billing Webhooks

Stripe webhooks are verified by Express at:

```text
POST http://localhost:3000/api/billing/webhook
```

After signature verification, the API enqueues the event in BullMQ. The worker handles:

- `checkout.session.completed` - updates the user plan, credits, and Stripe customer id
- `customer.subscription.deleted` - downgrades the user to Free
- `invoice.paid` - logs the invoice payment for audit visibility

Redis must be running before Stripe events can be queued:

```bash
redis-server
```

Start the API and worker in separate terminals:

```bash
npm run dev
npm run worker:billing:dev
```

Test locally with Stripe CLI:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Copy the `whsec_...` value printed by `stripe listen` into `.env` as `STRIPE_WEBHOOK_SECRET`, then restart the API. Trigger test events:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.deleted
stripe trigger invoice.paid
```

For real checkout testing, keep `stripe listen` running, start a Checkout upgrade from the app, and complete payment with a Stripe test card.

## n8n Workflow

Workflow ID:

```text
tX0iJh6n0aA8Abev
```

Testing webhook:

```text
https://local.jobscapeai.com/webhook-test/prospectpulse-scan
```

Production webhook:

```text
https://local.jobscapeai.com/webhook/prospectpulse-scan
```

Use the test webhook only while the workflow is in manual test mode. Use the production webhook after the workflow is active/published.

## MVP Plan Limits

Launch MVP includes:

- Free
- Starter
- Growth

Pro is intentionally excluded from the launch MVP.

Current frontend/backend plan rules live in:

- `script.js`
- `src/config/plans.js`

## Useful Commands

Start dev server:

```bash
npm run dev
```

Start production mode:

```bash
npm start
```

Syntax check a backend file:

```bash
node --check src/server.js
```

## Next Planned Migration

The current frontend is static HTML/CSS/JS. The planned production frontend migration is:

- Next.js App Router
- TypeScript
- Tailwind or a component system
- Supabase Auth client integration
- SEO-friendly landing pages
- Authenticated dashboard routes
