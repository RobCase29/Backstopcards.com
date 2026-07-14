import { describe, expect, it } from 'vitest'
import { buildReleaseLaneRegistry } from '../../shared/releaseLaneRegistry.js'

describe('release lane registry', () => {
  it('always admits the base anchor and official release lanes', () => {
    const registry = buildReleaseLaneRegistry(
      [
        { label: 'Base Auto', playerKey: 'a', registryClass: 'base', confidence: 0.8 },
        { label: 'Gold Ink /15', playerKey: 'a', registryClass: 'standard', confidence: 0.94 },
      ],
      { officialLabels: ['Gold Ink /15'] },
    )
    expect(registry.acceptedLabels).toEqual(new Set(['Base Auto', 'Gold Ink /15']))
  })

  it('quarantines one-off inferred historical lanes', () => {
    const registry = buildReleaseLaneRegistry([
      { label: 'Lunar /250', playerKey: 'a', registryClass: 'release-confirmed', confidence: 0.76 },
    ])
    expect(registry.acceptedCount).toBe(0)
    expect(registry.lanes[0]).toMatchObject({ accepted: false, playerCount: 1, saleCount: 1 })
  })

  it('accepts strict lanes with an explicit denominator', () => {
    const registry = buildReleaseLaneRegistry([
      { label: 'Purple /250', playerKey: 'a', registryClass: 'standard', confidence: 0.97, explicitDenominator: true },
    ])
    expect(registry.acceptedLabels.has('Purple /250')).toBe(true)
  })

  it('requires independent support for flexible release-specific lanes', () => {
    const registry = buildReleaseLaneRegistry([
      { label: 'Black /10', playerKey: 'a', registryClass: 'release-confirmed', confidence: 0.97, explicitDenominator: true },
      { label: 'Black /10', playerKey: 'b', registryClass: 'release-confirmed', confidence: 0.97, explicitDenominator: true },
    ])
    expect(registry.lanes[0]).toMatchObject({ accepted: true, playerCount: 2, explicitDenominatorSales: 2 })
  })
})
