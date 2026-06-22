import { describe, expect, it } from 'vitest'
import { impliedDynastyBasePrice, scoreDynastyValueOpportunity, type DynastyValueInput } from './dynastyValue'

const baseRow: DynastyValueInput = {
  stsRank: 80,
  stsProspectRank: 35,
  stsDynastyScore: 72,
  stsMomentumScore: 64,
  stsRiserValueScore: 54,
  stsAge: 20,
  stsLevel: 'AA',
  baseTwmaPrice: 55,
  baseEffectiveSales: 5,
  baseVolatility: 0.18,
  baseConfidence: 0.72,
  basePriceSource: 'blended-sales',
}

describe('dynasty value scoring', () => {
  it('rewards strong dynasty signals that are still modestly priced', () => {
    const valueTarget = scoreDynastyValueOpportunity(baseRow)
    const expensivePeer = scoreDynastyValueOpportunity({
      ...baseRow,
      baseTwmaPrice: 450,
      stsMomentumScore: 50,
      stsRiserValueScore: 18,
    })

    expect(valueTarget).toBeGreaterThan(expensivePeer + 18)
    expect(impliedDynastyBasePrice(baseRow)).toBeGreaterThan(baseRow.baseTwmaPrice)
  })

  it('does not let tiny thin-market base prices dominate by being cheap alone', () => {
    const cheapNoise = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: 950,
      stsProspectRank: 430,
      stsDynastyScore: 38,
      stsMomentumScore: 52,
      stsRiserValueScore: 5,
      baseTwmaPrice: 4,
      baseEffectiveSales: 0.5,
      baseConfidence: 0.2,
      basePriceSource: 'twma-fallback',
    })

    expect(scoreDynastyValueOpportunity(baseRow)).toBeGreaterThan(cheapNoise + 20)
  })

  it('excludes players without ranking signal from value queues', () => {
    expect(scoreDynastyValueOpportunity({ ...baseRow, stsRank: null, stsDynastyScore: null })).toBe(-1)
  })
})
