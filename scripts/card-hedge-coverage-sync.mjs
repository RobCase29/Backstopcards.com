import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

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

function textOption(name, fallback = '') {
  const value = parsed.options.get(name)
  return value == null || value === '' ? fallback : String(value)
}

function numberOption(name, fallback, min = 1, max = Number.POSITIVE_INFINITY) {
  const raw = textOption(name, '')
  if (raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function cardScopeOption(fallback = 'base-auto-first') {
  const raw = compact(textOption('card-scope', fallback)).toLowerCase()
  return raw === 'all' || raw === 'auto' || raw === 'base-auto-first' ? raw : fallback
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName))
}

function columnExists(db, tableName, columnName) {
  return tableExists(db, tableName) && db.prepare(`PRAGMA table_info(${tableName})`).all().some((row) => row.name === columnName)
}

function ageDays(value) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 86_400_000)) : null
}

function latestCheckedDays(row) {
  return ageDays(compact(row.lastSuccessAt) || compact(row.lastAttemptAt))
}

function laneState(row, staleDays, retryCooldownDays) {
  const price = Number(row.basePrice) || 0
  const saleCount = Number(row.baseSaleCount) || 0
  const status = compact(row.queueStatus) || 'unqueued'
  const error = compact(row.queueError)
  const days = ageDays(row.latestSoldAt)
  const checkedDays = latestCheckedDays(row)
  const recentlyChecked = retryCooldownDays > 0 && status === 'done' && checkedDays !== null && checkedDays <= retryCooldownDays
  if (recentlyChecked && price > 0) return 'recently-checked'
  if (recentlyChecked) return 'recently-checked-no-lane'
  if (price > 0 && days !== null && days > staleDays) return 'stale'
  if (price > 0 && saleCount > 0 && saleCount < 5) return 'thin'
  if (price > 0) return 'priced'
  if (status === 'running') return 'running'
  if (/timeout/i.test(error) || status === 'timeout') return 'timeout'
  if (status === 'error') return 'error'
  if (status === 'done') return 'no-clean-base'
  if (status === 'queued') return 'queued'
  return 'missing'
}

function priorityScore(row, staleDays, retryCooldownDays) {
  const state = laneState(row, staleDays, retryCooldownDays)
  const releaseYear = Number(row.releaseYear) || 0
  const saleCount = Number(row.baseSaleCount) || 0
  const base = {
    timeout: 96,
    error: 92,
    missing: 88,
    queued: 84,
    'no-clean-base': 74,
    stale: 58,
    thin: 48,
    'recently-checked': 0,
    'recently-checked-no-lane': 0,
    running: 0,
    priced: 0,
  }[state] ?? 0
  if (base <= 0) return 0
  return Math.round(base + Math.max(0, releaseYear - 2020) * 1.5 + Math.min(8, saleCount / 6))
}

