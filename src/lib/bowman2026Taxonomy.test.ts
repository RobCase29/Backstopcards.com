import { describe, expect, it } from 'vitest'
import {
  BOWMAN_2026_CHROME_AUTO_VARIATIONS,
  canonicalizeBowman2026AutoVariation,
} from '../../shared/bowman2026Taxonomy.js'

describe('2026 Bowman Chrome auto taxonomy', () => {
  it('contains one official identity for every flagship lane', () => {
    expect(BOWMAN_2026_CHROME_AUTO_VARIATIONS).toHaveLength(39)
    expect(new Set(BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((item) => item.id)).size).toBe(39)
    expect(new Set(BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((item) => item.label)).size).toBe(39)
  })

  it.each([
    ['2026 Bowman Chrome Aiva Arquette Gold Ink Variation Redemption', 'Gold Ink /15'],
    ['2026 Bowman Chrome Dillon Lewis 1st ROOKIE AUTO /15 EXCH Gold Ink', 'Gold Ink /15'],
    ['2026 Bowman Aiva Arquette Auto Variation bowman autofractorRedemption/35 Marlins', 'Logofractor /35'],
    ['2026 Bowman Chrome Aiva Arquette Refractor Redemption', 'Refractor /499'],
    ['Topps 2026 Bowman Bubblegum Auto Dillon Lewis Yankees #3/5', 'Gumball Snack Pack /5'],
    ['2026 Bowman Chrome Aiva Arquette Black & White Shimmer Auto', 'B&W Shimmer /11'],
    ['2026 Bowman Chrome Aiva Arquette Blue X-Fractor Auto /150', 'Blue X-Fractor /150'],
    ['2026 Bowman Chrome Aiva Arquette Green Grass Auto /99', 'Green Grass /99'],
  ])('maps %s to %s', (title, expected) => {
    expect(canonicalizeBowman2026AutoVariation(title, { playerName: 'Aiva Arquette', assumeAuto: true }).definition?.label).toBe(expected)
  })

  it('does not treat team colors as parallel evidence', () => {
    expect(
      canonicalizeBowman2026AutoVariation('2026 Bowman Chrome Justin Gonzales 1st Auto Red Sox', {
        playerName: 'Justin Gonzales',
        assumeAuto: true,
      }).definition?.label,
    ).toBe('Base Auto')
    expect(
      canonicalizeBowman2026AutoVariation('2026 Bowman Chrome Hector Ramos Auto Red Sox', {
        playerName: 'Hector Ramos',
        assumeAuto: true,
      }).definition?.label,
    ).toBe('Base Auto')
  })

  it('quarantines impossible and ambiguous lanes', () => {
    const impossible = canonicalizeBowman2026AutoVariation('2026 Bowman Chrome Prospect Auto Logofractor /36', { assumeAuto: true })
    expect(impossible.status).toBe('conflict')
    expect(impossible.modelEligible).toBe(false)

    const ambiguous = canonicalizeBowman2026AutoVariation('2026 Bowman Chrome Prospect Auto 12/50', { assumeAuto: true })
    expect(ambiguous.status).toBe('ambiguous')
    expect(ambiguous.modelEligible).toBe(false)
  })

  it('keeps adjacent Bowman products outside the flagship curve', () => {
    expect(canonicalizeBowman2026AutoVariation('2026 Bowman Mega Mojo Prospect Auto /25', { assumeAuto: true }).status).toBe('out-of-scope')
    expect(canonicalizeBowman2026AutoVariation('2026 Bowman Sapphire Auto /25', { assumeAuto: true }).status).toBe('out-of-scope')
    expect(canonicalizeBowman2026AutoVariation('2026 Bowman Paper Prospect Auto /25', { assumeAuto: true }).status).toBe('out-of-scope')
  })
})

