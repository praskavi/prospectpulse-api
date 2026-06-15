# ProspectPulse Project Tracker

Last updated: 2026-06-15

## Project Context

ProspectPulse is a lead generation SaaS built while learning full-stack development.

- Frontend: HTML, CSS, JavaScript for MVP validation. Planned migration to Next.js.
- Backend: Node.js with Express.
- Database: Supabase Postgres.
- Supabase project ref: `yeaiazjvuxkytxkfjfzj`.
- Supabase project URL: `https://yeaiazjvuxkytxkfjfzj.supabase.co`.
- Automation: n8n workflow.
- Data source: Apify actor `compass~crawler-google-places`.
- Target storage: Supabase `searches` and `search_results` tables.
- Current app entry points: SEO landing page at `index.html`; MVP app dashboard at `app.html`.

## Architecture Decision

Use one user-facing MVP1 result layer:

- `searches`: one row per user search.
- `search_results`: the businesses/leads returned for that specific search.

Google Sheets currently stores user search results, not raw bulk ingestion data. Therefore n8n should write to `searches` and `search_results`, and results can expire after 30 days.

## Frontend Architecture Decision

Move the product frontend to Next.js after MVP validation.

Target frontend stack:

- Next.js App Router.
- TypeScript.
- Tailwind CSS or a component system built on Tailwind.
- Supabase Auth for login/signup/session handling.
- SEO-friendly marketing pages rendered by Next.js.
- App dashboard pages rendered as React components behind authentication.

Keep the existing Express API during the migration. Do not rewrite frontend, backend, auth, billing, and workflow orchestration all at once.

Target Next.js structure:

```text
prospectpulse-web/
  app/
    page.tsx
    pricing/page.tsx
    login/page.tsx
    signup/page.tsx
    app/search/page.tsx
    app/searches/page.tsx
    app/searches/[id]/page.tsx
  components/
    marketing/
    dashboard/
    ui/
  lib/
    supabase/
    api/
    plans.ts
```

## Database Tasks

| Status | Task | Notes |
| --- | --- | --- |
| Done | Keep `searches` table for each user search | Includes 30-day `expires_at`. |
| Done | Keep `search_results` table for per-search leads | This replaces the current Google Sheet storage. |
| Done | Expand `search_results` for Google Sheet fields | Applied migration `202606130003_expand_search_results_for_n8n.sql`. |
| Done | Deprecate unnecessary `leads` and `lead_runs` tables | Applied migration `202606130002_deprecate_leads_and_lead_runs.sql`. |
| Done | Configure n8n Supabase insert node | n8n writes Apify results into `search_results`. |
| Pending | Add cleanup job for MVP1 user results | Delete expired `searches/search_results` after 30 days. |

## Backend Tasks

| Status | Task | Learning Focus |
| --- | --- | --- |
| Done | Keep server bootable without legacy leads CRUD | Express route mounting and middleware order. |
| Done | Return `410 Gone` for old `/api/leads` endpoints | HTTP status codes and API versioning. |
| Done | Add `/api/searches` endpoint | Express router/controller/service added. Uses temporary `x-user-id`/`DEV_USER_ID` until auth middleware is added. |
| Done | Add `/api/searches/:id/results` endpoint | Frontend polls saved Supabase results to avoid long HTTP timeouts. |
| Done | Start n8n workflow asynchronously | Prevents Cloudflare 524 timeout from long Apify enrichment runs. |
| Next | Add plan-limit enforcement | Business category term limits, max results, people enrichment limits, email verification rules. |
| Later | Add auth middleware | Supabase Auth and protected APIs. |
| Later | Add validation with Zod | Request body validation and error messages. |

## Frontend Tasks