function coverageRows(db, options) {
  const hasSourceSheet = columnExists(db, 'checklist_cards', 'source_sheet')
  const hasQueue = tableExists(db, 'canonical_refresh_queue')
  const queueHasError = columnExists(db, 'canonical_refresh_queue', 'error')
  const queueHasLastAttempt = columnExists(db, 'canonical_refresh_queue', 'last_attempt_at')
  const queueHasLastSuccess = columnExists(db, 'canonical_refresh_queue', 'last_success_at')
  const sourceFilter = options.source === 'waxpackhero' && hasSourceSheet ? "AND c.source_sheet = 'Wax Pack Hero First Bowman'" : ''
  const playerNames = options.players.length ? options.players.map((player) => player.toLowerCase()) : []
  const playerFilter = playerNames.length ? `AND lower(c.player_name) IN (${playerNames.map(() => '?').join(', ')})` : ''
  const queueSelect = hasQueue
    ? `COALESCE(q.status, 'unqueued') AS queueStatus,
       ${queueHasError ? "COALESCE(q.error, '')" : "''"} AS queueError,
       ${queueHasLastAttempt ? "COALESCE(q.last_attempt_at, '')" : "''"} AS lastAttemptAt,
       ${queueHasLastSuccess ? "COALESCE(q.last_success_at, '')" : "''"} AS lastSuccessAt`
    : "'unqueued' AS queueStatus, '' AS queueError, '' AS lastAttemptAt, '' AS lastSuccessAt"
  const queueJoin = hasQueue
    ? `LEFT JOIN canonical_refresh_queue q
         ON q.release_year = p.release_year AND lower(q.player_name) = lower(p.player_name)`
    : ''

  return db.prepare(`
    WITH checklist_players AS (
      SELECT
        r.release_year,
        r.release_name,
        c.player_key,
        MAX(c.player_name) AS player_name
      FROM checklist_cards c
      JOIN checklist_releases r ON r.release_key = c.release_key
      WHERE r.release_year >= ?
        ${sourceFilter}
        ${playerFilter}
      GROUP BY r.release_year, r.release_name, c.player_key
    ),
    base_candidates AS (
      SELECT
        cc.release_year,
        lower(cc.player_name) AS player_lookup,
        s.sale_count,
        s.sales_30,
        s.sales_90,
        COALESCE(NULLIF(s.twma_30, 0), NULLIF(s.recent_5_avg, 0), NULLIF(s.twma_90, 0), NULLIF(s.median_price, 0), NULLIF(s.avg_price, 0), 0) AS base_price,
        s.latest_sold_at,
        ROW_NUMBER() OVER (
          PARTITION BY cc.release_year, lower(cc.player_name)
          ORDER BY CASE WHEN lower(cc.product_family) LIKE '%chrome%' THEN 0 ELSE 1 END, s.sale_count DESC, s.sales_30 DESC, s.latest_sold_at DESC
        ) AS rn
      FROM canonical_cards cc
      JOIN canonical_comp_summary s ON s.canonical_card_key = cc.canonical_card_key
      WHERE cc.release_year >= ?
        AND cc.grade_bucket = 'Raw'
        AND cc.card_class IN ('auto', 'paper-auto')
        AND cc.variation_label IN ('Base Auto', 'Base', '')
        AND s.sale_count > 0
    )
    SELECT
      p.player_name AS playerName,
      p.release_year AS releaseYear,
      p.release_name AS releaseName,
      COALESCE(b.base_price, 0) AS basePrice,
      COALESCE(b.sale_count, 0) AS baseSaleCount,
      COALESCE(b.sales_30, 0) AS baseSales30,
      COALESCE(b.sales_90, 0) AS baseSales90,
      COALESCE(b.latest_sold_at, '') AS latestSoldAt,
      ${queueSelect}
    FROM checklist_players p
    LEFT JOIN base_candidates b
      ON b.release_year = p.release_year AND b.player_lookup = lower(p.player_name) AND b.rn = 1
    ${queueJoin}
  `).all(options.minYear, ...playerNames, options.minYear)
}

function setQueueStatus(db, task, status, fields = {}) {
  if (!tableExists(db, 'canonical_refresh_queue')) return
  const nowIso = new Date().toISOString()
  db.prepare(`
    INSERT INTO canonical_refresh_queue (player_name, release_year, priority, status, last_attempt_at, last_success_at, error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_name, release_year) DO UPDATE SET
      priority = MAX(canonical_refresh_queue.priority, excluded.priority),
      status = excluded.status,
      last_attempt_at = COALESCE(excluded.last_attempt_at, canonical_refresh_queue.last_attempt_at),
      last_success_at = COALESCE(excluded.last_success_at, canonical_refresh_queue.last_success_at),
      error = excluded.error,
      updated_at = excluded.updated_at
  `).run(
    task.playerName,
    task.releaseYear,
    task.priorityScore,
    status,
    fields.lastAttemptAt ?? null,
    fields.lastSuccessAt ?? null,
    fields.error ?? '',
    nowIso,
  )
}

function resetRunningTasks(db, options) {
  if (!tableExists(db, 'canonical_refresh_queue')) return 0
  const playerNames = options.players.length ? options.players.map((player) => player.toLowerCase()) : []
  const playerFilter = playerNames.length ? `AND lower(player_name) IN (${playerNames.map(() => '?').join(', ')})` : ''
  const nowIso = new Date().toISOString()
  const result = db.prepare(`
    UPDATE canonical_refresh_queue
    SET status = 'queued',
      error = '',
      updated_at = ?
    WHERE release_year >= ?
      AND status = 'running'
      ${playerFilter}
  `).run(nowIso, options.minYear, ...playerNames)
  return Number(result.changes) || 0
}

function runCommand(args, options = {}) {
  console.log(`\n${process.execPath} ${args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(' ')}`)
  if (options.dryRun) return { status: 0, skipped: true }
  return spawnSync(process.execPath, args, {
    stdio: 'inherit',
    timeout: options.timeoutMs,
  })
}

