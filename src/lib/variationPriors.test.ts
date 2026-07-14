import { describe, expect, it } from 'vitest'
import { stabilizeReleaseMultiplier, structuralVariationPrior } from './variationPriors'

describe('variation priors', () => {
  it('maps 2026 Bowman aliases to the official structural curve', () => {
    expect(structuralVariationPrior('Blue Refractor /150 Auto', 2026, 'bowman')?.multiplier).toBe(1.95)
    expect(structuralVariationPrior('Sunflower Seeds /5', 2026, 'bowman')?.multiplier).toBe(20)
  })

  it('keeps sparse legacy summaries near the structural prior', () => {
    expect(
      stabilizeReleaseMultiplier({
        variation: 'Gold /50 Auto',
        empiricalMultiplier: 7,
        releaseYear: 2026,
        category: 'bowman',
      }),
    ).toBe(4)
  })

  it('lets broad legacy evidence refine rather than replace the curve', () => {
    const multiplier = stabilizeReleaseMultiplier({
      variation: 'Packfractor /89',
      empiricalMultiplier: 9.3,
      releaseYear: 2026,
      category: 'bowman',
      playerCount: 40,
      totalSales: 90,
    })

    expect(multiplier).toBeGreaterThan(4.5)
    expect(multiplier).toBeLessThan(9.3)
  })

  it('does not re-shrink a proximity-calibrated multiplier', () => {
    expect(
      stabilizeReleaseMultiplier({
        variation: 'Blue /150 Auto',
        empiricalMultiplier: 2.37,
        releaseYear: 2026,
        category: 'bowman',
        modelMethod: 'hierarchical-proximity-v2',
      }),
    ).toBe(2.37)
  })
})
