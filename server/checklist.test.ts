import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { handleChecklistRoute } from './proxy'

type TestEnv = Record<string, string | undefined>

const tempDirs: string[] = []

function tempEnv(overrides: TestEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'backstop-checklist-'))
  tempDirs.push(dir)
  return {
    BACKSTOP_SALES_DB: join(dir, 'checklist.sqlite'),
    ...overrides,
  }
}

async function seedChecklistDb(dbFile: string) {
  const sqlite = (await import('node:sqlite')) as typeof import('node:sqlite')
  const db = new sqlite.DatabaseSync(dbFile)
  db.exec(`
    CREATE TABLE checklist_releases (
      release_key TEXT PRIMARY KEY,
      release_year INTEGER,
      release_name TEXT,
      product_line TEXT,
      imported_at TEXT,
      source_path TEXT,
      source_hash TEXT
    );

    CREATE TABLE checklist_cards (
      checklist_card_key TEXT PRIMARY KEY,
      release_key TEXT,
      release_year INTEGER,
      source_sheet TEXT,
      section TEXT,
      card_no TEXT,
      player_key TEXT,
      player_name TEXT,
      team TEXT,
      is_auto INTEGER,
      chase_category TEXT,
      first_status TEXT
    );

    CREATE TABLE checklist_player_signals (
      release_key TEXT,
      player_key TEXT,
      first_status TEXT,
      first_confidence REAL,
      first_evidence_count INTEGER
    );

    CREATE TABLE checklist_variation_templates (
      template_key TEXT PRIMARY KEY,
      release_key TEXT
    );

    CREATE TABLE checklist_card_universe (
      universe_card_key TEXT PRIMARY KEY,
      checklist_card_key TEXT,
      template_key TEXT,
      release_key TEXT,
      release_year INTEGER,
      card_no TEXT,
      player_name TEXT,
      player_key TEXT,
      team TEXT,
      product_family TEXT,
      card_family TEXT,
      card_class TEXT,
      variation_label TEXT,
      serial_denominator INTEGER,
      print_run REAL,
      scarcity_rank REAL,
      grade_bucket TEXT,
      first_status TEXT,
      chase_category TEXT,
      updated_at TEXT
    );

    CREATE TABLE canonical_refresh_queue (
      player_name TEXT,
      release_year INTEGER,
      status TEXT,
      error TEXT,
      last_attempt_at TEXT,
      last_success_at TEXT
    );

    CREATE TABLE canonical_cards (
      canonical_card_key TEXT PRIMARY KEY,
      player_name TEXT,
      release_year INTEGER,
      product_family TEXT,
      card_class TEXT,
      variation_label TEXT,
      grade_bucket TEXT
    );

    CREATE TABLE canonical_comp_summary (
      canonical_card_key TEXT PRIMARY KEY,
      sale_count INTEGER,
      sales_30 INTEGER,
      sales_90 INTEGER,
      twma_30 REAL,
      twma_90 REAL,
      recent_5_avg REAL,
      median_price REAL,
      avg_price REAL,
      latest_sold_at TEXT
    );
  `)

  db.prepare(
    'INSERT INTO checklist_releases (release_key, release_year, release_name, product_line, imported_at, source_path, source_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run('2026-bowman', 2026, '2026 Bowman', 'Bowman', '2026-06-25T14:00:00.000Z', '/tmp/2026.xlsx', 'abc123')
  db.prepare(
    'INSERT INTO checklist_cards (checklist_card_key, release_key, release_year, source_sheet, section, card_no, player_key, player_name, team, is_auto, chase_category, first_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('card-aiva-auto', '2026-bowman', 2026, 'Wax Pack Hero First Bowman', 'Chrome Prospect Autographs', 'CPA-AA', 'aiva arquette', 'Aiva Arquette', 'Miami Marlins', 1, 'flagship-auto', 'confirmed_1st')
  db.prepare(
    'INSERT INTO checklist_cards (checklist_card_key, release_key, release_year, source_sheet, section, card_no, player_key, player_name, team, is_auto, chase_category, first_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('card-aiva-insert', '2026-bowman', 2026, 'Wax Pack Hero First Bowman', 'Crystallized', 'BWC-1', 'aiva arquette', 'Aiva Arquette', 'Miami Marlins', 0, 'case-hit', 'unknown')
  db.prepare(
    'INSERT INTO checklist_player_signals (release_key, player_key, first_status, first_confidence, first_evidence_count) VALUES (?, ?, ?, ?, ?)',
  ).run('2026-bowman', 'aiva arquette', 'confirmed_1st', 0.9, 4)
  db.prepare('INSERT INTO checklist_variation_templates (template_key, release_key) VALUES (?, ?)').run('tmpl-base-auto', '2026-bowman')
  db.prepare('INSERT INTO checklist_variation_templates (template_key, release_key) VALUES (?, ?)').run('tmpl-refractor', '2026-bowman')
  const insertUniverse = db.prepare(`
    INSERT INTO checklist_card_universe (
      universe_card_key, checklist_card_key, template_key, release_key, release_year, card_no, player_name,
      player_key, team, product_family, card_family, card_class, variation_label, serial_denominator,
      print_run, scarcity_rank, grade_bucket, first_status, chase_category, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertUniverse.run(
    'u-aiva-base',
    'card-aiva-auto',
    'tmpl-base-auto',
    '2026-bowman',
    2026,
    'CPA-AA',
    'Aiva Arquette',
    'aiva arquette',
    'Miami Marlins',
    'Bowman Chrome',
    'Chrome Prospect Autographs',
    'auto',
    'Base Auto',
    null,
    1880,
    1880,
    'Raw',
    'confirmed_1st',
    'flagship-auto',
    '2026-06-25T14:00:00.000Z',
  )
  insertUniverse.run(
    'u-aiva-ref',
    'card-aiva-auto',
    'tmpl-refractor',
    '2026-bowman',
    2026,
    'CPA-AA',
    'Aiva Arquette',
    'aiva arquette',
    'Miami Marlins',
    'Bowman Chrome',
    'Chrome Prospect Autographs',
    'auto',
    'Refractor /499',
    499,
    null,
    499,
    'Raw',
    'confirmed_1st',
    'flagship-auto',
    '2026-06-25T14:00:00.000Z',
  )
  db.prepare('INSERT INTO canonical_refresh_queue (player_name, release_year, status) VALUES (?, ?, ?)').run('Aiva Arquette', 2026, 'queued')
  db.prepare('INSERT INTO canonical_cards (canonical_card_key, player_name, release_year, product_family, card_class, variation_label, grade_bucket) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'canon-aiva-base-auto',
    'Aiva Arquette',
    2026,
    'Bowman Chrome',
    'auto',
    'Base Auto',
    'Raw',
  )
  db.prepare('INSERT INTO canonical_comp_summary (canonical_card_key, sale_count, sales_30, sales_90, twma_30, twma_90, recent_5_avg, median_price, avg_price, latest_sold_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'canon-aiva-base-auto',
    42,
    8,
    18,
    108.5,
    103.2,
    109.1,
    105,
    106,
    '2026-06-25T14:00:00.000Z',
  )
  db.close()
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('checklist ledger proxy', () => {
  it('reports release health from the official checklist ledger', async () => {
    const env = tempEnv()
    await seedChecklistDb(env.BACKSTOP_SALES_DB ?? '')

    const response = await handleChecklistRoute('status', new Request('http://localhost/api/checklist/status'), env)
    const payload = (await response.json()) as {
      available: boolean
      cards: { total: number; players: number; flagshipAutos: number }
      universe: { total: number }
      templates: number
      firstStatuses: Array<{ status: string; players: number }>
      queue: Array<{ status: string; players: number }>
    }

    expect(response.status).toBe(200)
    expect(payload.available).toBe(true)
    expect(payload.cards).toMatchObject({ total: 2, players: 1, flagshipAutos: 1 })
    expect(payload.universe.total).toBe(2)
    expect(payload.templates).toBe(2)
    expect(payload.firstStatuses).toContainEqual({ status: 'confirmed_1st', players: 1 })
    expect(payload.queue).toContainEqual({ status: 'queued', players: 1 })
  })

  it('returns filtered official universe cards for a player', async () => {
    const env = tempEnv()
    await seedChecklistDb(env.BACKSTOP_SALES_DB ?? '')

    const response = await handleChecklistRoute(
      'universe',
      new Request('http://localhost/api/checklist/universe?player=Aiva%20Arquette&cardClass=auto'),
      env,
    )
    const payload = (await response.json()) as {
      total: number
      cards: Array<{ playerName: string; firstStatus: string; variationLabel: string; firstEvidenceCount: number }>
    }

    expect(response.status).toBe(200)
    expect(payload.total).toBe(2)
    expect(payload.cards.map((card) => card.variationLabel)).toEqual(['Base Auto', 'Refractor /499'])
    expect(payload.cards.every((card) => card.playerName === 'Aiva Arquette')).toBe(true)
    expect(payload.cards.every((card) => card.firstStatus === 'confirmed_1st')).toBe(true)
    expect(payload.cards.every((card) => card.firstEvidenceCount === 4)).toBe(true)
  })

  it('summarizes modeled coverage and prioritizes missing comp lanes', async () => {
    const env = tempEnv()
    await seedChecklistDb(env.BACKSTOP_SALES_DB ?? '')
    const sqlite = await import('node:sqlite')
    const db = new sqlite.DatabaseSync(env.BACKSTOP_SALES_DB ?? '')
    db.prepare(
      'INSERT INTO checklist_cards (checklist_card_key, release_key, release_year, source_sheet, section, card_no, player_key, player_name, team, is_auto, chase_category, first_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('card-dillon-auto', '2026-bowman', 2026, 'Wax Pack Hero First Bowman', 'Chrome Prospect Autographs', 'CPA-DL', 'dillon lewis', 'Dillon Lewis', 'Miami Marlins', 1, 'flagship-auto', 'confirmed_1st')
    db.prepare('INSERT INTO canonical_refresh_queue (player_name, release_year, status, error) VALUES (?, ?, ?, ?)').run(
      'Dillon Lewis',
      2026,
      'done',
      '',
    )
    db.close()

    const response = await handleChecklistRoute(
      'coverage',
      new Request('http://localhost/api/checklist/coverage?minYear=2026&source=waxpackhero&players=Aiva%20Arquette%7CDillon%20Lewis'),
      env,
    )
    const payload = (await response.json()) as {
      summary: { totalPlayers: number; pricedPlayers: number; missingPriceLanePlayers: number; coveragePct: number }
      nextRefresh: Array<{ playerName: string; laneState: string; action: string }>
      players: Array<{ playerName: string; basePrice: number; confidenceTier: string }>
    }

    expect(response.status).toBe(200)
    expect(payload.summary).toMatchObject({ totalPlayers: 2, pricedPlayers: 1, missingPriceLanePlayers: 1, coveragePct: 50 })
    expect(payload.players.find((player) => player.playerName === 'Aiva Arquette')).toMatchObject({
      basePrice: 108.5,
      confidenceTier: 'A',
    })
    expect(payload.nextRefresh[0]).toMatchObject({
      playerName: 'Dillon Lewis',
      laneState: 'no-clean-base',
      action: 'Try alternate query',
    })
  })

  it('holds recently checked no-lane players out of the refresh queue', async () => {
    const env = tempEnv()
    await seedChecklistDb(env.BACKSTOP_SALES_DB ?? '')
    const sqlite = await import('node:sqlite')
    const db = new sqlite.DatabaseSync(env.BACKSTOP_SALES_DB ?? '')
    db.prepare(
      'INSERT INTO checklist_cards (checklist_card_key, release_key, release_year, source_sheet, section, card_no, player_key, player_name, team, is_auto, chase_category, first_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('card-dillon-auto', '2026-bowman', 2026, 'Wax Pack Hero First Bowman', 'Chrome Prospect Autographs', 'CPA-DL', 'dillon lewis', 'Dillon Lewis', 'Miami Marlins', 1, 'flagship-auto', 'confirmed_1st')
    db.prepare('INSERT INTO canonical_refresh_queue (player_name, release_year, status, last_success_at, error) VALUES (?, ?, ?, ?, ?)').run(
      'Dillon Lewis',
      2026,
      'done',
      new Date().toISOString(),
      '',
    )
    db.close()

    const response = await handleChecklistRoute(
      'coverage',
      new Request('http://localhost/api/checklist/coverage?minYear=2026&source=waxpackhero&players=Dillon%20Lewis&retryCooldownDays=7'),
      env,
    )
    const payload = (await response.json()) as {
      nextRefresh: Array<{ playerName: string; laneState: string }>
      players: Array<{ playerName: string; laneState: string; priorityScore: number }>
    }

    expect(response.status).toBe(200)
    expect(payload.players[0]).toMatchObject({
      playerName: 'Dillon Lewis',
      laneState: 'recently-checked-no-lane',
      priorityScore: 0,
    })
    expect(payload.nextRefresh).toEqual([])
  })
})
