alter table public.search_results
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists post_code integer,
  add column if not exists google_url text,
  add column if not exists business_type text,
  add column if not exists review_count integer,
  add column if not exists scraped_at timestamptz,
  add column if not exists raw_payload jsonb;

create index if not exists idx_search_results_search_id_created_at
on public.search_results(search_id, created_at desc);

create index if not exists idx_search_results_business_type
on public.search_results(business_type);

create index if not exists idx_search_results_city
on public.search_results(city);

comment on table public.search_results is
  'Per-user search results/leads for MVP1. Results are linked to public.searches and retained for 30 days via searches.expires_at.';

comment on column public.search_results.google_url is
  'Maps/place URL from Apify Google Places. Replaces the Google Sheet Url column.';
