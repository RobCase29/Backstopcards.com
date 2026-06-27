import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  buildMarketMoversNormalizedPlayerModel,
  modelBucketCsvRows,
  normalizeMarketMoversSale,
} from './market-movers-sales-model.mjs'
import { rebuildCanonicalMarket, summarizeCanonicalMarket } from './canonical-market.mjs'

const API_BASE = 'https://api.cardhedger.com'
const cwd = process.cwd()
const dbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))

function argValue(name, fallback = null) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

async function loadEnvFile(file) {
  if (!existsSync(file)) return
  const text = await readFile(file, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
  }
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeName(value) {
  return compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function hash(value) {
  return createHash('sha1').update(String(value ?? '')).digest('hex').slice(0, 16)
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value ?? ''))
  } catch {
    return fallback
  }
}

function releaseYearFromText(value) {
  return Number(String(value ?? '').match(/\b(20\d{2})\b/)?.[1] ?? 0) || null
}

function cardSearchMatches(card, playerName, year) {
  const playerMatches = normalizeName(card.player) === normalizeName(playerName)
  const text = `${card.description ?? ''} ${card.set ?? ''} ${card.set_type ?? ''}`
  const bowmanMatches = /\bbowman\b/i.test(text)
  const yearMatches = !year || new RegExp(`\\b${year}\\b`).test(text)
  return playerMatches && bowmanMatches && yearMatches
}

