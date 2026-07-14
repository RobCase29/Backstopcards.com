import { describe, expect, it } from 'vitest'
import type { ChecklistModel } from '../types'
import { buildPricingMatrix, estimateBasePrice, releaseVariationCurve, variationKey } from './matrix'
import { BOWMAN_2026_CHROME_AUTO_VARIATIONS } from '../../shared/bowman2026Taxonomy.js'
import { STS_FALLBACK_CSV_INPUTS } from './stsFallback'
import { hydrateStsLeaderboard } from './stsRankings'

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
    {
      variation: 'Blue /150 Auto',
      avgMultiplier: 4,
      sortOrder: 2,
      modelMethod: 'hierarchical-proximity-v3',
      modelEvidence: 'modeled',
      modelActionable: true,
    },
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
  modelVersion: 'backstop-fv-v3',
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
      ['Blue /150 Auto', 195],
      ['Gold /50 Auto', 400],
    ])
  })

  it('preserves global Oracle ranks while assigning a distinct Bowman-local prospect order', () => {
    const headers = [
      'Source', '#', 'Checklist Key', 'Checklist Name', 'Checklist Team', 'Match Method',
      'Oracle Player Id', 'MLBAM Id', 'Oracle Name', 'Oracle Route', 'Ranking Role',
      'Rank Label', 'Rank Availability', 'Rank Universe', 'Rank Target', 'Rank As Of',
      'Rank Model Version', 'Evidence Tier', 'Volatility', 'Reason Codes', 'Career Outlook',
      'Career Outlook Band', 'Career Outlook Basis', 'Career Outlook As Of',
      'Career Outlook Model Version', 'Age', 'Level', 'Team', 'Pos', 'Record Version',
      'Snapshot Id', 'Schema Version', 'Contract Version', 'Updated',
    ]
    const row = (name: string, team: string, rank: number, id: string, mlbam: string, outlook: number) => [
      'Baseball Oracle Player Signals', rank, name.toLowerCase(), name, team, 'checklist_name_and_team',
      id, mlbam, name, 'milb', 'hitter', 'Prospect Rank', 'available', 6_490,
      'mlb_war_next_5_ge_5', '2025-12-31T00:00:00.000Z', 'rank-model-v1',
      'completed_season_full_model', 'standard', '', outlook, 'MLB contributor',
      'conditional_on_mlb_arrival', '2025-12-31T00:00:00.000Z', 'career-model-v1',
      20, 'AA', team, 'SS', `record-${id}`, 'snapshot-matrix-test', 'player-signals.v1',
      'player-signals-contract/v1', '2026-07-14T14:14:34.796Z',
    ].join(',')
    const oracleCsv = [
      headers.join(','),
      row('Local Rank One', 'MIA', 12, 'oracle:local-one', '900001', 76),
      row('Local Rank Two', 'BOS', 300, 'oracle:local-two', '900002', 62),
    ].join('\n')

    try {
      hydrateStsLeaderboard([oracleCsv])
      const matrix = buildPricingMatrix([
        {
          ...bowmanModel,
          players: [
            { playerName: 'Local Rank One', team: 'MIA', baseAvgPrice: 40, baseSalesCount: 5, variations: [] },
            { playerName: 'Local Rank Two', team: 'BOS', baseAvgPrice: 80, baseSalesCount: 5, variations: [] },
          ],
        },
      ])
      const first = matrix.rows.find((candidate) => candidate.playerName === 'Local Rank One')
      const second = matrix.rows.find((candidate) => candidate.playerName === 'Local Rank Two')

      expect(first).toMatchObject({
        rankingSource: 'baseball-oracle',
        oraclePlayerId: 'oracle:local-one',
        oracleMlbamId: '900001',
        oracleServedProspectRank: 12,
        oracleRankUniverse: 6_490,
        bowmanProspectRank: 1,
        oracleSnapshotId: 'snapshot-matrix-test',
      })
      expect(second).toMatchObject({
        oracleServedProspectRank: 300,
        bowmanProspectRank: 2,
      })
      expect(matrix.stsProspectRows).toBe(2)
    } finally {
      hydrateStsLeaderboard(STS_FALLBACK_CSV_INPUTS)
    }
  })

  it('uses each release-specific multiple for the same variation label', () => {
    const matrix = buildPricingMatrix([bowmanModel, draftModel])
    const bowmanBlue = matrix.rows.find((row) => row.release === '2026-Bowman')?.ladder.find((quote) => quote.label === 'Blue /150 Auto')
    const draftBlue = matrix.rows.find((row) => row.release === '2025-Bowman-Draft')?.ladder.find(
      (quote) => variationKey(quote.label) === variationKey('Blue /150 Auto'),
    )

    expect(bowmanBlue).toMatchObject({ multiplier: 1.95, price: 195 })
    expect(draftBlue).toMatchObject({ multiplier: 4, price: 320 })
  })

  it('keeps multiplier valuation independent from observed player variation averages', () => {
    const matrix = buildPricingMatrix([bowmanModel])
    const blue = matrix.rows[0].ladder.find((quote) => quote.label === 'Blue /150 Auto')

    expect(blue).toMatchObject({
      price: 195,
      multiplier: 1.95,
    })
  })

  it('keeps the displayed multiplier mathematically aligned with a direct-comp-adjusted quote', () => {
    const matrix = buildPricingMatrix([
      {
        ...bowmanModel,
        players: [
          {
            ...bowmanModel.players[0],
            variations: [{ variation: 'Blue /150 Auto', avgPrice: 300, multiplier: 3, salesCount: 8 }],
          },
        ],
      },
    ])
    const row = matrix.rows[0]
    const blue = row.ladder.find((quote) => quote.label === 'Blue /150 Auto')

    expect(blue?.price).toBeCloseTo(row.baseTwmaPrice * (blue?.multiplier ?? 0), 2)
  })

  it('passes proximity-calibrated release multipliers through unchanged', () => {
    const { variations } = releaseVariationCurve({
      ...bowmanModel,
      multipliers: [
        {
          variation: 'Blue /150 Auto',
          avgMultiplier: 2.37,
          playerCount: 31,
          totalSales: 84,
          modelMethod: 'hierarchical-proximity-v2',
          modelConfidence: 0.81,
          proximitySales: 84,
        },
      ],
    })

    expect(variations.find((variation) => variationKey(variation.variation) === variationKey('Blue /150 Auto'))).toMatchObject({
      variation: 'Blue /150',
      avgMultiplier: 2.37,
      modelMethod: 'hierarchical-proximity-v2',
    })
  })

  it('exposes every official 2026 lane once, even before a clean direct comp exists', () => {
    const { variations } = releaseVariationCurve({
      ...bowmanModel,
      multipliers: [],
      modelVersion: 'backstop-fv-v3',
    })

    expect(variations).toHaveLength(BOWMAN_2026_CHROME_AUTO_VARIATIONS.length)
    expect(new Set(variations.map((variation) => variationKey(variation.variation))).size).toBe(variations.length)
    const superfractor = variations.find((variation) => variation.variation === 'Superfractor /1')
    expect(superfractor).toMatchObject({
      modelMethod: 'structural-prior-only',
    })
    expect(superfractor?.avgMultiplier).toBeCloseTo(80)
  })

  it('canonicalizes legacy aliases before aggregating the 2026 release curve', () => {
    const { variations } = releaseVariationCurve({
      ...bowmanModel,
      modelVersion: 'backstop-fv-v3',
      multipliers: [
        { variation: 'Sunflower Seeds /5', avgMultiplier: 18, totalSales: 2 },
        { variation: 'Sunflower Snack Pack /5', avgMultiplier: 22, totalSales: 3 },
      ],
    })
    const sunflower = variations.filter((variation) => variation.variation === 'Sunflower Snack Pack /5')

    expect(sunflower).toHaveLength(1)
    expect(sunflower[0]?.totalSales).toBe(5)
  })

  it('canonicalizes historical aliases and rejects impossible generic refractor lanes', () => {
    const { variations, unresolvedMultipliers } = releaseVariationCurve({
      ...draftModel,
      modelVersion: 'backstop-fv-v3',
      multipliers: [
        { variation: 'Purple Refractor /250', avgMultiplier: 2.1, totalSales: 4 },
        { variation: 'Purple /250', avgMultiplier: 1.9, totalSales: 3 },
        { variation: 'Refractor /250', avgMultiplier: 2, totalSales: 2 },
      ],
    })

    expect(variations.filter((variation) => variation.variation === 'Purple /250')).toHaveLength(1)
    expect(variations.some((variation) => variation.variation === 'Refractor /250')).toBe(false)
    expect(unresolvedMultipliers).toBe(1)
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

  it('resists a one-off spike while keeping the base anchor current', () => {
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
    expect(estimate.price).toBeGreaterThan(48)
    expect(estimate.price).toBeLessThan(56)
    expect(estimate.sales30).toBe(6)
    expect(estimate.methodLabel).toContain('validated recent market')
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
    expect(estimate.methodLabel).toContain('validated recent market')
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
    expect(estimate.methodLabel).toContain('mixed auction + BIN')
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

  it('keeps unversioned aggregate summaries provisional when detailed sale rows are omitted', () => {
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
      methodLabel: 'cached comp summary / unversioned',
    })
    expect(estimate.effectiveSales).toBe(0)
    expect(estimate.confidence).toBeLessThan(0.5)
  })

  it('uses explicit snapshot provenance without promoting legacy summaries to raw evidence', () => {
    const estimate = estimateBasePrice(
      {
        playerName: 'Legacy Prospect',
        baseAvgPrice: 88,
        baseSalesCount: 20,
        baseModelMethod: 'legacy-cached-summary',
        baseModelConfidence: 0.44,
        baseEffectiveSales: 0,
        baseModelLow: 60,
        baseModelHigh: 130,
        variations: [],
      },
      asOf,
    )

    expect(estimate).toMatchObject({
      price: 88,
      low: 60,
      high: 130,
      effectiveSales: 0,
      confidence: 0.44,
      methodLabel: 'legacy cached summary / awaiting title-verified sales',
    })
  })

  it('backs into base auto value from player variation sales when base auto is missing', () => {
    const matrix = buildPricingMatrix([
      {
        ...bowmanModel,
        modelVersion: 'backstop-fv-v3',
        multipliers: bowmanModel.multipliers.map((variation) => ({
          ...variation,
          modelEvidence: 'modeled' as const,
          modelActionable: true,
        })),
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
    expect(implied?.baseTwmaPrice).toBeGreaterThan(46)
    expect(implied?.baseTwmaPrice).toBeLessThan(51)
    expect(implied?.baseMethod).toContain('implied from 2 variation anchors')
    const blueQuote = implied?.ladder.find((quote) => variationKey(quote.label) === variationKey('Blue /150 Auto'))
    expect(blueQuote?.price).toBeCloseTo((implied?.baseTwmaPrice ?? 0) * (blueQuote?.multiplier ?? 0), 0)
    expect(matrix.impliedBaseRows).toBe(1)
    expect(matrix.missingBaseRows).toBe(0)
  })

  it('abstains from a base quote when only one thin rare-variation sale exists', () => {
    const matrix = buildPricingMatrix([
      {
        ...draftModel,
        modelVersion: 'backstop-fv-v3',
        multipliers: [
          {
            variation: 'Red /5',
            avgMultiplier: 24,
            modelEvidence: 'indicative',
            modelActionable: false,
          },
        ],
        players: [
          {
            playerName: 'One Sale Prospect',
            baseAvgPrice: 0,
            baseSalesCount: 0,
            variations: [{ variation: 'Red /5', avgPrice: 500, multiplier: 24, salesCount: 1 }],
          },
        ],
      },
    ])

    const row = matrix.rows.find((candidate) => candidate.playerName === 'One Sale Prospect')
    expect(row?.basePriceSource).toBe('unpriced')
    expect(row?.baseTwmaPrice).toBe(0)
    expect(matrix.impliedBaseRows).toBe(0)
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
