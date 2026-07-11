import { describe, expect, it } from 'vitest'
import {
  blendHostedCompPrice,
  chooseBowmanBaseAutoCard,
  dailyExportDateCandidates,
  evaluateBowmanBaseAutoCandidate,
  normalizeHostedTimestamp,
  releaseSearchLabel,
  summarizeHostedCompSales,
  visitCsvRows,
} from './hostedComps'

describe('hosted comp card matching', () => {
  it('uses the exact Bowman release and normalizes Draft naming variants', () => {
    expect(releaseSearchLabel('2025 Bowman Chrome', 2025)).toBe('2025 Bowman Chrome')
    expect(releaseSearchLabel('2024 Bowman Chrome Draft', 2024)).toBe('2024 Bowman Draft')
    expect(releaseSearchLabel('2018 Bowman Draft Chrome', 2018)).toBe('2018 Bowman Draft')
  })

  it('accepts a structured flagship base auto without treating a team color as a parallel', () => {
    const result = evaluateBowmanBaseAutoCandidate(
      {
        card_id: 'base-1',
        player: 'Justin Gonzales',
        description: 'Justin Gonzales 2026 Bowman Chrome Prospects Autographs Baseball',
        set: '2026 Bowman Baseball',
        number: 'CPA-JG',
        variant: 'Base',
      },
      'Justin Gonzales',
      2026,
    )

    expect(result.eligible).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(100)
  })

  it('rejects special auto families that Card Hedge sometimes labels as a base variant', () => {
    for (const description of [
      'Dillon Lewis 2026 Bowman Chrome Prospects Autographs Gold Ink Baseball',
      'Dillon Lewis 2026 Bowman Chrome Prospect Packfractor Autograph Baseball',
      'Dillon Lewis 2026 Bowman Mega Box Prospect Mega Autographs Chrome Baseball',
    ]) {
      expect(
        evaluateBowmanBaseAutoCandidate(
          {
            card_id: description,
            player: 'Dillon Lewis',
            description,
            set: '2026 Bowman Baseball',
            number: 'CPA-DL',
            variant: 'Base',
          },
          'Dillon Lewis',
          2026,
        ).eligible,
      ).toBe(false)
    }
  })

  it('prefers the flagship auto over paper and insert autos', () => {
    const match = chooseBowmanBaseAutoCard(
      [
        {
          card_id: 'paper',
          player: 'Aiva Arquette',
          description: 'Aiva Arquette 2026 Bowman Prospect Autograph Baseball',
          set: '2026 Bowman Baseball',
          number: 'BPA-AA',
          variant: 'Base',
        },
        {
          card_id: 'chrome',
          player: 'Aiva Arquette',
          description: 'Aiva Arquette 2026 Bowman Chrome Prospects Autographs Baseball',
          set: '2026 Bowman Baseball',
          number: 'CPA-AA',
          variant: 'Base',
          '30 Day Sales': 8,
        },
      ],
      'Aiva Arquette',
      2026,
    )

    expect(match?.card.card_id).toBe('chrome')
  })
})

describe('hosted comp modeling', () => {
  it('keeps database timestamp objects ISO-safe when recomputing lanes', () => {
    expect(normalizeHostedTimestamp(new Date('2026-07-08T00:06:00.000Z'))).toBe('2026-07-08T00:06:00.000Z')
  })

  it('tries recent completed UTC dates when the latest export is not published yet', () => {
    expect(dailyExportDateCandidates(new Date('2026-07-09T23:30:00.000Z'))).toEqual([
      '2026-07-08',
      '2026-07-07',
      '2026-07-06',
    ])
  })

  it('parses quoted daily-export rows without splitting commas or embedded line breaks', () => {
    const rows: Record<string, string>[] = []
    const count = visitCsvRows(
      'player,description,price\r\n"Aiva Arquette","Bowman Chrome, Base Auto",112\r\n"Dillon Lewis","Line one\nLine two",25\r\n',
      (row) => rows.push(row),
    )

    expect(count).toBe(2)
    expect(rows[0]).toEqual({ player: 'Aiva Arquette', description: 'Bowman Chrome, Base Auto', price: '112' })
    expect(rows[1]?.description).toBe('Line one\nLine two')
  })

  it('deduplicates sales and calculates transparent recent metrics', () => {
    const summary = summarizeHostedCompSales(
      {
        comp_price: 112,
        high: 150,
        low: 80,
        count_used: 3,
        raw_prices: [
          { price_history_id: 'a', price: 120, sale_date: '2026-07-08T12:00:00.000Z', sale_type: 'Auction' },
          { price_history_id: 'a', price: 120, sale_date: '2026-07-08T12:00:00.000Z', sale_type: 'Auction' },
          { price_history_id: 'b', price: 100, sale_date: '2026-07-05T12:00:00.000Z', sale_type: 'Best Offer' },
          { price_history_id: 'c', price: 80, sale_date: '2026-06-01T12:00:00.000Z', sale_type: 'Auction' },
        ],
      },
      new Date('2026-07-09T12:00:00.000Z'),
    )

    expect(summary.modelPrice).toBe(112)
    expect(summary.sales).toHaveLength(3)
    expect(summary.sales30).toBe(2)
    expect(summary.sales90).toBe(3)
    expect(summary.recent3Avg).toBe(100)
    expect(summary.auctionCount).toBe(2)
    expect(summary.binCount).toBe(1)
  })

  it('lets deep comp lanes lead and uses direct FMV as corroboration', () => {
    expect(
      blendHostedCompPrice(100, 12, {
        card_id: 'card-1',
        grade: 'Raw',
        price: 120,
        confidence: 0.8,
        confidence_grade: 'A',
        method: 'direct',
      }),
    ).toBe(105)
    expect(
      blendHostedCompPrice(100, 12, {
        card_id: 'card-1',
        grade: 'Raw',
        price: 250,
        confidence: 0.3,
        confidence_grade: 'D',
        method: 'segment_fallback',
      }),
    ).toBe(100)
  })
})
