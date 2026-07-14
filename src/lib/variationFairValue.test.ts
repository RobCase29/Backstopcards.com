import { describe, expect, it } from 'vitest'
import { blendLaneEvidence } from './variationFairValue'

describe('variation fair value', () => {
  it('does not let a single lane sale overwrite the release curve', () => {
    const estimate = blendLaneEvidence({
      curvePrice: 200,
      directPrice: 800,
      saleCount: 1,
      curveConfidence: 0.76,
      directConfidence: 0.48,
    })

    expect(estimate.value).toBeGreaterThan(200)
    expect(estimate.value).toBeLessThan(300)
    expect(estimate.method).toBe('hierarchical-direct-blend')
  })

  it('allows deep direct evidence to move fair value materially', () => {
    const thin = blendLaneEvidence({ curvePrice: 200, directPrice: 320, saleCount: 1 })
    const deep = blendLaneEvidence({ curvePrice: 200, directPrice: 320, saleCount: 20, directConfidence: 0.9 })

    expect(deep.value).toBeGreaterThan(thin.value)
    expect(deep.value).toBeLessThan(320)
    expect(deep.confidence).toBeGreaterThan(thin.confidence)
  })

  it('returns the curve unchanged when direct evidence is absent', () => {
    expect(blendLaneEvidence({ curvePrice: 245, directPrice: 0, saleCount: 0 })).toMatchObject({
      value: 245,
      directValue: null,
      method: 'curve-only',
    })
  })
})
