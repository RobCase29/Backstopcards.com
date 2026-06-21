import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChecklistModel } from '../types'
import { fetchEbayBinListings } from './ebay'

const model: ChecklistModel = {
  category: 'bowman',
  release: '2026-Bowman',
  releaseYear: 2026,
  fetchedAt: '2026-06-20T00:00:00.000Z',
  source: 'authenticated-player-model',
  multipliers: [],
  players: [
    {
      playerName: 'Eli Willits',
      baseAvgPrice: 175,
      baseSalesCount: 8,
      variations: [],
    },
    {
      playerName: 'Value Prospect',
      baseAvgPrice: 25,
      baseSalesCount: 4,
      variations: [],
    },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchEbayBinListings', () => {
  it('builds player-scoped 2026 Bowman BIN queries and maps eBay items into listings', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        queries: Array<{ q: string; playerName: string }>
        sort: string
        minPrice: number
      }
      expect(body.queries).toHaveLength(1)
      expect(body.queries[0]?.q).toBe('Eli Willits 1st bowman auto')
      expect(body.sort).toBe('price')
      expect(body.minPrice).toBe(25)

      return new Response(
        JSON.stringify({
          fetchedAt: '2026-06-20T12:00:00.000Z',
          items: [
            {
              itemId: 'v1|123',
              legacyItemId: '123',
              title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150',
              itemWebUrl: 'https://www.ebay.com/itm/123',
              price: { value: '250.00', currency: 'USD' },
              buyingOptions: ['FIXED_PRICE'],
              shippingOptions: [{ shippingCost: { value: '5.50', currency: 'USD' } }],
              image: { imageUrl: 'https://i.ebayimg.com/card.jpg' },
              seller: { username: 'cardshop', feedbackScore: 1200 },
              _bowmanTraderQuery: body.queries[0],
            },
          ],
          stats: {
            queriesRun: 1,
            queriesSucceeded: 1,
            queriesFailed: 0,
            pagesFetched: 1,
            upstreamTotal: 1,
            dedupedItems: 1,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchEbayBinListings({ model, minPrice: 25, playerLimit: 1 })

    expect(result.listings).toHaveLength(1)
    expect(result.listings[0]?.item_id).toBe('123')
    expect(result.listings[0]?.current_price).toBe(250)
    expect(result.listings[0]?.shipping_cost).toBe(5.5)
    expect(result.listings[0]?.serial_denominator).toBe(150)
    expect(result.stats.mappedListings).toBe(1)
  })

  it('rejects eBay results whose title does not contain the searched player', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string }> }
        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'wrong-player',
                title: '2026 Bowman Chrome Different Player 1st Bowman Auto Blue /150',
                price: { value: '25.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
            ],
            stats: {
              queriesRun: 1,
              queriesSucceeded: 1,
              queriesFailed: 0,
              pagesFetched: 1,
              upstreamTotal: 1,
              dedupedItems: 1,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const result = await fetchEbayBinListings({ model, playerLimit: 1 })

    expect(result.listings).toEqual([])
    expect(result.stats.rejectedPlayerMismatches).toBe(1)
  })

  it('limits a player-focused scan to matching checklist names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string }> }
        expect(body.queries).toHaveLength(1)
        expect(body.queries[0]?.playerName).toBe('Value Prospect')
        expect(body.queries[0]?.q).toBe('Value Prospect 1st bowman auto')

        return new Response(
          JSON.stringify({
            items: [],
            stats: {
              queriesRun: 1,
              queriesSucceeded: 1,
              queriesFailed: 0,
              pagesFetched: 1,
              upstreamTotal: 0,
              dedupedItems: 0,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    await fetchEbayBinListings({ model, searchMode: 'player', searchTerm: 'value' })
  })

  it('adds the variation term to every queued player query and preserves it on listings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string; variationTerm?: string }> }
        expect(body.queries).toHaveLength(1)
        expect(body.queries[0]?.q).toBe('Eli Willits packfractor bowman auto')
        expect(body.queries[0]?.variationTerm).toBe('packfractor')

        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'packfractor-hit',
                title: 'Eli Willits 2026 Bowman Chrome 1st Auto Packfractor /99',
                price: { value: '100.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
            ],
            stats: {
              queriesRun: 1,
              queriesSucceeded: 1,
              queriesFailed: 0,
              pagesFetched: 1,
              upstreamTotal: 1,
              dedupedItems: 1,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const result = await fetchEbayBinListings({ model, playerLimit: 1, searchMode: 'variation', searchTerm: 'packfractor' })

    expect(result.listings[0]?.variation).toBe('packfractor')
    expect(result.stats.mappedListings).toBe(1)
  })

  it('rejects variation-focused results when the title does not contain the variation term', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string; variationTerm?: string }> }
        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'wrong-parallel',
                title: 'Eli Willits 2026 Bowman Chrome 1st Auto Refractor /499',
                price: { value: '100.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
            ],
            stats: {
              queriesRun: 1,
              queriesSucceeded: 1,
              queriesFailed: 0,
              pagesFetched: 1,
              upstreamTotal: 1,
              dedupedItems: 1,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const result = await fetchEbayBinListings({ model, playerLimit: 1, searchMode: 'variation', searchTerm: 'packfractor' })

    expect(result.listings).toEqual([])
    expect(result.stats.rejectedPlayerMismatches).toBe(1)
  })
})
