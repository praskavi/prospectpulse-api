do $$
begin
  if to_regclass('public.leads') is not null and to_regclass('public.deprecated_leads') is null then
    alter table public.leads rename to deprecated_leads;
  end if;

  if to_regclass('public.lead_runs') is not null and to_regclass('public.deprecated_lead_runs') is null then
    alter table public.lead_runs rename to deprecated_lead_runs;
  end if;
end $$;

comment on table public.deprecated_leads is
  'Deprecated. Google Sheets stored user search results, so MVP1 writes those rows to public.search_results instead.';

comment on table public.deprecated_lead_runs is
  'Deprecated. MVP1 user searches are represented by public.searches, not separate lead run records.';
