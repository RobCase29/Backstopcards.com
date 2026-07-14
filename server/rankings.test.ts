import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleRankingsRoute } from './proxy'

function postRefreshRequest() {
  return new Request('http://localhost/api/rankings/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: '{}',
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('rankings proxy', () => {
  it('refreshes hosted ranking CSVs without shifting consensus columns', async () => {
    let blankRankPlayerId: string | null = null
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('/api/v1/player-signals')) {
        const requestUrl = new URL(href)
        const ids = (requestUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean)
        blankRankPlayerId ??= ids[0] ?? null
        return new Response(
          JSON.stringify({
            schemaVersion: 'player-signals.v1',
            contractVersion: 'player-signals-contract/v1',
            snapshot: {
              id: 'player-signals-snapshot/v1:test',
              dataAsOf: '2026-07-14T14:14:34.796Z',
              freshness: { status: 'ok' },
            },
            items: ids.map((id, index) => ({
              recordVersion: `record:${id}`,
              player: {
                id,
                name: `Oracle Player ${index + 1}`,
                externalIds: { mlbam: null },
              },
              classification: {
                route: 'milb',
                rankingRole: 'hitter',
                age: 20,
                organizationCode: 'MIA',
                position: 'SS',
                currentLevel: 'AA',
              },
              signals: {
                stageRank: {
                  label: 'Prospect Rank',
                  availability: 'available',
                  reasonCodes: [],
                  rank: id === blankRankPlayerId ? null : index + 1,
                  universe: 6_490,
                  targetId: 'mlb_war_next_5_ge_5',
                  asOf: '2025-12-31T00:00:00.000Z',
                  modelVersion: 'milb-impact-five-calendar-year-war-v1',
                  evidenceTier: 'completed_season_full_model',
                  volatility: 'standard',
                },
                careerOutlook: {
                  availability: 'available',
                  value: 72,
                  band: { id: 'mlb_contributor', label: 'MLB contributor' },
                  basis: 'conditional_on_mlb_arrival',
                  asOf: '2025-12-31T00:00:00.000Z',
                  modelVersion: 'career-model-v1',
                },
              },
            })),
            page: { page: 1, limit: 50, total: ids.length, totalPages: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (href.includes('get-consensus') && href.includes('type=hitting')) {
        return new Response(
          JSON.stringify({
            updated: '2026-07-08T12:00:00Z',
            players: [
              {
                fg_id: 'sa-aiva',
                name: 'Aiva Arquette',
                age: 22,
                level: 'AA',
                team: 'MIA',
                position: 'SS',
                avg_rank: 101,
                coverage: 7,
                in_sts: 1,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (href.includes('get-consensus') && href.includes('type=pitching')) {
        return new Response(
          JSON.stringify({
            updated: '2026-07-08T12:05:00Z',
            players: [
              {
                fg_id: 'sa-pitcher',
                name: 'Test Pitcher',
                age: 21,
                level: 'A+',
                team: 'NYY',
                position: 'SP',
                avg_rank: 55,
                coverage: 6,
                in_sts: 1,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (href.includes('get-leaderboard')) {
        return new Response(
          JSON.stringify([
            {
              player_id: 'mlb-1',
              player: 'Shohei Ohtani',
              age: 31,
              highest_level: 'MLB',
              team_update: 'LAD',
              sp_rp: 'DH/SP',
              rank: 1,
              prospect_rank: '',
              c_30_day_change: 0,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({ error: 'unexpected url' }), { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleRankingsRoute('refresh', postRefreshRequest())
    const payload = (await response.json()) as {
      rows: number
      sources: Array<{ population: string; csv: string; rows: number; matchedRows: number }>
    }

    expect(response.status).toBe(200)
    const oracle = payload.sources.find((source) => source.population === 'oracle-prospect')
    expect(oracle?.rows).toBeGreaterThan(0)
    expect(oracle?.matchedRows).toBe((oracle?.rows ?? 0) - 1)
    const oracleHeaders = oracle?.csv.split('\n')[0].split(',') ?? []
    expect(oracleHeaders).toContain('Checklist Name')
    expect(oracleHeaders).not.toContain('Name')
    expect(oracleHeaders).toContain('Oracle Player Id')
    expect(oracleHeaders).toContain('Snapshot Id')
    expect(payload.rows).toBe((oracle?.rows ?? 0) + 3)

    const oracleRequests = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((href) => href.includes('/api/v1/player-signals'))
      .map((href) => new URL(href))
    const requestedIds = oracleRequests.flatMap((url) => (url.searchParams.get('ids') ?? '').split(',').filter(Boolean))
    expect(oracleRequests).toHaveLength(Math.ceil((oracle?.rows ?? 0) / 50))
    expect(requestedIds).toHaveLength(oracle?.rows ?? 0)
    expect(new Set(requestedIds).size).toBe(requestedIds.length)
    expect(oracleRequests.every((url) => (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).length <= 50)).toBe(true)

    const hitter = payload.sources.find((source) => source.population === 'hitter')
    expect(hitter?.rows).toBe(1)
    expect(hitter?.matchedRows).toBe(1)
    expect(hitter?.csv.split('\n')[1].split(',').slice(0, 6)).toEqual(['hitter', '1', 'sa-aiva', 'Aiva Arquette', '22', 'AA'])
  })
})
