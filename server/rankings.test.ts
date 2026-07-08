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
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
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
    expect(payload.rows).toBe(3)
    const hitter = payload.sources.find((source) => source.population === 'hitter')
    expect(hitter?.rows).toBe(1)
    expect(hitter?.matchedRows).toBe(1)
    expect(hitter?.csv.split('\n')[1].split(',').slice(0, 6)).toEqual(['hitter', '1', 'sa-aiva', 'Aiva Arquette', '22', 'AA'])
  })
})
