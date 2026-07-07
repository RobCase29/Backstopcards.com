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
      ranking: expect.any(Number),
      level: 'A+',
    })
    expect(result.listings[0]?.prospect?.ranking).toBeLessThan(25)
    expect(result.stats.mappedListings).toBe(1)
  })

  it('classifies plain chrome autograph listings as base autos instead of borrowing numbered lanes', async () => {
    const kendryModel: ChecklistModel = {
      ...model,
      players: [
        {
          playerName: 'Kendry Chourio',
          baseAvgPrice: 68,
          baseSalesCount: 6,
          variations: [],
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string }> }
        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'kendry-base-auto',
                title: '2026 Bowman Kendry Chourio Chrome Auto Autograph 1st Prospect #CPA-KC Royals',
                price: { value: '45.00', currency: 'USD' },
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

    const result = await fetchEbayBinListings({ model: kendryModel, playerLimit: 1 })

    expect(result.listings).toHaveLength(1)
    expect(result.listings[0]?.variation).toBe('Base Auto')
    expect(result.listings[0]?.serial_denominator).toBeNull()
  })

  it('uses structured image-variation labels while matching eBay gold ink wording', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string; variationTerm?: string }> }
        expect(body.queries[0]?.q).toBe('Eli Willits gold ink 2026 bowman chrome 1st auto')
        expect(body.queries[0]?.variationTerm).toBe('Gold Image Variation /15')
        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'gold-ink',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Gold Ink Auto /15',
                price: { value: '950.00', currency: 'USD' },
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

    const result = await fetchEbayBinListings({
      model,
      playerLimit: 1,
      searchMode: 'variation',
      searchTerm: 'Gold Image Variation /15',
    })

    expect(result.listings.map((listing) => listing.item_id)).toEqual(['gold-ink'])
    expect(result.listings[0]?.variation).toBe('Gold Image Variation /15')
    expect(result.listings[0]?.serial_denominator).toBe(15)
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

  it('runs a base-auto scan that rejects numbered and color parallel autos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string; baseAutoOnly?: boolean }> }
        expect(body.queries).toHaveLength(1)
        expect(body.queries[0]?.q).toBe('Eli Willits 2026 bowman chrome 1st auto')
        expect(body.queries[0]?.baseAutoOnly).toBe(true)

        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'base-auto',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Chrome Prospect Autographs Auto CPA-EW',
                price: { value: '140.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'red-sox-base-auto',
                title: '2026 Bowman Chrome Boston Red Sox Eli Willits 1st Bowman Auto CPA-EW',
                price: { value: '145.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'signed-rare',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Signed Rare Auto #BCP-95',
                price: { value: '95.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'ip-auto',
                title: '2026 Bowman Chrome Eli Willits Base #BCP-95 IP AUTO',
                price: { value: '88.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'blue-parallel',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Blue Refractor Auto /150',
                price: { value: '350.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'refractor-redemption',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Refractor Redemption',
                price: { value: '175.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
            ],
            stats: {
              queriesRun: 1,
              queriesSucceeded: 1,
              queriesFailed: 0,
              pagesFetched: 1,
              upstreamTotal: 6,
              dedupedItems: 6,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const result = await fetchEbayBinListings({ model, playerLimit: 1, searchMode: 'base-auto' })

    expect(result.listings.map((listing) => listing.item_id)).toEqual(['base-auto', 'red-sox-base-auto', 'signed-rare', 'ip-auto'])
    expect(result.listings.map((listing) => listing.variation)).toEqual([
      'Base Auto',
      'Base Auto',
      'Hand Signed Auto',
      'Hand Signed Auto',
    ])
    expect(result.listings.slice(2).every((listing) => listing.is_hand_signed)).toBe(true)
    expect(result.listings.every((listing) => listing.serial_denominator === null)).toBe(true)
    expect(result.stats.rejectedPlayerMismatches).toBe(2)
  })

  it('can map low-serial 1st Bowman non-autos while rejecting autos and /100+ cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string; lowSerialNonAuto?: boolean }> }
        expect(body.queries).toHaveLength(7)
        expect(body.queries[0]?.q).toBe('Eli Willits 2026 bowman chrome 1st /99')
        expect(body.queries.every((query) => query.lowSerialNonAuto)).toBe(true)

        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'green-non-auto',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Green Refractor /99',
                price: { value: '42.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'yellow-non-auto',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Yellow Refractor /75',
                price: { value: '55.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[1],
              },
              {
                itemId: 'red-sox-numbered',
                title: '2026 Bowman Chrome Eli Willits Red Sox 1st Bowman /99',
                price: { value: '40.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'auto-green',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Green Refractor Auto /99',
                price: { value: '240.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'blue-non-auto',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Blue Refractor /150',
                price: { value: '28.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
            ],
            stats: {
              queriesRun: 7,
              queriesSucceeded: 7,
              queriesFailed: 0,
              pagesFetched: 7,
              upstreamTotal: 3,
              dedupedItems: 3,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const result = await fetchEbayBinListings({ model, playerLimit: 1, searchMode: 'low-serial-non-auto' })

    expect(result.listings.map((listing) => listing.item_id)).toEqual(['green-non-auto', 'yellow-non-auto', 'red-sox-numbered'])
    expect(result.listings.map((listing) => listing.variation)).toEqual(['Green /99', 'Yellow /75', 'Numbered /99'])
    expect(result.listings[0]?.serial_denominator).toBe(99)
    expect(result.stats.rejectedPlayerMismatches).toBe(2)
  })

  it('can run a broad Superfractor scan without requiring 1st Bowman release text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string; superfractorOnly?: boolean }> }
        expect(body.queries).toHaveLength(3)
        expect(body.queries.map((query) => query.q)).toEqual([
          'Eli Willits Bowman Superfractor',
          'Eli Willits Bowman Super Fractor',
          'Eli Willits Bowman /1',
        ])
        expect(body.queries.every((query) => query.superfractorOnly)).toBe(true)

        return new Response(
          JSON.stringify({
            items: [
              {
                itemId: 'draft-super-auto',
                title: '2024 Bowman Draft Chrome Eli Willits Superfractor Auto 1/1',
                price: { value: '6500.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
              {
                itemId: 'first-bowman-super',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Super Fractor one of one',
                price: { value: '5100.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[1],
              },
              {
                itemId: 'red-auto',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Red Auto /5',
                price: { value: '900.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[2],
              },
              {
                itemId: 'printing-plate',
                title: '2026 Bowman Chrome Eli Willits Printing Plate 1/1',
                price: { value: '900.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[2],
              },
              {
                itemId: 'digital-super',
                title: 'Topps Bunt Digital Bowman Eli Willits Superfractor 1/1',
                price: { value: '99.00', currency: 'USD' },
                buyingOptions: ['FIXED_PRICE'],
                _bowmanTraderQuery: body.queries[0],
              },
            ],
            stats: {
              queriesRun: 3,
              queriesSucceeded: 3,
              queriesFailed: 0,
              pagesFetched: 3,
              upstreamTotal: 4,
              dedupedItems: 4,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const result = await fetchEbayBinListings({ model, playerLimit: 1, searchMode: 'superfractor' })

    expect(result.listings.map((listing) => listing.item_id)).toEqual(['draft-super-auto', 'first-bowman-super'])
    expect(result.listings.map((listing) => listing.variation)).toEqual(['Superfractor Auto /1', 'Superfractor /1'])
    expect(result.listings.every((listing) => listing.serial_denominator === 1)).toBe(true)
    expect(result.listings.map((listing) => listing.checklist_first_bowman)).toEqual([false, true])
    expect(result.stats.rejectedPlayerMismatches).toBe(3)
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

  it('uses current bid price plus shipping when Browse omits auction price', async () => {
    const soonEnd = new Date(Date.now() + 2 * 60 * 60 * 1_000).toISOString()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          queries: Array<{ q: string; playerName: string }>
        }

        return new Response(
          JSON.stringify({
            fetchedAt: '2026-06-20T12:00:00.000Z',
            items: [
              {
                itemId: 'current-bid-only',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Orange Wave /25',
                itemWebUrl: 'https://www.ebay.com/itm/current-bid-only',
                currentBidPrice: { value: '710.00', currency: 'USD' },
                buyingOptions: ['AUCTION'],
                itemEndDate: soonEnd,
                bidCount: 22,
                shippingOptions: [{ shippingCost: { value: '4.99', currency: 'USD' } }],
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

    const result = await fetchEbayAuctionListings({ model, playerLimit: 1 })

    expect(result.listings).toHaveLength(1)
    expect(result.listings[0]?.current_price).toBe(710)
    expect(result.listings[0]?.shipping_cost).toBe(4.99)
  })
})
