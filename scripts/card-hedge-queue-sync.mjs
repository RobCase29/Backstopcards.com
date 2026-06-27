import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createCanonicalMarketSchema, rebuildCanonicalMarket, summarizeCanonicalMarket } from './canonical-market.mjs'

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

const parsedArgs = parseArgs(process.argv.slice(2))

function flag(name) {
  return parsedArgs.flags.has(name)
}

function stringOption(name, fallback = '') {
  const value = parsedArgs.options.get(name)
  return value == null || value === '' ? fallback : value
}

function numberOption(name, fallback) {
  const value = Number(stringOption(name, ''))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function statusList() {
  return stringOption('status', 'queued,error')
    .split(',')
    .map(compact)
    .filter(Boolean)
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

function queuedPlayers(db, options) {
  const statuses = options.statuses.length ? options.statuses : ['queued']
  const placeholders = statuses.map(() => '?').join(', ')
  const params = [options.year, ...statuses]
  let sql = `
    SELECT player_name AS playerName, release_year AS releaseYear, priority, status
    FROM canonical_refresh_queue
    WHERE release_year = ?
      AND status IN (${placeholders})
  `
  if (options.player) {
    sql += ' AND player_name LIKE ?'
    params.push(`%${options.player}%`)
  }
  sql += ' ORDER BY priority DESC, player_name LIMIT ?'
  params.push(options.limit)
  return db.prepare(sql).all(...params)
}

function setQueueStatus(db, task, status, fields = {}) {
  const nowIso = new Date().toISOString()
  db.prepare(
    `
    UPDATE canonical_refresh_queue
    SET status = ?,
      last_attempt_at = COALESCE(?, last_attempt_at),
      last_success_at = COALESCE(?, last_success_at),
      error = ?,
      updated_at = ?
    WHERE player_name = ?
      AND release_year = ?
  `,
  ).run(
    status,
    fields.lastAttemptAt ?? null,
    fields.lastSuccessAt ?? null,
    fields.error ?? '',
    nowIso,
    task.playerName,
    task.releaseYear,
  )
}

function resetRunningTasks(db, year) {
  const nowIso = new Date().toISOString()
  return db
    .prepare(
      `
      UPDATE canonical_refresh_queue
      SET status = 'queued',
        error = '',
        updated_at = ?
      WHERE release_year = ?
        AND status = 'running'
    `,
    )
    .run(nowIso, year)
}

function resetErrorTasks(db, year) {
  const nowIso = new Date().toISOString()
  return db
    .prepare(
      `
      UPDATE canonical_refresh_queue
      SET status = 'queued',
        error = '',
        updated_at = ?
      WHERE release_year = ?
        AND status = 'error'
    `,
    )
    .run(nowIso, year)
}

function syncPlayer(task, options) {
  const args = [
    'scripts/card-hedge-player-sync.mjs',
    '--player',
    task.playerName,
    '--year',
    String(task.releaseYear || options.year),
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
    '--skip-canonical',
  ]
  if (options.reclassifyOnly) args.push('--reclassify-only')
  if (options.skipComps) args.push('--skip-comps')

  console.log(`\n${process.execPath} ${args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(' ')}`)
  if (options.dryRun) return { ok: true, skipped: true, status: 0 }

  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    signal: result.signal,
  }
}

const options = {
  year: numberOption('year', 2026),
  limit: Math.max(1, numberOption('limit', 5)),
  statuses: statusList(),
  player: compact(stringOption('player', '')),
  grades: compact(stringOption('grades', 'Raw')) || 'Raw',
  compScope: compact(stringOption('comp-scope', 'market-signals')).toLowerCase() === 'all' ? 'all' : 'market-signals',
  count: Math.min(100, Math.max(1, numberOption('count', 100))),
  maxCards: Math.max(1, numberOption('max-cards', 120)),
  rpm: Math.min(500, Math.max(1, numberOption('rpm', process.env.CARD_HEDGE_RATE_LIMIT_PER_MINUTE ?? 80))),
  dryRun: flag('dry-run'),
  resetRunning: flag('reset-running'),
  resetErrors: flag('reset-errors'),
  reclassifyOnly: flag('reclassify-only'),
  skipComps: flag('skip-comps'),
  skipFinalCanonical: flag('skip-final-canonical'),
  maxConsecutiveFailures: Math.max(1, numberOption('max-consecutive-failures', 3)),
}

const db = new DatabaseSync(dbFile)
createCanonicalMarketSchema(db)

if (!tableExists(db, 'canonical_refresh_queue')) {
  db.close()
  throw new Error('canonical_refresh_queue does not exist. Import a checklist with --seed-queue first.')
}

if (options.resetRunning && !options.dryRun) {
  const result = resetRunningTasks(db, options.year)
  console.log(JSON.stringify({ resetRunning: Number(result.changes) || 0 }, null, 2))
}

if (options.resetErrors && !options.dryRun) {
  const result = resetErrorTasks(db, options.year)
  console.log(JSON.stringify({ resetErrors: Number(result.changes) || 0 }, null, 2))
}

const tasks = queuedPlayers(db, options).map((row) => ({
  playerName: compact(row.playerName),
  releaseYear: Number(row.releaseYear) || options.year,
  priority: Number(row.priority) || 0,
  status: compact(row.status),
}))

console.log(
  JSON.stringify(
    {
      action: options.dryRun ? 'card-hedge-queue-dry-run' : 'card-hedge-queue-sync',
      dbFile,
      year: options.year,
      limit: options.limit,
      statuses: options.statuses,
      player: options.player || null,
      grades: options.grades,
      compScope: options.compScope,
      count: options.count,
      maxCards: options.maxCards,
      rpm: options.rpm,
      maxConsecutiveFailures: options.maxConsecutiveFailures,
      resetErrors: options.resetErrors,
      tasks,
    },
    null,
    2,
  ),
)

let completed = 0
let failed = 0
let skipped = 0
let consecutiveFailures = 0

for (const task of tasks) {
  const attemptAt = new Date().toISOString()
  if (!options.dryRun) setQueueStatus(db, task, 'running', { lastAttemptAt: attemptAt, error: '' })

  const result = syncPlayer(task, options)
  if (result.skipped) {
    skipped += 1
    continue
  }

  if (result.ok) {
    completed += 1
    consecutiveFailures = 0
    setQueueStatus(db, task, 'done', { lastAttemptAt: attemptAt, lastSuccessAt: new Date().toISOString(), error: '' })
  } else {
    failed += 1
    consecutiveFailures += 1
    const detail = result.signal ? `Card Hedge sync stopped by ${result.signal}` : `Card Hedge sync exited with code ${result.status}`
    setQueueStatus(db, task, 'error', { lastAttemptAt: attemptAt, error: detail })
    if (consecutiveFailures >= options.maxConsecutiveFailures) {
      console.warn(`Stopping queue after ${consecutiveFailures} consecutive failures. Upstream may be unhealthy.`)
      break
    }
  }
}

let canonical = null
if (completed > 0 && !options.skipFinalCanonical && !options.dryRun) {
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

console.log(
  JSON.stringify(
    {
      completed,
      failed,
      skipped,
      canonical,
    },
    null,
    2,
  ),
)

db.close()
