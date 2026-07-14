import { describe, expect, it } from 'vitest'
import {
  buildProximityRatioPoints,
  dedupeSales,
  estimateHierarchicalMultiplier,
  estimateLaneFairValue,
  robustFairValueEstimate,
} from '../../shared/fairValueEngine.js'

const day = 86_400_000
const asOf = Date.UTC(2026, 6, 10)

function sale(price: number, ageDays: number, channel: 'auction' | 'bin' = 'auction', itemId?: string) {
  return { price, soldAt: asOf - ageDays * day, channel, itemId }
}

describe('fair value engine', () => {
  it('deduplicates repeated marketplace sales', () => {
    expect(dedupeSales([sale(100, 2, 'auction', 'abc'), sale(100, 2, 'auction', 'abc'), sale(105, 1, 'bin', 'def')])).toHaveLength(2)
  })

  it('resists a single extreme outlier while respecting recent sales', () => {
    const estimate = robustFairValueEstimate([
      sale(95, 30),
      sale(100, 20),
      sale(102, 10),
      sale(105, 5, 'bin'),
      sale(108, 1),
      sale(2_500, 1, 'bin'),
    ], { asOf })
    expect(estimate).not.toBeNull()
    expect(estimate?.value).toBeGreaterThan(95)
    expect(estimate?.value).toBeLessThan(140)
    expect(estimate?.low).toBeLessThan(estimate?.value ?? 0)
    expect(estimate?.high).toBeGreaterThan(estimate?.value ?? 0)
  })

  it('anchors variation multiples to base sales close in time', () => {
    const points = buildProximityRatioPoints(
      [sale(400, 2), sale(360, 20)],
      [sale(100, 1), sale(95, 3), sale(90, 19), sale(92, 22)],
    )
    expect(points).toHaveLength(2)
    expect(points[0]?.price).toBeGreaterThan(3.5)
    expect(points[0]?.price).toBeLessThan(4.5)
  })

  it('shrinks thin player evidence toward deeper release evidence', () => {
    const releaseRatios = Array.from({ length: 12 }, (_, index) => sale(2 + (index % 3) * 0.05, index + 1))
    const estimate = estimateHierarchicalMultiplier({
      priorMultiplier: 1.35,
      priorReliability: 0.95,
      releaseRatioPoints: releaseRatios,
      playerVariationSales: [sale(350, 2)],
      playerBaseSales: [sale(100, 1), sale(105, 3)],
      asOf,
    })
    expect(estimate.multiplier).toBeGreaterThan(1.45)
    expect(estimate.multiplier).toBeLessThan(2.3)
    expect(estimate.sources).toContain('release-proximity')
  })

  it('blends direct lane comps with the base-multiple curve', () => {
    const estimate = estimateLaneFairValue({
      priorMultiplier: 2,
      releaseRatioPoints: [sale(2, 1), sale(2.1, 2), sale(1.9, 3)],
      baseSales: [sale(100, 1), sale(105, 2), sale(98, 5)],
      playerBaseSales: [sale(100, 1), sale(105, 2), sale(98, 5)],
      playerVariationSales: [sale(230, 1), sale(220, 4), sale(210, 7)],
      asOf,
    })
    expect(estimate).not.toBeNull()
    expect(estimate?.value).toBeGreaterThan(195)
    expect(estimate?.value).toBeLessThan(230)
    expect(estimate?.method).toBe('hierarchical-direct-blend')
  })
})
