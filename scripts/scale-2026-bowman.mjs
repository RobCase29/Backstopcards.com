import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { rebuildCanonicalMarket, summarizeCanonicalMarket } from './canonical-market.mjs'

const cwd = process.cwd()
const dbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))

function parseArgs(values) {
  const flags = new Set()
  const options = new Map()
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith('--')) continue
    const raw = value.slice(2)
    const equalsIndex = raw.indexOf('=')
    if (equalsIndex >= 0) {
      options.set(raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1))
    } else if (values[index + 1] && !values[index + 1].startsWith('--')) {
      options.set(raw, values[index + 1])
      index += 1
    } else {
      flags.add(raw)
    }
  }
  return { flags, options }
}

const parsed = parseArgs(process.argv.slice(2))

function flag(name) {
  return parsed.flags.has(name)
}

function option(name, fallback = '') {
  const value = parsed.options.get(name)
  return value == null || value === '' ? fallback : value
}

function intOption(name, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!parsed.options.has(name)) return fallback
  const rawValue = option(name, '')
  if (rawValue === '') return fallback
  const parsedValue = Number(rawValue)
  if (!Number.isFinite(parsedValue)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsedValue)))
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function tableExists(db, tableName) {
  return Boolean(
    db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        LIMIT 1
      `,
      )
      .get(tableName),
  )
}

function rowNumber(row, key) {
  const parsed = Number(row?.[key])
  return Number.isFinite(parsed) ? parsed : 0
}

function rowString(row, key) {
  const value = row?.[key]
  return value == null ? '' : String(value)
}

function rowsOrEmpty(db, tableName, query, ...params) {
  if (!tableExists(db, tableName)) return []
  return db.prepare(query).all(...params)
}

function getOrEmpty(db, tableName, query, ...params) {
  if (!tableExists(db, tableName)) return {}
  return db.prepare(query).get(...params) ?? {}
}

function queueRows(db, year, limit) {
  if (!tableExists(db, 'canonical_refresh_queue')) return []
  return db
    .prepare(
      `
        SELECT player_name AS playerName, release_year AS releaseYear, priority, status, error, last_success_at AS lastSuccessAt
        FROM canonical_refresh_queue
        WHERE release_year = ?
          AND status != 'done'
        ORDER BY priority DESC, player_name
        LIMIT ?
      `,
    )
    .all(year, limit)
}

function snapshot(db, year) {
  const queue = rowsOrEmpty(
    db,
    'canonical_refresh_queue',
    `
      SELECT status, COUNT(*) AS players, MAX(updated_at) AS updatedAt
      FROM canonical_refresh_queue
      WHERE release_year = ?
      GROUP BY status
      ORDER BY players DESC
    `,
    year,
  )
  const checklist = tableExists(db, 'checklist_cards')
    ? db
        .prepare(
          `
            SELECT
              COUNT(*) AS cards,
              COUNT(DISTINCT player_key) AS players,
              COALESCE(SUM(CASE WHEN is_auto = 1 THEN 1 ELSE 0 END), 0) AS autoCards,
              COALESCE(SUM(CASE WHEN first_status = 'confirmed_1st' THEN 1 ELSE 0 END), 0) AS confirmedFirstCards
            FROM checklist_cards
            WHERE release_year = ?
          `,
        )
        .get(year)
    : {}
  const cardHedge = tableExists(db, 'card_hedge_sales') && tableExists(db, 'canonical_refresh_queue')
    ? db
        .prepare(
          `
            SELECT
              COUNT(DISTINCT s.player_name) AS players,
              COUNT(DISTINCT s.card_id) AS cards,
              COUNT(*) AS sales,
              MAX(s.sold_at) AS latestSoldAt,
              MAX(s.imported_at) AS latestImportedAt
            FROM card_hedge_sales s
            JOIN canonical_refresh_queue q
              ON lower(q.player_name) = lower(s.player_name)
             AND q.release_year = ?
          `,
        )
        .get(year)
    : {}
  const canonical = tableExists(db, 'canonical_cards') && tableExists(db, 'canonical_comp_summary')
    ? db
        .prepare(
          `
            SELECT
              COUNT(DISTINCT c.canonical_card_key) AS lanes,
              COUNT(DISTINCT c.player_name) AS players,
              COALESCE(SUM(s.sale_count), 0) AS sales,
              MAX(s.latest_sold_at) AS latestSoldAt,
              MAX(s.updated_at) AS updatedAt
            FROM canonical_cards c
            LEFT JOIN canonical_comp_summary s ON s.canonical_card_key = c.canonical_card_key
            WHERE c.release_year = ?
          `,
        )
        .get(year)
    : {}
  const baseAnchors = tableExists(db, 'canonical_cards') && tableExists(db, 'canonical_comp_summary')
    ? db
        .prepare(
          `
            SELECT COUNT(*) AS lanes, COUNT(DISTINCT c.player_name) AS players, COALESCE(SUM(s.sale_count), 0) AS sales
            FROM canonical_cards c
            JOIN canonical_comp_summary s ON s.canonical_card_key = c.canonical_card_key
            WHERE c.release_year = ?
              AND c.card_class = 'auto'
              AND c.grade_bucket = 'Raw'
              AND c.variation_label = 'Base Auto'
          `,
        )
        .get(year)
    : {}
  const usage = getOrEmpty(
    db,
    'card_hedge_api_calls',
    `
      SELECT COUNT(*) AS calls, MAX(requested_at) AS latestCallAt
      FROM card_hedge_api_calls
      WHERE requested_at >= ?
    `,
    new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())).toISOString(),
  )

  return {
    year,
    queue: queue.map((row) => ({
      status: rowString(row, 'status'),
      players: rowNumber(row, 'players'),
      updatedAt: rowString(row, 'updatedAt'),
    })),
    nextQueue: queueRows(db, year, 20).map((row) => ({
      playerName: rowString(row, 'playerName'),
      priority: rowNumber(row, 'priority'),
      status: rowString(row, 'status'),
      error: rowString(row, 'error'),
      lastSuccessAt: rowString(row, 'lastSuccessAt'),
    })),
    checklist: {
      cards: rowNumber(checklist, 'cards'),
      players: rowNumber(checklist, 'players'),
      autoCards: rowNumber(checklist, 'autoCards'),
      confirmedFirstCards: rowNumber(checklist, 'confirmedFirstCards'),
    },
    cardHedge: {
      players: rowNumber(cardHedge, 'players'),
      cards: rowNumber(cardHedge, 'cards'),
      sales: rowNumber(cardHedge, 'sales'),
      latestSoldAt: rowString(cardHedge, 'latestSoldAt'),
      latestImportedAt: rowString(cardHedge, 'latestImportedAt'),
    },
    canonical: {
      players: rowNumber(canonical, 'players'),
      lanes: rowNumber(canonical, 'lanes'),
      sales: rowNumber(canonical, 'sales'),
      latestSoldAt: rowString(canonical, 'latestSoldAt'),
      updatedAt: rowString(canonical, 'updatedAt'),
    },
    baseAnchors: {
      players: rowNumber(baseAnchors, 'players'),
      lanes: rowNumber(baseAnchors, 'lanes'),
      sales: rowNumber(baseAnchors, 'sales'),
    },
    cardHedgeUsageToday: {
      calls: rowNumber(usage, 'calls'),
      latestCallAt: rowString(usage, 'latestCallAt'),
    },
  }
}

function runCommand(args, options = {}) {
  console.log(`\n${process.execPath} ${args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(' ')}`)
  if (options.dryRun) return { status: 0, skipped: true }
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  return {
    status: result.status ?? 1,
    signal: result.signal,
    skipped: false,
  }
}

const year = intOption('year', 2026, 2020, 2035)
const batchSize = intOption('batch-size', intOption('limit', 12, 1, 80), 1, 80)
const batches = flag('full') ? 999 : intOption('batches', 1, 1, 999)
const rpm = intOption('rpm', Number(process.env.CARD_HEDGE_RATE_LIMIT_PER_MINUTE ?? 80) || 80, 1, 500)
const count = intOption('count', 100, 1, 100)
const maxCards = intOption('max-cards', 120, 1, 300)
const maxConsecutiveFailures = intOption('max-consecutive-failures', 3, 1, 50)
const grades = compact(option('grades', 'Raw')) || 'Raw'
const compScope = compact(option('comp-scope', 'market-signals')).toLowerCase() === 'all' ? 'all' : 'market-signals'
const rawCardScope = compact(option('card-scope', 'base-auto-first')).toLowerCase()
const cardScope = rawCardScope === 'all' || rawCardScope === 'auto' || rawCardScope === 'base-auto-first' ? rawCardScope : 'base-auto-first'
const statuses = compact(option('status', 'queued,error')) || 'queued,error'
const dryRun = flag('dry-run')
const resetRunning = flag('reset-running')
const resetErrors = flag('reset-errors')
const refreshFirsts = flag('refresh-firsts')

mkdirSync(dirname(dbFile), { recursive: true })
const db = new DatabaseSync(dbFile)
const before = snapshot(db, year)

console.log(
  JSON.stringify(
    {
      action: dryRun ? 'scale-2026-bowman-dry-run' : 'scale-2026-bowman',
      dbFile,
      year,
      batchSize,
      batches: flag('full') ? 'full' : batches,
      rpm,
      count,
      maxCards,
      maxConsecutiveFailures,
      grades,
      compScope,
      cardScope,
      statuses,
      resetErrors,
      before: {
        queue: before.queue,
        cardHedge: before.cardHedge,
        canonical: before.canonical,
        baseAnchors: before.baseAnchors,
        nextQueue: before.nextQueue.slice(0, 10),
      },
    },
    null,
    2,
  ),
)

const runs = []
if (refreshFirsts) {
  const result = runCommand(
    ['scripts/import-first-bowman-source.mjs', '--release-key', `${year}-bowman`, '--year', String(year), '--seed-queue'],
    { dryRun },
  )
  runs.push({ command: 'import-first-bowman-source', result })
  if (result.status !== 0) {
    db.close()
    process.exit(result.status)
  }
}

for (let batch = 0; batch < batches; batch += 1) {
  const pending = queueRows(db, year, 1)
  if (!pending.length) break
  const args = [
    'scripts/card-hedge-queue-sync.mjs',
    '--year',
    String(year),
    '--limit',
    String(batchSize),
    '--status',
    statuses,
    '--grades',
    grades,
    '--comp-scope',
    compScope,
    '--card-scope',
    cardScope,
    '--count',
    String(count),
    '--max-cards',
    String(maxCards),
    '--max-consecutive-failures',
    String(maxConsecutiveFailures),
    '--rpm',
    String(rpm),
    '--skip-final-canonical',
  ]
  if (resetRunning && batch === 0) args.push('--reset-running')
  if (resetErrors && batch === 0) args.push('--reset-errors')
  if (dryRun) args.push('--dry-run')

  const result = runCommand(args)
  runs.push({ command: 'card-hedge-queue-sync', batch: batch + 1, result })
  if (result.status !== 0) {
    db.close()
    process.exit(result.status)
  }
  if (dryRun) break
}

let canonical = null
if (!dryRun) {
  db.exec('BEGIN')
  try {
    const rebuild = rebuildCanonicalMarket(db)
    canonical = { rebuild, summary: summarizeCanonicalMarket(db) }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    db.close()
    throw error
  }
}

const after = snapshot(db, year)
const report = {
  generatedAt: new Date().toISOString(),
  dbFile,
  options: {
    year,
    batchSize,
    batches: flag('full') ? 'full' : batches,
    rpm,
    count,
    maxCards,
    maxConsecutiveFailures,
    grades,
    compScope,
    cardScope,
    statuses,
    dryRun,
    resetErrors,
  },
  before,
  after,
  delta: {
    cardHedgePlayers: after.cardHedge.players - before.cardHedge.players,
    cardHedgeSales: after.cardHedge.sales - before.cardHedge.sales,
    canonicalPlayers: after.canonical.players - before.canonical.players,
    canonicalLanes: after.canonical.lanes - before.canonical.lanes,
    canonicalSales: after.canonical.sales - before.canonical.sales,
    baseAnchorPlayers: after.baseAnchors.players - before.baseAnchors.players,
    usageCalls: after.cardHedgeUsageToday.calls - before.cardHedgeUsageToday.calls,
  },
  runs,
  canonical,
}
const reportFile = resolve(
  cwd,
  'local-data/reports',
  `${year}-bowman-scale-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
)
mkdirSync(dirname(reportFile), { recursive: true })
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`)
db.close()

console.log(JSON.stringify({ reportFile, delta: report.delta, after: report.after }, null, 2))
