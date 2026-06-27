import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { createCanonicalMarketSchema } from './canonical-market.mjs'
import { createChecklistLedgerSchema, importChecklistWorkbook, normalizePlayerKey, summarizeChecklistLedger } from './checklist-ledger.mjs'

const cwd = process.cwd()
const defaultWorkbook = '/Users/rc3/Downloads/2026-Bowman-Baseball-Checklist.xlsx'
const defaultDbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))
const defaultReportFile = resolve(cwd, 'local-data/checklists/2026-bowman-checklist-ledger.json')

function argValue(name, fallback = null) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function queueScopeAllows(scope, row) {
  if (scope === 'all') return true
  if (scope === 'autos') return /auto/.test(row.cardClass)
  if (scope === 'flagship-autos') return row.chaseCategory === 'flagship-auto'
  if (scope === 'first-autos') return /auto/.test(row.cardClass) && ['confirmed_1st', 'likely_1st', 'unknown'].includes(row.firstStatus)
  return true
}

function queueWeight(row) {
  const category = {
    'flagship-auto': 95,
    'parallel-auto': 88,
    auto: 74,
    'chrome-prospect': 44,
    'paper-prospect': 35,
    'case-hit': 30,
    insert: 12,
    base: 4,
    support: 1,
  }[row.chaseCategory]
  const firstBoost = row.firstStatus === 'confirmed_1st' ? 32 : row.firstStatus === 'likely_1st' ? 20 : row.firstStatus === 'unknown' ? 4 : 0
  const evidenceBoost = Math.min(10, Number(row.firstEvidenceCount ?? 0))
  return (category ?? 1) + firstBoost + evidenceBoost
}

function seedRefreshQueue(db, releaseKey, scope) {
  createCanonicalMarketSchema(db)
  const release = db.prepare('SELECT release_year AS releaseYear FROM checklist_releases WHERE release_key = ?').get(releaseKey)
  if (!release) return { queuedPlayers: 0, inserted: 0, updated: 0, topQueue: [] }
  const rows = db.prepare(`
    SELECT
      player_name AS playerName,
      player_key AS playerKey,
      card_class AS cardClass,
      chase_category AS chaseCategory,
      first_status AS firstStatus,
      first_evidence_count AS firstEvidenceCount
    FROM checklist_cards
    WHERE release_key = ?
  `).all(releaseKey)
  const players = new Map()
  for (const row of rows) {
    if (!queueScopeAllows(scope, row)) continue
    const key = row.playerKey || normalizePlayerKey(row.playerName)
    const current =
      players.get(key) ??
      {
        playerName: row.playerName,
        releaseYear: release.releaseYear,
        priority: 0,
        cards: 0,
        firstStatus: row.firstStatus,
        chaseCategories: new Set(),
      }
    current.priority = Math.max(current.priority, queueWeight(row))
    current.cards += 1
    current.chaseCategories.add(row.chaseCategory)
    if (current.firstStatus !== 'confirmed_1st' && row.firstStatus === 'confirmed_1st') current.firstStatus = row.firstStatus
    players.set(key, current)
  }
  const queueRows = [...players.values()]
    .map((row) => ({
      ...row,
      priority: Number((row.priority + Math.min(12, row.cards) * 0.8).toFixed(3)),
      chaseCategories: [...row.chaseCategories].sort(),
    }))
    .sort((left, right) => right.priority - left.priority || left.playerName.localeCompare(right.playerName))

  const existing = db.prepare('SELECT player_name AS playerName, release_year AS releaseYear, status FROM canonical_refresh_queue').all()
  const existingStatus = new Map(existing.map((row) => [`${normalizePlayerKey(row.playerName)}:${row.releaseYear}`, row.status]))
  const nowIso = new Date().toISOString()
  const upsert = db.prepare(`
    INSERT INTO canonical_refresh_queue (player_name, release_year, priority, status, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(player_name, release_year) DO UPDATE SET
      priority=excluded.priority,
      status=CASE
        WHEN canonical_refresh_queue.status = 'done' THEN canonical_refresh_queue.status
        ELSE excluded.status
      END,
      updated_at=excluded.updated_at
  `)
  let inserted = 0
  let updated = 0
  for (const row of queueRows) {
    const key = `${normalizePlayerKey(row.playerName)}:${row.releaseYear}`
    if (existingStatus.has(key)) updated += 1
    else inserted += 1
    upsert.run(row.playerName, row.releaseYear, row.priority, existingStatus.get(key) === 'done' ? 'done' : 'queued', nowIso)
  }
  return { queuedPlayers: queueRows.length, inserted, updated, topQueue: queueRows.slice(0, 40) }
}

function usage() {
  return [
    'Usage: node scripts/import-bowman-checklist.mjs --workbook=/path/file.xlsx --year=2026 --name="2026 Bowman" [--release-key=2026-bowman] [--seed-queue]',
    '',
    'Queue scopes: all, autos, flagship-autos, first-autos',
  ].join('\n')
}

if (hasFlag('--help')) {
  console.log(usage())
  process.exit(0)
}

const workbookFile = resolve(argValue('--workbook', defaultWorkbook))
if (!existsSync(workbookFile)) {
  console.error(`Workbook not found: ${workbookFile}`)
  process.exit(1)
}

const dbFile = resolve(argValue('--db', defaultDbFile))
const reportFile = resolve(argValue('--report', defaultReportFile))
const releaseYear = Number(argValue('--year', '2026')) || 2026
const releaseName = compact(argValue('--name', `${releaseYear} Bowman`))
const releaseKey = compact(argValue('--release-key', `${releaseYear}-bowman`))
const queueScope = compact(argValue('--queue-scope', 'first-autos'))
const seedQueue = hasFlag('--seed-queue')

mkdirSync(dirname(dbFile), { recursive: true })
const db = new DatabaseSync(dbFile)
createChecklistLedgerSchema(db)

let result
let queue = null
db.exec('BEGIN')
try {
  result = importChecklistWorkbook(db, {
    workbookFile,
    releaseYear,
    releaseName,
    releaseKey,
    prune: true,
    pruneTemplates: true,
  })
  if (seedQueue) queue = seedRefreshQueue(db, result.releaseKey, queueScope)
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  db.close()
  throw error
}

const summary = summarizeChecklistLedger(db)
db.close()

const payload = {
  importedAt: new Date().toISOString(),
  workbookFile,
  dbFile,
  result,
  queue,
  summary: {
    ...summary,
    sections: summary.sections.slice(0, 30),
  },
}

mkdirSync(dirname(reportFile), { recursive: true })
writeFileSync(reportFile, `${JSON.stringify(payload, null, 2)}\n`)

console.log(JSON.stringify({ ...payload, reportFile }, null, 2))
