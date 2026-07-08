import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeListing, rankOpportunities } from './scoring'
import type { ChecklistModel, ProspectPulseListing } from '../types'
import type { SalesCachePlayerModel } from './salesCache'

const model: ChecklistModel = {
  category: 'bowman',
  release: '2026-Bowman',
  releaseYear: 2026,
  fetchedAt: '2026-06-20T00:00:00.000Z',
  source: 'authenticated-player-model',
  multipliers: [
    {
      variation: 'Blue /150',
      avgMultiplier: 3,
      avgPrice: 300,
      playerCount: 40,
      totalSales: 160,
    },
  ],
  players: [
    {
      playerName: 'Eli Willits',
      baseAvgPrice: 100,
      baseSalesCount: 12,
      variations: [
        {
          variation: 'Blue /150',
          avgPrice: 350,
          multiplier: 3.5,
          salesCount: 5,
        },
      ],
    },
  ],
}

const draftModel: ChecklistModel = {
  ...model,
  category: 'draft',
  release: '2025-Bowman-Draft',
  releaseYear: 2025,
}

function listing(overrides: Partial<ProspectPulseListing> = {}): ProspectPulseListing {
  return {
    item_id: 'card-1',
    player_name: 'Eli Willits',
    title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150',
    current_price: 100,
    shipping_cost: 5,
    buying_format: 'Buy It Now',
    listing_status: 'active',
    release_year: 2026,
    product_type: 'Bowman Chrome',
    variation: 'Blue',
    serial_denominator: 150,
    comps: [{ sale_price: 220 }],
    ...overrides,
  }
}

