# ADR 0001: Credit-Based Billing Model

## Status

Accepted

## Date

2026-06-16

## Context

ProspectPulse search runs can return different amounts of useful output than the user requested. A request can ask for many places, but actual businesses, people, and verifiable emails vary by location, category, and data availability.

Charging only on input selection would be simpler to calculate, but it can feel unfair when the run returns fewer useful records. Charging after output is known better matches customer value.

## Decision

Use credits as the product currency.

Reserve credits before a search using a worst-case estimate, then deduct based on actual output after results arrive. Refund or release the difference between reserved credits and actual cost.

The core rule is:

```text
Reserve credits before the search. Deduct actuals after results arrive. Refund the difference.
```

## Consequences

Customers are charged based on delivered output instead of requested maximums.

The app must maintain a reservation/deduction flow instead of a simple upfront debit.

The backend must be the source of truth for actual credit deduction. Frontend estimates are only guidance.

Failed searches should release reserved credits.
