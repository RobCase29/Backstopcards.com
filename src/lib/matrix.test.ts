import { describe, expect, it } from 'vitest'
import type { ChecklistModel } from '../types'
import { buildPricingMatrix, estimateBasePrice, releaseVariationCurve } from './matrix'

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
    expect(estimate.price).toBeGreaterThan(70)
    expect(estimate.sales30).toBe(6)
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
    expect(estimate.methodLabel).toBe('30d/90d blend')
  })

  it('falls back to ProspectPulse base when raw sale history is missing', () => {
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
      rawSales: 0,
    })
  })
})
