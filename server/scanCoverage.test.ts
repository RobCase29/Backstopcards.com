import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { handleScanCoverageRoute } from './proxy'

const tempDirs: string[] = []

function tempEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'backstop-scan-coverage-'))
  tempDirs.push(dir)
  return {
    BACKSTOP_SALES_DB: join(dir, 'coverage.sqlite'),
  }
}

function postRun(body: unknown) {
  return new Request('http://localhost/api/scan-coverage/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
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

describe('scan coverage ledger proxy', () => {
  it('records scan targets and returns the latest team coverage summary', async () => {
    const env = tempEnv()
    const first = await handleScanCoverageRoute(
      'run',
      postRun({
        runId: 'run-1',
        scanType: 'bin',
        scanKey: 'bin:Miami Marlins:all',
        teamCode: 'MIA',
        teamLabel: 'Miami Marlins',
        targetType: 'listing',
        searchMode: 'checklist',
        playerScope: 'all',
        releaseScope: 'all',
        observedAt: '2026-07-07T12:00:00.000Z',
        stats: {
          queriesRun: 2,
          queriesSucceeded: 2,
          queriesFailed: 0,
        },
        targets: [
          {
            targetKey: 'listing:2026-bowman:aiva-arquette',
            playerName: 'Aiva Arquette',
            playerKey: 'aiva-arquette',
            releaseKey: '2026-bowman',
            releaseYear: 2026,
            releaseName: '2026 Bowman',
            teamCode: 'MIA',
            listingCount: 3,
            opportunityCount: 1,
            bestEdgeDollars: 112,
            bestScore: 98,
            marketplaces: [{ marketplace: 'ebay', label: 'eBay', listings: 3 }],
          },
          {
            targetKey: 'listing:2026-bowman:luis-arana',
            playerName: 'Luis Arana',
            playerKey: 'luis-arana',
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
    const firstPayload = (await first.json()) as { targetCount: number; listingCount: number; opportunityCount: number }

    expect(first.status).toBe(200)
    expect(firstPayload.targetCount).toBe(2)
    expect(firstPayload.listingCount).toBe(3)
    expect(firstPayload.opportunityCount).toBe(1)

    const status = await handleScanCoverageRoute(
      'status',
      new Request('http://localhost/api/scan-coverage/status?teamCode=MIA'),
      env,
    )
    const payload = (await status.json()) as {
      summary: {
        totalTargets: number
        liveHitTargets: number
        opportunityTargets: number
        noHitTargets: number
        latestObservedAt: string
      }
      targets: Array<{ playerName: string; status: string; listingCount: number; opportunityCount: number }>
    }

    expect(status.status).toBe(200)
    expect(payload.summary.totalTargets).toBe(2)
    expect(payload.summary.liveHitTargets).toBe(1)
    expect(payload.summary.opportunityTargets).toBe(1)
    expect(payload.summary.noHitTargets).toBe(1)
    expect(payload.summary.latestObservedAt).toBe('2026-07-07T12:00:00.000Z')
    expect(payload.targets.find((target) => target.playerName === 'Aiva Arquette')).toMatchObject({
      status: 'live_opportunity',
      listingCount: 3,
      opportunityCount: 1,
    })
  })

  it('uses the newest run per scan target in status views', async () => {
    const env = tempEnv()
    const baseRun = {
      scanType: 'bin',
      scanKey: 'bin:Miami Marlins:all',
      teamCode: 'MIA',
      teamLabel: 'Miami Marlins',
      targetType: 'listing',
      targets: [
        {
          targetKey: 'listing:2026-bowman:aiva-arquette',
          playerName: 'Aiva Arquette',
          playerKey: 'aiva-arquette',
          releaseKey: '2026-bowman',
          releaseYear: 2026,
          releaseName: '2026 Bowman',
          teamCode: 'MIA',
        },
      ],
    }

    await handleScanCoverageRoute(
      'run',
      postRun({
        ...baseRun,
        runId: 'old-run',
        observedAt: '2026-07-07T12:00:00.000Z',
        targets: [{ ...baseRun.targets[0], listingCount: 0, opportunityCount: 0 }],
      }),
      env,
    )
    await handleScanCoverageRoute(
      'run',
      postRun({
        ...baseRun,
        runId: 'new-run',
        observedAt: '2026-07-07T12:10:00.000Z',
        targets: [{ ...baseRun.targets[0], listingCount: 2, opportunityCount: 0 }],
      }),
      env,
    )

    const status = await handleScanCoverageRoute(
      'status',
      new Request('http://localhost/api/scan-coverage/status?teamCode=MIA'),
      env,
    )
    const payload = (await status.json()) as {
      summary: { totalTargets: number; liveHitTargets: number; noHitTargets: number }
      targets: Array<{ runId: string; status: string; listingCount: number }>
    }

    expect(payload.summary.totalTargets).toBe(1)
    expect(payload.summary.liveHitTargets).toBe(1)
    expect(payload.summary.noHitTargets).toBe(0)
    expect(payload.targets).toEqual([expect.objectContaining({ runId: 'new-run', status: 'live_hits', listingCount: 2 })])
  })
})
