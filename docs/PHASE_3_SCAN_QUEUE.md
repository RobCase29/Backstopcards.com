# Phase 3: Scan Queue and Scheduler Boundary

## What Changed

- Added a durable `scan_queue_jobs` table beside the scan coverage ledger.
- Added `/api/scan-queue/status`, `/schedule`, `/claim`, `/complete`, and `/cron`.
- The Marlins page now schedules the next refresh job after every Marlins BIN, auction, and Superfractor coverage write.
- The Marlins page displays queue health next to ledger health: total jobs, due jobs, queued jobs, and next run time.
- The cron route can requeue expired leases and enqueue stale coverage targets from the ledger.

## Production Notes

- `/api/scan-queue/cron` requires `Authorization: Bearer $CRON_SECRET`.
- `claim` and `complete` require `SCAN_QUEUE_SECRET` or `CRON_SECRET` when either is configured.
- `vercel.json` already has two cron entries, which is the Hobby plan limit. This phase exposes the route but does not add a third cron entry.
- On Pro, add this cron when ready:

```json
{
  "path": "/api/scan-queue/cron?teamCode=MIA",
  "schedule": "*/30 * * * *"
}
```

## Data Flow

1. A live Marlins scan runs from the page.
2. The app writes the live market snapshot.
3. The app writes scan coverage targets.
4. The app schedules queue jobs for those same targets with a run-after time based on scan type and result quality.
5. Workers can claim jobs, execute the relevant marketplace scan, and complete or fail the job.

## Next Step

The queue is intentionally execution-agnostic. The next architectural step is a worker that claims due jobs and runs scans outside the browser so full-team coverage stays fresh without manual page interaction.
