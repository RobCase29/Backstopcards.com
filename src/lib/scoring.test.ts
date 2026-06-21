import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeListing, rankOpportunities } from './scoring'
import type { ChecklistModel, ProspectPulseListing } from '../types'

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

  it('marks expired BIN listings as ended', () => {
    const normalized = normalizeListing(
      listing({
        end_time: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    )

    expect(normalized.kind).toBe('bin')
    expect(normalized.status).toBe('ended')
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
})
