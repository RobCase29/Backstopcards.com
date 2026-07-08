# Phase 2 Scan Coverage Ledger

## What Changed

Scan coverage is now persisted as a first-class ledger.

The app can record:

- scan runs
- intended scan targets
- target-level live-hit status
- target-level modeled-opportunity status
- query counts and provider health from scan stats
- latest persisted coverage for a team/player/release target

The Marlins page now reads this ledger so it can distinguish:

- scanned and found modeled opportunity
- scanned and found raw live hits
- scanned and found no active hits
- scan target failed
- not yet recorded

## Migration

No destructive migration is required.

The server creates these SQLite tables when `/api/scan-coverage/run` or `/api/scan-coverage/status` is called:

- `scan_coverage_runs`
- `scan_coverage_targets`

Existing tables are not modified.

## API

`POST /api/scan-coverage/run`

Records one scan run and one row for each intended target.

`GET /api/scan-coverage/status?teamCode=MIA`

Returns latest target state per scan type and target key, plus recent run summaries.

## Current Integration

The Marlins page records coverage from:

- full Marlins BIN scans
- full Marlins auction scans
- single-player Marlins scans
- Marlins Superfractor sweeps

The page displays:

- scanned targets / total ledger targets
- live-hit and no-hit target counts
- raw hit and modeled-window counts
- latest ledger freshness

## Re-Evaluation Checkpoint

This phase creates the durable coverage layer, but it does not yet create a durable job runner.

Remaining concerns:

- scan execution is still browser-triggered
- retries/backoff are still implicit in provider calls
- production Neon persistence is not yet duplicated for this ledger
- target scheduling does not yet have `next_due_at` or priority buckets
- price-lane refresh and live-market refresh are still separate workflows

The next architectural step is a backend scan queue that consumes this ledger and schedules work by team, player, release, target type, freshness, and model priority.
