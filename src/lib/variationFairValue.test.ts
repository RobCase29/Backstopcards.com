import { describe, expect, it } from 'vitest'
import type { SalesCacheBucket, SalesCachePlayerModel, SalesCacheSale } from './salesCache'
import { blendLaneEvidence, stableSalesCacheBaseValue, stableSalesCacheLaneValue } from './variationFairValue'

const asOf = Date.UTC(2026, 6, 10)

function bucket(overrides: Partial<SalesCacheBucket> = {}): SalesCacheBucket {
  return {
    bucketKey: 'player|2026|bowman chrome|auto|base auto|raw',
    playerName: 'Player',
    releaseYear: 2026,
    productFamily: 'Bowman Chrome',
    cardClass: 'auto',
    variationLabel: 'Base Auto',
    gradeBucket: 'Raw',
    serialDenominator: null,
    saleCount: 3,
    sales30: 3,
    sales90: 3,
    auctionCount: 2,
    binCount: 1,
    minPrice: 90,
    q1Price: 95,
    medianPrice: 100,
    avgPrice: 100,
    q3Price: 105,
    maxPrice: 110,
    modelPrice: 999,
    baseAutoMultiple: 1,
    latestSoldAt: new Date(asOf - 86_400_000).toISOString(),
    generatedAt: new Date(asOf).toISOString(),
    ...overrides,
  }
}

function sale(itemId: string, price: number, ageDays: number, bucketKey: string): SalesCacheSale {
  return {
    itemId,
    playerName: 'Player',
    title: `Player base auto ${itemId}`,
    salePriceText: `$${price}`,
    salePrice: price,
    soldAt: new Date(asOf - ageDays * 86_400_000).toISOString(),
    saleType: 'Auction',
    channel: 'Auction',
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
    bucketKey,
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
  }
}

describe('variation fair value', () => {
  it('does not let a single lane sale overwrite the release curve', () => {
    const estimate = blendLaneEvidence({
      curvePrice: 200,
      directPrice: 800,
      saleCount: 1,
      curveConfidence: 0.76,
      directConfidence: 0.48,
    })

    expect(estimate.value).toBeGreaterThan(200)
    expect(estimate.value).toBeLessThan(300)
    expect(estimate.method).toBe('hierarchical-direct-blend')
  })

  it('allows deep direct evidence to move fair value materially', () => {
    const thin = blendLaneEvidence({ curvePrice: 200, directPrice: 320, saleCount: 1 })
    const deep = blendLaneEvidence({ curvePrice: 200, directPrice: 320, saleCount: 20, directConfidence: 0.9 })

    expect(deep.value).toBeGreaterThan(thin.value)
    expect(deep.value).toBeLessThan(320)
    expect(deep.confidence).toBeGreaterThan(thin.confidence)
  })

  it('returns the curve unchanged when direct evidence is absent', () => {
    expect(blendLaneEvidence({ curvePrice: 245, directPrice: 0, saleCount: 0 })).toMatchObject({
      value: 245,
      directValue: null,
      method: 'curve-only',
    })
  })

  it('recomputes the base anchor from raw sales instead of trusting a stale cached point', () => {
    const baseBucket = bucket()
    const model: SalesCachePlayerModel = {
      available: true,
      playerName: 'Player',
      baseAutoBucket: baseBucket,
      buckets: [baseBucket],
      sales: [sale('a', 90, 5, baseBucket.bucketKey), sale('b', 100, 3, baseBucket.bucketKey), sale('c', 110, 1, baseBucket.bucketKey)],
    }

    const estimate = stableSalesCacheBaseValue({ bucket: baseBucket, model, asOf })
    expect(estimate?.value).toBeGreaterThan(90)
    expect(estimate?.value).toBeLessThan(115)
    expect(estimate?.value).not.toBe(999)
    expect(estimate?.modelVersion).toBe('backstop-fv-v3')
  })

  it('rejects unversioned cache points when raw evidence is unavailable', () => {
    const staleBucket = bucket({ modelPrice: 999 })
    const model: SalesCachePlayerModel = { available: true, playerName: 'Player', baseAutoBucket: staleBucket, buckets: [staleBucket], sales: [] }

    expect(stableSalesCacheBaseValue({ bucket: staleBucket, model, asOf })).toBeNull()
    expect(stableSalesCacheLaneValue({ curvePrice: 200, bucket: staleBucket, model, asOf })).toMatchObject({
      value: 200,
      directValue: null,
      method: 'curve-only',
    })
  })
})