function ebayItemIdFromUrl(value) {
  const raw = compact(value)
  if (!raw) return ''
  return (
    raw.match(/\/itm\/(?:[^/?#]+\/)?(\d{8,})/i)?.[1] ??
    raw.match(/[?&](?:item|itemId|item_id)=(\d{8,})/i)?.[1] ??
    ''
  )
}

function stableSaleId(rawSale, cardId, grade) {
  const ebayId = ebayItemIdFromUrl(rawSale.sale_url)
  if (ebayId) return ebayId
  if (rawSale.price_history_id) return `cardhedge:${rawSale.price_history_id}`
  return `cardhedge:${hash([cardId, grade, rawSale.sale_date, rawSale.price, rawSale.title].join('|'))}`
}

function channelFromSaleType(value) {
  const raw = compact(value)
  if (/\bauction\b/i.test(raw)) return 'Auction'
  if (/\bbest\s+offer\b/i.test(raw)) return 'Best Offer'
  if (/\bbin\b|\bbuy\s+it\s+now\b|\bfixed\b/i.test(raw)) return 'Buy It Now'
  return raw || 'Unknown'
}

function buildNormalizationTitle(card, rawSale, grade) {
  const rawTitle = compact(rawSale.title)
  const description = compact(card.description)
  const gradeSuffix = /^raw$/i.test(grade) || new RegExp(`\\b${grade.replace(/\s+/g, '\\s*')}\\b`, 'i').test(rawTitle) ? '' : grade
  return compact([rawTitle, description, gradeSuffix].filter(Boolean).join(' '))
}

function cardImageUrl(value) {
  const raw = compact(value)
  if (raw.startsWith('//')) return `https:${raw}`
  return raw
}

function uniqueGrades(card, requestedGrades) {
  if (requestedGrades.length) return requestedGrades
  const grades = (Array.isArray(card.prices) ? card.prices : [])
    .map((price) => compact(price.grade))
    .filter(Boolean)
  return [...new Set(['Raw', ...grades])].slice(0, 4)
}

function gradeKey(value) {
  return normalizeName(value).replace(/[^a-z0-9.]+/g, '')
}

function requestedGradeKeys(requestedGrades) {
  const grades = requestedGrades.length ? requestedGrades : ['Raw']
  return new Set(grades.map(gradeKey))
}

function cardHasRequestedGradePrice(card, requestedGrades) {
  const gradeKeys = requestedGradeKeys(requestedGrades)
  return (Array.isArray(card.prices) ? card.prices : []).some((price) => {
    const value = numberValue(price.price ?? price.value ?? price.amount)
    return gradeKeys.has(gradeKey(price.grade)) && value != null && value > 0
  })
}

function cardHasRecentSalesSignal(card) {
  const sevenDay = numberValue(card['7 Day Sales'] ?? card.seven_day_sales ?? card.sevenDaySales)
  const thirtyDay = numberValue(card['30 Day Sales'] ?? card.thirty_day_sales ?? card.thirtyDaySales)
  return (sevenDay ?? 0) > 0 || (thirtyDay ?? 0) > 0
}

function shouldFetchCardComps(card, requestedGrades, compScope) {
  if (compScope === 'all') return true
  return cardHasRecentSalesSignal(card) || cardHasRequestedGradePrice(card, requestedGrades)
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function createRateLimiter(rpm) {
  const minDelayMs = Math.ceil(60_000 / Math.max(1, rpm))
  let lastAt = 0
  return async function waitTurn() {
    const now = Date.now()
    const waitMs = Math.max(0, lastAt + minDelayMs - now)
    if (waitMs > 0) await sleep(waitMs)
    lastAt = Date.now()
  }
}

async function cardHedgeJson(endpoint, body, apiKey, waitTurn, recordCall, attempt = 1) {
  await waitTurn()
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': apiKey,
      'User-Agent': 'Backstop Card Finder Card Hedge sync',
    },
    body: JSON.stringify(body),
  })
  recordCall?.(endpoint, response.status)
  const retryableStatus = [408, 425, 429, 500, 502, 503, 504].includes(response.status)
  if (retryableStatus && attempt <= 5) {
    const retryAfter = Number(response.headers.get('Retry-After'))
    const baseDelay = response.status === 429 ? 8_000 : 2_500
    const jitter = Math.floor(Math.random() * 1_000)
    await sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(45_000, baseDelay * attempt + jitter))
    return cardHedgeJson(endpoint, body, apiKey, waitTurn, recordCall, attempt + 1)
  }
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    throw new Error(`Card Hedge ${endpoint} failed: ${response.status} ${response.statusText} ${text.slice(0, 500)}`)
  }
  return payload
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS card_hedge_api_calls (
      call_id TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      requested_at TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_card_hedge_api_calls_requested
      ON card_hedge_api_calls(requested_at);

    CREATE TABLE IF NOT EXISTS card_hedge_cards (
      card_id TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      description TEXT,
      card_set TEXT,
      card_number TEXT,
      variant TEXT,
      category TEXT,
      category_group TEXT,
      set_type TEXT,
      rookie INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      seven_day_sales INTEGER,
      thirty_day_sales INTEGER,
      gain REAL,
      source_query TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS card_hedge_card_prices (
      card_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      grader TEXT NOT NULL DEFAULT '',
      price REAL,
      display_order INTEGER,
      captured_at TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      PRIMARY KEY(card_id, grade, grader),
      FOREIGN KEY(card_id) REFERENCES card_hedge_cards(card_id)
    );

    CREATE TABLE IF NOT EXISTS card_hedge_comp_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      comp_price REAL,
      high REAL,
      low REAL,
      count_requested INTEGER,
      count_used INTEGER,
      time_weighted INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      FOREIGN KEY(card_id) REFERENCES card_hedge_cards(card_id)
    );

    CREATE TABLE IF NOT EXISTS card_hedge_sales (
      price_history_id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      grade TEXT NOT NULL,
      price REAL NOT NULL,
      sold_at TEXT NOT NULL,
      sale_type TEXT,
      price_source TEXT,
      title TEXT,
      sale_url TEXT,
      image_url TEXT,
      imported_at TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      FOREIGN KEY(card_id) REFERENCES card_hedge_cards(card_id)
    );

    CREATE INDEX IF NOT EXISTS idx_card_hedge_cards_player ON card_hedge_cards(player_name, card_set);
    CREATE INDEX IF NOT EXISTS idx_card_hedge_sales_player ON card_hedge_sales(player_name, sold_at);
    CREATE INDEX IF NOT EXISTS idx_card_hedge_sales_card ON card_hedge_sales(card_id, grade, sold_at);

    CREATE TABLE IF NOT EXISTS market_movers_sales_raw (
      item_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      player_name TEXT NOT NULL,
      search TEXT,
      title TEXT NOT NULL,
      sale_price_text TEXT,
      sale_price REAL,
      sold_at TEXT,
      sale_type TEXT,
      seller TEXT,
      source_page INTEGER,
      source_offset INTEGER,
      imported_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_movers_sales_normalized (
      item_id TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      release_year INTEGER,
      product_family TEXT,
      card_class TEXT,
      variation_label TEXT,
      serial_denominator INTEGER,
      grade_company TEXT,
      grade_value REAL,
      grade_bucket TEXT,
      channel TEXT,
      is_auto INTEGER NOT NULL,
      is_bowman INTEGER NOT NULL,
      is_chrome INTEGER NOT NULL,
      is_paper INTEGER NOT NULL,
      is_case_hit INTEGER NOT NULL,
      is_insert INTEGER NOT NULL,
      insert_name TEXT,
      is_redemption INTEGER NOT NULL,
      is_redeemed INTEGER NOT NULL,
      is_digital INTEGER NOT NULL,
      is_lot INTEGER NOT NULL,
      model_eligible INTEGER NOT NULL,
      exclusion_reason TEXT,
      bucket_key TEXT,
      normalized_json TEXT NOT NULL,
      FOREIGN KEY(item_id) REFERENCES market_movers_sales_raw(item_id)
    );

    CREATE TABLE IF NOT EXISTS market_movers_model_buckets (
      bucket_key TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      release_year INTEGER,
      product_family TEXT,
      card_class TEXT,
      variation_label TEXT,
      grade_bucket TEXT,
      serial_denominator INTEGER,
      sale_count INTEGER NOT NULL,
      sales_30 INTEGER NOT NULL,
      sales_90 INTEGER NOT NULL,
      auction_count INTEGER NOT NULL,
      bin_count INTEGER NOT NULL,
      min_price REAL NOT NULL,
      q1_price REAL NOT NULL,
      median_price REAL NOT NULL,
      avg_price REAL NOT NULL,
      q3_price REAL NOT NULL,
      max_price REAL NOT NULL,
      model_price REAL NOT NULL,
      base_auto_multiple REAL,
      latest_sold_at TEXT,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_movers_sale_flags (
      item_id TEXT PRIMARY KEY,
      erroneous INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(item_id) REFERENCES market_movers_sales_raw(item_id)
    );

    CREATE TABLE IF NOT EXISTS market_movers_bucket_overrides (
      source_bucket_key TEXT PRIMARY KEY,
      target_bucket_key TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      target_release_year INTEGER,
      target_product_family TEXT,
      target_card_class TEXT,
      target_variation_label TEXT,
      target_serial_denominator INTEGER,
      target_grade_bucket TEXT,
      target_insert_name TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_market_movers_sales_player_sold ON market_movers_sales_raw(player_name, sold_at);
    CREATE INDEX IF NOT EXISTS idx_market_movers_norm_bucket ON market_movers_sales_normalized(bucket_key);
    CREATE INDEX IF NOT EXISTS idx_market_movers_norm_player_class ON market_movers_sales_normalized(player_name, card_class, product_family);
    CREATE INDEX IF NOT EXISTS idx_market_movers_norm_player_sold ON market_movers_sales_normalized(player_name, model_eligible);
  `)
}

function recordCardHedgeCall(db, endpoint, statusCode) {
  const requestedAt = new Date().toISOString()
  const callId = `${requestedAt}:cli-sync:${Math.random().toString(36).slice(2, 10)}`
  db.prepare(`
    INSERT INTO card_hedge_api_calls (call_id, route, endpoint, status_code, requested_at, request_count)
    VALUES (?, 'cli-sync', ?, ?, ?, 1)
  `).run(callId, endpoint, statusCode, requestedAt)
}

function bool(value) {
  return value ? 1 : 0
}

function upsertCard(db, card, sourceQuery, nowIso) {
  db.prepare(`
    INSERT INTO card_hedge_cards (
      card_id, player_name, description, card_set, card_number, variant, category, category_group,
      set_type, rookie, image_url, seven_day_sales, thirty_day_sales, gain, source_query,
      first_seen_at, last_seen_at, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(card_id) DO UPDATE SET
      player_name=excluded.player_name,
      description=excluded.description,
      card_set=excluded.card_set,
      card_number=excluded.card_number,
      variant=excluded.variant,
      category=excluded.category,
      category_group=excluded.category_group,
      set_type=excluded.set_type,
      rookie=excluded.rookie,
      image_url=COALESCE(NULLIF(excluded.image_url, ''), card_hedge_cards.image_url),
      seven_day_sales=excluded.seven_day_sales,
      thirty_day_sales=excluded.thirty_day_sales,
      gain=excluded.gain,
      source_query=excluded.source_query,
      last_seen_at=excluded.last_seen_at,
      raw_json=excluded.raw_json
  `).run(
    card.card_id,
    compact(card.player),
    compact(card.description),
    compact(card.set),
    compact(card.number),
    compact(card.variant),
    compact(card.category),
    compact(card.category_group),
    compact(card.set_type),
    bool(card.rookie === true || card.rookie === 'true' || card.rookie === 'yes'),
    cardImageUrl(card.image),
    numberValue(card['7 Day Sales']),
    numberValue(card['30 Day Sales']),
    numberValue(card.gain),
    sourceQuery,
    nowIso,
    nowIso,
    JSON.stringify(card),
  )

  const prices = Array.isArray(card.prices) ? card.prices : []
  const seenGrades = new Set()
  for (const price of prices) {
    const grade = compact(price.grade)
    const grader = compact(price.grader)
    const key = `${grade}|${grader}`
    if (!grade || seenGrades.has(key)) continue
    seenGrades.add(key)
    db.prepare(`
      INSERT INTO card_hedge_card_prices (
        card_id, grade, grader, price, display_order, captured_at, raw_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(card_id, grade, grader) DO UPDATE SET
        price=excluded.price,
        display_order=excluded.display_order,
        captured_at=excluded.captured_at,
        raw_json=excluded.raw_json
    `).run(
      card.card_id,
      grade,
      grader,
      numberValue(price.price),
      numberValue(price.display_order),
      nowIso,
      JSON.stringify(price),
    )
  }
}

function upsertMarketMoverCompatibleSale(db, row, sale) {
  db.prepare(`
    INSERT INTO market_movers_sales_raw (
      item_id, source, player_name, search, title, sale_price_text, sale_price, sold_at, sale_type,
      seller, source_page, source_offset, imported_at, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      source=excluded.source,
      player_name=excluded.player_name,
      search=excluded.search,
      title=excluded.title,
      sale_price_text=excluded.sale_price_text,
      sale_price=excluded.sale_price,
      sold_at=excluded.sold_at,
      sale_type=excluded.sale_type,
      seller=excluded.seller,
      source_page=excluded.source_page,
      source_offset=excluded.source_offset,
      imported_at=excluded.imported_at,
      raw_json=excluded.raw_json
  `).run(
    sale.itemId,
    'card-hedge-comps',
    row.playerName,
    row.search,
    row.displayTitle,
    sale.salePriceText,
    sale.salePrice,
    sale.soldAt,
    sale.saleType,
    sale.seller,
    sale.sourcePage,
    sale.sourceOffset,
    row.importedAt,
    JSON.stringify(row.rawJson),
  )

  db.prepare(`
    INSERT INTO market_movers_sales_normalized (
      item_id, player_name, release_year, product_family, card_class, variation_label, serial_denominator,
      grade_company, grade_value, grade_bucket, channel, is_auto, is_bowman, is_chrome, is_paper,
      is_case_hit, is_insert, insert_name, is_redemption, is_redeemed, is_digital, is_lot,
      model_eligible, exclusion_reason, bucket_key, normalized_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      player_name=excluded.player_name,
      release_year=excluded.release_year,
      product_family=excluded.product_family,
      card_class=excluded.card_class,
      variation_label=excluded.variation_label,
      serial_denominator=excluded.serial_denominator,
      grade_company=excluded.grade_company,
      grade_value=excluded.grade_value,
      grade_bucket=excluded.grade_bucket,
      channel=excluded.channel,
      is_auto=excluded.is_auto,
      is_bowman=excluded.is_bowman,
      is_chrome=excluded.is_chrome,
      is_paper=excluded.is_paper,
      is_case_hit=excluded.is_case_hit,
      is_insert=excluded.is_insert,
      insert_name=excluded.insert_name,
      is_redemption=excluded.is_redemption,
      is_redeemed=excluded.is_redeemed,
      is_digital=excluded.is_digital,
      is_lot=excluded.is_lot,
      model_eligible=excluded.model_eligible,
      exclusion_reason=excluded.exclusion_reason,
      bucket_key=excluded.bucket_key,
      normalized_json=excluded.normalized_json
  `).run(
    sale.itemId,
    sale.playerName,
    sale.releaseYear,
    sale.productFamily,
    sale.cardClass,
    sale.variationLabel,
    sale.serialDenominator,
    sale.gradeCompany,
    sale.gradeValue,
    sale.gradeBucket,
    sale.channel,
    bool(sale.isAuto),
    bool(sale.isBowman),
    bool(sale.isChrome),
    bool(sale.isPaper),
    bool(sale.isCaseHit),
    bool(sale.isInsert),
    sale.insertName,
    bool(sale.isRedemption),
    bool(sale.isRedeemed),
    bool(sale.isDigital),
    bool(sale.isLot),
    bool(sale.modelEligible),
    sale.exclusionReason,
    sale.bucketKey,
    JSON.stringify(sale),
  )
}

function upsertComps(db, card, grade, comps, playerName, importedAt, search, defaultReleaseYear) {
  const snapshotId = `${card.card_id}:${grade}:${hash(importedAt)}`
  db.prepare(`
    INSERT INTO card_hedge_comp_snapshots (
      snapshot_id, card_id, grade, fetched_at, comp_price, high, low, count_requested,
      count_used, time_weighted, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_id) DO UPDATE SET
      comp_price=excluded.comp_price,
      high=excluded.high,
      low=excluded.low,
      count_requested=excluded.count_requested,
      count_used=excluded.count_used,
      time_weighted=excluded.time_weighted,
      raw_json=excluded.raw_json
  `).run(
    snapshotId,
    card.card_id,
    grade,
    importedAt,
    numberValue(comps.comp_price),
    numberValue(comps.high),
    numberValue(comps.low),
    numberValue(comps.count_requested),
    numberValue(comps.count_used),
    bool(comps.time_weighted),
    JSON.stringify(comps),
  )

  const rawPrices = Array.isArray(comps.raw_prices) ? comps.raw_prices : []
  let importedSales = 0
  let modelEligibleSales = 0
  const normalizedSales = []
  for (const [index, rawSale] of rawPrices.entries()) {
    const price = numberValue(rawSale.price)
    const soldAt = compact(rawSale.sale_date)
    if (!price || price <= 0 || !soldAt) continue
    const priceHistoryId =
      compact(rawSale.price_history_id) || `${card.card_id}:${grade}:${hash([soldAt, price, rawSale.title, index].join('|'))}`
    const displayTitle = compact(rawSale.title) || compact(card.description)
    const normalizeTitle = buildNormalizationTitle(card, rawSale, grade)
    const itemId = stableSaleId(rawSale, card.card_id, grade)
    const compatibleRow = {
      itemId,
      title: normalizeTitle,
      salePrice: price,
      salePriceText: `$${price}`,
      soldDate: soldAt,
      soldAt,
      saleType: channelFromSaleType(rawSale.sale_type),
      seller: compact(rawSale.price_source),
      sourcePage: null,
      sourceOffset: index,
    }
    const normalized = normalizeMarketMoversSale(compatibleRow, playerName, { defaultReleaseYear })
    db.prepare(`
      INSERT INTO card_hedge_sales (
        price_history_id, card_id, player_name, grade, price, sold_at, sale_type, price_source,
        title, sale_url, image_url, imported_at, raw_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(price_history_id) DO UPDATE SET
        card_id=excluded.card_id,
        player_name=excluded.player_name,
        grade=excluded.grade,
        price=excluded.price,
        sold_at=excluded.sold_at,
        sale_type=excluded.sale_type,
        price_source=excluded.price_source,
        title=excluded.title,
        sale_url=excluded.sale_url,
        image_url=excluded.image_url,
        imported_at=excluded.imported_at,
        raw_json=excluded.raw_json
    `).run(
      priceHistoryId,
      card.card_id,
      playerName,
      grade,
      price,
      soldAt,
      compact(rawSale.sale_type),
      compact(rawSale.price_source),
      displayTitle,
      compact(rawSale.sale_url),
      cardImageUrl(rawSale.image),
      importedAt,
      JSON.stringify(rawSale),
    )
    upsertMarketMoverCompatibleSale(
      db,
      {
        playerName,
        search,
        displayTitle,
        importedAt,
        rawJson: {
          source: 'card-hedge-comps',
          card,
          grade,
          rawSale,
          normalizeTitle,
        },
      },
      normalized,
    )
    normalizedSales.push(normalized)
    importedSales += 1
    if (normalized.modelEligible) modelEligibleSales += 1
  }
  return { importedSales, modelEligibleSales, normalizedSales }
}

async function fetchSearchCards({ apiKey, waitTurn, recordCall, playerName, search, category, year, maxCards }) {
  const pageSize = 100
  let page = 1
  let pages = 1
  const cards = []
  do {
    const payload = await cardHedgeJson(
      '/v1/cards/card-search',
      { search, category, page, page_size: pageSize },
      apiKey,
      waitTurn,
      recordCall,
    )
    pages = Number(payload.pages ?? 1) || 1
    for (const card of Array.isArray(payload.cards) ? payload.cards : []) {
      if (cardSearchMatches(card, playerName, year)) cards.push(card)
    }
    page += 1
  } while (page <= pages && cards.length < maxCards)
  const unique = new Map()
  for (const card of cards) {
    if (!unique.has(card.card_id)) unique.set(card.card_id, card)
  }
  return [...unique.values()].slice(0, maxCards)
}

function loadPlayerNormalizedSales(db, playerName) {
  const rows = db.prepare(`
    SELECT
      n.normalized_json AS normalizedJson,
      COALESCE(f.erroneous, 0) AS erroneous,
      COALESCE(f.note, '') AS erroneousNote
    FROM market_movers_sales_normalized n
    LEFT JOIN market_movers_sale_flags f ON f.item_id = n.item_id
    WHERE n.player_name = ?
    ORDER BY n.release_year, n.product_family, n.card_class, n.variation_label
  `).all(playerName)

  return rows.flatMap((row) => {
    const sale = JSON.parse(String(row.normalizedJson ?? '{}'))
    if (Number(row.erroneous) === 1) {
      return [
        {
          ...sale,
          modelEligible: false,
          exclusionReason: row.erroneousNote ? `user flagged: ${row.erroneousNote}` : 'user flagged',
        },
      ]
    }
    return [sale]
  })
}

function reclassifyCardHedgeCompatibleSales(db, playerName, defaultReleaseYear, importedAt) {
  const rows = db.prepare(`
    SELECT
      item_id AS itemId,
      player_name AS playerName,
      search,
      title,
      sale_price_text AS salePriceText,
      sale_price AS salePrice,
      sold_at AS soldAt,
      sale_type AS saleType,
      seller,
      source_page AS sourcePage,
      source_offset AS sourceOffset,
      raw_json AS rawJson
    FROM market_movers_sales_raw
    WHERE source = 'card-hedge-comps'
      AND (? = '' OR player_name = ?)
    ORDER BY player_name, sold_at
  `).all(playerName || '', playerName || '')

  let reclassifiedSales = 0
  let modelEligibleSales = 0
  for (const row of rows) {
    const rawJson = parseJson(row.rawJson, {})
    const normalizeTitle =
      compact(rawJson?.normalizeTitle) ||
      buildNormalizationTitle(rawJson?.card ?? {}, rawJson?.rawSale ?? { title: row.title }, rawJson?.grade ?? 'Raw') ||
      compact(row.title)
    const targetPlayer = compact(row.playerName)
    const compatibleRow = {
      itemId: compact(row.itemId),
      title: normalizeTitle,
      salePrice: numberValue(row.salePrice),
      salePriceText: compact(row.salePriceText) || `$${numberValue(row.salePrice) ?? ''}`,
      soldDate: compact(row.soldAt),
      soldAt: compact(row.soldAt),
      saleType: compact(row.saleType),
      seller: compact(row.seller),
      sourcePage: numberValue(row.sourcePage),
      sourceOffset: numberValue(row.sourceOffset) ?? 0,
    }
    const normalized = normalizeMarketMoversSale(compatibleRow, targetPlayer, { defaultReleaseYear })
    upsertMarketMoverCompatibleSale(
      db,
      {
        playerName: targetPlayer,
        search: compact(row.search),
        displayTitle: compact(row.title),
        importedAt,
        rawJson,
      },
      normalized,
    )
    reclassifiedSales += 1
    if (normalized.modelEligible) modelEligibleSales += 1
  }
  return { reclassifiedSales, modelEligibleSales }
}

async function rebuildPlayerBuckets(db, playerName, outputDir) {
  const normalized = loadPlayerNormalizedSales(db, playerName)
  const latestSoldAt = normalized.reduce((latest, sale) => (sale.soldAt && sale.soldAt > latest ? sale.soldAt : latest), '')
  const model = buildMarketMoversNormalizedPlayerModel(normalized, playerName, { asOf: latestSoldAt || new Date().toISOString() })

  db.prepare('DELETE FROM market_movers_model_buckets WHERE player_name = ?').run(playerName)
  const bucketStmt = db.prepare(`
    INSERT INTO market_movers_model_buckets (
      bucket_key, player_name, release_year, product_family, card_class, variation_label, grade_bucket,
      serial_denominator, sale_count, sales_30, sales_90, auction_count, bin_count,
      min_price, q1_price, median_price, avg_price, q3_price, max_price, model_price,
      base_auto_multiple, latest_sold_at, generated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const bucket of model.buckets) {
    bucketStmt.run(
      bucket.bucketKey,
      bucket.playerName,
      bucket.releaseYear,
      bucket.productFamily,
      bucket.cardClass,
      bucket.variationLabel,
      bucket.gradeBucket,
      bucket.serialDenominator,
      bucket.count,
      bucket.sales30,
      bucket.sales90,
      bucket.auctionCount,
      bucket.binCount,
      bucket.minPrice,
      bucket.q1Price,
      bucket.medianPrice,
      bucket.avgPrice,
      bucket.q3Price,
      bucket.maxPrice,
      bucket.modelPrice,
      bucket.baseAutoMultiple,
      bucket.latestSoldAt,
      model.generatedAt,
    )
  }

  await mkdir(outputDir, { recursive: true })
  const slug = normalizeName(playerName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player'
  await writeFile(join(outputDir, `${slug}.card-hedge-summary.json`), JSON.stringify({ ...model, normalized: undefined }, null, 2))
  await writeFile(join(outputDir, `${slug}.card-hedge-buckets.csv`), modelBucketCsvRows(model))
  return model
}

async function main() {
  await loadEnvFile(resolve(cwd, '.env.local'))
  const reclassifyOnly = hasFlag('--reclassify-only')
  const apiKey = process.env.CARD_HEDGE_API_KEY
  if (!apiKey && !reclassifyOnly) throw new Error('Set CARD_HEDGE_API_KEY in .env.local or your shell environment')

  const playerName = compact(argValue('--player', 'Aiva Arquette'))
  const year = Number(argValue('--year', '2026')) || null
  const search = compact(argValue('--search', `${playerName} ${year ?? ''} Bowman`))
  const category = compact(argValue('--category', 'Baseball'))
  const maxCards = Number(argValue('--max-cards', '250')) || 250
  const count = Math.min(100, Math.max(1, Number(argValue('--count', '100')) || 100))
  const rpm = Math.min(500, Math.max(1, Number(argValue('--rpm', process.env.CARD_HEDGE_RATE_LIMIT_PER_MINUTE ?? '80')) || 80))
  const requestedGrades = compact(argValue('--grades', 'Raw'))
    .split(',')
    .map(compact)
    .filter(Boolean)
  const rawCompScope = compact(argValue('--comp-scope', 'market-signals')).toLowerCase()
  const compScope = rawCompScope === 'all' ? 'all' : 'market-signals'
  const skipComps = hasFlag('--skip-comps')
  const rebuildCanonical = !hasFlag('--skip-canonical')
  const outputDir = resolve(cwd, 'local-data/card-hedge/players')
  const importedAt = new Date().toISOString()
  const waitTurn = reclassifyOnly ? async () => {} : createRateLimiter(rpm)

  await mkdir(dirname(dbFile), { recursive: true })
  const db = new DatabaseSync(dbFile)
  createSchema(db)
  const recordCall = reclassifyOnly ? null : (endpoint, statusCode) => recordCardHedgeCall(db, endpoint, statusCode)

  const cards = reclassifyOnly
    ? []
    : await fetchSearchCards({ apiKey, waitTurn, recordCall, playerName, search, category, year, maxCards })
  let compRequests = 0
  let compErrors = 0
  let importedSales = 0
  let modelEligibleSales = 0
  let reclassifiedSales = 0
  let cardsSkippedForNoSignal = 0

  if (reclassifyOnly) {
    db.exec('BEGIN')
    try {
      const result = reclassifyCardHedgeCompatibleSales(db, playerName, year, importedAt)
      reclassifiedSales = result.reclassifiedSales
      modelEligibleSales = result.modelEligibleSales
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      db.close()
      throw error
    }
  } else {
    db.exec('BEGIN')
    try {
      for (const card of cards) upsertCard(db, card, search, importedAt)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      db.close()
      throw error
    }
  }

  if (!reclassifyOnly && !skipComps) {
    for (const card of cards) {
      if (!shouldFetchCardComps(card, requestedGrades, compScope)) {
        cardsSkippedForNoSignal += 1
        continue
      }
      const grades = uniqueGrades(card, requestedGrades)
      for (const grade of grades) {
        try {
          const comps = await cardHedgeJson(
            '/v1/cards/comps',
            {
              card_id: card.card_id,
              count,
              grade,
              time_weighted: true,
              include_raw_prices: true,
            },
            apiKey,
            waitTurn,
            recordCall,
          )
          compRequests += 1
          db.exec('BEGIN')
          const result = upsertComps(db, card, grade, comps, playerName, importedAt, search, year)
          db.exec('COMMIT')
          importedSales += result.importedSales
          modelEligibleSales += result.modelEligibleSales
        } catch (error) {
          compErrors += 1
          try {
            db.exec('ROLLBACK')
          } catch {
            // Ignore rollback when no transaction was open.
          }
          console.warn(`Card Hedge comps failed for ${card.description ?? card.card_id} (${grade}): ${error.message}`)
        }
      }
    }
  }

  let playerModel = null
  let canonical = null
  db.exec('BEGIN')
  try {
    playerModel = await rebuildPlayerBuckets(db, playerName, outputDir)
    if (rebuildCanonical) {
      const rebuild = rebuildCanonicalMarket(db)
      canonical = { rebuild, summary: summarizeCanonicalMarket(db) }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    db.close()
    throw error
  }

  const cardRows = db.prepare('SELECT COUNT(*) AS count FROM card_hedge_cards WHERE player_name = ?').get(playerName)
  const saleRows = db.prepare('SELECT COUNT(*) AS count FROM card_hedge_sales WHERE player_name = ?').get(playerName)
  db.close()

  console.log(
    JSON.stringify(
      {
        dbFile,
        playerName,
        search,
        year,
        grades: requestedGrades,
        compScope,
        rpm,
        cardsFetched: cards.length,
        cardsSkippedForNoSignal,
        compRequests,
        compErrors,
        importedSales,
        modelEligibleSales,
        cachedCardHedgeCards: Number(cardRows?.count ?? 0),
        cachedCardHedgeSales: Number(saleRows?.count ?? 0),
        reclassifiedSales,
        playerModel: playerModel
          ? {
              totalRows: playerModel.totalRows,
              modelEligibleRows: playerModel.modelEligibleRows,
              excludedRows: playerModel.excludedRows,
              buckets: playerModel.buckets.length,
              baseAutoPrice: playerModel.baseAutoPrice ? Number(playerModel.baseAutoPrice.toFixed(2)) : null,
              topBuckets: playerModel.buckets.slice(0, 10).map((bucket) => ({
                bucketKey: bucket.bucketKey,
                count: bucket.count,
                modelPrice: Number(bucket.modelPrice.toFixed(2)),
                multiple: bucket.baseAutoMultiple ? Number(bucket.baseAutoMultiple.toFixed(2)) : null,
              })),
            }
          : null,
        canonical,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
