import { describe, expect, it } from 'vitest'
import { normalizeTeamCode, teamDisplayName } from './teams'

describe('team normalization', () => {
  it('normalizes codes and full team labels', () => {
    expect(normalizeTeamCode('WSH')).toBe('WSN')
    expect(normalizeTeamCode('Boston Red Sox')).toBe('BOS')
    expect(teamDisplayName('BOS')).toBe('Boston Red Sox')
  })

  it('recovers a single compressed team label', () => {
    expect(normalizeTeamCode('BALTIMOREORIOLES')).toBe('BAL')
  })

  it('rejects ambiguous and unsupported team values', () => {
    expect(normalizeTeamCode('ARIZONADIAMONDBACKSPITTSBURGHPIRATES')).toBe('')
    expect(normalizeTeamCode('YOMIURIGIANTS')).toBe('')
  })
})
