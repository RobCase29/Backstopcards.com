import { describe, expect, it } from 'vitest'
import type { ChecklistModel } from '../types'
import { mergeChecklistModels, mergeChecklistPlayers } from './prospectPulse'

function model(players: ChecklistModel['players'], multipliers: ChecklistModel['multipliers'] = []): ChecklistModel {
  return {
    category: 'bowman',
    release: '2026-Bowman',
    releaseYear: 2026,
    multipliers,
    players,
    fetchedAt: '2026-07-12T00:00:00.000Z',
    source: 'canonical-sold-model',
  }
}

describe('checklist source merge', () => {
  it('merges duplicate player identities and complementary variation evidence', () => {
    const players = mergeChecklistPlayers(
      [
        {
          playerName: 'Kade Anderson',
          team: 'Seattle Mariners',
          baseAvgPrice: 72,
          baseSalesCount: 8,
          variations: [{ variation: 'Orange /25 Auto', avgPrice: 900, multiplier: 12.5, salesCount: 1 }],
        },
      ],
      [
        {
          playerName: 'Kade Anderson Jr.',
          baseAvgPrice: 75,
          baseSalesCount: 12,
          variations: [{ variation: 'Orange Refractor /25 Auto', avgPrice: 950, multiplier: 12.7, salesCount: 3 }],
        },
      ],
    )

    expect(players).toHaveLength(1)
    expect(players[0]).toMatchObject({ playerName: 'Kade Anderson', team: 'Seattle Mariners', baseAvgPrice: 75, baseSalesCount: 12 })
    expect(players[0].variations).toEqual([
      expect.objectContaining({ variation: 'Orange Refractor /25 Auto', avgPrice: 950, salesCount: 3 }),
    ])
  })

  it('deduplicates multiplier aliases while preserving distinct base and /499 lanes', () => {
    const merged = mergeChecklistModels(
      model([], [
        { variation: 'Base Auto', avgMultiplier: 1, sortOrder: 0 },
        { variation: 'Orange /25 Auto', avgMultiplier: 12, totalSales: 2, sortOrder: 4 },
        { variation: 'Refractor /499 Auto', avgMultiplier: 1.5, sortOrder: 1 },
      ]),
      model([], [{ variation: 'Orange Refractor /25 Auto', avgMultiplier: 12.2, totalSales: 5, sortOrder: 4 }]),
    )

    expect(merged?.multipliers).toHaveLength(3)
    expect(merged?.multipliers.map((variation) => variation.variation)).toEqual([
      'Base Auto',
      'Refractor /499 Auto',
      'Orange Refractor /25 Auto',
    ])
  })
})
