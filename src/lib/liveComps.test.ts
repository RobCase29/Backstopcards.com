import { describe, expect, it } from 'vitest'
import type { NormalizedListing } from '../types'
import type { SalesCacheBucket, SalesCachePlayerModel, SalesCacheSale } from './salesCache'
import { salesCacheValuationForListing } from './liveComps'

const now = '2026-06-25T12:00:00.000Z'

function bucket(overrides: Partial<SalesCacheBucket>): SalesCacheBucket {
  return {
    bucketKey: overrides.bucketKey ?? 'bucket',
    playerName: 'Kendry Chourio',
    releaseYear: 2026,
    productFamily: 'Bowman Chrome',
    cardClass: 'auto',
    variationLabel: 'Base Auto',
    gradeBucket: 'Raw',
    serialDenominator: null,
    saleCount: 1,
    sales30: 1,
    sales90: 1,
    auctionCount: 0,
    binCount: 1,
    minPrice: 50,
    q1Price: 50,
    medianPrice: 50,
    avgPrice: 50,
    q3Price: 50,
    maxPrice: 50,
    modelPrice: 50,
    baseAutoMultiple: 1,
    latestSoldAt: now,
    generatedAt: now,
    ...overrides,
  }
}

function listing(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    id: 'kendry-base-auto',
    kind: 'bin',
    title: '2026 Bowman Kendry Chourio Chrome Auto Autograph 1st Prospect #CPA-KC Royals',
    playerName: 'Kendry Chourio',
    currentPrice: 45,
    shippingCost: 0,
    allInPrice: 45,
    marketPrice: 0,
    compCount: 0,
    comps: [],
    status: 'active',
    isSold: false,
    watchCount: 0,
    bidCount: 0,
    releaseYear: 2026,
    releaseLabel: '2026 Bowman',
    variationLabel: 'Base Auto',
    serialDenominator: null,
    isGraded: false,
    isEligibleGraded: false,
    isBowman: true,
    isAutograph: true,
    isFirstBowman: true,
    isTargetAuto: true,
    isLowSerialNonAuto: false,
    isHandSigned: false,
    universeScore: 1,
    ...overrides,
  }
}

function sale(overrides: Partial<SalesCacheSale> = {}): SalesCacheSale {
  return {
    itemId: overrides.itemId ?? 'sale',
    playerName: 'Kendry Chourio',
    title: '2026 Bowman Chrome Kendry Chourio 1st Bowman Green Refractor /99',
    salePriceText: '$48',
    salePrice: 48,
    soldAt: now,
    saleType: 'Buy It Now',
    channel: 'Card Hedge',
    seller: 'seller',
    sourcePage: null,
    sourceOffset: 0,
    releaseYear: 2026,
    productFamily: 'Bowman Chrome',
    cardClass: 'chrome',
    variationLabel: 'Green /99',
    serialDenominator: 99,
    gradeCompany: null,
    gradeValue: null,
    gradeBucket: 'Raw',
    insertName: null,
    bucketKey: 'green-99',
    modelEligible: true,
    exclusionReason: null,
    isAuto: false,
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

describe('salesCacheValuationForListing', () => {
  it('does not map a plain base auto listing to a numbered comp lane', () => {
    const model: SalesCachePlayerModel = {
      available: true,
      playerName: 'Kendry Chourio',
      buckets: [
        bucket({
          bucketKey: 'mini-diamond',
          variationLabel: 'Mini Diamond /100',
          serialDenominator: 100,
          saleCount: 6,
          sales30: 6,
          modelPrice: 132,
          medianPrice: 132,
        }),
        bucket({
          bucketKey: 'base-auto',
          variationLabel: 'Base Auto',
          serialDenominator: null,
          saleCount: 2,
          sales30: 2,
          modelPrice: 68,
          medianPrice: 68,
        }),
      ],
      sales: [],
    }

    const valuation = salesCacheValuationForListing(listing(), model)

    expect(valuation?.bucket.variationLabel).toBe('Base Auto')
    expect(valuation?.soldModelPrice).toBe(68)
  })

  it('does not map low-serial non-autos into an auto comp lane', () => {
    const model: SalesCachePlayerModel = {
      available: true,
      playerName: 'Kendry Chourio',
      buckets: [
        bucket({
          bucketKey: 'auto-green-99',
          cardClass: 'auto',
          variationLabel: 'Green /99',
          serialDenominator: 99,
          saleCount: 8,
          sales30: 8,
          modelPrice: 175,
          medianPrice: 175,
        }),
      ],
      sales: [
        sale({
          bucketKey: 'auto-green-99',
          cardClass: 'auto',
          isAuto: true,
          salePrice: 175,
        }),
      ],
    }

    const valuation = salesCacheValuationForListing(
      listing({
        id: 'green-99-non-auto',
        title: '2026 Bowman Chrome Kendry Chourio 1st Bowman Green Refractor /99',
        variationLabel: 'Green /99',
        serialDenominator: 99,
        isAutograph: false,
        isTargetAuto: false,
        isLowSerialNonAuto: true,
      }),
      model,
    )

    expect(valuation).toBeNull()
  })

  it('allows a two-sale exact low-serial non-auto comp lane', () => {
    const model: SalesCachePlayerModel = {
      available: true,
      playerName: 'Kendry Chourio',
      buckets: [
        bucket({
          bucketKey: 'green-99',
          cardClass: 'chrome',
          variationLabel: 'Green /99',
          serialDenominator: 99,
          saleCount: 2,
          sales30: 2,
          modelPrice: 48,
          medianPrice: 48,
        }),
      ],
      sales: [
        sale({ itemId: 'green-99-a', bucketKey: 'green-99', salePrice: 47 }),
        sale({ itemId: 'green-99-b', bucketKey: 'green-99', salePrice: 49, sourceOffset: 1 }),
      ],
    }

    const valuation = salesCacheValuationForListing(
      listing({
        id: 'green-99-non-auto',
        title: '2026 Bowman Chrome Kendry Chourio 1st Bowman Green Refractor /99',
        variationLabel: 'Green /99',
        serialDenominator: 99,
        isAutograph: false,
        isTargetAuto: false,
        isLowSerialNonAuto: true,
      }),
      model,
    )

    expect(valuation?.bucket.variationLabel).toBe('Green /99')
    expect(valuation?.saleCount).toBe(2)
    expect(valuation?.source).toBe('sales-cache-exact')
  })

  it('rejects same-serial lanes when the distinctive modifier is different', () => {
    const model: SalesCachePlayerModel = {
      available: true,
      playerName: 'Kendry Chourio',
      buckets: [
        bucket({
          bucketKey: 'green-99',
          cardClass: 'chrome',
          variationLabel: 'Green /99',
          serialDenominator: 99,
          saleCount: 6,
          sales30: 6,
          modelPrice: 50,
          medianPrice: 50,
        }),
      ],
      sales: [
        sale({
          bucketKey: 'green-99',
          variationLabel: 'Green /99',
          serialDenominator: 99,
        }),
      ],
    }

    const valuation = salesCacheValuationForListing(
      listing({
        id: 'green-grass-99',
        title: '2026 Bowman Chrome Kendry Chourio 1st Bowman Green Grass Refractor /99',
        variationLabel: 'Green Grass /99',
        serialDenominator: 99,
        isAutograph: false,
        isTargetAuto: false,
        isLowSerialNonAuto: true,
      }),
      model,
    )

    expect(valuation).toBeNull()
  })
})
