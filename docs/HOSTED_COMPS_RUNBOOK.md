# Hosted Comp Pipeline

The hosted comp pipeline keeps Bowman pricing current without requiring a local scrape or a new deployment.

## Data flow

```text
Official/Wax Pack Hero player universe
  -> backstop_comp_refresh_queue
  -> Elite daily export
       -> strict player + year + flagship base-auto classifier
       -> item-level sales in backstop_comp_sales
       -> affected lane summaries in backstop_comp_lanes
  -> targeted Card Hedge search (identity gaps only)
  -> targeted Card Hedge comps (known IDs skip search)
  -> batch FMV corroboration
  -> /api/sales-cache/players
  -> full Daily Board hydration
```

## Freshness contract

- Daily export: ingested once per UTC date and recorded in `backstop_comp_meta`; the importer walks up to 45 recent completed UTC dates, skipping dates already loaded and tolerating provider publication lag.
- Known comp lanes: eligible for direct refresh after 20 hours.
- Batch FMV: eligible after 20 hours.
- No-match players: retried after 7 days unless a user explicitly prioritizes them.
- Transient errors: retried after 6 hours.
- On-demand refresh: sets the requested player/year to the top queue priority and runs within the current API budget.
- Historical backfill: each broad refresh walks backward through up to 45 recent Elite daily exports, records an idempotent marker per date, then uses exact player search/comps calls for names not discovered in bulk data.
- Release fairness: queue claims are interleaved across release years so current products cannot starve older checklists.

## Safety rules

- The checklist queue defines eligible players; export rows cannot create arbitrary players.
- Only raw, flagship Bowman Chrome prospect/draft-pick autos with a structured `CPA-*` or `CDA-*` card number can anchor base price.
- Paper, Mega/Mojo, Sapphire, Gold Ink, PackFractor, inserts, image variations, and other auto families are rejected from the base lane.
- Team words such as `Red Sox` never imply a Red /5 parallel because variation identity comes from structured Card Hedge fields.
- Live listings never enter sold-comp tables.
- A direct sold lane leads the model; FMV only blends when its method and confidence are suitable.

## Operations

- `GET /api/card-hedge/refresh` is cron-only and requires `Authorization: Bearer $CRON_SECRET`.
- `POST /api/card-hedge/refresh` is same-origin and can run a broad refresh or accept `{ "playerName", "releaseYear" }` for targeted recovery.
- `GET /api/sales-cache/status` exposes queue counts, fresh lane counts, the latest sync run, and API health.
- `npm run comps:hosted-bootstrap` regenerates the deployable queue/model bootstrap from the local canonical database.
- `npm run comps:hosted-backfill -- --batches=6` safely accelerates a large backlog from an authenticated workstation. It reads the ignored `.vercel-access-code.txt`, waits between batches for the configured provider limit, and prints aggregate telemetry only.

## Failure recovery

1. Check Data Health for the latest run error and API budget.
2. Confirm `CARD_HEDGE_API_KEY`, `DATABASE_URL`, Upstash variables, and `CRON_SECRET` exist in Production.
3. Run a targeted player refresh to separate taxonomy failure from provider failure.
4. If the daily export fails, direct known-ID comp refreshes still proceed.
5. If Card Hedge is unavailable, the last Neon model and static bootstrap remain readable; live scans should continue using the last trusted price.
