import { describe, expect, it } from 'vitest'
import {
  lowSerialNonAutoVariationLabel,
  normalizedTitleKey,
  superfractorVariationLabel,
  titleCanUseBowmanSuperfractorAutoProxy,
  titleLooksLikeBaseAuto,
  titleLooksLikeLowSerialNonAuto,
  titleLooksLikeSuperfractor,
  titleMatchesPlayerName,
  titleMatchesSearchTerm,
  titleMatchesVariationTerm,
  titleSerialDenominator,
  variationQueryTerm,
} from './cardTitleGuards'

describe('card title guards', () => {
  it('normalizes names and matches player/search terms consistently', () => {
    expect(normalizedTitleKey('Luis Arana Jr.')).toBe('luis arana')
    expect(titleMatchesPlayerName('2026 Bowman Chrome Luis Arana Jr. 1st Auto CPA-LA', 'Luis Arana')).toBe(true)
    expect(titleMatchesPlayerName('2026 Bowman Chrome Aiva Arquette 1st Auto CPA-AA', 'Luis Arana')).toBe(false)
    expect(titleMatchesSearchTerm('Luis Arana', 'arana luis')).toBe(true)
  })

  it('uses shared variation aliases for marketplace wording', () => {
    expect(variationQueryTerm('Gold Image Variation /15')).toBe('gold ink')
    expect(titleMatchesVariationTerm('2026 Bowman Chrome Eli Willits 1st Bowman Gold Ink Auto /15', 'Gold Image Variation /15')).toBe(
      true,
    )
    expect(titleMatchesVariationTerm('2026 Bowman Chrome Eli Willits 1st Bowman Gold Refractor Auto /50', 'Gold Image Variation /15')).toBe(
      false,
    )
  })

  it('recognizes official Bowman Superfractors and rejects common false positives', () => {
    expect(titleSerialDenominator('2026 Bowman Chrome Luis Arana 1st Bowman Superfractor Auto one of one')).toBe(1)
    expect(titleLooksLikeSuperfractor('2026 Bowman Chrome Luis Arana 1st Bowman Superfractor Auto 1/1')).toBe(true)
    expect(titleLooksLikeSuperfractor('2024 Bowman Chrome Draft Gage Miller Auto Blue Refractor /150')).toBe(false)
    expect(titleLooksLikeSuperfractor('2024 Bowman Chrome Aiva Arquette Printing Plate 1/1')).toBe(false)
    expect(titleLooksLikeSuperfractor('Aiva Arquette Superfractor 1-of-1', { requireBowman: false })).toBe(true)
    expect(titleLooksLikeSuperfractor('Aiva Arquette Superfractor 1-of-1')).toBe(false)
  })

  it('keeps base autos and low-serial non-autos in separate model lanes', () => {
    expect(titleLooksLikeBaseAuto('2026 Bowman Chrome Dillon Lewis 1st Bowman Auto CPA-DL')).toBe(true)
    expect(titleLooksLikeBaseAuto('2026 Bowman Chrome Dillon Lewis 1st Bowman Blue Auto /150')).toBe(false)
    expect(titleLooksLikeLowSerialNonAuto('2026 Bowman Chrome Dillon Lewis 1st Bowman Gold Refractor /50')).toBe(true)
    expect(titleLooksLikeLowSerialNonAuto('2026 Bowman Chrome Dillon Lewis 1st Bowman Gold Auto /50')).toBe(false)
    expect(lowSerialNonAutoVariationLabel('2026 Bowman Chrome Dillon Lewis Gold Refractor /50', 50)).toBe('Gold /50')
  })

  it('only allows Bowman flagship/prospect autos to borrow Superfractor proxy pricing', () => {
    expect(titleCanUseBowmanSuperfractorAutoProxy('2026 Bowman Chrome Prospect Luis Arana BCPA-LA Superfractor Auto 1/1')).toBe(
      true,
    )
    expect(titleCanUseBowmanSuperfractorAutoProxy('2025 Bowman Top 100 Luis Arana Superfractor Auto 1/1')).toBe(false)
    expect(titleCanUseBowmanSuperfractorAutoProxy('2026 Bowman Chrome Prospect Luis Arana Superfractor Non Auto 1/1')).toBe(false)
    expect(superfractorVariationLabel('2026 Bowman Chrome Prospect Luis Arana Superfractor Auto 1/1')).toBe('Superfractor Auto /1')
  })
})
