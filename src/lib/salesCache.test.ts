import { describe, expect, it } from 'vitest'
import {
  salesCacheBucketIsFlagshipRawAuto,
  salesCacheBucketIsFlagshipRawBaseAuto,
  type SalesCacheBucket,
} from './salesCache'

function bucket(overrides: Partial<SalesCacheBucket> = {}): SalesCacheBucket {
  return {
    bucketKey: 'marek-houston|2026|bowman-chrome|auto|base-auto|raw',
    playerName: 'Marek Houston',
    releaseYear: 2026,
    productFamily: 'Bowman Chrome',
    cardClass: 'auto',
    variationLabel: 'Base Auto',
    gradeBucket: 'Raw',
    serialDenominator: null,
    saleCount: 8,
    sales30: 5,
    sales90: 8,
    auctionCount: 5,
    binCount: 3,
    minPrice: 20,
    q1Price: 23,
    medianPrice: 25,
    avgPrice: 25,
    q3Price: 27,
    maxPrice: 31,
    modelPrice: 25,
    baseAutoMultiple: 1,
    latestSoldAt: '2026-07-15T00:00:00.000Z',
    generatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('sales-cache flagship auto guards', () => {
  it('accepts the raw flagship Chrome base auto lane', () => {
    expect(salesCacheBucketIsFlagshipRawBaseAuto(bucket())).toBe(true)
  })

  it('accepts Bowman Draft Chrome autos stored under the release family', () => {
    expect(salesCacheBucketIsFlagshipRawBaseAuto(bucket({ productFamily: 'Bowman Draft' }))).toBe(true)
  })

  it.each(['Bowman', 'Bowman Paper', 'Bowman Mega', 'Bowman Sapphire', 'Hand Signed'])(
    'never lets the %s base lane replace the flagship Chrome anchor',
    (productFamily) => {
      expect(salesCacheBucketIsFlagshipRawBaseAuto(bucket({ productFamily }))).toBe(false)
    },
  )

  it('allows a flagship Chrome parallel to inform the Chrome curve without calling it the base lane', () => {
    const parallel = bucket({ variationLabel: 'Aqua /125', serialDenominator: 125, baseAutoMultiple: 2.4 })
    expect(salesCacheBucketIsFlagshipRawAuto(parallel)).toBe(true)
    expect(salesCacheBucketIsFlagshipRawBaseAuto(parallel)).toBe(false)
  })

  it('rejects graded and non-auto lanes', () => {
    expect(salesCacheBucketIsFlagshipRawAuto(bucket({ gradeBucket: 'PSA 10' }))).toBe(false)
    expect(salesCacheBucketIsFlagshipRawAuto(bucket({ cardClass: 'chrome' }))).toBe(false)
  })
})
