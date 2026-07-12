import { describe, expect, it } from 'vitest'
import type { ChecklistModel } from '../types'
import { buildPricingMatrix, estimateBasePrice, releaseVariationCurve, variationKey } from './matrix'

const asOf = Date.UTC(2026, 5, 21)

const bowmanModel: ChecklistModel = {
  category: 'bowman',
  release: '2026-Bowman',
  releaseYear: 2026,
  multipliers: [
    { variation: 'Blue /150 Auto', avgMultiplier: 3, sortOrder: 2 },
    { variation: 'Gold /50 Auto', avgMultiplier: 7, sortOrder: 3 },
  ],
  players: [
    {
      playerName: 'Top Prospect',
      baseAvgPrice: 100,
      baseSalesCount: 12,
      variations: [{ variation: 'Blue /150 Auto', avgPrice: 310, multiplier: 3.1, salesCount: 2 }],
    },
    {
      playerName: 'Value Prospect',
      baseAvgPrice: 40,
      baseSalesCount: 5,
      variations: [],
    },
  ],
  fetchedAt: '2026-06-21T00:00:00.000Z',
  source: 'authenticated-player-model',
}

const draftModel: ChecklistModel = {
  category: 'draft',
  release: '2025-Bowman-Draft',
  releaseYear: 2025,
  multipliers: [
    { variation: 'Base Auto', avgMultiplier: 1, sortOrder: 0 },
    { variation: 'Blue /150 Auto', avgMultiplier: 4, sortOrder: 2 },
  ],
  players: [
    {
      playerName: 'Draft Prospect',
      baseAvgPrice: 80,
      baseSalesCount: 8,
      variations: [],
    },
  ],
  fetchedAt: '2026-06-21T00:00:00.000Z',
  source: 'authenticated-player-model',
}

