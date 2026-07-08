import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { handleScanCoverageRoute, handleScanQueueRoute } from './proxy'

const tempDirs: string[] = []

function tempEnv(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'backstop-scan-queue-'))
  tempDirs.push(dir)
  return {
    BACKSTOP_SALES_DB: join(dir, 'queue.sqlite'),
    ...extra,
  }
}

function jsonPost(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('scan queue proxy', () => {
  it('schedules, claims, and completes scan jobs', async () => {
    const env = tempEnv()
    const scheduled = await handleScanQueueRoute(
      'schedule',
      jsonPost('http://localhost/api/scan-queue/schedule', {
        source: 'test',
        teamCode: 'MIA',
        teamLabel: 'Miami Marlins',
        scanType: 'bin',
        targetType: 'listing',
        jobs: [
          {
            queueKey: 'mia:bin:2026-bowman:aiva-arquette',
            playerName: 'Aiva Arquette',
            playerKey: 'aiva-arquette',
            releaseKey: '2026-bowman',
            releaseYear: 2026,
            releaseName: '2026 Bowman',
            priority: 99,
            runAfter: '2020-01-01T12:00:00.000Z',
          },
          {
            queueKey: 'mia:bin:2026-bowman:luis-arana',
            playerName: 'Luis Arana',
            playerKey: 'luis-arana',
            releaseKey: '2026-bowman',
            releaseYear: 2026,
            releaseName: '2026 Bowman',
            priority: 70,
            runAfter: '2020-01-01T12:00:00.000Z',
          },
        ],
      }),
      env,
    )
    const scheduledPayload = (await scheduled.json()) as { queued: number; jobs: Array<{ playerName: string }> }

    expect(scheduled.status).toBe(200)
    expect(scheduledPayload.queued).toBe(2)
    expect(scheduledPayload.jobs.map((job) => job.playerName)).toEqual(['Aiva Arquette', 'Luis Arana'])

    const status = await handleScanQueueRoute(
      'status',
      new Request('http://localhost/api/scan-queue/status?teamCode=MIA'),
      env,
    )
    const statusPayload = (await status.json()) as { summary: { totalJobs: number; queuedJobs: number; dueJobs: number } }

    expect(status.status).toBe(200)
    expect(statusPayload.summary.totalJobs).toBe(2)
    expect(statusPayload.summary.queuedJobs).toBe(2)
    expect(statusPayload.summary.dueJobs).toBe(2)

    const claimed = await handleScanQueueRoute(
      'claim',
      jsonPost('http://localhost/api/scan-queue/claim', {
        teamCode: 'MIA',
        limit: 1,
        leaseOwner: 'worker:test',
        leaseSeconds: 120,
      }),
      env,
    )
    const claimedPayload = (await claimed.json()) as {
      claimed: number
      jobs: Array<{ jobId: string; playerName: string; status: string; attempts: number }>
    }

    expect(claimed.status).toBe(200)
    expect(claimedPayload.claimed).toBe(1)
    expect(claimedPayload.jobs[0]).toMatchObject({
      playerName: 'Aiva Arquette',
      status: 'leased',
      attempts: 1,
    })

    const completed = await handleScanQueueRoute(
      'complete',
      jsonPost('http://localhost/api/scan-queue/complete', {
        leaseOwner: 'worker:test',
        jobs: [{ jobId: claimedPayload.jobs[0].jobId, status: 'done' }],
      }),
      env,
    )
    const completedPayload = (await completed.json()) as { completed: number; failed: number; skipped: number }

    expect(completed.status).toBe(200)
    expect(completedPayload).toMatchObject({ completed: 1, failed: 0, skipped: 0 })
  })

  it('requires cron auth and can enqueue stale coverage targets', async () => {
    const env = tempEnv({ CRON_SECRET: 'queue-secret' })
    const unauthorized = await handleScanQueueRoute(
      'cron',
      new Request('http://localhost/api/scan-queue/cron?teamCode=MIA'),
      env,
    )

    expect(unauthorized.status).toBe(401)

    await handleScanCoverageRoute(
      'run',
      jsonPost('http://localhost/api/scan-coverage/run', {
        runId: 'coverage-run-1',
        scanType: 'bin',
        scanKey: 'bin:Miami Marlins:all',
        teamCode: 'MIA',
        teamLabel: 'Miami Marlins',
        targetType: 'listing',
        searchMode: 'checklist',
        playerScope: 'all',
        observedAt: '2020-01-01T12:00:00.000Z',
        targets: [
          {
            targetKey: 'listing:2026-bowman:aiva-arquette',
            playerName: 'Aiva Arquette',
            playerKey: 'aiva-arquette',
            releaseKey: '2026-bowman',
            releaseYear: 2026,
            releaseName: '2026 Bowman',
            teamCode: 'MIA',
            listingCount: 0,
            opportunityCount: 0,
          },
        ],
      }),
      env,
    )

    const cron = await handleScanQueueRoute(
      'cron',
      new Request('http://localhost/api/scan-queue/cron?teamCode=MIA', {
        headers: { Authorization: 'Bearer queue-secret' },
      }),
      env,
    )
    const cronPayload = (await cron.json()) as {
      scheduledFromCoverage: { evaluated: number; due: number; queued: number }
      summary: { totalJobs: number; queuedJobs: number }
    }

    expect(cron.status).toBe(200)
    expect(cronPayload.scheduledFromCoverage).toMatchObject({ evaluated: 1, due: 1, queued: 1 })
    expect(cronPayload.summary).toMatchObject({ totalJobs: 1, queuedJobs: 1 })
  })
})
