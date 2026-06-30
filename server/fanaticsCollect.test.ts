import { describe, expect, it, vi, afterEach } from 'vitest'
import { handleFanaticsCollectRoute } from './proxy'

function postJson(body: unknown) {
  return new Request('http://localhost/api/fanatics-collect/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  })
}

function fanaticsEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    FANATICS_COLLECT_GRAPHQL_URL: 'https://fanatics.test/graphql',
    FANATICS_COLLECT_ALGOLIA_APP_ID: 'TESTAPP',
    FANATICS_COLLECT_ALGOLIA_INDEX: 'test_index',
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Fanatics Collect proxy', () => {
  it('validates query batches before requesting a Fanatics search key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const response = await handleFanaticsCollectRoute('search', postJson({ queries: [] }), fanaticsEnv())
    const payload = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/At least one Fanatics Collect query/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('chunks large Fanatics searches into smaller Algolia multi-search calls', async () => {
    const queries = Array.from({ length: 27 }, (_, index) => ({
      q: `Player ${index} 2026 Bowman chrome auto`,
      playerName: `Player ${index}`,
      release: '2026-bowman',
      releaseYear: 2026,
      category: 'bowman',
    }))
    const algoliaBatchSizes: number[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlString = String(url)
      if (urlString === 'https://fanatics.test/graphql') {
        return new Response(JSON.stringify({ data: { collectSearchKey: 'test-search-key' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      expect(urlString).toBe('https://TESTAPP-dsn.algolia.net/1/indexes/*/queries')
      const body = JSON.parse(String(init?.body)) as { requests: Array<{ query: string }> }
      algoliaBatchSizes.push(body.requests.length)
      return new Response(
        JSON.stringify({
          results: body.requests.map((request, index) => ({
            nbHits: 1,
            hits: [
              {
                objectID: `${request.query}-${index}`,
                title: request.query,
                listingUuid: `${request.query}-${index}`,
                askingPrice: 50,
              },
            ],
          })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleFanaticsCollectRoute('search', postJson({ queries, minPrice: 25 }), fanaticsEnv())
    const payload = (await response.json()) as {
      items: unknown[]
      stats: { queriesRun: number; upstreamPagesFetched: number }
    }

    expect(response.status).toBe(200)
    expect(payload.items).toHaveLength(27)
    expect(payload.stats.queriesRun).toBe(27)
    expect(payload.stats.upstreamPagesFetched).toBe(2)
    expect(algoliaBatchSizes).toEqual([25, 2])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('accepts metadata-light query strings instead of failing the provider', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlString = String(url)
      if (urlString === 'https://fanatics.test/graphql') {
        return new Response(JSON.stringify({ data: { collectSearchKey: 'test-search-key' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const body = JSON.parse(String(init?.body)) as { requests: Array<{ query: string }> }
      expect(body.requests.map((request) => request.query)).toEqual(['Aiva Arquette 2026 Bowman Chrome Auto'])
      return new Response(
        JSON.stringify({
          results: [
            {
              nbHits: 1,
              hits: [
                {
                  objectID: 'aiva-light-query',
                  title: 'Aiva Arquette 2026 Bowman Chrome Auto',
                  listingUuid: 'aiva-light-query',
                  askingPrice: 50,
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleFanaticsCollectRoute(
      'search',
      postJson({ queries: ['Aiva Arquette 2026 Bowman Chrome Auto'], minPrice: 25 }),
      fanaticsEnv(),
    )
    const payload = (await response.json()) as { items: unknown[]; stats: { queriesRun: number } }

    expect(response.status).toBe(200)
    expect(payload.items).toHaveLength(1)
    expect(payload.stats.queriesRun).toBe(1)
  })
})
