import { describe, expect, it } from 'vitest'
import {
  canonicalizeHistoricalBowmanAutoVariation,
  historicalBowmanAutoPrior,
  standardBowmanAutoMultiplier,
} from '../../shared/bowmanAutoTaxonomy.js'
import { extractSerialDenominator } from '../../shared/bowman2026Taxonomy.js'

describe('historical Bowman auto identity', () => {
  it.each([
    ['2025 Bowman Chrome Andrew Salas Blue Raywave Refractor Auto /150', 'Blue RayWave /150'],
    ['2024 Bowman Chrome Green Grass 1st AUTO /99', 'Green Grass /99'],
    ['2023 Bowman Draft Orange Wave Auto 12/25', 'Orange Wave /25'],
    ['2022 Bowman Draft Gold Wave Auto /50', 'Gold Wave /50'],
    ['2021 Bowman Chrome Purple Refractor Auto /250', 'Purple /250'],
    ['2020 Bowman Chrome Refractor Auto /499', 'Refractor /499'],
    ['2021 Bowman Chrome Green Atomic Auto /99', 'Green Atomic /99'],
    ['2026 Bowman Chrome Prospect Gold Ink Variation Redemption', 'Gold Ink /15'],
  ])('canonicalizes %s', (title, expected) => {
    expect(canonicalizeHistoricalBowmanAutoVariation(title).definition?.label).toBe(expected)
  })

  it('removes team color language before matching parallels', () => {
    const result = canonicalizeHistoricalBowmanAutoVariation(
      '2026 Bowman Chrome Justin Gonzales 1st Auto Red Sox #CPA-JG',
      { playerName: 'Justin Gonzales' },
    )
    expect(result.definition?.label).toBe('Base Auto')
  })

  it('abstains on unidentified serials and adjacent auto products', () => {
    expect(canonicalizeHistoricalBowmanAutoVariation('2025 Bowman Chrome Prospect Auto /150').status).toBe('ambiguous')
    expect(canonicalizeHistoricalBowmanAutoVariation('2025 Bowman Chrome Refractor Auto /250').status).toBe('ambiguous')
    expect(canonicalizeHistoricalBowmanAutoVariation('2024 Bowman Chrome Green Auto /499').status).toBe('ambiguous')
    expect(canonicalizeHistoricalBowmanAutoVariation('2023 Bowman Chrome Gold Auto /75').status).toBe('ambiguous')
    expect(canonicalizeHistoricalBowmanAutoVariation('2024 Bowman Rising Infernos Auto /99').status).toBe('out-of-scope')
    expect(canonicalizeHistoricalBowmanAutoVariation('2024 Bowman IP Auto Signed Rare').status).toBe('out-of-scope')
  })

  it.each([
    '2024 Bowman Draft Chrome Class of 2024 Auto /250 Carter Johnson',
    '2019 Bowman Chrome Draft CJ Abrams Under Armour RC Auto /199',
    '2024 Bowman Chrome Paul Skenes Dylan Crews Dual Auto /25',
    '2019 Bowman Draft Franchise Futures Dual Auto Greg Jones JJ Goss',
    '2026 Bowman Draft Pick Pairings Dual Auto Red /5',
    '2025 Bowman Chrome 3 Card Auto Lot',
  ])('keeps adjacent and multi-card autograph markets outside the flagship curve: %s', (title) => {
    expect(canonicalizeHistoricalBowmanAutoVariation(title).status).toBe('out-of-scope')
  })

  it('keeps unredeemed manufacturer redemptions in the same physical auto lane', () => {
    const result = canonicalizeHistoricalBowmanAutoVariation(
      '2025 Bowman Chrome Prospect Refractor Autograph Redemption /499',
    )
    expect(result.definition?.label).toBe('Refractor /499')
  })

  it('does not parse grades or dates as serial denominators', () => {
    expect(extractSerialDenominator('SGC 9.5/10 Bowman Chrome Auto')).toBeNull()
    expect(extractSerialDenominator('Redemption expires 3/1/2036')).toBeNull()
    expect(extractSerialDenominator('Bowman Chrome Auto 12/50')).toBe(50)
  })

  it('provides a monotonic structural scarcity curve', () => {
    expect(standardBowmanAutoMultiplier(499)).toBeLessThan(standardBowmanAutoMultiplier(150) ?? 0)
    expect(standardBowmanAutoMultiplier(150)).toBeLessThan(standardBowmanAutoMultiplier(50) ?? 0)
    expect(standardBowmanAutoMultiplier(50)).toBeLessThan(standardBowmanAutoMultiplier(5) ?? 0)
    expect(historicalBowmanAutoPrior('Gold Wave /50')?.multiplier).toBeGreaterThan(4.5)
  })
})
