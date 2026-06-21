import { describe, expect, it } from 'vitest'
import type { ChecklistModel } from '../types'
import { buildMarketMoversSoldModel, importMarketMoversComps, parseMarketMoversRows } from './marketMovers'

const model: ChecklistModel = {
  category: 'bowman',
  release: '2026-Bowman',
  releaseYear: 2026,
  fetchedAt: '2026-06-21T00:00:00.000Z',
  source: 'authenticated-player-model',
  multipliers: [
    { variation: 'Base Auto', avgMultiplier: 1, sortOrder: 0 },
    { variation: 'Speckle /299', avgMultiplier: 1.4, sortOrder: 1 },
    { variation: 'Red /5', avgMultiplier: 34, sortOrder: 2 },
  ],
  players: [
    {
      playerName: 'Eli Willits',
      baseAvgPrice: 65,
      baseSalesCount: 8,
      variations: [],
    },
  ],
}

describe('Market Movers imports', () => {
  it('parses captured Market Movers JSON rows', () => {
    const rows = parseMarketMoversRows(
      JSON.stringify([
        {
          title: '2026 Bowman Eli Willits Chrome Auto Washington Nationals CPA-EW',
          itemId: '198439823177',
          salePriceText: '$59.99',
          soldDate: '6/20/2026',
          saleType: 'Fixed Price',
          seller: 'undergroundcasebreaks (9884)',
        },
      ]),
    )

    expect(rows).toEqual([
      {
        title: '2026 Bowman Eli Willits Chrome Auto Washington Nationals CPA-EW',
        itemId: '198439823177',
        salePrice: 59.99,
        soldDate: '2026-06-20T12:00:00.000Z',
        saleType: 'Fixed Price',
        seller: 'undergroundcasebreaks (9884)',
      },
    ])
  })

  it('maps Market Movers comps through checklist guardrails', () => {
    const input = JSON.stringify([
      {
        title: '2026 Bowman Eli Willits Chrome Auto Washington Nationals CPA-EW',
        itemId: '198439823177',
        salePriceText: '$59.99',
        soldDate: '6/20/2026',
        saleType: 'Fixed Price',
      },
      {
        title: '2026 Bowman Eli Willits Chrome Speckle Refractor Auto /299 Nationals',
        itemId: '206283202887',
        salePriceText: '$89.99',
        soldDate: '6/19/2026',
        saleType: 'Fixed Price',
      },
      {
        title: '2026 Topps Bowman Draft Chrome Eli Willits Auto',
        itemId: '366479862967',
        salePriceText: '$72.00',
        soldDate: '6/19/2026',
        saleType: 'Auction',
      },
    ])

    const imported = importMarketMoversComps(input, model)

    expect(imported.rows).toHaveLength(3)
    expect(imported.comps.map((comp) => comp.variationLabel)).toEqual(['Base Auto', 'Speckle /299'])
    expect(imported.rejectedRows).toBe(1)
  })

  it('builds a sold overlay from Market Movers rows', () => {
    const result = buildMarketMoversSoldModel(
      JSON.stringify([
        {
          title: '2026 Bowman Eli Willits Chrome Auto Washington Nationals CPA-EW',
          itemId: '198439823177',
          salePriceText: '$59.99',
          soldDate: '6/20/2026',
          saleType: 'Fixed Price',
        },
        {
          title: '2026 Bowman Eli Willits Chrome Speckle Refractor Auto /299 Nationals',
          itemId: '206283202887',
          salePriceText: '$89.99',
          soldDate: '6/19/2026',
          saleType: 'Fixed Price',
        },
      ]),
      model,
    )

    expect(result.model.source).toBe('market-movers-sold-model')
    expect(result.stats).toMatchObject({
      queriesRun: 1,
      mappedComps: 2,
      baseComps: 1,
      variationComps: 1,
      soldDerivedMultipliers: 1,
    })
  })
})
