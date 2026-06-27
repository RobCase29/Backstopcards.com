import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleCardHedgeRoute } from './proxy'

type TestEnv = Record<string, string | undefined>

const tempDirs: string[] = []

function tempEnv(overrides: TestEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'backstop-card-hedge-'))
  tempDirs.push(dir)
  return {
    BACKSTOP_SALES_DB: join(dir, 'usage.sqlite'),
    CARD_HEDGE_API_KEY: 'test-card-hedge-key',
    CARD_HEDGE_PLAN: 'elite',
    CARD_HEDGE_RATE_LIMIT_PER_MINUTE: '80',
    CARD_HEDGE_DAILY_LIMIT: '200000',
    ...overrides,
  }
}

function postJson(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('Card Hedge proxy', () => {
  it('reports elite configuration and local usage without exposing the API key', async () => {
    const response = await handleCardHedgeRoute('status', new Request('http://localhost/api/card-hedge/status'), tempEnv())
    const payload = (await response.json()) as {
      configured: boolean
      plan: string
      eliteAccessExpected: boolean
      limits: { perMinute: number; perDay: number }
      usage: { remainingDay: number; remainingMinute: number }
      endpoints: { dailyExport: string }
      apiKey?: string
    }

    expect(response.status).toBe(200)
    expect(payload.configured).toBe(true)
    expect(payload.plan).toBe('elite')
    expect(payload.eliteAccessExpected).toBe(true)
    expect(payload.limits).toEqual({ perMinute: 80, perDay: 200000 })
    expect(payload.usage.remainingMinute).toBe(80)
    expect(payload.usage.remainingDay).toBe(200000)
    expect(payload.endpoints.dailyExport).toBe('/api/card-hedge/daily-export?date=YYYY-MM-DD')
    expect(JSON.stringify(payload)).not.toContain('test-card-hedge-key')
  })

  it('forwards JSON calls to Card Hedge with the API key header', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.cardhedger.com/v1/cards/card-search')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-Key': 'test-card-hedge-key',
      })
      expect(JSON.parse(String(init?.body))).toEqual({
        search: 'Aiva Arquette 2026 Bowman',
        page: 1,
        page_size: 3,
      })

      return new Response(JSON.stringify({ count: 1, pages: 1, cards: [{ card_id: 'card-1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleCardHedgeRoute(
      'search',
      postJson('http://localhost/api/card-hedge/search', {
        search: 'Aiva Arquette 2026 Bowman',
        page: 1,
        page_size: 3,
      }),
      tempEnv(),
    )

    await expect(response.json()).resolves.toEqual({ count: 1, pages: 1, cards: [{ card_id: 'card-1' }] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('guards the locally configured minute rate limit before calling upstream', async () => {
    const env = tempEnv({ CARD_HEDGE_RATE_LIMIT_PER_MINUTE: '1' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ count: 0, pages: 0, cards: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await handleCardHedgeRoute(
      'search',
      postJson('http://localhost/api/card-hedge/search', { search: 'Aiva' }),
      env,
    )
    expect(first.status).toBe(200)

    const second = await handleCardHedgeRoute(
      'search',
      postJson('http://localhost/api/card-hedge/search', { search: 'Eli' }),
      env,
    )
    const payload = (await second.json()) as { error: string; limits: { perMinute: number } }

    expect(second.status).toBe(429)
    expect(payload.error).toMatch(/minute limit/)
    expect(payload.limits.perMinute).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('streams the Elite daily export endpoint with a date guard', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.cardhedger.com/v1/download/daily-price-export/2026-06-24')
      expect(init?.headers).toMatchObject({
        'X-API-Key': 'test-card-hedge-key',
        Accept: 'text/csv, application/json',
      })
      return new Response('card_id,price\ncard-1,42\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleCardHedgeRoute(
      'daily-export',
      new Request('http://localhost/api/card-hedge/daily-export?date=2026-06-24'),
      tempEnv(),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/csv')
    await expect(response.text()).resolves.toContain('card_id,price')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
