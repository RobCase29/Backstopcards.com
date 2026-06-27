import { createHash } from 'node:crypto'
import { normalizeMarketMoversSale } from './market-movers-sales-model.mjs'

const ONE_DAY_MS = 86_400_000
const LOOKBACK_DAYS = 365
const REBUILT_CANONICAL_SOURCES = [
  'market_movers_sale',
  'card_hedge_sale',
  'card_hedge_native_sale',
  'market_movers_card',
]

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function titleCase(value) {
  return compact(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^(?:B&W|HTA|RC|SSP|SP|CPA|BPA)$/i.test(word)) return word.toUpperCase()
      if (/^\/\d+$/.test(word)) return word
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
    })
    .join(' ')
}

export function slugify(value, fallback = 'unknown') {
  const slug = compact(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || fallback
}

function hash(value) {
  return createHash('sha1').update(String(value ?? '')).digest('hex').slice(0, 12)
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function boolInt(value) {
  return value ? 1 : 0
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

function ebayItemIdFromUrl(value) {
  const raw = compact(value)
  if (!raw) return ''
  return (
    raw.match(/\/itm\/(?:[^/?#]+\/)?(\d{8,})/i)?.[1] ??
    raw.match(/[?&](?:item|itemId|item_id)=(\d{8,})/i)?.[1] ??
    ''
  )
}

function cardNumberFromText(value) {
  return String(value ?? '').match(/#([A-Z0-9-]+)/i)?.[1] ?? ''
}

function serialDenominatorFromText(value) {
  const explicit = String(value ?? '').match(/(?:#\/|\/|out\s+of\s+|numbered\s+to\s+)(\d{1,4})\b/i)
  return Number(explicit?.[1] ?? 0) || null
}

function normalizeGradeBucket(value) {
  const raw = compact(value)
  if (!raw || /^raw$/i.test(raw)) return 'Raw'
  const match = raw.match(/\b(PSA|BGS|SGC|CGC)\s*(10|9\.5|9|8\.5|8|7\.5|7)\b/i)
  if (match) return `${match[1].toUpperCase()} ${match[2]}`
  return titleCase(raw)
}

function normalizeCardClass(value, fallback = 'base') {
  const raw = compact(value).toLowerCase()
  if (!raw) return fallback
  if (raw === 'paper-auto') return 'paper-auto'
  if (raw === 'insert-auto') return 'insert-auto'
  if (raw === 'case-hit') return 'case-hit'
  if (raw.includes('auto')) return 'auto'
  if (raw.includes('paper')) return 'paper'
  if (raw.includes('chrome')) return 'chrome'
  if (raw.includes('insert')) return 'insert'
  return raw
}

function normalizeVariationLabel(value, cardClass = '') {
  const raw = compact(value)
  if (!raw) {
    if (/auto/.test(cardClass)) return 'Base Auto'
    if (cardClass === 'paper') return 'Base Paper'
    if (cardClass === 'chrome') return 'Base Chrome'
    return 'Base'
  }
  if (/^base$/i.test(raw) && /auto/.test(cardClass)) return 'Base Auto'
  return raw
}

function cardFamilyFromNormalized(row) {
  if (row.insertName) return titleCase(row.insertName)
  if (row.cardClass === 'paper-auto') return 'Paper Autographs'
  if (row.cardClass === 'insert-auto') return 'Insert Autographs'
  if (row.cardClass === 'case-hit') return 'Case Hits'
  if (row.cardClass === 'auto') return 'Chrome Prospect Autographs'
  if (row.cardClass === 'paper') return 'Paper'
  if (row.cardClass === 'chrome') return 'Chrome Prospects'
  if (row.cardClass === 'insert') return 'Inserts'
  return 'Base'
}

function productFamilyFromStructured(title, category, cardClass) {
  const text = `${title} ${category}`
  if (/\bsapphire\b/i.test(text)) return 'Bowman Sapphire'
  if (/\bmega\b|\bmojo\b/i.test(text)) return 'Bowman Mega'
  if (/\bdraft\b/i.test(text)) return 'Bowman Draft'
  if (/\bpaper\b/i.test(text)) return 'Bowman Paper'
  if (/\bchrome\b|\bautographs?\b/i.test(text) || /auto/.test(cardClass)) return 'Bowman Chrome'
  return 'Bowman'
}

function parseStructuredCategory(category, title = '') {
  const raw = compact(category)
  const parts = raw.split(/\s+-\s+/).map(compact).filter(Boolean)
  const familyRaw = parts[0] || raw || 'Base'
  const variationRaw = parts.slice(1).join(' - ')
  const family = familyRaw.replace(/\s*\(1st\)\s*/gi, '').trim()
  const variation = variationRaw.replace(/\s*\(1st\)\s*/gi, '').trim()
  const text = `${category} ${title}`
  const isAuto = /\bauto(?:graph|graphs)?\b|\bautographs?\b|CPA-|BPA-/i.test(text)
  const isPaper = /\bpaper\b/i.test(text)
  const cardClass = isPaper && isAuto ? 'paper-auto' : isAuto ? 'auto' : /\bchrome\b/i.test(text) ? 'chrome' : 'base'
  return {
    cardFamily: family || (isAuto ? 'Chrome Prospect Autographs' : 'Base'),
    cardClass,
    variationLabel: normalizeVariationLabel(variation || (isAuto ? 'Base Auto' : 'Base'), cardClass),
  }
}

export function canonicalCardKey(parts) {
  return [
    parts.releaseYear ?? 'unknown-year',
    slugify(parts.playerName, 'unknown-player'),
    slugify(parts.productFamily, 'unknown-product'),
    slugify(parts.cardClass, 'unknown-class'),
    slugify(parts.cardFamily, 'unknown-family'),
    slugify(parts.variationLabel, 'base'),
    slugify(parts.gradeBucket, 'raw'),
  ].join('|')
}

export function canonicalFromNormalizedSale(row) {
  const cardClass = normalizeCardClass(row.cardClass)
  const variationLabel = normalizeVariationLabel(row.variationLabel, cardClass)
  const releaseYear = numberOrNull(row.releaseYear)
  const card = {
    playerName: compact(row.playerName),
    releaseYear,
    releaseLabel: releaseYear ? `${releaseYear} Bowman` : '',
    productFamily: compact(row.productFamily) || 'Bowman',
    cardFamily: cardFamilyFromNormalized({ ...row, cardClass }),
    cardClass,
    variationLabel,
    serialDenominator: numberOrNull(row.serialDenominator) ?? serialDenominatorFromText(variationLabel),
    gradeBucket: normalizeGradeBucket(row.gradeBucket),
    cardNumber: '',
  }
  return {
    ...card,
    canonicalCardKey: canonicalCardKey(card),
  }
}

export function canonicalFromStructuredCard(row) {
  const category = compact(row.category)
  const title = compact(row.cardTitle ?? row.card_title)
  const parsed = parseStructuredCategory(category, title)
  const releaseYear = numberOrNull(row.releaseYear ?? row.release_year) ?? releaseYearFromText(title)
  const serialDenominator =
    numberOrNull(row.serialDenominator ?? row.serial_denominator) ??
    serialDenominatorFromText(category) ??
    serialDenominatorFromText(title)
  const card = {
    playerName: compact(row.playerName ?? row.player_name),
    releaseYear,
    releaseLabel: releaseYear ? `${releaseYear} Bowman` : '',
    productFamily: productFamilyFromStructured(title, category, parsed.cardClass),
    cardFamily: parsed.cardFamily,
    cardClass: parsed.cardClass,
    variationLabel: normalizeVariationLabel(parsed.variationLabel, parsed.cardClass),
    serialDenominator,
    gradeBucket: normalizeGradeBucket(row.gradeBucket ?? row.grade_bucket),
    cardNumber: compact(row.cardNumber ?? row.card_number) || cardNumberFromText(title),
  }
  return {
    ...card,
    canonicalCardKey: canonicalCardKey(card),
  }
}

export function createCanonicalMarketSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS canonical_cards (
      canonical_card_key TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      release_year INTEGER,
      release_label TEXT,
      product_family TEXT,
      card_family TEXT,
      card_class TEXT,
      variation_label TEXT,
      serial_denominator INTEGER,
      grade_bucket TEXT NOT NULL DEFAULT 'Raw',
      card_number TEXT,
      source_count INTEGER NOT NULL DEFAULT 0,
      latest_comp_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS canonical_source_mappings (
      source TEXT NOT NULL,
      source_key TEXT NOT NULL,
      canonical_card_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      confidence REAL NOT NULL,
      mapping_status TEXT NOT NULL DEFAULT 'auto',
      raw_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(source, source_key),
      FOREIGN KEY(canonical_card_key) REFERENCES canonical_cards(canonical_card_key)
    );

    CREATE TABLE IF NOT EXISTS canonical_daily_prices (
      canonical_card_key TEXT NOT NULL,
      sold_date TEXT NOT NULL,
      sale_count INTEGER NOT NULL,
      avg_price REAL NOT NULL,
      source_count INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(canonical_card_key, sold_date),
      FOREIGN KEY(canonical_card_key) REFERENCES canonical_cards(canonical_card_key)
    );

    CREATE TABLE IF NOT EXISTS canonical_comp_summary (
      canonical_card_key TEXT PRIMARY KEY,
      sale_count INTEGER NOT NULL,
      sales_30 INTEGER NOT NULL,
      sales_90 INTEGER NOT NULL,
      sales_365 INTEGER NOT NULL,
      auction_count INTEGER NOT NULL,
      bin_count INTEGER NOT NULL,
      min_price REAL NOT NULL,
      q1_price REAL NOT NULL,
      median_price REAL NOT NULL,
      avg_price REAL NOT NULL,
      q3_price REAL NOT NULL,
      max_price REAL NOT NULL,
      recent_3_avg REAL,
      recent_5_avg REAL,
      twma_30 REAL,
      twma_90 REAL,
      latest_sold_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(canonical_card_key) REFERENCES canonical_cards(canonical_card_key)
    );

    CREATE TABLE IF NOT EXISTS canonical_refresh_queue (
      player_name TEXT NOT NULL,
      release_year INTEGER,
      priority REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      last_attempt_at TEXT,
      last_success_at TEXT,
      error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(player_name, release_year)
    );

    CREATE INDEX IF NOT EXISTS idx_canonical_cards_player ON canonical_cards(player_name, release_year);
    CREATE INDEX IF NOT EXISTS idx_canonical_cards_family ON canonical_cards(release_year, product_family, card_class, variation_label);
    CREATE INDEX IF NOT EXISTS idx_canonical_source_card ON canonical_source_mappings(canonical_card_key);
    CREATE INDEX IF NOT EXISTS idx_canonical_daily_card ON canonical_daily_prices(canonical_card_key, sold_date);
  `)
}

function upsertCanonicalCard(db, card, nowIso) {
  db.prepare(`
    INSERT INTO canonical_cards (
      canonical_card_key, player_name, release_year, release_label, product_family, card_family,
      card_class, variation_label, serial_denominator, grade_bucket, card_number, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(canonical_card_key) DO UPDATE SET
      player_name=excluded.player_name,
      release_year=excluded.release_year,
      release_label=COALESCE(NULLIF(excluded.release_label, ''), canonical_cards.release_label),
      product_family=excluded.product_family,
      card_family=excluded.card_family,
      card_class=excluded.card_class,
      variation_label=excluded.variation_label,
      serial_denominator=COALESCE(excluded.serial_denominator, canonical_cards.serial_denominator),
      grade_bucket=excluded.grade_bucket,
      card_number=COALESCE(NULLIF(excluded.card_number, ''), canonical_cards.card_number),
      updated_at=excluded.updated_at
  `).run(
    card.canonicalCardKey,
    card.playerName,
    card.releaseYear,
    card.releaseLabel,
    card.productFamily,
    card.cardFamily,
    card.cardClass,
    card.variationLabel,
    card.serialDenominator,
    card.gradeBucket,
    card.cardNumber,
    nowIso,
    nowIso,
  )
}

function upsertSourceMapping(db, source, sourceKey, card, rawJson, confidence, nowIso) {
  db.prepare(`
    INSERT INTO canonical_source_mappings (
      source, source_key, canonical_card_key, player_name, confidence, mapping_status, raw_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'auto', ?, ?, ?)
    ON CONFLICT(source, source_key) DO UPDATE SET
      canonical_card_key=excluded.canonical_card_key,
      player_name=excluded.player_name,
      confidence=excluded.confidence,
      raw_json=excluded.raw_json,
      updated_at=excluded.updated_at
  `).run(source, sourceKey, card.canonicalCardKey, card.playerName, confidence, JSON.stringify(rawJson ?? {}), nowIso, nowIso)
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `).get(tableName),
  )
}

function hasNativeCardHedgeSales(db) {
  if (!tableExists(db, 'card_hedge_cards') || !tableExists(db, 'card_hedge_sales')) return false
  const row = db.prepare('SELECT COUNT(*) AS count FROM card_hedge_sales').get()
  return Number(row?.count ?? 0) > 0
}

function percentile(values, pct) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * pct
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function median(values) {
  return percentile(values, 0.5)
}

function ageDays(dateIso, asOfMs) {
  const time = new Date(dateIso).getTime()
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY
  return Math.max(0, (asOfMs - time) / ONE_DAY_MS)
}

function weightedLogPrice(sales, asOfMs, halfLifeDays) {
  const clean = sales.filter((sale) => sale.price > 0 && sale.soldAt)
  if (!clean.length) return null
  const logPrices = clean.map((sale) => Math.log(sale.price))
  const center = median(logPrices)
  const deviations = logPrices.map((value) => Math.abs(value - center))
  const mad = median(deviations)
  const clipWidth = clean.length >= 5 && mad > 0 ? Math.max(0.22, mad * 1.4826 * 2.25) : Number.POSITIVE_INFINITY
  let totalWeight = 0
  let total = 0
  for (const sale of clean) {
    const clipped = Math.min(center + clipWidth, Math.max(center - clipWidth, Math.log(sale.price)))
    const weight = Math.pow(0.5, ageDays(sale.soldAt, asOfMs) / halfLifeDays) * Math.max(1, Number(sale.saleCount ?? 1) || 1)
    totalWeight += weight
    total += clipped * weight
  }
  return totalWeight > 0 ? Math.exp(total / totalWeight) : null
}

function summarizeSales(canonicalCardKey, sales, asOfMs, nowIso) {
  const clean = sales.filter((sale) => sale.price > 0 && sale.soldAt)
  const expandedPrices = clean.flatMap((sale) => Array.from({ length: Math.max(1, Number(sale.saleCount ?? 1) || 1) }, () => sale.price))
  const prices = expandedPrices
  const recent = [...clean].sort((left, right) => String(right.soldAt).localeCompare(String(left.soldAt)))
  const saleCountFor = (sale) => Math.max(1, Number(sale.saleCount ?? 1) || 1)
  const inDays = (days) =>
    clean.filter((sale) => ageDays(sale.soldAt, asOfMs) <= days).reduce((total, sale) => total + saleCountFor(sale), 0)
  const weightedAverage = clean.reduce((total, sale) => total + sale.price * Math.max(1, Number(sale.saleCount ?? 1) || 1), 0) / prices.length
  return {
    canonicalCardKey,
    saleCount: prices.length,
    sales30: inDays(30),
    sales90: inDays(90),
    sales365: inDays(LOOKBACK_DAYS),
    auctionCount: clean.filter((sale) => sale.channel === 'auction').length,
    binCount: clean.filter((sale) => sale.channel === 'bin').length,
    minPrice: Math.min(...prices),
    q1Price: percentile(prices, 0.25),
    medianPrice: median(prices),
    avgPrice: weightedAverage,
    q3Price: percentile(prices, 0.75),
    maxPrice: Math.max(...prices),
    recent3Avg: recent.slice(0, 3).reduce((total, sale) => total + sale.price, 0) / Math.max(1, Math.min(3, recent.length)),
    recent5Avg: recent.slice(0, 5).reduce((total, sale) => total + sale.price, 0) / Math.max(1, Math.min(5, recent.length)),
    twma30: weightedLogPrice(clean, asOfMs, 30),
    twma90: weightedLogPrice(clean, asOfMs, 90),
    latestSoldAt: recent[0]?.soldAt ?? '',
    updatedAt: nowIso,
  }
}

function upsertSummary(db, summary) {
  db.prepare(`
    INSERT INTO canonical_comp_summary (
      canonical_card_key, sale_count, sales_30, sales_90, sales_365, auction_count, bin_count,
      min_price, q1_price, median_price, avg_price, q3_price, max_price,
      recent_3_avg, recent_5_avg, twma_30, twma_90, latest_sold_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(canonical_card_key) DO UPDATE SET
      sale_count=excluded.sale_count,
      sales_30=excluded.sales_30,
      sales_90=excluded.sales_90,
      sales_365=excluded.sales_365,
      auction_count=excluded.auction_count,
      bin_count=excluded.bin_count,
      min_price=excluded.min_price,
      q1_price=excluded.q1_price,
      median_price=excluded.median_price,
      avg_price=excluded.avg_price,
      q3_price=excluded.q3_price,
      max_price=excluded.max_price,
      recent_3_avg=excluded.recent_3_avg,
      recent_5_avg=excluded.recent_5_avg,
      twma_30=excluded.twma_30,
      twma_90=excluded.twma_90,
      latest_sold_at=excluded.latest_sold_at,
      updated_at=excluded.updated_at
  `).run(
    summary.canonicalCardKey,
    summary.saleCount,
    summary.sales30,
    summary.sales90,
    summary.sales365,
    summary.auctionCount,
    summary.binCount,
    summary.minPrice,
    summary.q1Price,
    summary.medianPrice,
    summary.avgPrice,
    summary.q3Price,
    summary.maxPrice,
    summary.recent3Avg,
    summary.recent5Avg,
    summary.twma30,
    summary.twma90,
    summary.latestSoldAt,
    summary.updatedAt,
  )
}

function upsertDailyPrice(db, canonicalCardKey, soldDate, saleCount, avgPrice, sourceCount, nowIso) {
  if (!soldDate || saleCount <= 0 || avgPrice <= 0) return
  db.prepare(`
    INSERT INTO canonical_daily_prices (
      canonical_card_key, sold_date, sale_count, avg_price, source_count, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(canonical_card_key, sold_date) DO UPDATE SET
      sale_count=excluded.sale_count,
      avg_price=excluded.avg_price,
      source_count=excluded.source_count,
      updated_at=excluded.updated_at
  `).run(canonicalCardKey, soldDate.slice(0, 10), saleCount, avgPrice, sourceCount, nowIso)
}

function normalizedSaleRows(db, options = {}) {
  if (!tableExists(db, 'market_movers_sales_normalized')) return []
  const includeCardHedgeMirror = options.includeCardHedgeMirror ?? true
  const hasOverrides = tableExists(db, 'market_movers_bucket_overrides')
  const hasFlags = tableExists(db, 'market_movers_sale_flags')
  const overrideJoin = hasOverrides
    ? `LEFT JOIN market_movers_bucket_overrides o ON o.source_bucket_key = n.bucket_key`
    : ''
  const flagJoin = hasFlags ? `LEFT JOIN market_movers_sale_flags f ON f.item_id = n.item_id` : ''
  const overrideValue = (column, fallback) => (hasOverrides ? `COALESCE(o.${column}, ${fallback})` : fallback)
  const flagValue = hasFlags ? 'COALESCE(f.erroneous, 0)' : '0'
  const cardHedgeMirrorFilter = includeCardHedgeMirror ? '' : "AND COALESCE(r.source, '') NOT LIKE 'card-hedge%'"
  return db.prepare(`
    SELECT
      n.item_id AS itemId,
      n.player_name AS playerName,
      ${overrideValue('target_release_year', 'n.release_year')} AS releaseYear,
      ${overrideValue('target_product_family', 'n.product_family')} AS productFamily,
      ${overrideValue('target_card_class', 'n.card_class')} AS cardClass,
      ${overrideValue('target_variation_label', 'n.variation_label')} AS variationLabel,
      ${overrideValue('target_serial_denominator', 'n.serial_denominator')} AS serialDenominator,
      ${overrideValue('target_grade_bucket', 'n.grade_bucket')} AS gradeBucket,
      ${overrideValue('target_insert_name', 'n.insert_name')} AS insertName,
      n.bucket_key AS sourceBucketKey,
      ${overrideValue('target_bucket_key', 'n.bucket_key')} AS bucketKey,
      n.model_eligible AS modelEligible,
      ${flagValue} AS erroneous,
      r.sale_price AS salePrice,
      r.sold_at AS soldAt,
      r.source AS source,
      n.channel AS channel,
      r.title AS title,
      n.normalized_json AS normalizedJson,
      r.raw_json AS rawJson
    FROM market_movers_sales_normalized n
    JOIN market_movers_sales_raw r ON r.item_id = n.item_id
    ${overrideJoin}
    ${flagJoin}
    WHERE n.model_eligible = 1
      AND ${flagValue} = 0
      AND r.sale_price > 0
      AND r.sold_at IS NOT NULL
      AND r.sold_at <> ''
      ${cardHedgeMirrorFilter}
    ORDER BY n.player_name, r.sold_at
  `).all()
}

function cardHedgeNativeSaleRows(db) {
  if (!hasNativeCardHedgeSales(db)) return []
  return db.prepare(`
    SELECT
      s.price_history_id AS priceHistoryId,
      s.card_id AS cardId,
      s.player_name AS playerName,
      s.grade AS grade,
      s.price AS salePrice,
      s.sold_at AS soldAt,
      s.sale_type AS saleType,
      s.price_source AS priceSource,
      s.title AS title,
      s.sale_url AS saleUrl,
      s.raw_json AS saleRawJson,
      c.description AS description,
      c.card_set AS cardSet,
      c.card_number AS cardNumber,
      c.variant AS variant,
      c.category AS category,
      c.category_group AS categoryGroup,
      c.set_type AS setType,
      c.raw_json AS cardRawJson
    FROM card_hedge_sales s
    JOIN card_hedge_cards c ON c.card_id = s.card_id
    WHERE s.price > 0
      AND s.sold_at IS NOT NULL
      AND s.sold_at <> ''
    ORDER BY s.player_name, s.sold_at
  `).all()
}

function cardHedgeNativeSourceKey(row) {
  const ebayId = ebayItemIdFromUrl(row.saleUrl)
  if (ebayId) return `ebay:${ebayId}`
  if (row.priceHistoryId) return `cardhedge:${row.priceHistoryId}`
  return `cardhedge:${hash([row.cardId, row.grade, row.soldAt, row.salePrice, row.title].join('|'))}`
}

function channelFromCardHedgeSaleType(value) {
  const raw = compact(value)
  if (/\bauction\b/i.test(raw)) return 'Auction'
  if (/\bbest\s+offer\b/i.test(raw)) return 'Best Offer'
  if (/\bbin\b|\bbuy\s+it\s+now\b|\bfixed\b/i.test(raw)) return 'Buy It Now'
  return raw || 'Unknown'
}

function buildCardHedgeNormalizationTitle(row) {
  const grade = compact(row.grade)
  const gradeSuffix =
    !grade || /^raw$/i.test(grade) || new RegExp(`\\b${grade.replace(/\s+/g, '\\s*')}\\b`, 'i').test(row.title ?? '')
      ? ''
      : grade
  return compact(
    [
      row.title,
      row.description,
      row.cardSet,
      row.variant,
      row.category,
      row.categoryGroup,
      row.setType,
      row.cardNumber ? `#${row.cardNumber}` : '',
      gradeSuffix,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function normalizeCardHedgeNativeSale(row) {
  const title = buildCardHedgeNormalizationTitle(row)
  return normalizeMarketMoversSale(
    {
      itemId: cardHedgeNativeSourceKey(row),
      title,
      salePrice: row.salePrice,
      salePriceText: `$${Number(row.salePrice || 0).toFixed(2)}`,
      soldAt: row.soldAt,
      saleType: channelFromCardHedgeSaleType(row.saleType),
      seller: row.priceSource,
      sourcePage: null,
      sourceOffset: 0,
    },
    row.playerName,
    { defaultReleaseYear: releaseYearFromText(title) },
  )
}

function structuredCardRows(db) {
  if (!tableExists(db, 'market_movers_card_records')) return []
  return db.prepare(`
    SELECT
      card_key AS cardKey,
      player_name AS playerName,
      card_title AS cardTitle,
      release_year AS releaseYear,
      card_number AS cardNumber,
      category,
      grade_bucket AS gradeBucket,
      serial_denominator AS serialDenominator,
      image_url AS imageUrl,
      raw_json AS rawJson
    FROM market_movers_card_records
    ORDER BY player_name, release_year, category
  `).all()
}

function latestStructuredDailyRows(db) {
  if (!tableExists(db, 'market_movers_card_snapshots') || !tableExists(db, 'market_movers_card_daily_sales')) return []
  return db.prepare(`
    WITH latest AS (
      SELECT card_key, MAX(captured_at) AS captured_at
      FROM market_movers_card_snapshots
      GROUP BY card_key
    )
    SELECT
      s.card_key AS cardKey,
      d.sold_date AS soldDate,
      d.sale_count AS saleCount,
      d.avg_price AS avgPrice
    FROM market_movers_card_snapshots s
    JOIN latest l ON l.card_key = s.card_key AND l.captured_at = s.captured_at
    JOIN market_movers_card_daily_sales d ON d.snapshot_id = s.snapshot_id
    WHERE d.avg_price > 0 AND d.sale_count > 0
  `).all()
}

export function rebuildCanonicalMarket(db, options = {}) {
  createCanonicalMarketSchema(db)
  const nowIso = options.nowIso ?? new Date().toISOString()
  const asOfMs = options.asOf ? new Date(options.asOf).getTime() : Date.now()
  const saleGroups = new Map()
  const cardsTouched = new Set()
  let normalizedMappings = 0
  let cardHedgeNativeMappings = 0
  let structuredMappings = 0
  const useNativeCardHedge = options.useNativeCardHedge ?? hasNativeCardHedgeSales(db)

  db.prepare(
    `DELETE FROM canonical_source_mappings WHERE source IN (${REBUILT_CANONICAL_SOURCES.map(() => '?').join(', ')})`,
  ).run(...REBUILT_CANONICAL_SOURCES)
  db.prepare('DELETE FROM canonical_comp_summary').run()
  db.prepare('DELETE FROM canonical_daily_prices').run()

  const cardHedgeNativeSourceKeys = new Set()
  if (useNativeCardHedge) {
    for (const row of cardHedgeNativeSaleRows(db)) {
      const sourceKey = cardHedgeNativeSourceKey(row)
      if (!sourceKey || cardHedgeNativeSourceKeys.has(sourceKey)) continue
      cardHedgeNativeSourceKeys.add(sourceKey)
      const normalized = normalizeCardHedgeNativeSale(row)
      if (!normalized.modelEligible) continue
      const card = canonicalFromNormalizedSale(normalized)
      if (!card.playerName) continue
      upsertCanonicalCard(db, card, nowIso)
      upsertSourceMapping(
        db,
        'card_hedge_native_sale',
        sourceKey,
        card,
        {
          source: 'card_hedge_native',
          normalized,
          nativeSale: {
            priceHistoryId: row.priceHistoryId,
            cardId: row.cardId,
            grade: row.grade,
            saleType: row.saleType,
            saleUrl: row.saleUrl,
          },
          card: parseJson(row.cardRawJson, {}),
          sale: parseJson(row.saleRawJson, {}),
        },
        0.96,
        nowIso,
      )
      if (!saleGroups.has(card.canonicalCardKey)) saleGroups.set(card.canonicalCardKey, [])
      saleGroups.get(card.canonicalCardKey).push({
        price: Number(normalized.salePrice),
        soldAt: String(normalized.soldAt),
        channel: String(normalized.channel ?? 'unknown'),
      })
      upsertDailyPrice(db, card.canonicalCardKey, String(normalized.soldAt).slice(0, 10), 1, Number(normalized.salePrice), 1, nowIso)
      cardsTouched.add(card.canonicalCardKey)
      cardHedgeNativeMappings += 1
    }
  }

  for (const row of normalizedSaleRows(db, { includeCardHedgeMirror: !useNativeCardHedge })) {
    const card = canonicalFromNormalizedSale(row)
    if (!card.playerName || !row.itemId) continue
    const sourceName = String(row.source ?? '').startsWith('card-hedge') ? 'card_hedge_sale' : 'market_movers_sale'
    upsertCanonicalCard(db, card, nowIso)
    upsertSourceMapping(
      db,
      sourceName,
      row.itemId,
      card,
      {
        normalized: parseJson(row.normalizedJson, {}),
        raw: parseJson(row.rawJson, {}),
        bucketKey: row.bucketKey,
        sourceBucketKey: row.sourceBucketKey,
      },
      row.sourceBucketKey !== row.bucketKey ? 0.98 : 0.92,
      nowIso,
    )
    if (!saleGroups.has(card.canonicalCardKey)) saleGroups.set(card.canonicalCardKey, [])
    saleGroups.get(card.canonicalCardKey).push({
      price: Number(row.salePrice),
      soldAt: String(row.soldAt),
      channel: String(row.channel ?? 'unknown'),
    })
    upsertDailyPrice(db, card.canonicalCardKey, String(row.soldAt).slice(0, 10), 1, Number(row.salePrice), 1, nowIso)
    cardsTouched.add(card.canonicalCardKey)
    normalizedMappings += 1
  }

  const structuredCardKeyToCanonical = new Map()
  for (const row of structuredCardRows(db)) {
    const card = canonicalFromStructuredCard(row)
    if (!card.playerName || !row.cardKey) continue
    upsertCanonicalCard(db, card, nowIso)
    upsertSourceMapping(db, 'market_movers_card', row.cardKey, card, parseJson(row.rawJson, {}), 0.82, nowIso)
    structuredCardKeyToCanonical.set(row.cardKey, card.canonicalCardKey)
    cardsTouched.add(card.canonicalCardKey)
    structuredMappings += 1
  }

  for (const row of latestStructuredDailyRows(db)) {
    const canonicalKey = structuredCardKeyToCanonical.get(row.cardKey)
    if (!canonicalKey) continue
    // Structured daily rows fill chart history. Item-level raw sales remain the primary comp summary when present.
    upsertDailyPrice(
      db,
      canonicalKey,
      String(row.soldDate),
      Number(row.saleCount),
      Number(row.avgPrice),
      Number(row.saleCount),
      nowIso,
    )
    if (!saleGroups.has(canonicalKey)) saleGroups.set(canonicalKey, [])
    const hasItemLevelSales = saleGroups.get(canonicalKey).some((sale) => sale.channel !== 'market-movers-daily')
    if (!hasItemLevelSales) {
      saleGroups.get(canonicalKey).push({
        price: Number(row.avgPrice),
        soldAt: String(row.soldDate),
        channel: 'market-movers-daily',
        saleCount: Number(row.saleCount),
      })
    }
  }

  let summaries = 0
  for (const [canonicalKey, sales] of saleGroups.entries()) {
    if (!sales.length) continue
    upsertSummary(db, summarizeSales(canonicalKey, sales, asOfMs, nowIso))
    summaries += 1
  }

  db.exec(`
    UPDATE canonical_cards
    SET source_count = (
      SELECT COUNT(*)
      FROM canonical_source_mappings m
      WHERE m.canonical_card_key = canonical_cards.canonical_card_key
    ),
    latest_comp_at = (
      SELECT latest_sold_at
      FROM canonical_comp_summary s
      WHERE s.canonical_card_key = canonical_cards.canonical_card_key
    )
  `)

  db.prepare(`
    DELETE FROM canonical_cards
    WHERE NOT EXISTS (
      SELECT 1
      FROM canonical_source_mappings m
      WHERE m.canonical_card_key = canonical_cards.canonical_card_key
    )
  `).run()

  return {
    cardsTouched: cardsTouched.size,
    normalizedMappings,
    cardHedgeNativeMappings,
    structuredMappings,
    summaries,
  }
}

export function summarizeCanonicalMarket(db) {
  const empty = { cards: 0, mappings: 0, summaries: 0, dailyRows: 0, players: 0 }
  if (!tableExists(db, 'canonical_cards')) return empty
  const cards = db.prepare(`
    SELECT
      COUNT(*) AS cards,
      COUNT(DISTINCT player_name) AS players
    FROM canonical_cards
  `).get()
  const mappings = db.prepare('SELECT COUNT(*) AS mappings FROM canonical_source_mappings').get()
  const sourceBreakdown = db.prepare(`
    SELECT source, COUNT(*) AS mappings, COUNT(DISTINCT player_name) AS players
    FROM canonical_source_mappings
    GROUP BY source
    ORDER BY mappings DESC
  `).all()
  const summaries = db.prepare('SELECT COUNT(*) AS summaries FROM canonical_comp_summary').get()
  const daily = db.prepare('SELECT COUNT(*) AS dailyRows FROM canonical_daily_prices').get()
  const topCards = db.prepare(`
    SELECT
      c.player_name AS playerName,
      c.release_year AS releaseYear,
      c.product_family AS productFamily,
      c.card_family AS cardFamily,
      c.card_class AS cardClass,
      c.variation_label AS variationLabel,
      c.grade_bucket AS gradeBucket,
      s.sale_count AS saleCount,
      s.twma_30 AS twma30,
      s.recent_5_avg AS recent5Avg,
      s.latest_sold_at AS latestSoldAt
    FROM canonical_comp_summary s
    JOIN canonical_cards c ON c.canonical_card_key = s.canonical_card_key
    ORDER BY s.sale_count DESC, s.latest_sold_at DESC
    LIMIT 12
  `).all()
  return {
    cards: Number(cards?.cards ?? 0),
    players: Number(cards?.players ?? 0),
    mappings: Number(mappings?.mappings ?? 0),
    sourceBreakdown,
    summaries: Number(summaries?.summaries ?? 0),
    dailyRows: Number(daily?.dailyRows ?? 0),
    topCards,
  }
}
