import { describe, expect, it } from 'vitest'
import type { SalesCacheSale } from './salesCache'
import {
  compareSalesBucketsByScarcity,
  isFlagshipChromeAutoLane,
  readableVariationLabel,
  saleBucketShortLabel,
  saleMatchesLabScope,
  salesScarcityModel,
} from './salesLab'

function sale(overrides: Partial<SalesCacheSale>): SalesCacheSale {
  return {
    itemId: 'item',
    playerName: 'Player',
    title: '',
    salePriceText: '$0',
    salePrice: 0,
    soldAt: '2026-06-24T12:00:00.000Z',
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

describe('sales lab scarcity model', () => {
  it('orders base autos ahead of numbered auto parallels by estimated print run', () => {
    const baseAuto = salesScarcityModel(null, 'Bowman Chrome / Base Auto / Raw', 'Autos')
    const goldAuto = salesScarcityModel(null, 'Bowman Chrome / Gold / Raw', 'Autos')

    expect(baseAuto.copies).toBe(1880)
    expect(baseAuto.label).toBe('~1,880 run')
    expect(goldAuto.copies).toBe(50)
    expect(goldAuto.label).toBe('~/50')

    const rows = [
      { estimatedCopies: goldAuto.copies, numbered: goldAuto.numbered, label: 'Gold', type: 'Autos', modelPrice: 300, count: 2 },
      { estimatedCopies: baseAuto.copies, numbered: baseAuto.numbered, label: 'Base Auto', type: 'Autos', modelPrice: 58, count: 105 },
    ].sort(compareSalesBucketsByScarcity)

    expect(rows.map((row) => row.label)).toEqual(['Base Auto', 'Gold'])
  })

  it('keeps known unnumbered variations from being misread as simple color parallels', () => {
    const redRcVariation = salesScarcityModel(null, 'Bowman Chrome / Red RC Variation / Raw', 'Chrome')
    const genericChrome = salesScarcityModel(null, 'Bowman Chrome / Base Chrome / Raw', 'Chrome')

    expect(redRcVariation.copies).toBe(20_690)
    expect(redRcVariation.label).toBe('~20,690 run')
    expect(genericChrome.copies).toBe(50_000)
    expect(genericChrome.label).toBe('unserialed')
  })

  it('keeps obvious non-auto chrome lanes out of the flagship chrome-auto scope', () => {
    const baseAuto = sale({ variationLabel: 'Base Auto' })
    const refractorAuto = sale({ variationLabel: 'Refractor /499', serialDenominator: 499 })
    const reptilianChrome = sale({ variationLabel: 'Reptilian' })

    expect(isFlagshipChromeAutoLane(baseAuto)).toBe(true)
    expect(isFlagshipChromeAutoLane(refractorAuto)).toBe(true)
    expect(isFlagshipChromeAutoLane(reptilianChrome)).toBe(false)
    expect(saleMatchesLabScope(reptilianChrome, 'chrome-autos')).toBe(false)
    expect(saleMatchesLabScope(reptilianChrome, 'autos')).toBe(true)
  })

  it('labels bare serial-only lanes as unlabeled and sorts named lanes first', () => {
    expect(readableVariationLabel('/150')).toBe('Unlabeled /150')
    expect(saleBucketShortLabel(sale({ variationLabel: '/150' }))).toBe('Bowman Chrome / Unlabeled /150 / Raw')

    const rows = [
      { estimatedCopies: 150, numbered: true, label: 'Bowman Chrome / Unlabeled /150 / Raw', type: 'Autos', modelPrice: 73, count: 1 },
      { estimatedCopies: 150, numbered: true, label: 'Bowman Chrome / Blue /150 / Raw', type: 'Autos', modelPrice: 136, count: 10 },
    ].sort(compareSalesBucketsByScarcity)

    expect(rows.map((row) => row.label)).toEqual(['Bowman Chrome / Blue /150 / Raw', 'Bowman Chrome / Unlabeled /150 / Raw'])
  })
})
