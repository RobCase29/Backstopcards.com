import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createCanonicalMarketSchema } from './canonical-market.mjs'

const cwd = process.cwd()
const args = process.argv.slice(2)
const dbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))
const marketMoversDir = resolve(join(cwd, 'local-data/market-movers'))
const queueDir = resolve(join(cwd, 'local-data/queues'))

const parsedArgs = parseArgs(args)
const releaseYear = numberOption('year', 2026)
const limit = numberOption('limit', 8)
const dryRun = flag('dry-run')
const claim = flag('claim')
const syncComplete = flag('sync-complete')
const resetRunning = flag('reset-running')
const statusFilter = stringOption('status', 'queued,error')
  .split(',')
  .map((status) => compact(status))
  .filter(Boolean)
const playerFilter = stringOption('player', '')

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

function parseArgs(values) {
  const flags = new Set()
  const options = new Map()
  for (const value of values) {
    if (!value.startsWith('--')) continue
    const raw = value.slice(2)
    const equalsIndex = raw.indexOf('=')
    if (equalsIndex >= 0) {
      options.set(raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1))
    } else {
      flags.add(raw)
    }
  }
  return { flags, options }
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function slugify(value, fallback = 'player') {
  const slug = compact(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || fallback
}

function normalizeName(value) {
  return compact(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
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

function queueSummary(db) {
  if (!tableExists(db, 'canonical_refresh_queue')) {
    return { players: 0, queued: 0, running: 0, done: 0, error: 0 }
  }
  const rows = db
    .prepare(
      `
      SELECT status, COUNT(*) AS count
      FROM canonical_refresh_queue
      WHERE release_year = ?
      GROUP BY status
    `,
    )
    .all(releaseYear)
  const summary = { players: 0, queued: 0, running: 0, done: 0, error: 0 }
  for (const row of rows) {
    const status = compact(row.status) || 'queued'
    const count = Number(row.count) || 0
    summary.players += count
    summary[status] = count
  }
  return summary
}

function marketMoversSearchUrl(query) {
  const params = new URLSearchParams({ search: query, ct: 'sports-card' })
  return `https://marketmovers.sportscardinvestor.com/sales-history?${params.toString()}`
}

function buildPlayerTask(row) {
  const playerName = compact(row.playerName)
  const query = `${playerName} ${releaseYear} Bowman`
  const autoQuery = `${playerName} ${releaseYear} Bowman Chrome Auto`
  const slug = slugify(`${playerName}-${releaseYear}-bowman`)
  const dateStamp = new Date().toISOString().slice(0, 10)
  return {
    playerName,
    releaseYear: Number(row.releaseYear) || releaseYear,
    priority: Number(row.priority) || 0,
    currentStatus: compact(row.status),
    searchQuery: query,
    searchUrl: marketMoversSearchUrl(query),
    focusedAutoQuery: autoQuery,
    focusedAutoUrl: marketMoversSearchUrl(autoQuery),
    expectedFiles: {
      raw: `local-data/market-movers/${slug}-${dateStamp}.raw.json`,
      structured: `local-data/market-movers/${slug}-${dateStamp}.structured.json`,
    },
    captureNotes: [
      'Open the broad search URL first; it should expose the full Market Movers card result set for this player.',
      'Use the raw comps capture for item-level rows when the comps grid is visible.',
      'Use the structured capture after selecting important card rows and the 365-day window.',
      'After captures are saved, run npm run sales:refresh and npm run comps:queue:sync.',
    ],
  }
}

function pendingPlayers(db) {
  const statuses = statusFilter.length ? statusFilter : ['queued']
  const placeholders = statuses.map(() => '?').join(', ')
  const params = [releaseYear, ...statuses]
  let sql = `
    SELECT player_name AS playerName, release_year AS releaseYear, priority, status, error
    FROM canonical_refresh_queue
    WHERE release_year = ?
      AND status IN (${placeholders})
  `
  if (playerFilter) {
    sql += ' AND player_name LIKE ?'
    params.push(`%${playerFilter}%`)
  }
  sql += ' ORDER BY priority DESC, player_name LIMIT ?'
  params.push(limit)
  return db.prepare(sql).all(...params)
}

function writeManifest(tasks) {
  mkdirSync(queueDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const manifestFile = join(queueDir, `market-movers-${releaseYear}-batch-${stamp}.json`)
  const htmlFile = join(queueDir, `market-movers-${releaseYear}-batch-${stamp}.html`)
  const manifest = {
    generatedAt: new Date().toISOString(),
    dbFile,
    releaseYear,
    limit,
    claim,
    dryRun,
    queueBefore: null,
    players: tasks,
    captureHelpers: {
      rawBookmarkletSource: 'src/lib/marketMovers.ts::MARKET_MOVERS_CAPTURE_BOOKMARKLET',
      structuredBookmarkletSource: 'src/lib/marketMovers.ts::MARKET_MOVERS_STRUCTURED_CAPTURE_BOOKMARKLET',
    },
    nextCommands: [
      'npm run sales:refresh',
      'npm run comps:queue:sync',
      'npm run sales:doctor',
    ],
  }
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(htmlFile, batchHtml(manifest), 'utf8')
  return { manifestFile, htmlFile, manifest }
}

function batchHtml(manifest) {
  const rows = manifest.players
    .map(
      (task, index) => `
        <article class="player">
          <div class="rank">${index + 1}</div>
          <div>
            <h2>${escapeHtml(task.playerName)}</h2>
            <p>Priority ${task.priority.toFixed(3)} · ${escapeHtml(task.currentStatus || 'queued')}</p>
            <div class="links">
              <a href="${escapeHtml(task.searchUrl)}" target="_blank" rel="noreferrer">Broad 2026 Bowman</a>
              <a href="${escapeHtml(task.focusedAutoUrl)}" target="_blank" rel="noreferrer">Chrome auto focus</a>
            </div>
            <code>${escapeHtml(task.expectedFiles.raw)}</code>
            <code>${escapeHtml(task.expectedFiles.structured)}</code>
          </div>
        </article>`,
    )
    .join('\n')
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Market Movers ${manifest.releaseYear} Batch</title>
    <style>
      :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #081315; color: #f4ead7; }
      body { margin: 0; padding: 32px; background: radial-gradient(circle at top left, rgba(127, 224, 207, 0.14), transparent 34%), #081315; }
      main { max-width: 1120px; margin: 0 auto; }
      h1 { font-size: clamp(32px, 5vw, 64px); line-height: 0.95; margin: 0 0 8px; letter-spacing: 0; }
      .meta { color: #95aaa9; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
      .player { display: grid; grid-template-columns: 48px 1fr; gap: 18px; padding: 18px; margin: 14px 0; border: 1px solid rgba(157, 225, 215, 0.24); background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025)); border-radius: 10px; box-shadow: 0 20px 55px rgba(0,0,0,0.28); }
      .rank { width: 48px; height: 48px; border-radius: 10px; display: grid; place-items: center; background: #0f1b1e; color: #b9fff3; font-weight: 900; }
      h2 { margin: 0 0 2px; font-size: 24px; }
      p { margin: 0 0 14px; color: #a9b5b3; font-weight: 800; }
      .links { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
      a { color: #061111; background: #a7f7df; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-weight: 900; }
      code { display: block; margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: rgba(0,0,0,0.28); color: #f7dca0; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <main>
      <p class="meta">${manifest.players.length} players · generated ${escapeHtml(manifest.generatedAt)}</p>
      <h1>Market Movers Batch</h1>
      ${rows || '<p>No players selected.</p>'}
    </main>
  </body>
</html>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function claimTasks(db, tasks) {
  if (!claim || dryRun || tasks.length === 0) return 0
  const nowIso = new Date().toISOString()
  const update = db.prepare(`
    UPDATE canonical_refresh_queue
    SET status = 'running',
      last_attempt_at = ?,
      error = '',
      updated_at = ?
    WHERE player_name = ?
      AND release_year = ?
      AND status != 'done'
  `)
  let claimed = 0
  for (const task of tasks) {
    const result = update.run(nowIso, nowIso, task.playerName, task.releaseYear)
    claimed += Number(result.changes) || 0
  }
  return claimed
}

function resetRunningTasks(db) {
  if (!resetRunning || dryRun) return 0
  const nowIso = new Date().toISOString()
  const result = db
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
    .run(nowIso, releaseYear)
  return Number(result.changes) || 0
}

async function discoverCapturePlayerNames() {
  const fromFiles = new Map()
  async function visit(path) {
    const info = await stat(path).catch(() => null)
    if (!info) return
    if (info.isDirectory()) {
      for (const entry of await readdir(path)) await visit(join(path, entry))
      return
    }
    if (!/\.(?:raw|structured|cards)\.json$/i.test(path)) return
    const names = await playerNamesFromCaptureFile(path)
    for (const capture of names) {
      const key = normalizeName(capture.playerName)
      const current = fromFiles.get(key) ?? {
        playerName: capture.playerName,
        files: 0,
        completeRawFiles: 0,
        incompleteRawFiles: 0,
        structuredFiles: 0,
        rows: 0,
      }
      current.files += 1
      current.rows += capture.rows
      if (capture.kind === 'raw' && capture.complete) current.completeRawFiles += 1
      if (capture.kind === 'raw' && !capture.complete) current.incompleteRawFiles += 1
      if (capture.kind === 'structured') current.structuredFiles += 1
      fromFiles.set(key, current)
    }
  }
  await visit(marketMoversDir)
  return fromFiles
}

async function playerNamesFromCaptureFile(path) {
  const text = await readFile(path, 'utf8').catch(() => '')
  if (!text) return []
  const payload = parseJson(text, null)
  if (!payload) return []
  const names = []
  const push = (value, details = {}) => {
    const name = compact(value)
    if (name) {
      names.push({
        playerName: name,
        kind: details.kind ?? 'unknown',
        complete: Boolean(details.complete),
        rows: Number(details.rows) || 0,
      })
    }
  }
  const visitRows = (rows, details = {}) => {
    for (const row of Array.isArray(rows) ? rows : []) push(row?.playerName ?? row?.player_name, details)
  }
  const isRawFile = /\.raw\.json$/i.test(path)
  const isStructuredFile = /\.(?:structured|cards)\.json$/i.test(path)
  const pagesFetched = Number(payload.pagesFetched) || 0
  const totalPages = Number(payload.totalPages) || 0
  const rows = Array.isArray(payload.rows) ? payload.rows.length : Array.isArray(payload) ? payload.length : 0
  const rawComplete = isRawFile && pagesFetched > 0 && totalPages > 0 && pagesFetched >= totalPages
  if (Array.isArray(payload)) visitRows(payload, { kind: 'raw', complete: false, rows })
  visitRows(payload.rows, { kind: isRawFile ? 'raw' : 'unknown', complete: rawComplete, rows })
  visitRows(payload.cards, { kind: isStructuredFile ? 'structured' : 'unknown', complete: false, rows: payload.cards?.length })
  push(payload.playerName, { kind: isRawFile ? 'raw' : 'unknown', complete: rawComplete, rows })
  push(payload.selectedCard?.playerName, { kind: 'structured', complete: false, rows: payload.selectedCard ? 1 : 0 })
  if (Array.isArray(payload.captures)) {
    for (const capture of payload.captures) {
      visitRows(capture?.rows, { kind: 'raw', complete: false, rows: capture?.rows?.length })
      visitRows(capture?.cards, { kind: 'structured', complete: false, rows: capture?.cards?.length })
      push(capture?.selectedCard?.playerName, { kind: 'structured', complete: false, rows: capture?.selectedCard ? 1 : 0 })
    }
  }
  return names
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function importedPlayersFromDb(db) {
  const players = new Map()
  const add = (row, source) => {
    const playerName = compact(row.playerName)
    if (!playerName) return
    const key = normalizeName(playerName)
    const current = players.get(key) ?? {
      playerName,
      sources: new Set(),
      rows: 0,
      latestImportedAt: '',
    }
    current.sources.add(source)
    current.rows += Number(row.rows) || 0
    const latest = compact(row.latestImportedAt)
    if (latest && latest > current.latestImportedAt) current.latestImportedAt = latest
    players.set(key, current)
  }

  if (tableExists(db, 'market_movers_sales_raw')) {
    const rows = db
      .prepare(
        `
        SELECT player_name AS playerName, COUNT(*) AS rows, MAX(imported_at) AS latestImportedAt
        FROM market_movers_sales_raw
        GROUP BY player_name
      `,
      )
      .all()
    for (const row of rows) add(row, 'raw')
  }

  if (tableExists(db, 'market_movers_card_records')) {
    const rows = db
      .prepare(
        `
        SELECT player_name AS playerName, COUNT(*) AS rows, MAX(last_seen_at) AS latestImportedAt
        FROM market_movers_card_records
        GROUP BY player_name
      `,
      )
      .all()
    for (const row of rows) add(row, 'structured')
  }

  return players
}

async function syncCompletedPlayers(db) {
  if (!syncComplete) return { completed: 0, importedPlayers: 0, captureFilePlayers: 0, completeRawPlayers: 0 }
  const imported = importedPlayersFromDb(db)
  const filePlayers = existsSync(marketMoversDir) ? await discoverCapturePlayerNames() : new Map()
  const completeFilePlayers = new Map([...filePlayers.entries()].filter(([, value]) => value.completeRawFiles > 0))

  const queueRows = tableExists(db, 'canonical_refresh_queue')
    ? db
        .prepare(
          `
          SELECT player_name AS playerName, release_year AS releaseYear, status
          FROM canonical_refresh_queue
          WHERE release_year = ?
        `,
        )
        .all(releaseYear)
    : []
  const nowIso = new Date().toISOString()
  const update = db.prepare(`
    UPDATE canonical_refresh_queue
    SET status = 'done',
      last_success_at = ?,
      error = '',
      updated_at = ?
    WHERE player_name = ?
      AND release_year = ?
      AND status != 'done'
  `)
  let completed = 0
  for (const row of queueRows) {
    const match = completeFilePlayers.get(normalizeName(row.playerName))
    if (!match) continue
    const importedMatch = imported.get(normalizeName(row.playerName))
    const successAt = importedMatch?.latestImportedAt || nowIso
    const result = dryRun ? { changes: 0 } : update.run(successAt, nowIso, row.playerName, row.releaseYear)
    completed += dryRun ? 1 : Number(result.changes) || 0
  }
  return {
    completed,
    importedPlayers: imported.size,
    captureFilePlayers: filePlayers.size,
    completeRawPlayers: completeFilePlayers.size,
    partialRawPlayers: [...filePlayers.values()].filter((value) => value.incompleteRawFiles > 0 && value.completeRawFiles === 0).length,
    structuredOnlyPlayers: [...filePlayers.values()].filter((value) => value.structuredFiles > 0 && value.completeRawFiles === 0).length,
  }
}

if (!existsSync(dbFile)) {
  console.error(
    `No sales database exists at ${dbFile}. Run npm run checklist:import:2026 && npm run checklist:firsts:2026 first.`,
  )
  process.exit(1)
}

mkdirSync(dirname(dbFile), { recursive: true })
const db = new DatabaseSync(dbFile)
createCanonicalMarketSchema(db)

const initialQueue = queueSummary(db)
const resetCount = resetRunningTasks(db)
const syncResult = await syncCompletedPlayers(db)
const before = queueSummary(db)
const rows = syncComplete ? [] : pendingPlayers(db)
const tasks = rows.map(buildPlayerTask)
const claimed = claimTasks(db, tasks)
const after = queueSummary(db)
const output = {
  dbFile,
  releaseYear,
  dryRun,
  resetRunning: resetCount,
  syncComplete: syncResult,
  claim,
  claimed,
  queueInitial: initialQueue,
  queueBefore: before,
  queueAfter: after,
  selectedPlayers: tasks.length,
  players: tasks,
}

let manifestFiles = null
if (!syncComplete) {
  const written = writeManifest(tasks)
  written.manifest.queueBefore = before
  writeFileSync(written.manifestFile, `${JSON.stringify(written.manifest, null, 2)}\n`)
  manifestFiles = {
    json: written.manifestFile,
    html: written.htmlFile,
  }
}

console.log(JSON.stringify({ ...output, manifestFiles }, null, 2))
db.close()
