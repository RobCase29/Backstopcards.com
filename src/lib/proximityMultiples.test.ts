import { describe, expect, it } from 'vitest'
import type { SalesCacheSale } from './salesCache'
import { isRawBaseAutoSale, isRawAutoVariationSale, summarizeProximityMultiplier } from './proximityMultiples'

function sale(overrides: Partial<SalesCacheSale>): SalesCacheSale {
  return {
    itemId: overrides.itemId ?? 'item',
    playerName: 'Player',
    title: '',
    salePriceText: '$0',
    salePrice: 100,
    soldAt: '2026-06-20T12:00:00.000Z',
    saleType: 'BIN',
    channel: 'bin',
    seller: '',
    sourcePage: null,
    sourceOffset: 0,
    releaseYear: 2026,
    productFamily: 'Bowman Chrome',
    cardClass: 'auto',
    variationLabel: 'Base Auto',
    serialDenominator: null,
    gradeCompany: null,
    gradeValue: null,
    gradeBucket: 'Raw',
    insertName: null,
    bucketKey: 'bucket',
    modelEligible: true,
    exclusionReason: null,
    isAuto: true,
    isBowman: true,
    isChrome: true,
    isPaper: false,
    isCaseHit: false,
    isInsert: false,
    isRedemption: false,
    isRedeemed: false,
    isDigital: false,
    isLot: false,
    erroneous: false,
    erroneousNote: '',
    flagUpdatedAt: '',
    ...overrides,
  }
}

describe('proximity multipliers', () => {
  it('anchors a variation sale to nearby base auto sales instead of a current base model', () => {
    const variation = sale({
      itemId: 'gold',
      variationLabel: 'Gold /50',
      serialDenominator: 50,
      salePrice: 300,
      soldAt: '2026-06-20T12:00:00.000Z',
    })
    const summary = summarizeProximityMultiplier(
      [variation],
      [
        sale({ itemId: 'base-before', salePrice: 100, soldAt: '2026-06-18T12:00:00.000Z' }),
        sale({ itemId: 'base-after', salePrice: 110, soldAt: '2026-06-21T12:00:00.000Z' }),
        variation,
      ],
    )

    expect(summary).not.toBeNull()
    expect(summary?.pointCount).toBe(1)
    expect(summary?.multiplier).toBeGreaterThan(2.7)
    expect(summary?.multiplier).toBeLessThan(3.05)
    expect(summary?.points[0].windowDays).toBe(14)
  })

  it('falls back to a wider date window when the closest base sales are older', () => {
    const variation = sale({
      itemId: 'orange',
      variationLabel: 'Orange /25',
      serialDenominator: 25,
      salePrice: 500,
      soldAt: '2026-06-20T12:00:00.000Z',
    })
    const summary = summarizeProximityMultiplier(
      [variation],
      [sale({ itemId: 'base-old', salePrice: 125, soldAt: '2026-05-27T12:00:00.000Z' }), variation],
    )

    expect(summary?.points[0].windowDays).toBe(30)
    expect(summary?.multiplier).toBeCloseTo(4, 1)
  })

  it('does not create a near-sale multiple without a usable base anchor', () => {
    const variation = sale({
      itemId: 'super',
      variationLabel: 'Superfractor /1',
      serialDenominator: 1,
      salePrice: 5000,
    })

    expect(summarizeProximityMultiplier([variation], [variation])).toBeNull()
  })

  it('recognizes only clean raw base auto and raw variation auto sales', () => {
    expect(isRawBaseAutoSale(sale({ variationLabel: 'Base Auto' }))).toBe(true)
    expect(isRawBaseAutoSale(sale({ variationLabel: 'Base Auto', gradeBucket: 'PSA 10', gradeValue: 10 }))).toBe(false)
    expect(isRawAutoVariationSale(sale({ variationLabel: 'Refractor /499', serialDenominator: 499 }))).toBe(true)
    expect(isRawAutoVariationSale(sale({ variationLabel: 'Base Auto' }))).toBe(false)
    expect(isRawAutoVariationSale(sale({ variationLabel: 'Gold /50', erroneous: true }))).toBe(false)
  })
})