describe('pricing matrix', () => {
  it('synthesizes a base auto 1x multiple when the release curve omits it', () => {
    const { variations } = releaseVariationCurve(bowmanModel)

    expect(variations[0]).toMatchObject({
      variation: 'Base Auto',
      avgMultiplier: 1,
    })
  })

  it('keeps the release-agnostic base key stable and never duplicates the base lane', () => {
    const { variations } = releaseVariationCurve(draftModel)

    expect(variationKey('Base Auto')).toBe('base')
    expect(variations.filter((variation) => variationKey(variation.variation) === 'base')).toHaveLength(1)
  })

  it('solves every player x release variation cell and ranks by base auto value', () => {
    const matrix = buildPricingMatrix([bowmanModel])

    expect(matrix.rows.map((row) => row.playerName)).toEqual(['Top Prospect', 'Value Prospect'])
    expect(matrix.totalResolvedCells).toBe(6)
    expect(matrix.rows[0].ladder.map((quote) => [quote.label, quote.price])).toEqual([
      ['Base Auto', 100],
      ['Blue /150 Auto', 300],
      ['Gold /50 Auto', 700],
    ])
  })

  it('uses each release-specific multiple for the same variation label', () => {
    const matrix = buildPricingMatrix([bowmanModel, draftModel])
    const bowmanBlue = matrix.rows.find((row) => row.release === '2026-Bowman')?.ladder.find((quote) => quote.label === 'Blue /150 Auto')
    const draftBlue = matrix.rows.find((row) => row.release === '2025-Bowman-Draft')?.ladder.find((quote) => quote.label === 'Blue /150 Auto')

    expect(bowmanBlue).toMatchObject({ multiplier: 3, price: 300 })
    expect(draftBlue).toMatchObject({ multiplier: 4, price: 320 })
  })

  it('keeps multiplier valuation independent from observed player variation averages', () => {
    const matrix = buildPricingMatrix([bowmanModel])
    const blue = matrix.rows[0].ladder.find((quote) => quote.label === 'Blue /150 Auto')

    expect(blue).toMatchObject({
      price: 300,
      multiplier: 3,
    })
  })

  it('treats snack-pack wording variants as one variation key', () => {
    expect(variationKey('Sunflower Seeds /5')).toBe(variationKey('Sunflower Snack Pack /5'))
    expect(variationKey('Gum Ball /5')).toBe(variationKey('Gumball Snack Pack /5'))
  })

  it('treats colored numbered refractor aliases as one lane without collapsing /499 refractors into base', () => {
    expect(variationKey('Orange /25 Auto')).toBe(variationKey('Orange Refractor /25 Auto'))
    expect(variationKey('Blue /150 Auto')).toBe(variationKey('Blue Refractor /150 Auto'))
    expect(variationKey('Refractor /499 Auto')).not.toBe(variationKey('Base Auto'))
  })

  it('uses a 30-day recency-weighted base when enough raw sales are available', () => {
    const estimate = estimateBasePrice(
      {
        playerName: 'Hot Prospect',
        baseAvgPrice: 50,
        baseSalesCount: 20,
        baseSales: [
          { salePrice: 160, saleDate: '2026-06-20' },
          { salePrice: 50, saleDate: '2026-06-16' },
          { salePrice: 50, saleDate: '2026-06-11' },
          { salePrice: 50, saleDate: '2026-06-06' },
          { salePrice: 50, saleDate: '2026-06-01' },
          { salePrice: 50, saleDate: '2026-05-27' },
        ],
        variations: [],
      },
      asOf,
    )

    expect(estimate.source).toBe('weighted-sales')
    expect(estimate.price).toBeGreaterThan(58)
    expect(estimate.price).toBeLessThan(70)
    expect(estimate.sales30).toBe(6)
    expect(estimate.methodLabel).toContain('robust recency ensemble')
  })

  it('blends 30-day, 90-day, and fallback values when recent base sales are thin', () => {
    const estimate = estimateBasePrice(
      {
        playerName: 'Thin Prospect',
        baseAvgPrice: 100,
        baseSalesCount: 8,
        baseSales: [
          { salePrice: 140, saleDate: '2026-06-19' },
          { salePrice: 130, saleDate: '2026-06-14' },
          { salePrice: 120, saleDate: '2026-06-04' },
          { salePrice: 80, saleDate: '2026-05-02' },
          { salePrice: 75, saleDate: '2026-04-11' },
        ],
        variations: [],
      },
      asOf,
    )

    expect(estimate.source).toBe('blended-sales')
    expect(estimate.price).toBeGreaterThan(100)
    expect(estimate.price).toBeLessThan(140)
    expect(estimate.methodLabel).toContain('robust recency ensemble')
  })

  it('balances auction and BIN channels when both are present', () => {
    const estimate = estimateBasePrice(
      {
        playerName: 'Channel Prospect',
        baseAvgPrice: 115,
        baseSalesCount: 8,
        baseSales: [
          { salePrice: 100, saleDate: '2026-06-20', saleType: 'Auction' },
          { salePrice: 102, saleDate: '2026-06-17', saleType: 'Auction' },
          { salePrice: 98, saleDate: '2026-06-12', saleType: 'Auction' },
          { salePrice: 104, saleDate: '2026-06-02', saleType: 'Auction' },
          { salePrice: 142, saleDate: '2026-06-19', saleType: 'Fixed Price' },
          { salePrice: 138, saleDate: '2026-06-15', saleType: 'Fixed Price' },
          { salePrice: 145, saleDate: '2026-06-08', saleType: 'Buy It Now' },
          { salePrice: 135, saleDate: '2026-05-30', saleType: 'Best Offer' },
        ],
        variations: [],
      },
      asOf,
    )

    expect(estimate.source).toBe('weighted-sales')
    expect(estimate.auctionSales).toBe(4)
    expect(estimate.binSales).toBe(4)
    expect(estimate.price).toBeGreaterThan(108)
    expect(estimate.price).toBeLessThan(132)
    expect(estimate.methodLabel).toContain('auction/BIN channel blend')
  })

  it('shrinks stale thin sales toward the cached summary anchor', () => {
    const estimate = estimateBasePrice(
      {
        playerName: 'Stale Prospect',
        baseAvgPrice: 60,
        baseSalesCount: 3,
        baseSales: [
          { salePrice: 150, saleDate: '2026-03-01', saleType: 'Auction' },
          { salePrice: 140, saleDate: '2026-02-22', saleType: 'Auction' },
        ],
        variations: [],
      },
      asOf,
    )

    expect(estimate.source).toBe('blended-sales')
    expect(estimate.price).toBeGreaterThan(62)
    expect(estimate.price).toBeLessThan(95)
    expect(estimate.confidence).toBeLessThan(0.62)
  })

  it('preserves aggregate comp evidence when detailed sale rows are omitted from a snapshot', () => {
    const estimate = estimateBasePrice(
      {
        playerName: 'Fallback Prospect',
        baseAvgPrice: 88,
        baseSalesCount: 6,
        variations: [],
      },
      asOf,
    )

    expect(estimate).toMatchObject({
      price: 88,
      source: 'twma-fallback',
      rawSales: 6,
      methodLabel: 'cached comp summary',
    })
    expect(estimate.effectiveSales).toBeGreaterThan(2)
    expect(estimate.confidence).toBeGreaterThan(0.5)
  })

  it('backs into base auto value from player variation sales when base auto is missing', () => {
    const matrix = buildPricingMatrix([
      {
        ...bowmanModel,
        players: [
          ...bowmanModel.players,
          {
            playerName: 'No Base Prospect',
            baseAvgPrice: 0,
            baseSalesCount: 0,
            variations: [
              { variation: 'Blue /150 Auto', avgPrice: 90, multiplier: 0, salesCount: 2 },
              { variation: 'Gold /50 Auto', avgPrice: 210, multiplier: 0, salesCount: 1 },
            ],
          },
        ],
      },
    ])

    const implied = matrix.rows.find((row) => row.playerName === 'No Base Prospect')

    expect(implied).toBeDefined()
    expect(implied?.basePriceSource).toBe('variation-implied')
    expect(implied?.baseTwmaPrice).toBeGreaterThan(28)
    expect(implied?.baseTwmaPrice).toBeLessThan(32)
    expect(implied?.baseMethod).toContain('implied from 2 variation anchors')
    expect(implied?.ladder.find((quote) => quote.label === 'Blue /150 Auto')?.price).toBeCloseTo((implied?.baseTwmaPrice ?? 0) * 3, 0)
    expect(matrix.impliedBaseRows).toBe(1)
    expect(matrix.missingBaseRows).toBe(0)
  })

  it('keeps checklist-only players visible without counting them as priced models', () => {
    const matrix = buildPricingMatrix([
      {
        ...bowmanModel,
        players: [
          ...bowmanModel.players,
          {
            playerName: 'Awaiting Comps',
            baseAvgPrice: 0,
            baseSalesCount: 0,
            variations: [],
          },
        ],
      },
    ])

    const awaiting = matrix.rows.find((row) => row.playerName === 'Awaiting Comps')

    expect(awaiting).toBeDefined()
    expect(awaiting?.basePriceSource).toBe('unpriced')
    expect(awaiting?.baseTwmaPrice).toBe(0)
    expect(awaiting?.baseMethod).toBe('needs base comps')
    expect(awaiting?.stsRiserValueScore).toBeNull()
    expect(awaiting?.stsBinTargetScore).toBeNull()
    expect(awaiting?.ladder.every((quote) => quote.price === 0)).toBe(true)
    expect(matrix.totalPlayers).toBe(3)
    expect(matrix.totalPricedPlayers).toBe(2)
    expect(matrix.missingBaseRows).toBe(1)
    expect(matrix.totalResolvedCells).toBe(6)
  })
})
