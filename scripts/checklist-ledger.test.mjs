import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  classifyChecklistSection,
  createChecklistLedgerSchema,
  parseWaxPackHeroFirstBowmanHtml,
  parseWaxPackHeroFirstBowmanPage,
  rebuildChecklistUniverse,
  refreshChecklistFirstEvidence,
  seedVariationTemplates,
  upsertExplicitFirstBowmanEvidence,
  upsertChecklistRelease,
  upsertChecklistRows,
} from './checklist-ledger.mjs'

describe('checklist ledger', () => {
  it('parses Wax Pack Hero first Bowman rows from release HTML', () => {
    const rows = parseWaxPackHeroFirstBowmanHtml(`
      <p>BP-1 <a href="https://example.com">Ethan Holliday (eBay link)</a></p>
      <p>BP-26 Sean Paul Li&#241;an</p>
      <p>BCP-99 Should Not Match Default BP Prefix</p>
    `)

    expect(rows).toEqual([
      {
        cardNo: 'BP-1',
        playerName: 'Ethan Holliday',
        title: 'BP-1 Ethan Holliday',
        sourceKey: 'BP-1',
        confidence: 0.99,
      },
      {
        cardNo: 'BP-26',
        playerName: 'Sean Paul Liñan',
        title: 'BP-26 Sean Paul Liñan',
        sourceKey: 'BP-26',
        confidence: 0.99,
      },
    ])
  })

  it('parses Wax Pack Hero hub pages across Bowman Chrome and Draft sections', () => {
    const page = parseWaxPackHeroFirstBowmanPage(
      `
        <h2>2025 Bowman</h2>
        <p>BP-1 Jesus Made</p>
        <h2>2025 Bowman Chrome</h2>
        <p>BCP-153 Josuar Gonzalez (eBay)</p>
        <h2>Bowman Draft</h2>
        <p>BD-1 Eli Willits</p>
      `,
      { releaseYear: 2025, sourceUrl: 'https://waxpackhero.com/first-bowman/2025-bowman' },
    )

    expect(page.entries).toEqual([
      expect.objectContaining({
        releaseKey: '2025-bowman',
        releaseName: '2025 Bowman',
        cardNo: 'BP-1',
        playerName: 'Jesus Made',
      }),
      expect.objectContaining({
        releaseKey: '2025-bowman-chrome',
        releaseName: '2025 Bowman Chrome',
        cardNo: 'BCP-153',
        playerName: 'Josuar Gonzalez',
      }),
      expect.objectContaining({
        releaseKey: '2025-bowman-draft',
        releaseName: '2025 Bowman Draft',
        cardNo: 'BD-1',
        playerName: 'Eli Willits',
      }),
    ])
  })

  it('classifies Chrome Prospect Autographs as flagship chrome autos', () => {
    const meta = classifyChecklistSection('Chrome Prospect Autographs', 'CPA-AA')

    expect(meta.productFamily).toBe('Bowman Chrome')
    expect(meta.cardClass).toBe('auto')
    expect(meta.isAuto).toBe(true)
    expect(meta.isChrome).toBe(true)
    expect(meta.chaseCategory).toBe('flagship-auto')
  })

  it('generates card universe lanes from official checklist rows', () => {
    const db = new DatabaseSync(':memory:')
    createChecklistLedgerSchema(db)
    const releaseKey = upsertChecklistRelease(db, {
      releaseKey: '2026-bowman',
      releaseYear: 2026,
      releaseName: '2026 Bowman',
      nowIso: '2026-06-25T00:00:00.000Z',
    })
    upsertChecklistRows(
      db,
      releaseKey,
      2026,
      [
        {
          sourceSheet: 'Autographs',
          section: 'Chrome Prospect Autographs',
          cardNo: 'CPA-AA',
          playerName: 'Aiva Arquette',
          team: 'Miami Marlins',
          rookieFlag: '',
        },
        {
          sourceSheet: 'Base',
          section: 'Base Set',
          cardNo: '8',
          playerName: 'Aaron Judge',
          team: 'New York Yankees',
          rookieFlag: '',
        },
      ],
      { nowIso: '2026-06-25T00:00:00.000Z' },
    )
    seedVariationTemplates(db, releaseKey, undefined, { nowIso: '2026-06-25T00:00:00.000Z' })
    const universe = rebuildChecklistUniverse(db, releaseKey, { nowIso: '2026-06-25T00:00:00.000Z' })
    const aivaRows = db
      .prepare("SELECT variation_label AS variationLabel FROM checklist_card_universe WHERE player_name = 'Aiva Arquette'")
      .all()
      .map((row) => row.variationLabel)
    const judgeRows = db
      .prepare("SELECT variation_label AS variationLabel FROM checklist_card_universe WHERE player_name = 'Aaron Judge'")
      .all()
      .map((row) => row.variationLabel)

    expect(universe.universeRows).toBeGreaterThan(20)
    expect(aivaRows).toContain('Base Auto')
    expect(aivaRows).toContain('Refractor /499')
    expect(judgeRows).toEqual(['Base'])
    db.close()
  })

  it('confirms 1st Bowman status from explicit source evidence', () => {
    const db = new DatabaseSync(':memory:')
    createChecklistLedgerSchema(db)
    const releaseKey = upsertChecklistRelease(db, {
      releaseKey: '2026-bowman',
      releaseYear: 2026,
      releaseName: '2026 Bowman',
      nowIso: '2026-06-25T00:00:00.000Z',
    })
    upsertChecklistRows(
      db,
      releaseKey,
      2026,
      [
        {
          sourceSheet: 'Autographs',
          section: 'Chrome Prospect Autographs',
          cardNo: 'CPA-AA',
          playerName: 'Aiva Arquette',
          team: 'Miami Marlins',
          rookieFlag: '',
        },
        {
          sourceSheet: 'Base',
          section: 'Base Set',
          cardNo: '8',
          playerName: 'Aaron Judge',
          team: 'New York Yankees',
          rookieFlag: '',
        },
      ],
      { nowIso: '2026-06-25T00:00:00.000Z' },
    )

    const result = upsertExplicitFirstBowmanEvidence(
      db,
      releaseKey,
      [
        { cardNo: 'BP-40', playerName: 'Aiva Arquette', sourceKey: 'BP-40' },
        { cardNo: 'BP-999', playerName: 'Missing Player', sourceKey: 'BP-999' },
      ],
      { nowIso: '2026-06-25T00:00:00.000Z', sourceUrl: 'https://waxpackhero.com/first-bowman/2026-bowman' },
    )
    const auto = db
      .prepare("SELECT first_status AS firstStatus, first_confidence AS confidence, first_evidence_count AS evidence FROM checklist_cards WHERE card_no = 'CPA-AA'")
      .get()
    const judge = db.prepare("SELECT first_status AS firstStatus FROM checklist_cards WHERE card_no = '8'").get()

    expect(result.matched).toBe(1)
    expect(result.unmatched).toBe(1)
    expect(auto.firstStatus).toBe('confirmed_1st')
    expect(auto.confidence).toBe(0.99)
    expect(auto.evidence).toBe(1)
    expect(judge.firstStatus).toBe('unknown')
    db.close()
  })

  it('derives 1st Bowman player status from market title evidence', () => {
    const db = new DatabaseSync(':memory:')
    createChecklistLedgerSchema(db)
    const releaseKey = upsertChecklistRelease(db, {
      releaseKey: '2026-bowman',
      releaseYear: 2026,
      releaseName: '2026 Bowman',
      nowIso: '2026-06-25T00:00:00.000Z',
    })
    upsertChecklistRows(
      db,
      releaseKey,
      2026,
      [
        {
          sourceSheet: 'Autographs',
          section: 'Chrome Prospect Autographs',
          cardNo: 'CPA-AA',
          playerName: 'Aiva Arquette',
          team: 'Miami Marlins',
          rookieFlag: '',
        },
        {
          sourceSheet: 'Inserts',
          section: 'Power Chords',
          cardNo: 'PC-AA',
          playerName: 'Aiva Arquette',
          team: 'Miami Marlins',
          rookieFlag: '',
        },
      ],
      { nowIso: '2026-06-25T00:00:00.000Z' },
    )
    db.exec(`
      CREATE TABLE market_movers_sales_raw (
        source TEXT,
        item_id TEXT,
        player_name TEXT,
        title TEXT,
        sold_at TEXT,
        raw_json TEXT
      );
    `)
    const insert = db.prepare(`
      INSERT INTO market_movers_sales_raw (source, item_id, player_name, title, sold_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    insert.run(
      'market-movers-ui',
      'sale-1',
      'Aiva Arquette',
      '2026 Bowman Chrome Aiva Arquette 1st Bowman Auto CPA-AA',
      '2026-06-20T12:00:00.000Z',
      '{}',
    )
    insert.run(
      'market-movers-ui',
      'sale-2',
      'Aiva Arquette',
      '2026 Bowman Aiva Arquette 1st Bowman Chrome Auto Refractor',
      '2026-06-22T12:00:00.000Z',
      '{}',
    )

    const result = refreshChecklistFirstEvidence(db, releaseKey, { nowIso: '2026-06-25T00:00:00.000Z' })
    const auto = db
      .prepare("SELECT first_status AS firstStatus, first_evidence_count AS evidence FROM checklist_cards WHERE card_no = 'CPA-AA'")
      .get()
    const insertCard = db.prepare("SELECT first_status AS firstStatus FROM checklist_cards WHERE card_no = 'PC-AA'").get()

    expect(result.evidence).toBe(2)
    expect(auto.firstStatus).toBe('confirmed_1st')
    expect(auto.evidence).toBe(2)
    expect(insertCard.firstStatus).toBe('unknown')
    db.close()
  })
})
