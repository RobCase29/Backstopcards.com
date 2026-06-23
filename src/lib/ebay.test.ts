import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChecklistModel } from '../types'
import { fetchEbayAuctionListings, fetchEbayBinListings, isEbayRateLimitError } from './ebay'

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
        buyingOption: string
      }
      expect(body.queries).toHaveLength(1)
      expect(body.queries[0]?.q).toBe('Eli Willits 2026 bowman chrome 1st auto')
      expect(body.sort).toBe('price')
      expect(body.minPrice).toBe(25)
      expect(body.buyingOption).toBe('FIXED_PRICE')

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
    expect(result.listings[0]?.prospect).toMatchObject({
      name: 'Eli Willits',
      ranking: 2,
      level: 'A+',
    })
    expect(result.stats.mappedListings).toBe(1)
  })

  it('rejects eBay results whose title does not contain the searched player', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          queries: Array<{ q: string; playerName: string; release: string; releaseYear: number; category: ChecklistModel['category'] }>
        }
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

  it('matches player names across accents and optional suffixes', async () => {
    const accentModel: ChecklistModel = {
      ...model,
      players: [
        {
          playerName: 'Ronald Acuña Jr.',
          baseAvgPrice: 500,
          baseSalesCount: 20,
          variations: [],
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          queries: Array<{ q: string; playerName: string }>
        }
        expect(body.queries[0]?.playerName).toBe('Ronald Acuña Jr.')

        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'acuna',
                title: '2026 Bowman Chrome Ronald Acuna 1st Bowman Auto Blue /150',
                price: { value: '750.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
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

    const result = await fetchEbayBinListings({ model: accentModel, playerLimit: 1 })

    expect(result.listings).toHaveLength(1)
    expect(result.stats.rejectedPlayerMismatches).toBe(0)
  })

  it('limits a player-focused scan to matching checklist names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          queries: Array<{ q: string; playerName: string; release: string; releaseYear: number; category: ChecklistModel['category'] }>
        }
        expect(body.queries).toHaveLength(1)
        expect(body.queries[0]?.playerName).toBe('Value Prospect')
        expect(body.queries[0]?.q).toBe('Value Prospect 2026 bowman chrome 1st auto')

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

  it('classifies eBay 429 responses as rate-limit errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: 'eBay is rate-limiting Browse API requests right now. Wait a minute, then retry with a smaller player scope.',
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(fetchEbayBinListings({ model, searchMode: 'player', searchTerm: 'Eli' })).rejects.toSatisfy(isEbayRateLimitError)
  })

  it('queues an explicit scored player-name bucket before falling back to base price ordering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          queries: Array<{ q: string; playerName: string }>
        }
        expect(body.queries).toHaveLength(1)
        expect(body.queries[0]?.playerName).toBe('Value Prospect')
        expect(body.queries[0]?.q).toBe('Value Prospect 2026 bowman chrome 1st auto')

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

    await fetchEbayBinListings({ model, playerNames: ['Value Prospect'], playerLimit: 1 })
  })

  it('builds release-aware queries for Bowman Draft checklists', async () => {
    const draftModel: ChecklistModel = {
      ...model,
      category: 'draft',
      release: '2025-Bowman-Draft',
      releaseYear: 2025,
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          queries: Array<{ q: string; playerName: string; release: string; releaseYear: number; category: ChecklistModel['category'] }>
        }
        expect(body.queries).toHaveLength(1)
        expect(body.queries[0]?.q).toBe('Eli Willits 2025 bowman draft chrome 1st auto')
        expect(body.queries[0]?.release).toBe('2025-Bowman-Draft')
        expect(body.queries[0]?.releaseYear).toBe(2025)
        expect(body.queries[0]?.category).toBe('draft')

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

    await fetchEbayBinListings({ model: draftModel, playerLimit: 1 })
  })

  it('adds the variation term to every queued player query and preserves it on listings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string; variationTerm?: string }> }
        expect(body.queries).toHaveLength(1)
        expect(body.queries[0]?.q).toBe('Eli Willits packfractor 2026 bowman chrome 1st auto')
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

  it('rejects paper autos and insert autos that do not belong to the chrome auto model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string }> }
        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'paper-auto',
                title: '2026 Bowman Baseball 1st Bowman Eli Willits Red Paper Auto 1/5',
                price: { value: '1000.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'bpa-paper-auto',
                title: '2026 Bowman Eli Willits 1st Bowman Auto ORANGE 13/25 #BPA-EW',
                price: { value: '500.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'power-chords',
                title: 'Eli Willits AUTO GOLD /50 POWER CHORDS 1st DIE-CUT - 2026 Bowman Baseball',
                price: { value: '250.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'ascensions-case-hit',
                title: 'Eli Willits 1st Bowman Chrome RED AUTO /5 Ascensions SSP Mets',
                price: { value: '2000.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'draft-night-case-hit',
                title: '2025 Bowman Draft 1st Chrome Prospect Draft Night Auto Gold Eli Willits /50',
                price: { value: '756.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'bunt-digital',
                title: '2026 Topps Bunt Digital Bowman Eli Willits Chrome Auto Blue /150',
                price: { value: '25.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'redeemed-auto',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 Redeemed',
                price: { value: '100.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'sapphire-auto',
                title: '2026 Bowman Sapphire Chrome Eli Willits 1st Bowman Auto Orange /25',
                price: { value: '750.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'bowmans-best-auto',
                title: "2026 Bowman's Best Eli Willits Chrome Auto Gold /50",
                price: { value: '300.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'leaf-auto',
                title: '2026 Leaf Eli Willits Auto Gold /50',
                price: { value: '80.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'real-chrome',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Orange Shimmer /25',
                price: { value: '1500.00', currency: 'USD' },
                _bowmanTraderQuery: body.queries[0],
              },
            ],
            stats: {
              queriesRun: 1,
              queriesSucceeded: 1,
              queriesFailed: 0,
              pagesFetched: 1,
              upstreamTotal: 4,
              dedupedItems: 4,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const result = await fetchEbayBinListings({ model, playerLimit: 1 })

    expect(result.listings.map((listing) => listing.item_id)).toEqual(['real-chrome'])
    expect(result.stats.rejectedPlayerMismatches).toBe(10)
  })
})

describe('fetchEbayAuctionListings', () => {
  it('builds ending-soon auction queries and keeps only auctions inside the close window', async () => {
    const soonEnd = new Date(Date.now() + 2 * 60 * 60 * 1_000).toISOString()
    const lateEnd = new Date(Date.now() + 30 * 60 * 60 * 1_000).toISOString()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          queries: Array<{ q: string; playerName: string }>
          sort: string
          buyingOption: string
          maxHoursToClose: number
        }
        expect(body.queries).toHaveLength(1)
        expect(body.queries[0]?.q).toBe('Eli Willits 2026 bowman chrome 1st auto')
        expect(body.sort).toBe('endingSoonest')
        expect(body.buyingOption).toBe('AUCTION')
        expect(body.maxHoursToClose).toBe(24)

        return new Response(
          JSON.stringify({
            fetchedAt: '2026-06-20T12:00:00.000Z',
            items: [
              {
                itemId: 'ending-soon',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150',
                itemWebUrl: 'https://www.ebay.com/itm/ending-soon',
                price: { value: '150.00', currency: 'USD' },
                buyingOptions: ['AUCTION'],
                itemEndDate: soonEnd,
                bidCount: 7,
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'too-late',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Gold /50',
                price: { value: '200.00', currency: 'USD' },
                buyingOptions: ['AUCTION'],
                itemEndDate: lateEnd,
                bidCount: 2,
                _bowmanTraderQuery: body.queries[0],
              },
            ],
            stats: {
              queriesRun: 1,
              queriesSucceeded: 1,
              queriesFailed: 0,
              pagesFetched: 1,
              upstreamTotal: 2,
              dedupedItems: 2,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const result = await fetchEbayAuctionListings({ model, playerLimit: 1 })

    expect(result.listings).toHaveLength(1)
    expect(result.listings[0]?.item_id).toBe('ending-soon')
    expect(result.listings[0]?.buying_format).toBe('Auction')
    expect(result.listings[0]?.end_time).toBe(soonEnd)
    expect(result.listings[0]?.bid_count).toBe(7)
    expect(result.stats.rejectedPlayerMismatches).toBe(1)
  })
})
