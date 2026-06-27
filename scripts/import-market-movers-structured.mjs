import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const cwd = process.cwd()
const args = process.argv.slice(2)
const inputArgs = args.filter((arg) => !arg.startsWith('--'))
const defaultInput = join(cwd, 'local-data/market-movers')
const dbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))

function slugify(value, fallback = 'unknown') {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || fallback
}

function hash(value) {
  return createHash('sha1').update(String(value ?? '')).digest('hex').slice(0, 12)
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function parseMarketMoversDate(value) {
  const raw = compact(value)
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, month, day, year] = match
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : ''
  }
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : ''
}

function releaseYearFromText(value) {
  return Number(String(value ?? '').match(/\b(20\d{2})\b/)?.[1] ?? 0) || null
}

function cardNumberFromTitle(value) {
  return String(value ?? '').match(/#([A-Z0-9-]+)/i)?.[1] ?? ''
}

function serialDenominatorFromCategory(value) {
  return Number(String(value ?? '').match(/\/\s*(\d{1,4})\b/)?.[1] ?? 0) || null
}

function cardKey(card) {
  const basis = [
    card.playerName,
    card.cardTitle,
    card.category,
    card.grade,
  ]
    .map(compact)
    .join(' | ')
  return `${slugify(card.playerName, 'player')}:${slugify(card.cardTitle, 'card')}:${hash(basis)}`
}

function snapshotId(cardKeyValue, capturedAt, windowDays) {
  return `${cardKeyValue}:${windowDays ?? 'window'}:${hash(capturedAt)}`
}

function normalizeCard(input) {
  const playerName = compact(input?.playerName)
  const cardTitle = compact(input?.cardTitle)
  const category = compact(input?.category)
  const grade = compact(input?.grade) || 'Raw'
  return {
    playerName,
    cardTitle,
    category,
    grade,
    releaseYear: releaseYearFromText(cardTitle),
    cardNumber: cardNumberFromTitle(cardTitle),
    serialDenominator: serialDenominatorFromCategory(category),
    latestPrice: numberValue(input?.latestPrice ?? input?.latestPriceText),
    latestDate: parseMarketMoversDate(input?.latestDate),
    trendPct: numberValue(input?.trendPct ?? input?.trendText),
    rollingAverage: numberValue(input?.rollingAverage ?? input?.rollingAverageText),
    selectedWindowDays: numberValue(input?.selectedWindowDays ?? input?.selectedWindowLabel),
    salesCount: numberValue(input?.salesCount),
    imageUrl: compact(input?.imageUrl),
    dailySales: Array.isArray(input?.dailySales) ? input.dailySales : [],
    raw: input ?? {},
  }
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS market_movers_card_records (
      card_key TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      card_title TEXT NOT NULL,
      release_year INTEGER,
      card_number TEXT,
      category TEXT,
      grade_bucket TEXT,
      serial_denominator INTEGER,
      image_url TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_movers_card_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      card_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      source_url TEXT,
      query TEXT,
      window_days INTEGER,
      latest_price REAL,
      latest_date TEXT,
      trend_pct REAL,
      rolling_average REAL,
      sales_count INTEGER,
      raw_json TEXT NOT NULL,
      FOREIGN KEY(card_key) REFERENCES market_movers_card_records(card_key)
    );

    CREATE TABLE IF NOT EXISTS market_movers_card_daily_sales (
      snapshot_id TEXT NOT NULL,
      sold_date TEXT NOT NULL,
      sale_count INTEGER NOT NULL,
      avg_price REAL NOT NULL,
      raw_json TEXT NOT NULL,
      PRIMARY KEY(snapshot_id, sold_date),
      FOREIGN KEY(snapshot_id) REFERENCES market_movers_card_snapshots(snapshot_id)
    );

    CREATE TABLE IF NOT EXISTS market_movers_card_search_results (
      capture_id TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      card_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      latest_price REAL,
      latest_date TEXT,
      raw_json TEXT NOT NULL,
      PRIMARY KEY(capture_id, row_index),
      FOREIGN KEY(card_key) REFERENCES market_movers_card_records(card_key)
    );

    CREATE INDEX IF NOT EXISTS idx_market_movers_card_records_player ON market_movers_card_records(player_name, release_year);
    CREATE INDEX IF NOT EXISTS idx_market_movers_card_snapshots_player ON market_movers_card_snapshots(player_name, captured_at);
    CREATE INDEX IF NOT EXISTS idx_market_movers_card_daily_snapshot ON market_movers_card_daily_sales(snapshot_id, sold_date);
  `)
}

async function discoverCaptureFiles(paths) {
  const discovered = []
  async function visit(path) {
    const absolute = resolve(path)
    const info = await stat(absolute).catch(() => null)
    if (!info) return
    if (info.isDirectory()) {
      for (const entry of await readdir(absolute)) await visit(join(absolute, entry))
      return
    }
    if (/\.(?:structured|cards)\.json$/i.test(absolute)) discovered.push(absolute)
  }

  for (const path of paths.length ? paths : [defaultInput]) await visit(path)
  return [...new Set(discovered)].sort()
}

function unwrapCaptures(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.captures)) return payload.captures
  return [payload]
}

function upsertCard(db, cardKeyValue, card, capturedAt) {
  db.prepare(`
    INSERT INTO market_movers_card_records (
      card_key, player_name, card_title, release_year, card_number, category, grade_bucket,
      serial_denominator, image_url, first_seen_at, last_seen_at, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(card_key) DO UPDATE SET
      player_name=excluded.player_name,
      card_title=excluded.card_title,
      release_year=excluded.release_year,
      card_number=excluded.card_number,
      category=excluded.category,
      grade_bucket=excluded.grade_bucket,
      serial_denominator=excluded.serial_denominator,
      image_url=COALESCE(NULLIF(excluded.image_url, ''), market_movers_card_records.image_url),
      last_seen_at=excluded.last_seen_at,
      raw_json=excluded.raw_json
  `).run(
    cardKeyValue,
    card.playerName,
    card.cardTitle,
    card.releaseYear,
    card.cardNumber,
    card.category,
    card.grade,
    card.serialDenominator,
    card.imageUrl,
    capturedAt,
    capturedAt,
    JSON.stringify(card.raw),
  )
}

function importCapture(db, capture, inputPath) {
  const capturedAt = new Date(capture?.capturedAt || Date.now()).toISOString()
  const captureId = `${slugify(capture?.query || basename(inputPath), 'capture')}:${hash(`${inputPath}:${capturedAt}`)}`
  const sourceUrl = compact(capture?.sourceUrl)
  const query = compact(capture?.query)
  const cards = Array.isArray(capture?.cards) ? capture.cards : []
  let cardsImported = 0
  let snapshotsImported = 0
  let dailyRowsImported = 0

  for (const [index, rawCard] of cards.entries()) {
    const card = normalizeCard(rawCard)
    if (!card.playerName || !card.cardTitle) continue
    const key = cardKey(card)
    upsertCard(db, key, card, capturedAt)
    db.prepare(`
      INSERT INTO market_movers_card_search_results (
        capture_id, row_index, card_key, player_name, latest_price, latest_date, raw_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(capture_id, row_index) DO UPDATE SET
        card_key=excluded.card_key,
        player_name=excluded.player_name,
        latest_price=excluded.latest_price,
        latest_date=excluded.latest_date,
        raw_json=excluded.raw_json
    `).run(captureId, index, key, card.playerName, card.latestPrice, card.latestDate, JSON.stringify(rawCard))
    cardsImported += 1
  }

  if (capture?.selectedCard) {
    const card = normalizeCard(capture.selectedCard)
    if (card.playerName && card.cardTitle) {
      const key = cardKey(card)
      const windowDays = card.selectedWindowDays || 365
      const id = snapshotId(key, capturedAt, windowDays)
      upsertCard(db, key, card, capturedAt)
      db.prepare(`
        INSERT INTO market_movers_card_snapshots (
          snapshot_id, card_key, player_name, captured_at, source_url, query, window_days,
          latest_price, latest_date, trend_pct, rolling_average, sales_count, raw_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(snapshot_id) DO UPDATE SET
          latest_price=excluded.latest_price,
          latest_date=excluded.latest_date,
          trend_pct=excluded.trend_pct,
          rolling_average=excluded.rolling_average,
          sales_count=excluded.sales_count,
          raw_json=excluded.raw_json
      `).run(
        id,
        key,
        card.playerName,
        capturedAt,
        sourceUrl,
        query,
        windowDays,
        card.latestPrice,
        card.latestDate,
        card.trendPct,
        card.rollingAverage,
        card.salesCount,
        JSON.stringify(capture.selectedCard),
      )
      snapshotsImported += 1

      for (const row of card.dailySales) {
        const soldDate = parseMarketMoversDate(row.date)
        const saleCount = numberValue(row.saleCount)
        const avgPrice = numberValue(row.avgPrice ?? row.avgPriceText)
        if (!soldDate || !saleCount || !avgPrice) continue
        db.prepare(`
          INSERT INTO market_movers_card_daily_sales (snapshot_id, sold_date, sale_count, avg_price, raw_json)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(snapshot_id, sold_date) DO UPDATE SET
            sale_count=excluded.sale_count,
            avg_price=excluded.avg_price,
            raw_json=excluded.raw_json
        `).run(id, soldDate, saleCount, avgPrice, JSON.stringify(row))
        dailyRowsImported += 1
      }
    }
  }

  return { inputPath, captureId, cardsImported, snapshotsImported, dailyRowsImported }
}

const inputFiles = await discoverCaptureFiles(inputArgs)
await mkdir(dirname(dbFile), { recursive: true })
const db = new DatabaseSync(dbFile)
createSchema(db)

const imports = []
db.exec('BEGIN')
try {
  for (const inputFile of inputFiles) {
    const payload = JSON.parse(await readFile(inputFile, 'utf8'))
    for (const capture of unwrapCaptures(payload)) imports.push(importCapture(db, capture, inputFile))
  }
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  db.close()
  throw error
}

const outputDir = inputFiles[0] ? dirname(inputFiles[0]) : defaultInput
const summaryFile = join(outputDir, `market-movers-structured-import-${new Date().toISOString().slice(0, 10)}.json`)
await writeFile(summaryFile, JSON.stringify({ dbFile, inputFiles, imports }, null, 2))
db.close()

console.log(JSON.stringify({ dbFile, inputFiles, imports, summaryFile }, null, 2))
