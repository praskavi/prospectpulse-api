-- Enable pg_cron extension
create extension if not exists pg_cron;

-- Nightly job at 2am: delete searches older than their expiry date
-- search_results rows cascade automatically via FK
select cron.schedule(
  'cleanup-expired-searches',
  '0 2 * * *',
  $$
    delete from public.searches
    where expires_at < now();
  $$
);