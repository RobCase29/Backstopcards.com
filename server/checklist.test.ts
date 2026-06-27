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
      section TEXT,
      player_key TEXT,
      player_name TEXT,
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
      status TEXT
    );
  `)

  db.prepare(
    'INSERT INTO checklist_releases (release_key, release_year, release_name, product_line, imported_at, source_path, source_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run('2026-bowman', 2026, '2026 Bowman', 'Bowman', '2026-06-25T14:00:00.000Z', '/tmp/2026.xlsx', 'abc123')
  db.prepare(
    'INSERT INTO checklist_cards (checklist_card_key, release_key, section, player_key, player_name, is_auto, chase_category, first_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('card-aiva-auto', '2026-bowman', 'Chrome Prospect Autographs', 'aiva arquette', 'Aiva Arquette', 1, 'flagship-auto', 'confirmed_1st')
  db.prepare(
    'INSERT INTO checklist_cards (checklist_card_key, release_key, section, player_key, player_name, is_auto, chase_category, first_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('card-aiva-insert', '2026-bowman', 'Crystallized', 'aiva arquette', 'Aiva Arquette', 0, 'case-hit', 'unknown')
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
})
