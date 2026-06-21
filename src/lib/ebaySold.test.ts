import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChecklistModel } from '../types'
import {
  buildEbaySoldVariationModel,
  fetchEbaySoldVariationModel,
  mapEbaySoldItemToComp,
  summarizeEbaySoldModel,
  type RawEbaySoldItem,
} from './ebaySold'

const asOf = Date.UTC(2026, 5, 21)

const model: ChecklistModel = {
  category: 'bowman',
  release: '2026-Bowman',
  releaseYear: 2026,
  fetchedAt: '2026-06-20T00:00:00.000Z',
  source: 'authenticated-player-model',
  multipliers: [
    { variation: 'Base Auto', avgMultiplier: 1, sortOrder: 0 },
    { variation: 'Blue /150', avgMultiplier: 3, sortOrder: 1 },
    { variation: 'Gold /50', avgMultiplier: 8, sortOrder: 2 },
  ],
  players: [
    {
      playerName: 'Eli Willits',
      baseAvgPrice: 100,
      baseSalesCount: 8,
      variations: [],
    },
    {
      playerName: 'Aiva Arquette',
      baseAvgPrice: 90,
      baseSalesCount: 6,
      variations: [],
    },
  ],
}

function soldItem(overrides: Partial<RawEbaySoldItem> = {}): RawEbaySoldItem {
  return {
    itemId: 'item-1',
    title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto',
    price: { value: '100.00', currency: 'USD' },
    itemSoldDate: '2026-06-20T12:00:00.000Z',
    itemWebUrl: 'https://www.ebay.com/itm/item-1',
    _bowmanTraderQuery: {
      q: 'Eli Willits 1st bowman chrome auto',
      playerName: 'Eli Willits',
      release: '2026-Bowman',
      releaseYear: 2026,
      category: 'bowman',
    },
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('eBay sold variation modeling', () => {
  it('maps sold base and variation comps from eBay sold item shapes', () => {
    const base = mapEbaySoldItemToComp(soldItem(), model)
    const blue = mapEbaySoldItemToComp(
      soldItem({
        itemId: 'blue',
        title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue Refractor /150',
        price: { value: '315.00', currency: 'USD' },
      }),
      model,
    )

    expect(base).toMatchObject({
      kind: 'base',
      playerName: 'Eli Willits',
      salePrice: 100,
      variationLabel: 'Base Auto',
    })
    expect(blue).toMatchObject({
      kind: 'variation',
      variationKey: 'blue /150',
      variationLabel: 'Blue /150',
      serialDenominator: 150,
    })
  })

  it('rejects bad sold comps before they can anchor the model', () => {
    const badTitles = [
      '2026 Bowman Baseball 1st Bowman Eli Willits Red Paper Auto 1/5',
      '2026 Topps Bunt Digital Bowman Eli Willits Chrome Auto Blue /150',
      '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 Redeemed',
      '2026 Bowman Chrome Different Player 1st Bowman Auto',
    ]

    expect(badTitles.map((title) => mapEbaySoldItemToComp(soldItem({ title }), model))).toEqual([null, null, null, null])
  })

  it('builds sold-derived base anchors and variation multipliers', () => {
    const comps = [
      mapEbaySoldItemToComp(soldItem({ itemId: 'base-1', price: { value: '100' }, itemSoldDate: '2026-06-20T00:00:00.000Z' }), model),
      mapEbaySoldItemToComp(soldItem({ itemId: 'base-2', price: { value: '110' }, itemSoldDate: '2026-06-18T00:00:00.000Z' }), model),
      mapEbaySoldItemToComp(soldItem({ itemId: 'base-3', price: { value: '105' }, itemSoldDate: '2026-06-16T00:00:00.000Z' }), model),
      mapEbaySoldItemToComp(soldItem({ itemId: 'base-4', price: { value: '95' }, itemSoldDate: '2026-06-14T00:00:00.000Z' }), model),
      mapEbaySoldItemToComp(soldItem({ itemId: 'base-5', price: { value: '115' }, itemSoldDate: '2026-06-12T00:00:00.000Z' }), model),
      mapEbaySoldItemToComp(soldItem({ itemId: 'base-6', price: { value: '100' }, itemSoldDate: '2026-06-10T00:00:00.000Z' }), model),
      mapEbaySoldItemToComp(
        soldItem({
          itemId: 'blue-1',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue Refractor /150',
          price: { value: '330' },
          itemSoldDate: '2026-06-19T00:00:00.000Z',
        }),
        model,
      ),
    ].filter((comp): comp is NonNullable<typeof comp> => Boolean(comp))

    const soldModel = buildEbaySoldVariationModel(model, comps, asOf)
    const eli = soldModel.players.find((player) => player.playerName === 'Eli Willits')
    const blue = soldModel.multipliers.find((variation) => variation.variation === 'Blue /150')

    expect(eli?.baseAvgPrice).toBeGreaterThan(100)
    expect(eli?.baseSales).toHaveLength(6)
    expect(blue?.avgMultiplier).toBeGreaterThan(3)
    expect(blue?.totalSales).toBe(1)

    const stats = summarizeEbaySoldModel(model, comps, soldModel)
    expect(stats).toMatchObject({
      mappedComps: 7,
      baseComps: 6,
      variationComps: 1,
      soldDerivedMultipliers: 1,
      soldAnchoredPlayers: 1,
    })
  })

  it('fetches sold items from the local eBay sold endpoint and returns a model overlay', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ q: string; playerName: string }> }
        expect(body.queries[0]?.q).toBe('Eli Willits 1st bowman chrome auto')
        return new Response(
          JSON.stringify({
            items: [
              soldItem({ itemId: 'base-fetch-1', _bowmanTraderQuery: body.queries[0] }),
              soldItem({
                itemId: 'blue-fetch-1',
                title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue Refractor /150',
                price: { value: '310' },
                _bowmanTraderQuery: body.queries[0],
              }),
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

    const result = await fetchEbaySoldVariationModel({ model: { ...model, players: [model.players[0]] }, playerLimit: 1 })

    expect(result.model.source).toBe('ebay-sold-model')
    expect(result.comps).toHaveLength(2)
    expect(result.stats).toMatchObject({
      queriesRun: 1,
      mappedComps: 2,
      baseComps: 1,
      variationComps: 1,
    })
  })
})