const options = {
  minYear: numberOption('min-year', 2020, 1900, 9999),
  staleDays: numberOption('stale-days', 60, 7, 730),
  retryCooldownDays: numberOption('retry-cooldown-days', 7, 0, 90),
  limit: numberOption('limit', 20, 1, 500),
  source: compact(textOption('source', 'waxpackhero')),
  players: textOption('players', '')
    .split(/[|\n,]+/)
    .map(compact)
    .filter(Boolean),
  grades: compact(textOption('grades', 'Raw')) || 'Raw',
  count: numberOption('count', 40, 1, 100),
  maxCards: numberOption('max-cards', 80, 1, 180),
  rpm: numberOption('rpm', process.env.CARD_HEDGE_RATE_LIMIT_PER_MINUTE ?? 80, 1, 500),
  timeoutMs: numberOption('timeout-ms', 60_000, 10_000, 300_000),
  compScope: compact(textOption('comp-scope', 'market-signals')) === 'all' ? 'all' : 'market-signals',
  cardScope: cardScopeOption(),
  dryRun: flag('dry-run'),
  resetRunning: flag('reset-running'),
  skipFinalCanonical: flag('skip-final-canonical'),
  skipSnapshot: flag('skip-snapshot'),
}

const db = new DatabaseSync(dbFile)
if (!tableExists(db, 'checklist_cards') || !tableExists(db, 'canonical_cards') || !tableExists(db, 'canonical_comp_summary')) {
  db.close()
  throw new Error('Coverage sync requires checklist and canonical market tables.')
}

let resetRunning = 0
if (options.resetRunning && !options.dryRun) resetRunning = resetRunningTasks(db, options)

const rows = coverageRows(db, options)
  .map((row) => ({
    ...row,
    releaseYear: Number(row.releaseYear) || options.minYear,
    laneState: laneState(row, options.staleDays, options.retryCooldownDays),
    priorityScore: priorityScore(row, options.staleDays, options.retryCooldownDays),
  }))
  .filter((row) => row.priorityScore > 0 && row.laneState !== 'running' && row.laneState !== 'priced')
  .sort((left, right) => right.priorityScore - left.priorityScore || right.releaseYear - left.releaseYear || String(left.playerName).localeCompare(String(right.playerName)))
  .slice(0, options.limit)

console.log(JSON.stringify({
  action: options.dryRun ? 'coverage-sync-dry-run' : 'coverage-sync',
  dbFile,
  options,
  resetRunning,
  targets: rows.map((row) => ({
    playerName: row.playerName,
    releaseYear: row.releaseYear,
    laneState: row.laneState,
    priorityScore: row.priorityScore,
  })),
}, null, 2))

let completed = 0
let failed = 0
for (const row of rows) {
  const task = {
    playerName: compact(row.playerName),
    releaseYear: Number(row.releaseYear) || options.minYear,
    priorityScore: Number(row.priorityScore) || 0,
  }
  const attemptAt = new Date().toISOString()
  if (!options.dryRun) setQueueStatus(db, task, 'running', { lastAttemptAt: attemptAt, error: '' })
  const result = runCommand([
    'scripts/card-hedge-player-sync.mjs',
    '--player',
    task.playerName,
    '--year',
    String(task.releaseYear),
    '--grades',
    options.grades,
    '--count',
    String(options.count),
    '--max-cards',
    String(options.maxCards),
    '--rpm',
    String(options.rpm),
    '--comp-scope',
    options.compScope,
    '--card-scope',
    options.cardScope,
    '--skip-canonical',
  ], { dryRun: options.dryRun, timeoutMs: options.timeoutMs })

  if (result.status === 0) {
    completed += 1
    if (!options.dryRun) setQueueStatus(db, task, 'done', { lastAttemptAt: attemptAt, lastSuccessAt: new Date().toISOString(), error: '' })
  } else {
    failed += 1
    const status = result.error?.code === 'ETIMEDOUT' ? 'timeout' : 'error'
    if (!options.dryRun) setQueueStatus(db, task, status, { lastAttemptAt: attemptAt, error: status })
  }
}

db.close()

if (!options.dryRun && !options.skipFinalCanonical) {
  runCommand(['scripts/rebuild-canonical-market.mjs'])
  if (!options.skipSnapshot) runCommand(['scripts/export-static-checklist-snapshot.mjs'])
}

console.log(JSON.stringify({ completed, failed }, null, 2))
if (failed > 0) process.exitCode = 1
