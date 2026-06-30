import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleEbayRoute } from './proxy'

type TestEnv = Record<string, string | undefined>

const tempDirs: string[] = []

function tempEnv(overrides: TestEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'backstop-ebay-cache-'))
  tempDirs.push(dir)
  return {
    BACKSTOP_SALES_DB: join(dir, 'market.sqlite'),
    EBAY_CLIENT_ID: 'test-ebay-client',
    EBAY_CLIENT_SECRET: 'test-ebay-secret',
    EBAY_ENV: 'production',
    EBAY_MARKETPLACE_ID: 'EBAY_US',
    ...overrides,
  }
}

function postJson(body: unknown) {
  return new Request('http://localhost/api/ebay/search', {
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

describe('eBay query cache', () => {
  it('reuses a fixed-price Browse response across identical scans', async () => {
    const env = tempEnv()
    let upstreamSearches = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const href = String(url)
        if (href.includes('/identity/v1/oauth2/token')) {
          return new Response(JSON.stringify({ access_token: 'token', expires_in: 7200 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        expect(href).toContain('/buy/browse/v1/item_summary/search')
        upstreamSearches += 1
        return new Response(
          JSON.stringify({
            total: 1,
            itemSummaries: [
              {
                itemId: 'v1|123',
                legacyItemId: '123',
                title: '2026 Bowman Chrome Aiva Arquette 1st Bowman Auto',
                itemWebUrl: 'https://www.ebay.com/itm/123',
                price: { value: '100.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const body = {
      queries: [{ q: 'Aiva Arquette 2026 Bowman Chrome 1st auto', playerName: 'Aiva Arquette' }],
      limit: 100,
      maxPages: 1,
      sort: 'price',
      buyingOption: 'FIXED_PRICE',
    }

    const first = await handleEbayRoute('search', postJson(body), env)
    const firstPayload = (await first.json()) as { stats: Record<string, number>; items: Array<Record<string, unknown>> }

    const second = await handleEbayRoute('search', postJson(body), env)
    const secondPayload = (await second.json()) as { stats: Record<string, number>; items: Array<Record<string, unknown>> }

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(upstreamSearches).toBe(1)
    expect(firstPayload.stats.cacheMisses).toBe(1)
    expect(firstPayload.stats.cacheWrites).toBe(1)
    expect(firstPayload.stats.upstreamPagesFetched).toBe(1)
    expect(secondPayload.stats.cacheHits).toBe(1)
    expect(secondPayload.stats.upstreamPagesFetched).toBe(0)
    expect(secondPayload.items[0]?._bowmanTraderQuery).toMatchObject({ playerName: 'Aiva Arquette' })
  })
})