describe('normalizeListing', () => {
  it('uses positive price fallbacks and parses string money fields', () => {
    const normalized = normalizeListing(
      listing({
        current_price: '0',
        price: '$250.00',
        shipping_cost: '$5.25',
        release_year: '2026',
        serial_denominator: '150',
        seller_feedback_score: '1,234',
      }),
    )

    expect(normalized.currentPrice).toBe(250)
    expect(normalized.allInPrice).toBe(255.25)
    expect(normalized.releaseYear).toBe(2026)
    expect(normalized.serialDenominator).toBe(150)
    expect(normalized.sellerFeedbackScore).toBe(1234)
    expect(normalized.isTargetAuto).toBe(true)
  })

  it('normalizes Gold Ink exchange auctions into the Gold Image /15 lane', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Prospect Gold Ink Dillon Lewis 1st ROOKIE AUTO /15 EXCH',
        player_name: 'Dillon Lewis',
        buying_format: 'Auction',
        variation: '',
        serial_denominator: null,
      }),
    )

    expect(normalized.variationLabel).toBe('Gold Image Variation /15')
    expect(normalized.serialDenominator).toBe(15)
    expect(normalized.isTargetAuto).toBe(true)
  })

  it('detects graded cards from title metadata even when is_graded is missing', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 PSA 10',
        is_graded: null,
        grader: null,
        grade: null,
      }),
    )

    expect(normalized.isGraded).toBe(true)
  })

  it('detects compact and hobby-style grade wording', () => {
    expect(normalizeListing(listing({ title: '2026 Bowman Chrome Eli Willits 1st Auto PSA10 Blue /150' })).isGraded).toBe(true)
    expect(normalizeListing(listing({ title: '2026 Bowman Chrome Eli Willits 1st Auto BGS 9.5 Blue /150' })).isGraded).toBe(true)
    expect(normalizeListing(listing({ title: '2026 Bowman Chrome Eli Willits 1st Auto GEM MT 10 Blue /150' })).isGraded).toBe(true)
  })

  it('normalizes major-grader 9+ slab details', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Eli Willits 1st Auto PSA GEM MT 10 Blue /150',
      }),
    )

    expect(normalized.gradingCompany).toBe('PSA')
    expect(normalized.gradeNumber).toBe(10)
    expect(normalized.isEligibleGraded).toBe(true)
  })

  it('infers snack-pack autos as chrome auto /5 variation lanes', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Eli Willits 1st Bowman Sunflower Snack Pack Auto',
        variation: '',
        serial_denominator: null,
      }),
    )

    expect(normalized.variationLabel).toBe('Sunflower Snack Pack /5')
    expect(normalized.serialDenominator).toBe(5)
    expect(normalized.isTargetAuto).toBe(true)
  })

  it('infers plain refractor redemptions as the /499 auto lane', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Refractor Redemption',
        variation: '',
        serial_denominator: null,
      }),
    )

    expect(normalized.variationLabel).toBe('Refractor /499')
    expect(normalized.serialDenominator).toBe(499)
  })

  it('does not infer Red /5 from Red Sox team text on base autos', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Justin Gonzales 1st Bowman Auto Red Sox #CPA-JG Top Prospect',
        player_name: 'Justin Gonzales',
        variation: '',
        serial_denominator: null,
      }),
    )

    expect(normalized.variationLabel).toBe('Base')
    expect(normalized.serialDenominator).toBeNull()
  })

  it('prices true base autos from the player base anchor', () => {
    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'base-auto',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Chrome Prospect Autographs Auto CPA-EW',
          current_price: 70,
          variation: '',
          serial_denominator: null,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      model,
    )

    expect(opportunities[0].valuationSource).toBe('base-auto')
    expect(opportunities[0].matchedVariation).toBe('Base Auto')
    expect(opportunities[0].fairValue).toBe(100)
  })

  it('keeps Red Sox base autos on the base-auto model instead of the Red /5 lane', () => {
    const redSoxModel: ChecklistModel = {
      ...model,
      multipliers: [
        { variation: 'Base Auto', avgMultiplier: 1, playerCount: 76, totalSales: 220 },
        { variation: 'Red /5', avgMultiplier: 55, playerCount: 28, totalSales: 35 },
      ],
      players: [
        {
          playerName: 'Justin Gonzales',
          baseAvgPrice: 86,
          baseSalesCount: 3,
          variations: [],
        },
      ],
    }

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'justin-red-sox-base-auto',
          player_name: 'Justin Gonzales',
          title: '2026 Bowman Chrome JUSTIN GONZALES 1st Auto Red Sox #CPA-JG Top Prospect',
          current_price: 86,
          shipping_cost: 0,
          variation: '',
          serial_denominator: null,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      redSoxModel,
    )

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0]?.matchedVariation).toBe('Base Auto')
    expect(opportunities[0]?.valuationSource).toBe('base-auto')
    expect(opportunities[0]?.fairValue).toBe(86)
  })

  it('accepts checklist-sourced Fanatics auto rows that omit literal 1st Bowman wording', () => {
    const fanaticsListing = listing({
      item_id: 'fanatics-base-auto',
      title: '2026 Bowman Chrome Eli Willits PROSPECT AUTO #CPA-EW',
      current_price: 75,
      shipping_cost: 0,
      variation: 'Base Auto',
      serial_denominator: null,
      marketplace: 'fanatics-collect',
      marketplace_label: 'Fanatics Collect',
      checklist_match: true,
      checklist_first_bowman: true,
      comps: [],
    })

    expect(normalizeListing(fanaticsListing).isTargetAuto).toBe(true)

    const opportunities = rankOpportunities([fanaticsListing], DEFAULT_SETTINGS, model)

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0]?.listing.marketplaceLabel).toBe('Fanatics Collect')
    expect(opportunities[0]?.matchedVariation).toBe('Base Auto')
  })

  it('still rejects non-checklist auto rows when 1st Bowman evidence is missing', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Eli Willits PROSPECT AUTO #CPA-EW',
        variation: 'Base Auto',
        serial_denominator: null,
        checklist_match: false,
        checklist_first_bowman: false,
      }),
    )

    expect(normalized.isTargetAuto).toBe(false)
  })

  it('routes IP and hand-signed base cards into a separate lower-value lane', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Eli Willits 1st Bowman Signed Rare Auto #BCP-95',
        current_price: 40,
        variation: '',
        serial_denominator: null,
        comps: [],
      }),
    )

    expect(normalized.isHandSigned).toBe(true)
    expect(normalized.variationLabel).toBe('Hand Signed Auto')

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'signed-rare',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Signed Rare Auto #BCP-95',
          current_price: 40,
          variation: '',
          serial_denominator: null,
          comps: [],
        }),
        listing({
          item_id: 'ip-auto',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Base #BCP-95 IP AUTO',
          current_price: 35,
          variation: '',
          serial_denominator: null,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      model,
    )

    expect(opportunities.map((opportunity) => opportunity.valuationSource)).toEqual([
      'hand-signed-base',
      'hand-signed-base',
    ])
    expect(opportunities.every((opportunity) => opportunity.matchedVariation === 'Hand Signed Auto')).toBe(true)
    expect(opportunities.every((opportunity) => Math.abs(opportunity.fairValue - 55) < 0.01)).toBe(true)
    expect(opportunities.every((opportunity) => opportunity.warnings.includes('not pack-issued certified auto'))).toBe(true)
  })

  it('does not let hand-signed listings borrow the normal base-auto sold lane', () => {
    const soldCacheModel: SalesCachePlayerModel = {
      available: true,
      playerName: 'Eli Willits',
      baseAutoPrice: 100,
      buckets: [
        {
          bucketKey: 'eli:base-auto:raw',
          playerName: 'Eli Willits',
          releaseYear: 2026,
          productFamily: 'Bowman Chrome',
          cardClass: 'auto',
          variationLabel: 'Base Auto',
          gradeBucket: 'Raw',
          serialDenominator: null,
          saleCount: 12,
          sales30: 10,
          sales90: 12,
          auctionCount: 6,
          binCount: 6,
          minPrice: 90,
          q1Price: 95,
          medianPrice: 100,
          avgPrice: 102,
          q3Price: 110,
          maxPrice: 130,
          modelPrice: 105,
          baseAutoMultiple: 1,
          latestSoldAt: '2026-06-23T00:00:00.000Z',
          generatedAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      sales: [],
    }

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'ip-auto',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Base #BCP-95 IP AUTO',
          current_price: 35,
          variation: '',
          serial_denominator: null,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      model,
      soldCacheModel,
    )

    expect(opportunities[0].valuationSource).toBe('hand-signed-base')
    expect(opportunities[0].fairValue).toBeCloseTo(55)
    expect(opportunities[0].compSaleCount).toBeNull()
  })

  it('anchors thin snack-pack BIN valuations to base times release multiple instead of a one-sale player comp', () => {
    const snackPackModel: ChecklistModel = {
      ...model,
      multipliers: [
        {
          variation: 'Sunflower Seeds /5',
          avgMultiplier: 30.2,
          avgPrice: 334,
          playerCount: 20,
          totalSales: 36,
        },
      ],
      players: [
        {
          playerName: 'Dillon Lewis',
          baseAvgPrice: 11.06,
          baseSalesCount: 4,
          variations: [
            {
              variation: 'Sunflower Snack Pack /5',
              avgPrice: 650,
              multiplier: 58.8,
              salesCount: 1,
            },
          ],
        },
      ],
    }

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'dillon-sunflower',
          player_name: 'Dillon Lewis',
          title: '2026 Bowman Chrome Dillon Lewis 1st Snack Pack Sunflower Seeds Auto /5 SSP',
          current_price: 500,
          shipping_cost: 0,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      snackPackModel,
    )

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0]?.valuationSource).toBe('player-base-curve')
    expect(opportunities[0]?.matchedVariation).toBe('Sunflower Seeds /5')
    expect(opportunities[0]?.modelPrice).toBeCloseTo(334.01, 1)
    expect(opportunities[0]?.variationPrice).toBe(650)
  })

  it('does not treat a graded card below 9 as eligible for the raw-floor slab model', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Eli Willits 1st Auto PSA 8 Blue /150',
      }),
    )

    expect(normalized.isGraded).toBe(true)
    expect(normalized.gradeNumber).toBe(8)
    expect(normalized.isEligibleGraded).toBe(false)
  })

  it('does not treat Bowman First Edition as a 1st Bowman auto by itself', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman First Edition Eli Willits Autograph',
        variation: 'Base',
        serial_denominator: null,
      }),
    )

    expect(normalized.isFirstBowman).toBe(false)
    expect(normalized.isTargetAuto).toBe(false)
  })

  it('detects low-serial 1st Bowman non-autos as a separate gated universe', () => {
    const normalized = normalizeListing(
      listing({
        title: '2026 Bowman Chrome Eli Willits 1st Bowman Green Refractor /99',
        variation: '',
        serial_denominator: null,
      }),
    )

    expect(normalized.isAutograph).toBe(false)
    expect(normalized.isTargetAuto).toBe(false)
    expect(normalized.isLowSerialNonAuto).toBe(true)
    expect(normalized.serialDenominator).toBe(99)
  })

  it('marks expired BIN listings as ended', () => {
    const normalized = normalizeListing(
      listing({
        end_time: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    )

    expect(normalized.kind).toBe('bin')
    expect(normalized.status).toBe('ended')
  })

  it('prefers explicit release metadata when labeling listings', () => {
    const normalized = normalizeListing(
      listing({
        release: '2025-Bowman-Chrome',
        release_year: 2025,
        product_type: 'Bowman Chrome',
      }),
    )

    expect(normalized.releaseLabel).toBe('2025 Bowman Chrome')
  })
})

