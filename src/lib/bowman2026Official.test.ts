import { describe, expect, it } from 'vitest'
import { titleEligibleForBowmanChromeAutoModel } from './cardTitleGuards'
import { matchBowman2026OfficialFamily, titleMatchesBowman2026ChromeAutoBlocker } from './bowman2026Official'

describe('2026 Bowman official checklist guardrails', () => {
  it('recognizes official insert and paper-auto families from checklist codes', () => {
    expect(matchBowman2026OfficialFamily('2026 Bowman Aiva Arquette Crystallized BWC-1')?.name).toBe('Crystallized')
    expect(matchBowman2026OfficialFamily('2026 Bowman Aiva Arquette Orange Auto #BPA-AA')?.name).toBe('Base Prospect Retail Autographs')
    expect(matchBowman2026OfficialFamily('2026 Bowman Power Chords Auto Gold /50 PC-9')?.name).toBe('Power Chords Autographs')
  })

  it('blocks official non-flagship families from the chrome auto model', () => {
    expect(titleMatchesBowman2026ChromeAutoBlocker('2026 Bowman Aiva Arquette Chrome Auto CPA-AA')).toBe(false)
    expect(titleMatchesBowman2026ChromeAutoBlocker('2026 Bowman Aiva Arquette Crystallized BWC-1')).toBe(true)
    expect(titleMatchesBowman2026ChromeAutoBlocker('2026 Bowman Aiva Arquette Power Chords Auto Gold /50')).toBe(true)
    expect(titleMatchesBowman2026ChromeAutoBlocker('2026 Bowman Aiva Arquette Red Paper Auto #BPA-AA')).toBe(true)
  })

  it('allows snack-pack autographs through the chrome auto guard', () => {
    expect(titleEligibleForBowmanChromeAutoModel('2026 Bowman Chrome Aiva Arquette Sunflower Snack Pack Auto /5')).toBe(true)
    expect(titleEligibleForBowmanChromeAutoModel('2026 Bowman Chrome Aiva Arquette Peanuts Auto /5')).toBe(true)
    expect(titleEligibleForBowmanChromeAutoModel('2026 Bowman Aiva Arquette Power Chords Auto Gold /50')).toBe(false)
  })
})
