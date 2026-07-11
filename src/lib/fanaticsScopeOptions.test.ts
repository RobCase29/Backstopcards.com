import { describe, expect, it } from 'vitest'
import type { ChecklistModel } from '../types'
import { buildFanaticsScopeOptions, fanaticsScopedPlayerNames } from './fanaticsScopeOptions'

function model(release: string, players: Array<{ playerName: string; team?: string | null }>): ChecklistModel {
  return {
    category: 'chrome',
    source: 'public-multipliers',
    release,
    releaseYear: 2026,
    fetchedAt: '2026-07-11T00:00:00.000Z',
    multipliers: [],
    players: players.map((player) => ({
      ...player,
      baseAvgPrice: 0,
      baseSalesCount: 0,
      variations: [],
    })),
  }
}

describe('Fanatics scope options', () => {
  it('builds sorted, deduplicated player, team, and set suggestions', () => {
    const options = buildFanaticsScopeOptions([
      model('bowman-chrome', [
        { playerName: 'Aiva Arquette', team: 'Miami Marlins' },
        { playerName: 'Eli Willits', team: 'Washington Nationals' },
      ]),
      model('bowman-draft', [
        { playerName: 'Aiva Arquette', team: 'Miami Marlins' },
        { playerName: 'Luis Arana', team: null },
      ]),
    ])

    expect(options.player).toEqual(['Aiva Arquette', 'Eli Willits', 'Luis Arana'])
    expect(options.team).toEqual(['Miami Marlins', 'Washington Nationals'])
    expect(options.set).toEqual(['2026 Bowman Chrome', '2026 Bowman Draft'])
  })

  it('matches only players with an explicit resolved team', () => {
    const models = [model('bowman-chrome', [
      { playerName: 'Aiva Arquette', team: 'MIA' },
      { playerName: 'Eli Willits', team: 'WSH' },
      { playerName: 'Unknown Team Player', team: null },
    ])]
    const labels: Record<string, string> = { MIA: 'Miami Marlins', WSH: 'Washington Nationals' }

    expect(fanaticsScopedPlayerNames(
      models,
      'team',
      'Miami Marlins',
      (_playerName, team) => labels[String(team)] ?? '',
    )).toEqual(['Aiva Arquette'])
  })
})
