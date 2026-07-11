import { describe, expect, it } from 'vitest'
import type { Opportunity } from './types'
import { filterFanaticsDealOpportunities, type FanaticsDealFilters } from './lib/fanaticsDealFilters'

function opportunity(options: {
  id: string
  player: string
  ask: number
  fair: number
  marketplace?: string
  graded?: boolean
  confidence?: number
}): Opportunity {
  const edge = options.fair - options.ask
  return {
    listing: {
      id: options.id,
      kind: 'bin',
      title: `2026 Bowman Chrome ${options.player} 1st Auto`,
      playerName: options.player,
      currentPrice: options.ask,
      shippingCost: 0,
      allInPrice: options.ask,
      marketPrice: 0,
      compCount: 0,
      comps: [],
      status: 'active',
      isSold: false,
      marketplace: options.marketplace ?? 'fanatics-collect',
      marketplaceLabel: 'Fanatics Collect',
      watchCount: 0,
      bidCount: 0,
      releaseYear: 2026,
      releaseLabel: '2026 Bowman',
      variationLabel: 'Base Auto',
      serialDenominator: null,
      isGraded: Boolean(options.graded),
      isEligibleGraded: Boolean(options.graded),
      isBowman: true,
      isAutograph: true,
      isFirstBowman: true,
      isTargetAuto: true,
      isLowSerialNonAuto: false,
      isHandSigned: false,
      universeScore: 1,
      listingAgeHours: 1,
      hoursToClose: null,
    },
    score: 80,
    grade: 'A',
    action: 'Buy now',
    lane: 'buy',
    fairValue: options.fair,
    rawFairValue: options.fair,
    modelPrice: options.fair,
    modelConfidence: options.confidence ?? 0.8,
    valuationSource: 'base-auto',
    discountPct: edge / options.fair,
    edgeDollars: edge,
    rawEdgeDollars: edge,
    maxEntry: options.fair,
    expectedRoiPct: edge / options.ask,
    confidence: options.confidence ?? 0.8,
    trustScore: 80,
    compQualityScore: 75,
    availabilityScore: 70,
    universeScore: 1,
    executionScore: 80,
    liquidityScore: 70,
    urgencyScore: 50,
    riskScore: 10,
    scoreComponents: {
      rawEdge: 1,
      percentEdge: 1,
      compQuality: 1,
      targetFit: 1,
      availability: 1,
      variationModel: 1,
      prospect: 1,
      riskPenalty: 0,
    },
    thesis: '',
    tags: [],
    reasons: [],
    warnings: [],
  }
}

const defaults: FanaticsDealFilters = {
  query: '',
  valueBand: 'within-50',
  grade: 'all',
  sort: 'edge',
  maxPrice: 0,
  holdsOnly: false,
  holdTargets: [],
}

describe('Fanatics Collect dedicated-page filters', () => {
  it('defaults to Fanatics listings within 50% of model and sorts by dollar edge', () => {
    const results = filterFanaticsDealOpportunities(
      [
        opportunity({ id: 'small', player: 'Player Small', ask: 80, fair: 100 }),
        opportunity({ id: 'large', player: 'Player Large', ask: 150, fair: 250 }),
        opportunity({ id: 'rich', player: 'Player Rich', ask: 120, fair: 100 }),
        opportunity({ id: 'outside', player: 'Player Outside', ask: 151, fair: 100 }),
        opportunity({ id: 'ebay', player: 'Player Ebay', ask: 10, fair: 200, marketplace: 'ebay' }),
      ],
      defaults,
    )

    expect(results.map((result) => result.listing.id)).toEqual(['large', 'small', 'rich'])
  })

  it('supports near-model, player search, grade, max-price, and hold-target filters', () => {
    const results = filterFanaticsDealOpportunities(
      [
        opportunity({ id: 'raw', player: 'Aiva Arquette', ask: 105, fair: 100 }),
        opportunity({ id: 'graded', player: 'Aiva Arquette', ask: 95, fair: 100, graded: true }),
        opportunity({ id: 'other', player: 'Luis Arana', ask: 75, fair: 100 }),
      ],
      {
        ...defaults,
        query: 'arquette',
        valueBand: 'near-model',
        grade: 'graded',
        maxPrice: 100,
        holdsOnly: true,
        holdTargets: ['Aiva Arquette'],
      },
    )

    expect(results.map((result) => result.listing.id)).toEqual(['graded'])
  })

  it('can sort by discount, lowest price, or confidence', () => {
    const rows = [
      opportunity({ id: 'confidence', player: 'Player A', ask: 90, fair: 100, confidence: 0.95 }),
      opportunity({ id: 'discount', player: 'Player B', ask: 50, fair: 100, confidence: 0.7 }),
      opportunity({ id: 'price', player: 'Player C', ask: 40, fair: 60, confidence: 0.8 }),
    ]

    expect(filterFanaticsDealOpportunities(rows, { ...defaults, sort: 'discount' })[0]?.listing.id).toBe('discount')
    expect(filterFanaticsDealOpportunities(rows, { ...defaults, sort: 'price' })[0]?.listing.id).toBe('price')
    expect(filterFanaticsDealOpportunities(rows, { ...defaults, sort: 'confidence' })[0]?.listing.id).toBe('confidence')
  })
})
