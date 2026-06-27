import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  canonicalFromNormalizedSale,
  canonicalFromStructuredCard,
  createCanonicalMarketSchema,
  rebuildCanonicalMarket,
} from './canonical-market.mjs'

function createNativeCardHedgeTables(db) {
  db.exec(`
    CREATE TABLE card_hedge_cards (
      card_id TEXT PRIMARY KEY,
      player_name TEXT,
      description TEXT,
      card_set TEXT,
      card_number TEXT,
      variant TEXT,
      category TEXT,
      category_group TEXT,
      set_type TEXT,
      raw_json TEXT
    );

    CREATE TABLE card_hedge_sales (
      price_history_id TEXT PRIMARY KEY,
      card_id TEXT,
      player_name TEXT,
      grade TEXT,
      price REAL,
      sold_at TEXT,
      sale_type TEXT,
      price_source TEXT,
      title TEXT,
      sale_url TEXT,
      raw_json TEXT
    );
  `)
}

function insertNativeCardHedgeRefractorSale(db) {
  db.prepare(`
    INSERT INTO card_hedge_cards (
      card_id, player_name, description, card_set, card_number, variant, category, category_group, set_type, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ch-aiva-cpa-aa',
    'Aiva Arquette',
    'Aiva Arquette 2026 Bowman #CPA-AA Chrome Prospect Autographs - Refractor /499',
    '2026 Bowman',
    'CPA-AA',
    'Refractor /499',
    'Chrome Prospect Autographs (1st)',
    'Baseball',
    'Bowman',
    '{}',
  )
  db.prepare(`
    INSERT INTO card_hedge_sales (
      price_history_id, card_id, player_name, grade, price, sold_at, sale_type, price_source, title, sale_url, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ph-1',
    'ch-aiva-cpa-aa',
    'Aiva Arquette',
    'Raw',
    165,
    '2026-06-23T12:00:00.000Z',
    'Buy It Now',
    'eBay',
    '2026 Bowman Aiva Arquette Auto Refractor Redemption #CPA-AA /499',
    'https://www.ebay.com/itm/123456789012',
    '{}',
  )
}

describe('canonical market mapping', () => {
  it('keeps generic refractor redemption autos in the /499 lane', () => {
    const card = canonicalFromNormalizedSale({
      itemId: 'sale-1',
      playerName: 'Aiva Arquette',
      releaseYear: 2026,
      productFamily: 'Bowman Chrome',
      cardClass: 'auto',
      variationLabel: 'Refractor /499',
      serialDenominator: 499,
      gradeBucket: 'Raw',
      insertName: null,
    })

    expect(card.cardFamily).toBe('Chrome Prospect Autographs')
    expect(card.variationLabel).toBe('Refractor /499')
    expect(card.serialDenominator).toBe(499)
    expect(card.gradeBucket).toBe('Raw')
    expect(card.canonicalCardKey).toContain('refractor-/499')
  })

  it('preserves B&W shimmer as a low-pop chrome auto lane', () => {
    const card = canonicalFromNormalizedSale({
      itemId: 'sale-2',
      playerName: 'Aiva Arquette',
      releaseYear: 2026,
      productFamily: 'Bowman Chrome',
      cardClass: 'auto',
      variationLabel: 'B&W Shimmer /11',
      serialDenominator: 11,
      gradeBucket: 'Raw',
      insertName: null,
    })

    expect(card.variationLabel).toBe('B&W Shimmer /11')
    expect(card.serialDenominator).toBe(11)
    expect(card.canonicalCardKey).toContain('b-and-w-shimmer-/11')
  })

  it('treats snack pack autos as chrome autograph variations', () => {
    const card = canonicalFromNormalizedSale({
      itemId: 'sale-3',
      playerName: 'Aiva Arquette',
      releaseYear: 2026,
      productFamily: 'Bowman Chrome',
      cardClass: 'auto',
      variationLabel: 'Sunflower Snack Pack /5',
      serialDenominator: 5,
      gradeBucket: 'Raw',
      insertName: null,
    })

    expect(card.productFamily).toBe('Bowman Chrome')
    expect(card.cardFamily).toBe('Chrome Prospect Autographs')
    expect(card.variationLabel).toBe('Sunflower Snack Pack /5')
    expect(card.serialDenominator).toBe(5)
  })

  it('maps Market Movers selected card taxonomy into canonical cards', () => {
    const card = canonicalFromStructuredCard({
      cardKey: 'aiva-cpa-aa-refactor',
      playerName: 'Aiva Arquette',
      cardTitle: 'Aiva Arquette 2026 Bowman #CPA-AA',
      category: 'Chrome Prospect Autographs (1st) - Refractor /499 (1st)',
      gradeBucket: 'Raw',
    })

    expect(card.releaseYear).toBe(2026)
    expect(card.productFamily).toBe('Bowman Chrome')
    expect(card.cardFamily).toBe('Chrome Prospect Autographs')
    expect(card.cardClass).toBe('auto')
    expect(card.variationLabel).toBe('Refractor /499')
    expect(card.serialDenominator).toBe(499)
    expect(card.cardNumber).toBe('CPA-AA')
  })

  it('prunes stale rebuilt-source canonical cards on rebuild', () => {
    const db = new DatabaseSync(':memory:')
    createCanonicalMarketSchema(db)
    db.prepare(`
      INSERT INTO canonical_cards (
        canonical_card_key, player_name, release_year, release_label, product_family, card_family,
        card_class, variation_label, serial_denominator, grade_bucket, card_number, source_count,
        created_at, updated_at
      )
      VALUES (
        'stale-card', 'Aiva Arquette', 2026, '2026 Bowman', 'Bowman Chrome', 'Chrome Prospects',
        'chrome', 'Refractor /499', 499, 'Raw', '', 1, '2026-06-24T00:00:00.000Z', '2026-06-24T00:00:00.000Z'
      )
    `).run()
    db.prepare(`
      INSERT INTO canonical_source_mappings (
        source, source_key, canonical_card_key, player_name, confidence, raw_json, created_at, updated_at
      )
      VALUES (
        'market_movers_sale', 'old-sale', 'stale-card', 'Aiva Arquette', 0.9, '{}',
        '2026-06-24T00:00:00.000Z', '2026-06-24T00:00:00.000Z'
      )
    `).run()

    rebuildCanonicalMarket(db, { nowIso: '2026-06-25T00:00:00.000Z' })

    expect(db.prepare('SELECT COUNT(*) AS count FROM canonical_source_mappings').get().count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM canonical_cards').get().count).toBe(0)
    db.close()
  })

  it('maps native Card Hedge comps directly into canonical cards', () => {
    const db = new DatabaseSync(':memory:')
    createNativeCardHedgeTables(db)
    insertNativeCardHedgeRefractorSale(db)

    const result = rebuildCanonicalMarket(db, { nowIso: '2026-06-25T00:00:00.000Z' })
    const mapping = db.prepare('SELECT source, source_key AS sourceKey FROM canonical_source_mappings').get()
    const card = db.prepare('SELECT product_family AS productFamily, card_class AS cardClass, variation_label AS variationLabel FROM canonical_cards').get()
    const summary = db.prepare('SELECT sale_count AS saleCount, median_price AS medianPrice FROM canonical_comp_summary').get()

    expect(result.cardHedgeNativeMappings).toBe(1)
    expect(mapping.source).toBe('card_hedge_native_sale')
    expect(mapping.sourceKey).toBe('ebay:123456789012')
    expect(card.productFamily).toBe('Bowman Chrome')
    expect(card.cardClass).toBe('auto')
    expect(card.variationLabel).toBe('Refractor /499')
    expect(summary.saleCount).toBe(1)
    expect(summary.medianPrice).toBe(165)
    db.close()
  })

  it('prefers native Card Hedge comps over mirrored compatibility rows', () => {
    const db = new DatabaseSync(':memory:')
    createNativeCardHedgeTables(db)
    insertNativeCardHedgeRefractorSale(db)
    db.exec(`
      CREATE TABLE market_movers_sales_raw (
        item_id TEXT PRIMARY KEY,
        source TEXT,
        player_name TEXT,
        title TEXT,
        sale_price REAL,
        sold_at TEXT,
        raw_json TEXT
      );

      CREATE TABLE market_movers_sales_normalized (
        item_id TEXT PRIMARY KEY,
        player_name TEXT,
        release_year INTEGER,
        product_family TEXT,
        card_class TEXT,
        variation_label TEXT,
        serial_denominator INTEGER,
        grade_bucket TEXT,
        insert_name TEXT,
        bucket_key TEXT,
        model_eligible INTEGER,
        channel TEXT,
        normalized_json TEXT
      );
    `)
    db.prepare(`
      INSERT INTO market_movers_sales_raw (item_id, source, player_name, title, sale_price, sold_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      '123456789012',
      'card-hedge-comps',
      'Aiva Arquette',
      '2026 Bowman Aiva Arquette Auto Refractor Redemption #CPA-AA /499',
      165,
      '2026-06-23T12:00:00.000Z',
      '{}',
    )
    db.prepare(`
      INSERT INTO market_movers_sales_normalized (
        item_id, player_name, release_year, product_family, card_class, variation_label, serial_denominator,
        grade_bucket, insert_name, bucket_key, model_eligible, channel, normalized_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '123456789012',
      'Aiva Arquette',
      2026,
      'Bowman Chrome',
      'auto',
      'Refractor /499',
      499,
      'Raw',
      null,
      'player=Aiva Arquette | 2026 | Bowman Chrome | auto | Refractor /499 | Raw',
      1,
      'bin',
      '{}',
    )

    rebuildCanonicalMarket(db, { nowIso: '2026-06-25T00:00:00.000Z' })
    const sourceRows = db.prepare('SELECT source, COUNT(*) AS count FROM canonical_source_mappings GROUP BY source').all()
    const summary = db.prepare('SELECT sale_count AS saleCount FROM canonical_comp_summary').get()

    expect(sourceRows).toEqual([{ source: 'card_hedge_native_sale', count: 1 }])
    expect(summary.saleCount).toBe(1)
    db.close()
  })
})
