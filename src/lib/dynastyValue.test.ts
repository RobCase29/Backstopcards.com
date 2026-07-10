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

  it('treats prospect-only coverage as a usable ranking signal', () => {
    const prospectOnly = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: null,
      stsDynastyScore: null,
      stsProspectRank: 22,
      baseTwmaPrice: 38,
    })

    expect(prospectOnly).toBeGreaterThan(50)
  })

  it('treats MLB dynasty rank as a usable fallback when prospect rank is gone', () => {
    const mlbFallback = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: 18,
      stsProspectRank: null,
      stsDynastyScore: 86,
      stsLevel: 'MLB',
      stsAge: 24,
      baseTwmaPrice: 85,
    })
    const unranked = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: null,
      stsProspectRank: null,
      stsDynastyScore: null,
      stsLevel: 'MLB',
      stsAge: 24,
      baseTwmaPrice: 85,
    })

    expect(mlbFallback).toBeGreaterThan(50)
    expect(unranked).toBe(-1)
  })

  it('boosts similarly priced players when the formulated rank is materially stronger', () => {
    const strongRank = scoreDynastyValueOpportunity({ ...baseRow, stsRank: 30, stsProspectRank: 12, stsDynastyScore: 82, baseTwmaPrice: 75 })
    const weakerRank = scoreDynastyValueOpportunity({ ...baseRow, stsRank: 600, stsProspectRank: 230, stsDynastyScore: 45, baseTwmaPrice: 75 })

    expect(strongRank).toBeGreaterThan(weakerRank + 18)
  })

  it('makes elite cheap base autos beat similarly elite expensive base autos', () => {
    const cheapElite = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: 2,
      stsProspectRank: 2,
      stsDynastyScore: 90,
      baseTwmaPrice: 23,
      baseEffectiveSales: 3,
      baseConfidence: 0.58,
      baseVolatility: 0.28,
    })
    const expensiveElite = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: 1,
      stsProspectRank: 1,
      stsDynastyScore: 93,
      baseTwmaPrice: 199,
      baseEffectiveSales: 9,
      baseConfidence: 0.86,
      baseVolatility: 0.16,
    })

    expect(cheapElite).toBeGreaterThan(expensiveElite + 6)
  })

  it('surfaces a top-two prospect with a very cheap base auto above expensive top-five peers', () => {
    const topTwoCheap = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: 2,
      stsProspectRank: 2,
      stsDynastyScore: 91,
      baseTwmaPrice: 23,
      baseEffectiveSales: 4,
      baseConfidence: 0.62,
      baseVolatility: 0.3,
    })
    const topOneExpensive = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: 1,
      stsProspectRank: 1,
      stsDynastyScore: 93,
      baseTwmaPrice: 199,
      baseEffectiveSales: 9,
      baseConfidence: 0.86,
      baseVolatility: 0.16,
    })
    const topFiveExpensive = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: 5,
      stsProspectRank: 5,
      stsDynastyScore: 86,
      baseTwmaPrice: 190,
      baseEffectiveSales: 8,
      baseConfidence: 0.8,
      baseVolatility: 0.18,
    })

    expect(topTwoCheap).toBeGreaterThan(topOneExpensive + 5)
    expect(topTwoCheap).toBeGreaterThan(topFiveExpensive + 8)
  })

  it('balances percentage value with meaningful absolute dollar upside', () => {
    const cheapTopTwenty = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: 23,
      stsProspectRank: 19,
      stsDynastyScore: 79,
      baseTwmaPrice: 19,
      baseEffectiveSales: 100,
      baseConfidence: 0.98,
      baseVolatility: 0.15,
    })
    const topOverall = scoreDynastyValueOpportunity({
      ...baseRow,
      stsRank: 1,
      stsProspectRank: 1,
      stsDynastyScore: 93,
      baseTwmaPrice: 190,
      baseEffectiveSales: 100,
      baseConfidence: 0.98,
      baseVolatility: 0.15,
    })

    expect(impliedDynastyBasePrice({ ...baseRow, stsRank: 1, stsProspectRank: 1, stsDynastyScore: 93 })).toBeGreaterThan(900)
    expect(topOverall).toBeGreaterThan(cheapTopTwenty)
  })

  it('excludes players without ranking signal from value queues', () => {
    expect(scoreDynastyValueOpportunity({ ...baseRow, stsRank: null, stsProspectRank: null, stsDynastyScore: null })).toBe(-1)
  })
})