| Status | Task | Notes |
| --- | --- | --- |
| Done | Update search UI to create a `searches` row | Frontend calls Express, not n8n directly. |
| Done | Add enrichment controls | Company contacts, people enrichment, max people per business, email verification. |
| Done | Add SEO-friendly static landing page | `index.html` is marketing page; app moved to `app.html`. |
| Next | Migrate landing page to Next.js | First step in Next.js migration. |
| Next | Migrate app dashboard to React components | Keep Express API during migration. |
| Next | Display `search_results` as cards | Matches V3 spec. |
| Next | Add credit estimator | Critical before running expensive searches. |
| Later | Unlock contact flow | Charge credits, then reveal contact fields. |
| Later | Export businesses/contacts | Different credit costs. |

## Plan Tier Functional Rules

Launch MVP includes Free, Starter, and Growth only. Pro is intentionally excluded from launch to keep billing, permissions, and support scope simpler.

Source file: `subscriptions.csv`.

| Feature | Free | Starter | Growth |
| --- | ---: | ---: | ---: |
| Business category search terms per search | 1 | 1 | 3 |
| Max results per search | 10 | 25 | 50 |
| Credits per month | 100 | 1000 | 4000 |
| Company contacts | Limited | Yes | Yes |
| People enrichment | No | Limited / 1 | Up to 2 |
| Email verification | No | Yes | Yes |
| CSV export | Yes | Yes | Yes |
| Saved searches | No | 5 | 10 |
| Search history | 7 days | 30 days | 90 days |
| API/webhook access | No | No | No |

Plan limits must be enforced in the backend, not only in the frontend.

Apify mapping for multiple category terms:

```json
{
  "searchStringsArray": ["Printing", "Sign Shop", "Commercial Printer"]
}
```

MVP frontend can start with one business category field, then move to a category tag input when Growth plan behavior is implemented.

Later Pro candidate features:

- Business category search terms per search: 5+.
- Max results per search: 100.
- Credits per month: Unlimited.
- Company contacts: Yes.
- People enrichment: Up to 5.
- Email verification: Yes.
- CSV export: Yes.
- Saved searches: Unlimited.
- Search history: 180+ days.
- API/webhook access: Yes.
- Team users and role-based access.
- Cross-team duplicate detection.
- Priority workflow queue.

## n8n To Supabase Mapping

| Google Sheet Column | Supabase Column |
| --- | --- |
| `Company_Name` | `search_results.business_name` |
| `City` | `search_results.city` |
| `Website` | `search_results.website` |
| `Phone` | `search_results.phone` |
| `Url` | `search_results.google_url` |
| `Business_Type` | `search_results.business_type` and/or `searches.business_category` |
| `Rating` | `search_results.rating` |
| `Review_Count` | `search_results.review_count` |
| `Research_Done` | Not needed for MVP1 unless enrichment workflow needs it |
| `Scraped_At` | `search_results.scraped_at` |

Additional Apify fields:

| Apify Field | Supabase Column |
| --- | --- |
| `leadsEnrichment[0].fullName` | `search_results.owner_name` |
| `leadsEnrichment[0].email` or first `emails[]` | `search_results.email` |
| `leadsEnrichment[0].linkedinProfile` or first `linkedIns[]` | `search_results.linkedin_url` |
| Any owner/email/LinkedIn present | `search_results.contact_unlocked = true` |
| Full Apify place object | `search_results.raw_payload` |

## Teaching Notes

- A table is like a spreadsheet tab, but with typed columns, constraints, indexes, and security.
- A migration is a repeatable database change saved in code so the schema can be recreated.
- Express routes are the public API surface; services contain database logic.
- SSR means the server sends ready HTML. CSR means the browser builds UI with JavaScript after load.
- Current MVP app dashboard is client-side rendered and not intended for SEO.
- Marketing pages should be SEO-friendly; private dashboards and lead results should not be indexed.
- RLS means Row Level Security. Supabase can block reads/writes unless a policy allows them. n8n usually writes with a server-side service role key, not the browser anon key.

## Immediate Next Step

Reselect the Apify credential in the n8n draft after MCP workflow updates, then publish the workflow with `responseMode: onReceived`.

After that, restart Express and test:

```bash
npm run dev
```

Then run a browser search from `app.html` and confirm the UI polls `/api/searches/:id/results`.
