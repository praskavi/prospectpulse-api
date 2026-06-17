# ADR 0009: Free Trial Enrollments RLS

## Status

Accepted

## Date

2026-06-16

## Context

The `free_trial_enrollments` table records email-level trial usage. This table should not be readable or writable by anonymous clients because it can reveal user enrollment data and can be abused to alter trial eligibility.

## Decision

Enable Row Level Security on `public.free_trial_enrollments`.

Use a restrictive policy that blocks direct anon/user access. Backend service-role operations remain responsible for enrollment reads and writes.

Migration:

```text
supabase/migrations/202606160008_enable_rls_on_free_trial_enrollments.sql
```

## Consequences

Trial enrollment data is protected from client-side access.

All app writes to this table must happen from trusted backend code using the service role.

Local and remote Supabase migration history must remain aligned before deployment.
