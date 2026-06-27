import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { normalizePlayerKey } from './checklist-ledger.mjs'

const cwd = process.cwd()
const defaultDbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))

function argValue(name, fallback = null) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function percentile(values, pct) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * pct
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function money(value) {
  return value == null ? null : Number(value.toFixed(2))
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName))
}

function baseAutoRows(db) {
  if (!tableExists(db, 'market_movers_model_buckets')) return []
  return db.prepare(`
    SELECT
      player_name AS playerName,
      release_year AS releaseYear,
      product_family AS productFamily,
      variation_label AS variationLabel,
      sale_count AS saleCount,
      sales_30 AS sales30,
      sales_90 AS sales90,
      median_price AS medianPrice,
      model_price AS modelPrice,
      latest_sold_at AS latestSoldAt
    FROM market_movers_model_buckets
    WHERE grade_bucket = 'Raw'
      AND card_class = 'auto'
      AND (
        variation_label = 'Base Auto'
        OR variation_label = 'Base'
        OR variation_label = ''
      )
      AND model_price > 0
    ORDER BY model_price DESC
  `).all()
}

function firstBowmanUniverse(db) {
  if (!tableExists(db, 'checklist_cards')) return []
  return db.prepare(`
    SELECT
      release_year AS releaseYear,
      player_name AS playerName,
      player_key AS playerKey,
      MIN(section) AS section,
      COUNT(*) AS cards
    FROM checklist_cards
    WHERE source_sheet = 'Wax Pack Hero First Bowman'
    GROUP BY release_year, player_key
    ORDER BY release_year DESC, player_name
  `).all()
}

function strongestBaseAutoByPlayerYear(rows) {
  const best = new Map()
  for (const row of rows) {
    const key = `${normalizePlayerKey(row.playerName)}:${row.releaseYear}`
    const current = best.get(key)
    const score =
      (/\bchrome\b/i.test(row.productFamily) ? 1_000_000 : 0) +
      Number(row.saleCount ?? 0) * 100 +
      Number(row.sales30 ?? 0)
    if (!current || score > current.score) best.set(key, { ...row, score })
  }
  return [...best.values()].map(({ score: _score, ...row }) => row)
}

const dbFile = resolve(argValue('--db', defaultDbFile))
const reportFile = resolve(argValue('--report', join(cwd, 'local-data/checklists/first-bowman-base-auto-projection.json')))
const sinceYear = Number(argValue('--since-year', '1996')) || 0
const untilYear = Number(argValue('--until-year', '9999')) || 9999

const db = new DatabaseSync(dbFile)
const universe = firstBowmanUniverse(db).filter((row) => row.releaseYear >= sinceYear && row.releaseYear <= untilYear)
const universeKeys = new Set(universe.map((row) => `${row.playerKey}:${row.releaseYear}`))
const directBaseAutos = strongestBaseAutoByPlayerYear(
  baseAutoRows(db)
  .filter((row) => row.releaseYear >= sinceYear && row.releaseYear <= untilYear)
  .filter((row) => universeKeys.has(`${normalizePlayerKey(row.playerName)}:${row.releaseYear}`)),
)

db.close()

const values = directBaseAutos.map((row) => Number(row.modelPrice)).filter((value) => Number.isFinite(value) && value > 0)
const thresholds = {
  p50: money(percentile(values, 0.5)),
  p75: money(percentile(values, 0.75)),
  p90: money(percentile(values, 0.9)),
  p95: money(percentile(values, 0.95)),
  p99: money(percentile(values, 0.99)),
}

const pricedKeys = new Set(directBaseAutos.map((row) => `${normalizePlayerKey(row.playerName)}:${row.releaseYear}`))
const byYear = new Map()
for (const row of universe) {
  const year = row.releaseYear
  const current = byYear.get(year) ?? { releaseYear: year, firstPlayers: 0, pricedBaseAutos: 0 }
  current.firstPlayers += 1
  if (pricedKeys.has(`${row.playerKey}:${row.releaseYear}`)) current.pricedBaseAutos += 1
  byYear.set(year, current)
}

const payload = {
  generatedAt: new Date().toISOString(),
  dbFile,
  range: { sinceYear, untilYear },
  universe: {
    firstPlayers: universe.length,
    pricedBaseAutos: pricedKeys.size,
    coveragePct: universe.length ? Number(((pricedKeys.size / universe.length) * 100).toFixed(1)) : 0,
  },
  thresholds,
  byYear: [...byYear.values()].sort((left, right) => right.releaseYear - left.releaseYear),
  leaders: directBaseAutos.slice(0, 100),
  notes: [
    'Only raw Base Auto modeled lanes are included.',
    'Players enter the universe from Wax Pack Hero 1st Bowman source rows.',
    'Coverage rises as canonical_refresh_queue is processed by Card Hedge sync.',
  ],
}

mkdirSync(dirname(reportFile), { recursive: true })
writeFileSync(reportFile, `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ ...payload, reportFile }, null, 2))
