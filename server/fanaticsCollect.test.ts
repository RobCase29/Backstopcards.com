import { describe, expect, it, vi, afterEach } from 'vitest'
import { handleFanaticsCollectRoute } from './proxy'

const redisMemory = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@upstash/redis', () => ({
  Redis: class {
    async get<T>(key: string) {
      return (redisMemory.get(key) ?? null) as T | null
    }

    async set(key: string, value: unknown) {
      redisMemory.set(key, value)
      return 'OK'
    }
  },
}))

function postJson(body: unknown, route = 'search', includeScope = true) {
  const scopedBody = route === 'search' && includeScope && body && typeof body === 'object'
    ? { scope: { type: 'player', value: 'Aiva Arquette' }, ...body }
    : body
  return new Request(`http://localhost/api/fanatics-collect/${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify(scopedBody),
  })
}

function fanaticsEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    FANATICS_COLLECT_GRAPHQL_URL: 'https://fanatics.test/graphql',
    FANATICS_COLLECT_ALGOLIA_APP_ID: 'TESTAPP',
    FANATICS_COLLECT_ALGOLIA_INDEX: 'test_index',
    FANATICS_COLLECT_SEARCH_AUTHORIZED: 'true',
    FANATICS_COLLECT_AUTHORIZATION_ID: 'fanatics-written-permission-test',
    ...overrides,
  }
}

afterEach(() => {
  redisMemory.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Fanatics Collect proxy', () => {
  it('fails closed when the user does not provide a search scope', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const response = await handleFanaticsCollectRoute(
      'search',
      postJson({ queries: ['2026 Bowman Chrome Auto'] }, 'search', false),
      fanaticsEnv({ FANATICS_COLLECT_SEARCH_AUTHORIZED: undefined, FANATICS_COLLECT_AUTHORIZATION_ID: undefined }),
    )
    const payload = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/player, team, or set/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

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
      fanaticsEnv({ FANATICS_COLLECT_SEARCH_AUTHORIZED: undefined, FANATICS_COLLECT_AUTHORIZATION_ID: undefined }),
    )
    const payload = (await response.json()) as {
      items: unknown[]
      stats: { queriesRun: number }
      provenance: { mode: string; scopeType: string; scopeValue: string }
    }

    expect(response.status).toBe(200)
    expect(payload.items).toHaveLength(1)
    expect(payload.stats.queriesRun).toBe(1)
    expect(payload.provenance).toEqual({
      mode: 'user-scoped-search',
      scopeType: 'player',
      scopeValue: 'Aiva Arquette',
    })
  })

  it('keeps a stale rescue snapshot and serves it when a live refresh fails', async () => {
    const env = fanaticsEnv({
      FANATICS_COLLECT_GRAPHQL_URL: 'https://fanatics-stale.test/graphql',
      UPSTASH_REDIS_REST_URL: 'https://redis.test',
      UPSTASH_REDIS_REST_TOKEN: 'redis-token',
      FANATICS_QUERY_CACHE_FRESH_TTL_SECONDS: '60',
      FANATICS_QUERY_CACHE_STALE_TTL_SECONDS: '3600',
    })
    const requestBody = {
      queries: ['Aiva Arquette 2026 Bowman Chrome Auto'],
      scope: { type: 'player', value: 'Aiva Arquette' },
      minPrice: 25,
    }
    const liveFetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === 'https://fanatics-stale.test/graphql') {
        return Response.json({ data: { collectSearchKey: 'stale-test-key' } })
      }
      return Response.json({
        results: [{
          nbHits: 1,
          hits: [{ objectID: 'aiva-stale', listingUuid: 'aiva-stale', title: 'Aiva Arquette 2026 Bowman Chrome Auto', askingPrice: 50 }],
        }],
      })
    })
    vi.stubGlobal('fetch', liveFetch)

    const liveResponse = await handleFanaticsCollectRoute('search', postJson(requestBody), env)
    expect(liveResponse.status).toBe(200)
    expect(redisMemory.size).toBe(1)

    const [cacheKey, cachedRaw] = [...redisMemory.entries()][0]
    const cached = JSON.parse(String(cachedRaw)) as { fetchedAt: string }
    cached.fetchedAt = new Date(Date.now() - 2 * 60 * 1_000).toISOString()
    redisMemory.set(cacheKey, JSON.stringify(cached))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })))

    const fallbackResponse = await handleFanaticsCollectRoute('search', postJson(requestBody), env)
    const fallback = (await fallbackResponse.json()) as {
      items: unknown[]
      errors: Array<{ error: string }>
      cache: { state: string; ageSeconds: number; freshTtlSeconds: number; staleTtlSeconds: number }
      stats: { upstreamPagesFetched: number; redisCacheHits: number }
    }

    expect(fallbackResponse.status).toBe(200)
    expect(fallback.items).toHaveLength(1)
    expect(fallback.cache).toMatchObject({ state: 'stale-fallback', freshTtlSeconds: 60, staleTtlSeconds: 3600 })
    expect(fallback.cache.ageSeconds).toBeGreaterThanOrEqual(120)
    expect(fallback.errors.at(-1)?.error).toMatch(/cached Fanatics results because the live refresh failed/i)
    expect(fallback.stats).toMatchObject({ upstreamPagesFetched: 0, redisCacheHits: 1 })
  })

  it('coalesces simultaneous identical searches into one upstream request', async () => {
    let algoliaCalls = 0
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === 'https://fanatics-coalesce.test/graphql') {
        return Response.json({ data: { collectSearchKey: 'coalesce-test-key' } })
      }
      algoliaCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return Response.json({
        results: [{
          nbHits: 1,
          hits: [{ objectID: 'aiva-coalesced', listingUuid: 'aiva-coalesced', title: 'Aiva Arquette 2026 Bowman Chrome Auto', askingPrice: 50 }],
        }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const env = fanaticsEnv({ FANATICS_COLLECT_GRAPHQL_URL: 'https://fanatics-coalesce.test/graphql' })
    const body = {
      queries: ['Aiva Arquette 2026 Bowman Chrome Auto'],
      scope: { type: 'player', value: 'Aiva Arquette' },
    }

    const [left, right] = await Promise.all([
      handleFanaticsCollectRoute('search', postJson(body), env),
      handleFanaticsCollectRoute('search', postJson(body), env),
    ])

    expect(left.status).toBe(200)
    expect(right.status).toBe(200)
    expect(algoliaCalls).toBe(1)
  })

  it('paginates an authorized wide feed, deduplicates UUIDs, and reports complete coverage', async () => {
    const cursors: string[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url))
      cursors.push(parsed.searchParams.get('cursor') ?? '')
      expect(parsed.origin + parsed.pathname).toBe('https://feed.fanatics.test/listings')
      expect(parsed.searchParams.get('query')).toBe('Bowman')
      expect(parsed.searchParams.get('saleType')).toBe('FIXED')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer feed-token')

      if (!parsed.searchParams.get('cursor')) {
        return Response.json({
          items: [
            { listingUuid: 'one', title: '2026 Bowman Chrome Player One Auto', askingPrice: 100, images: ['private'] },
            { listingUuid: 'shared', title: '2026 Bowman Chrome Shared Auto', askingPrice: 200 },
          ],
          nextCursor: 'page-2',
          hasMore: true,
          total: 3,
          observedAt: '2026-07-11T12:00:00.000Z',
        })
      }
      return Response.json({
        items: [
          { listingUuid: 'shared', title: '2026 Bowman Chrome Shared Auto', askingPrice: 190 },
          { listingUuid: 'two', title: '2026 Bowman Chrome Player Two Auto', askingPrice: 50 },
        ],
        hasMore: false,
        total: 3,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleFanaticsCollectRoute(
      'wide-scan',
      postJson({ minPrice: 75, pageSize: 100 }, 'wide-scan'),
      fanaticsEnv({
        FANATICS_COLLECT_WIDE_SCAN_AUTHORIZED: 'true',
        FANATICS_COLLECT_AUTHORIZED_FEED_URL: 'https://feed.fanatics.test/listings',
        FANATICS_COLLECT_AUTHORIZED_FEED_TOKEN: 'feed-token',
      }),
    )
    const payload = (await response.json()) as {
      items: Array<Record<string, unknown>>
      fetchedAt: string
      coverage: { complete: boolean; pagesFetched: number; stoppedReason: string }
      stats: { dedupedItems: number; upstreamPagesFetched: number }
    }

    expect(response.status).toBe(200)
    expect(cursors).toEqual(['', 'page-2'])
    expect(payload.items.map((item) => item.listingUuid)).toEqual(['one', 'shared'])
    expect(payload.items[0]).not.toHaveProperty('images')
    expect(payload.fetchedAt).toBe('2026-07-11T12:00:00.000Z')
    expect(payload.coverage).toMatchObject({ complete: true, pagesFetched: 2, stoppedReason: 'complete' })
    expect(payload.stats).toMatchObject({ dedupedItems: 2, upstreamPagesFetched: 2 })
  })

  it('marks a wide feed partial when the configured page budget is exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      items: [{ listingUuid: 'one', title: '2026 Bowman Chrome Player One Auto', askingPrice: 100 }],
      nextCursor: 'more',
      hasMore: true,
    })))

    const response = await handleFanaticsCollectRoute(
      'wide-scan',
      postJson({ maxPages: 1 }, 'wide-scan'),
      fanaticsEnv({
        FANATICS_COLLECT_WIDE_SCAN_AUTHORIZED: 'true',
        FANATICS_COLLECT_AUTHORIZED_FEED_URL: 'https://feed.fanatics.test/listings',
        FANATICS_COLLECT_WIDE_MAX_PAGES: '1',
      }),
    )
    const payload = (await response.json()) as {
      errors: Array<{ error: string }>
      coverage: { complete: boolean; stoppedReason: string; nextCursor: string }
    }

    expect(response.status).toBe(200)
    expect(payload.coverage).toMatchObject({ complete: false, stoppedReason: 'page-budget', nextCursor: 'more' })
    expect(payload.errors[0]?.error).toMatch(/page budget/i)
  })
})