describe('rankOpportunities', () => {
  it('sorts by modeled dollar spread and keeps the model source visible', () => {
    const opportunities = rankOpportunities(
      [
        listing({ item_id: 'wide-edge', current_price: 90 }),
        listing({ item_id: 'narrow-edge', current_price: 230 }),
      ],
      DEFAULT_SETTINGS,
      model,
    )

    expect(opportunities).toHaveLength(2)
    expect(opportunities[0]?.listing.id).toBe('wide-edge')
    expect(opportunities[0]?.valuationSource).toBe('base-twma-blend')
    expect(opportunities[0]?.edgeDollars).toBeGreaterThan(opportunities[1]?.edgeDollars ?? 0)
  })

  it('uses the hardened base estimate when valuing active BIN listings', () => {
    const hardenedModel: ChecklistModel = {
      ...model,
      multipliers: [
        {
          variation: 'Blue /150',
          avgMultiplier: 3,
          playerCount: 40,
          totalSales: 160,
        },
      ],
      players: [
        {
          playerName: 'Eli Willits',
          baseAvgPrice: 50,
          baseSalesCount: 6,
          baseSales: [
            { salePrice: 100, saleDate: new Date(Date.now() - 2 * 86_400_000).toISOString(), saleType: 'Auction' },
            { salePrice: 104, saleDate: new Date(Date.now() - 5 * 86_400_000).toISOString(), saleType: 'Auction' },
            { salePrice: 98, saleDate: new Date(Date.now() - 8 * 86_400_000).toISOString(), saleType: 'Fixed Price' },
            { salePrice: 102, saleDate: new Date(Date.now() - 12 * 86_400_000).toISOString(), saleType: 'Buy It Now' },
          ],
          variations: [],
        },
      ],
    }

    const opportunities = rankOpportunities([listing({ current_price: 225, comps: [] })], DEFAULT_SETTINGS, hardenedModel)

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0]?.valuationSource).toBe('player-base-curve')
    expect(opportunities[0]?.baseTwmaPrice).toBeGreaterThan(275)
  })

  it('excludes Sapphire listings from regular Bowman model matching', () => {
    const superfractorModel: ChecklistModel = {
      ...model,
      multipliers: [
        {
          variation: 'Superfractor /1',
          avgMultiplier: 40,
          avgPrice: 4000,
          playerCount: 12,
          totalSales: 20,
        },
      ],
      players: [
        {
          playerName: 'Seth Hernandez',
          baseAvgPrice: 100,
          baseSalesCount: 10,
          variations: [
            {
              variation: 'Superfractor /1',
              avgPrice: 5000,
              multiplier: 50,
              salesCount: 1,
            },
          ],
        },
      ],
    }

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'sapphire-one-of-one',
          player_name: 'Seth Hernandez',
          title: '2026 Bowman Sapphire Seth Hernandez 1st Bowman Auto 1/1',
          variation: 'Sapphire',
          serial_denominator: 1,
          current_price: 500,
          comps: [{ sale_price: 550 }],
        }),
      ],
      DEFAULT_SETTINGS,
      superfractorModel,
    )

    expect(opportunities).toEqual([])
  })

  it('does not value PackFractor text as Red X-Fractor from substring noise', () => {
    const packfractorModel: ChecklistModel = {
      ...model,
      multipliers: [
        {
          variation: 'Red X-Fractor /5',
          avgMultiplier: 58.3,
          avgPrice: 5830,
          playerCount: 10,
          totalSales: 20,
        },
        {
          variation: 'Packfractor /89',
          avgMultiplier: 9.3,
          avgPrice: 930,
          playerCount: 40,
          totalSales: 90,
        },
      ],
      players: [
        {
          playerName: 'Seong-Jun Kim',
          baseAvgPrice: 100,
          baseSalesCount: 9,
          variations: [],
        },
      ],
    }

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'packfractor-redemption-no-serial',
          player_name: 'Seong-Jun Kim',
          title: '2026 Bowman Seong-Jun Kim 1st Chrome PackFractor Auto Redemption Texas Rangers',
          variation: 'packfractor',
          serial_denominator: null,
          current_price: 505,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      packfractorModel,
    )

    expect(opportunities).toEqual([])
  })

  it('matches a confirmed PackFractor serial to the PackFractor model', () => {
    const packfractorModel: ChecklistModel = {
      ...model,
      multipliers: [
        {
          variation: 'Red X-Fractor /5',
          avgMultiplier: 58.3,
          avgPrice: 5830,
          playerCount: 10,
          totalSales: 20,
        },
        {
          variation: 'Packfractor /89',
          avgMultiplier: 9.3,
          avgPrice: 930,
          playerCount: 40,
          totalSales: 90,
        },
      ],
      players: [
        {
          playerName: 'Aiva Arquette',
          baseAvgPrice: 100,
          baseSalesCount: 9,
          variations: [],
        },
      ],
    }

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'packfractor-confirmed',
          player_name: 'Aiva Arquette',
          title: '2026 Bowman Aiva Arquette Chrome Auto Refractor PackFractor Variation 1st #/89',
          variation: 'packfractor',
          serial_denominator: 89,
          current_price: 749,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      packfractorModel,
    )

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0]?.matchedVariation).toBe('Packfractor /89')
    expect(opportunities[0]?.fairValue).toBeCloseTo(930)
  })

  it('prefers specific parallel variants over broader serial color matches', () => {
    const specificParallelModel: ChecklistModel = {
      ...model,
      multipliers: [
        {
          variation: 'Orange /25',
          avgMultiplier: 20,
          avgPrice: 2000,
          playerCount: 20,
          totalSales: 80,
        },
        {
          variation: 'Orange Shimmer /25',
          avgMultiplier: 12,
          avgPrice: 1200,
          playerCount: 20,
          totalSales: 80,
        },
        {
          variation: 'Gold /50',
          avgMultiplier: 9,
          avgPrice: 900,
          playerCount: 35,
          totalSales: 100,
        },
        {
          variation: 'Gold Mojo /50',
          avgMultiplier: 6,
          avgPrice: 600,
          playerCount: 35,
          totalSales: 100,
        },
      ],
      players: [
        {
          playerName: 'Edward Florentino',
          baseAvgPrice: 100,
          baseSalesCount: 10,
          variations: [],
        },
        {
          playerName: 'Roldy Brito',
          baseAvgPrice: 100,
          baseSalesCount: 10,
          variations: [],
        },
      ],
    }

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'orange-shimmer',
          player_name: 'Edward Florentino',
          title: '2026 Bowman Edward Florentino Orange Shimmer chrome 1st Auto Pirates 24/25 SSP',
          variation: 'Base',
          serial_denominator: 25,
          current_price: 100,
          comps: [],
        }),
        listing({
          item_id: 'gold-mojo',
          player_name: 'Roldy Brito',
          title: '2026 Bowman Chrome #BMA-RB Roldy Brito Auto Gold Mojo /50 + 1st Mojo Refractor',
          variation: 'Base',
          serial_denominator: 50,
          current_price: 100,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      specificParallelModel,
    )

    expect(opportunities.find((opportunity) => opportunity.listing.id === 'orange-shimmer')?.matchedVariation).toBe(
      'Orange Shimmer /25',
    )
    expect(opportunities.find((opportunity) => opportunity.listing.id === 'gold-mojo')?.matchedVariation).toBe('Gold Mojo /50')
  })

  it('does not value a distinct modifier title against a broad color-only model', () => {
    const broadOnlyModel: ChecklistModel = {
      ...model,
      multipliers: [
        {
          variation: 'Gold /50',
          avgMultiplier: 9,
          avgPrice: 900,
          playerCount: 35,
          totalSales: 100,
        },
      ],
      players: [
        {
          playerName: 'Roldy Brito',
          baseAvgPrice: 100,
          baseSalesCount: 10,
          variations: [],
        },
      ],
    }

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'gold-mojo-broad-only',
          player_name: 'Roldy Brito',
          title: '2026 Bowman Chrome #BMA-RB Roldy Brito Auto Gold Mojo /50 + 1st Mojo Refractor',
          variation: 'Base',
          serial_denominator: 50,
          current_price: 100,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      broadOnlyModel,
    )

    expect(opportunities).toEqual([])
  })

  it('does not value x-fractor wording against a broad color-only model', () => {
    const broadOnlyModel: ChecklistModel = {
      ...model,
      multipliers: [
        {
          variation: 'Orange /25',
          avgMultiplier: 20,
          avgPrice: 2000,
          playerCount: 20,
          totalSales: 80,
        },
      ],
      players: [
        {
          playerName: 'Justin Gonzales',
          baseAvgPrice: 100,
          baseSalesCount: 10,
          variations: [],
        },
      ],
    }

    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'orange-x-broad-only',
          player_name: 'Justin Gonzales',
          title: 'Justin Gonzales 2026 Bowman 1st Chrome Orange X Refractor Auto /25 #CPA-JG',
          variation: 'Base',
          serial_denominator: 25,
          current_price: 100,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      broadOnlyModel,
    )

    expect(opportunities).toEqual([])
  })

  it('enforces the min comp count control', () => {
    const opportunities = rankOpportunities(
      [
        listing({ item_id: 'has-comp', comps: [{ sale_price: 220 }] }),
        listing({ item_id: 'no-comp', comps: [] }),
      ],
      { ...DEFAULT_SETTINGS, minCompCount: 1 },
      model,
    )

    expect(opportunities.map((opportunity) => opportunity.listing.id)).toEqual(['has-comp'])
  })

  it('excludes ended or sold listings by default', () => {
    const opportunities = rankOpportunities(
      [
        listing({ item_id: 'active-card' }),
        listing({
          item_id: 'expired-card',
          end_time: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        listing({ item_id: 'sold-card', listing_status: 'sold' }),
      ],
      DEFAULT_SETTINGS,
      model,
    )

    expect(opportunities.map((opportunity) => opportunity.listing.id)).toEqual(['active-card'])
  })

  it('excludes graded listings from raw BIN rankings', () => {
    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'graded-card',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 PSA10',
          current_price: 100,
        }),
      ],
      DEFAULT_SETTINGS,
      model,
    )

    expect(opportunities).toEqual([])
  })

  it('only ranks low-serial non-autos when an exact sold-cache lane supports the model', () => {
    const soldCacheModel: SalesCachePlayerModel = {
      available: true,
      playerName: 'Eli Willits',
      baseAutoPrice: 100,
      buckets: [
        {
          bucketKey: 'eli:green-99-non-auto:raw',
          playerName: 'Eli Willits',
          releaseYear: 2026,
          productFamily: 'Bowman Chrome',
          cardClass: 'chrome',
          variationLabel: 'Green /99',
          gradeBucket: 'Raw',
          serialDenominator: 99,
          saleCount: 5,
          sales30: 5,
          sales90: 5,
          auctionCount: 2,
          binCount: 3,
          minPrice: 38,
          q1Price: 42,
          medianPrice: 45,
          avgPrice: 46,
          q3Price: 50,
          maxPrice: 58,
          modelPrice: 48,
          baseAutoMultiple: null,
          latestSoldAt: '2026-06-23T00:00:00.000Z',
          generatedAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      sales: Array.from({ length: 5 }, (_, index) => ({
        itemId: `green-99-sale-${index}`,
        playerName: 'Eli Willits',
        title: '2026 Bowman Chrome Eli Willits 1st Bowman Green Refractor /99',
        salePriceText: '$48',
        salePrice: 48 + index,
        soldAt: new Date(Date.now() - index * 86_400_000).toISOString(),
        saleType: 'Buy It Now',
        channel: 'Card Hedge',
        seller: 'seller',
        sourcePage: null,
        sourceOffset: index,
        releaseYear: 2026,
        productFamily: 'Bowman Chrome',
        cardClass: 'chrome',
        variationLabel: 'Green /99',
        serialDenominator: 99,
        gradeCompany: null,
        gradeValue: null,
        gradeBucket: 'Raw',
        insertName: null,
        bucketKey: 'eli:green-99-non-auto:raw',
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
      })),
    }

    const supported = rankOpportunities(
      [
        listing({
          item_id: 'green-99-live',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Green Refractor /99',
          current_price: 35,
          variation: '',
          serial_denominator: null,
          comps: [],
        }),
      ],
      { ...DEFAULT_SETTINGS, targetUniverse: 'low-serial-non-auto' },
      model,
      soldCacheModel,
    )

    expect(supported).toHaveLength(1)
    expect(supported[0]?.valuationSource).toBe('sales-cache-exact')
    expect(supported[0]?.matchedVariation).toBe('Green /99')

    const unsupported = rankOpportunities(
      [
        listing({
          item_id: 'orange-25-live',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Orange Refractor /25',
          current_price: 35,
          variation: '',
          serial_denominator: null,
          comps: [],
        }),
      ],
      { ...DEFAULT_SETTINGS, targetUniverse: 'low-serial-non-auto' },
      model,
      soldCacheModel,
    )

    expect(unsupported).toEqual([])
  })

  it('includes PSA/BGS/SGC/CGC 9+ slabs in raw-plus-graded rankings with raw floor plus graded model', () => {
    const rawOpportunity = rankOpportunities([listing({ item_id: 'raw-card' })], DEFAULT_SETTINGS, model)[0]
    const opportunities = rankOpportunities(
      [
        listing({ item_id: 'psa-10', title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 PSA10' }),
        listing({ item_id: 'bgs-9', title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 BGS 9' }),
        listing({ item_id: 'sgc-9', title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 SGC 9' }),
        listing({ item_id: 'cgc-10', title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 CGC 10' }),
      ],
      { ...DEFAULT_SETTINGS, mode: 'raw-plus-graded' },
      model,
    )

    expect(opportunities.map((opportunity) => opportunity.listing.id).sort()).toEqual(['bgs-9', 'cgc-10', 'psa-10', 'sgc-9'])
    expect(opportunities.every((opportunity) => opportunity.rawFairValue === rawOpportunity?.fairValue)).toBe(true)
    expect(opportunities.every((opportunity) => opportunity.fairValue >= opportunity.rawFairValue)).toBe(true)
    expect(opportunities.find((opportunity) => opportunity.listing.id === 'psa-10')?.fairValue).toBeGreaterThan(rawOpportunity?.fairValue ?? 0)
    expect(opportunities.every((opportunity) => (opportunity.gradingMultiplier ?? 0) >= 0.9)).toBe(true)
    expect(opportunities.every((opportunity) => opportunity.reasons.some((reason) => /graded model|premium curve|slab premium/i.test(reason)))).toBe(true)
    expect(opportunities.every((opportunity) => opportunity.trustScore > 0)).toBe(true)
  })

  it('excludes low-grade or unclear slabs from raw-plus-graded rankings', () => {
    const opportunities = rankOpportunities(
      [
        listing({ item_id: 'psa-8', title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 PSA 8' }),
        listing({ item_id: 'unknown-slab', title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150 graded slabbed' }),
      ],
      { ...DEFAULT_SETTINGS, mode: 'raw-plus-graded' },
      model,
    )

    expect(opportunities).toEqual([])
  })

  it('excludes plausible Bowman autos when the player is not on a loaded checklist', () => {
    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'unsupported-player',
          player_name: 'Random Prospect',
          title: '2026 Bowman Chrome Random Prospect 1st Bowman Auto Blue /150',
        }),
      ],
      DEFAULT_SETTINGS,
      model,
    )

    expect(opportunities).toEqual([])
  })

  it('excludes case-hit insert autos from the chrome auto model even when cached or imported', () => {
    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'ascensions-case-hit',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman RED AUTO /5 Ascensions SSP',
          current_price: 500,
        }),
        listing({
          item_id: 'draft-night-case-hit',
          title: '2025 Bowman Draft 1st Chrome Prospect Draft Night Auto Gold Eli Willits /50',
          release_year: 2025,
          product_type: 'Bowman Draft Chrome',
          current_price: 500,
        }),
      ],
      DEFAULT_SETTINGS,
      [model, draftModel],
    )

    expect(opportunities).toEqual([])
  })

  it('can include inactive listings only when activeOnly is disabled', () => {
    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'expired-card',
          end_time: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      { ...DEFAULT_SETTINGS, activeOnly: false },
      model,
    )

    expect(opportunities.map((opportunity) => opportunity.listing.id)).toEqual(['expired-card'])
  })

  it('includes all fetched release families by default', () => {
    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'draft-card',
          title: '2025 Bowman Draft Chrome Eli Willits 1st Bowman Auto Blue /150',
          release_year: 2025,
          product_type: 'Bowman Draft Chrome',
        }),
        listing({
          item_id: 'regular-card',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150',
          release_year: 2026,
          product_type: 'Bowman Chrome',
        }),
      ],
      DEFAULT_SETTINGS,
      [model, draftModel],
    )

    expect(opportunities.map((opportunity) => opportunity.listing.id).sort()).toEqual(['draft-card', 'regular-card'])
  })

  it('can keep Bowman Draft separate from regular Bowman in selected-release scope', () => {
    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'draft-card',
          title: '2025 Bowman Draft Chrome Eli Willits 1st Bowman Auto Blue /150',
          release_year: 2025,
          product_type: 'Bowman Draft Chrome',
        }),
        listing({
          item_id: 'regular-card',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Blue /150',
          release_year: 2026,
          product_type: 'Bowman Chrome',
        }),
      ],
      { ...DEFAULT_SETTINGS, targetReleaseYear: 2025, targetCategory: 'draft', releaseScope: 'selected' },
      [model, draftModel],
    )

    expect(opportunities.map((opportunity) => opportunity.listing.id)).toEqual(['draft-card'])
  })

  it('uses a matching local sold lane as the active listing model rail', () => {
    const soldCacheModel: SalesCachePlayerModel = {
      available: true,
      playerName: 'Eli Willits',
      baseAutoPrice: 100,
      buckets: [
        {
          bucketKey: 'eli:refractor-499:raw',
          playerName: 'Eli Willits',
          releaseYear: 2026,
          productFamily: 'Bowman Chrome',
          cardClass: 'auto',
          variationLabel: 'Refractor /499',
          gradeBucket: 'Raw',
          serialDenominator: 499,
          saleCount: 6,
          sales30: 4,
          sales90: 6,
          auctionCount: 3,
          binCount: 3,
          minPrice: 135,
          q1Price: 160,
          medianPrice: 180,
          avgPrice: 184,
          q3Price: 205,
          maxPrice: 225,
          modelPrice: 180,
          baseAutoMultiple: 1.8,
          latestSoldAt: '2026-06-23T00:00:00.000Z',
          generatedAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      sales: [],
    }
    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'refractor-redemption',
          title: '2026 Bowman Chrome Eli Willits 1st Bowman Auto Refractor Redemption',
          current_price: 90,
          variation: '',
          serial_denominator: null,
          comps: [],
        }),
      ],
      DEFAULT_SETTINGS,
      model,
      soldCacheModel,
    )

    expect(opportunities[0].valuationSource).toBe('sales-cache-exact')
    expect(opportunities[0].fairValue).toBe(180)
    expect(opportunities[0].matchedVariation).toBe('Refractor /499')
    expect(opportunities[0].compSaleCount).toBe(6)
  })

  it('does not let a sold lane from another release override a selected-release listing', () => {
    const soldCacheModel: SalesCachePlayerModel = {
      available: true,
      playerName: 'Eli Willits',
      baseAutoPrice: 100,
      buckets: [
        {
          bucketKey: 'eli:2026:blue-150:raw',
          playerName: 'Eli Willits',
          releaseYear: 2026,
          productFamily: 'Bowman Chrome',
          cardClass: 'auto',
          variationLabel: 'Blue /150',
          gradeBucket: 'Raw',
          serialDenominator: 150,
          saleCount: 9,
          sales30: 6,
          sales90: 9,
          auctionCount: 4,
          binCount: 5,
          minPrice: 900,
          q1Price: 950,
          medianPrice: 999,
          avgPrice: 999,
          q3Price: 1050,
          maxPrice: 1100,
          modelPrice: 999,
          baseAutoMultiple: 9.99,
          latestSoldAt: '2026-06-23T00:00:00.000Z',
          generatedAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      sales: [],
    }
    const opportunities = rankOpportunities(
      [
        listing({
          item_id: 'draft-blue',
          title: '2025 Bowman Draft Chrome Eli Willits 1st Bowman Auto Blue /150',
          release_year: 2025,
          product_type: 'Bowman Draft Chrome',
          current_price: 150,
          variation: 'Blue',
          serial_denominator: 150,
          comps: [],
        }),
      ],
      { ...DEFAULT_SETTINGS, targetReleaseYear: 2025, targetCategory: 'draft', releaseScope: 'selected' },
      [model, draftModel],
      soldCacheModel,
    )

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0].valuationSource).not.toMatch(/^sales-cache/)
    expect(opportunities[0].fairValue).toBeLessThan(500)
  })
})
