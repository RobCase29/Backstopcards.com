import { createHash, randomUUID } from 'node:crypto'
import { HOSTED_COMP_LANE_SEEDS, HOSTED_COMP_QUEUE_SEEDS } from './data/hostedCompBootstrap.js'

export type HostedCompSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>

export type HostedCardHedgeRequest = (endpoint: string, payload: Record<string, unknown>) => Promise<unknown>

export type HostedCompRefreshOptions = {
  sql: HostedCompSql
  requestCardHedge: HostedCardHedgeRequest
  fetchDailyExport?: (date: string) => Promise<string>
  maxPlayers?: number
  maxTaskApiCalls?: number
  maxFmvCards?: number
  timeBudgetMs?: number
  now?: Date
}

type CardHedgeCard = {
  card_id?: string
  player?: string
  description?: string
  set?: string
  number?: string
  variant?: string
  category?: string
  category_group?: string
  set_type?: string
  prices?: Array<{ grade?: string; price?: string | number }>
  '7 Day Sales'?: number | string
  '30 Day Sales'?: number | string
}

type CardHedgeRawSale = {
  price?: string | number
  sale_date?: string
  price_source?: string
  card_id?: string
  price_history_id?: string
  grade?: string
  sale_type?: string
  title?: string
  sale_url?: string
  image?: string
}

type CardHedgeComps = {
  comp_price?: string | number
  high?: string | number
  low?: string | number
  count_requested?: number
  count_used?: number
  time_weighted?: boolean
  raw_prices?: CardHedgeRawSale[] | null
}

type CardHedgeFmvResult = {
  card_id?: string
  grade?: string
  price?: number | string | null
  price_low?: number | string | null
  price_high?: number | string | null
  confidence?: number | string
  confidence_grade?: string
  method?: string
  freshness_days?: number | string | null
  fmv_window_days?: number | string | null
  fmv_sample_count?: number | string | null
  raw_price?: number | string | null
  price_explanation?: string
  error?: string
}

type HostedQueueTask = {
  playerName: string
  releaseYear: number
  priority: number
  cardId: string
  cardDescription: string
  matchScore: number
  matchReason: string
}

type HostedLaneRecord = {
  laneKey: string
  playerName: string
  releaseYear: number
  cardId: string
  cardDescription: string
  modelPrice: number | null
  compPrice: number | null
  minPrice: number
  q1Price: number
  medianPrice: number
  avgPrice: number
  q3Price: number
  maxPrice: number
  saleCount: number
  sales30: number
  sales90: number
  auctionCount: number
  binCount: number
  recent3Avg: number | null
  recent5Avg: number | null
  latestSoldAt: string
  generatedAt: string
  matchScore: number
  matchReason: string
}

type HostedSaleRecord = {
  itemId: string
  laneKey: string
  playerName: string
  releaseYear: number
  cardId: string
  title: string
  salePrice: number
  soldAt: string
  saleType: string
  channel: string
  source: string
  saleUrl: string
  imageUrl: string
  gradeBucket: string
  rawJson: string
}

type DailyExportCandidate = {
  task: HostedQueueTask
  card: CardHedgeCard
  evaluation: { eligible: boolean; score: number; reason: string }
  sales: CardHedgeRawSale[]
}

const HOSTED_COMP_SCHEMA_VERSION = 1
const BASE_AUTO_PRODUCT_FAMILY = 'Bowman Chrome'
const BASE_AUTO_VARIATION = 'Base Auto'
const BASE_AUTO_GRADE = 'Raw'
const MAX_PLAYER_NAME_LENGTH = 100
const MAX_PLAYER_BATCH = 160
const MAX_BUCKETS_PER_PLAYER = 72
const MAX_SALES_PER_PLAYER = 3_000
const DAY_MS = 24 * 60 * 60 * 1_000
const schemaPromises = new WeakMap<HostedCompSql, Promise<void>>()

function compact(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizedName(value: unknown) {
  return compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function numberOrNull(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function numberValue(value: unknown, fallback = 0) {
  return numberOrNull(value) ?? fallback
}

function stringValue(value: unknown) {
  return compact(value)
}

function releaseYearFromText(value: unknown) {
  return Number(compact(value).match(/\b(20\d{2})\b/)?.[1] ?? 0) || null
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function roundMoney(value: number | null) {
  return positive(value) ? Number(value.toFixed(2)) : null
}

function laneKeyFor(playerName: string, releaseYear: number) {
  return `${normalizedName(playerName)}|${releaseYear}|bowman-chrome|auto|base-auto|raw`
}

export function dailyExportDateCandidates(now: Date, count = 3) {
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - index - 1)
    return date.toISOString().slice(0, 10)
  })
}

export function visitCsvRows(text: string, visitor: (row: Record<string, string>) => void) {
  let headers: string[] | null = null
  let values: string[] = []
  let field = ''
  let quoted = false
  let rows = 0

  const flushRow = () => {
    values.push(field)
    field = ''
    if (!headers) {
      headers = values.map((value) => value.replace(/^\uFEFF/, '').trim())
    } else if (values.some(Boolean)) {
      visitor(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
      rows += 1
    }
    values = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (character === ',' && !quoted) {
      values.push(field)
      field = ''
      continue
    }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      flushRow()
      continue
    }
    field += character
  }
  if (field || values.length) flushRow()
  return rows
}

function stableSaleId(sale: CardHedgeRawSale, cardId: string) {
  const explicit = compact(sale.price_history_id)
  if (explicit) return `cardhedge:${explicit}`
  const ebayId = compact(sale.sale_url).match(/\/itm\/(?:[^/?#]+\/)?(\d{8,})/i)?.[1]
  if (ebayId) return `ebay:${ebayId}`
  const payload = [cardId, sale.grade, sale.sale_date, sale.price, sale.title].map(compact).join('|')
  return `cardhedge:${createHash('sha1').update(payload).digest('hex').slice(0, 24)}`
}

function channelFromSaleType(value: unknown) {
  const text = compact(value)
  if (/auction/i.test(text)) return 'Auction'
  if (/best\s*offer/i.test(text)) return 'Best Offer'
  if (/buy\s*it\s*now|\bbin\b|fixed/i.test(text)) return 'Buy It Now'
  return text || 'Unknown'
}

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0
  const index = (sorted.length - 1) * fraction
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function timeWeightedMean(sales: Array<{ price: number }>, limit = 20) {
  const rows = sales.slice(0, limit)
  if (!rows.length) return 0
  let numerator = 0
  let denominator = 0
  rows.forEach((sale, index) => {
    const weight = rows.length - index
    numerator += sale.price * weight
    denominator += weight
  })
  return denominator ? numerator / denominator : 0
}

export function evaluateBowmanBaseAutoCandidate(card: CardHedgeCard, playerName: string, releaseYear: number) {
  const description = compact(card.description)
  const cardSet = compact(card.set)
  const variant = compact(card.variant)
  const cardNumber = compact(card.number)
  const playerMatches = normalizedName(card.player) === normalizedName(playerName)
  const text = `${description} ${cardSet} ${compact(card.set_type)}`
  const year = releaseYearFromText(text)
  const reasons: string[] = []

  if (!playerMatches) return { eligible: false, score: -1, reason: 'player mismatch' }
  if (!/\bbowman\b/i.test(text)) return { eligible: false, score: -1, reason: 'not Bowman' }
  if (releaseYear && year !== releaseYear) return { eligible: false, score: -1, reason: 'release year mismatch' }
  if (!/\bauto(?:graph|graphs|graphed)?\b/i.test(description)) return { eligible: false, score: -1, reason: 'not an autograph card' }
  if (variant && !/^base$/i.test(variant)) return { eligible: false, score: -1, reason: `parallel variant: ${variant}` }
  if (
    /\b(?:paper|mega|mojo|sapphire|rookie\s+auto|rookie\s+autograph|packfractor|gold\s+ink|draft\s+nights?|portrait|class\s+of|all[- ]america|spotlight|sterling|best|inception|choice|hta|dual|pairings?|image\s+variation|printing\s+plate)\b/i.test(
      text,
    )
  ) {
    return { eligible: false, score: -1, reason: 'non-flagship autograph family' }
  }

  let score = 0
  if (/^base$/i.test(variant)) {
    score += 30
    reasons.push('base variant')
  }
  if (/^(?:CPA|CDA)-/i.test(cardNumber)) {
    score += 80
    reasons.push('flagship auto card number')
  }
  if (/\bchrome\b/i.test(description)) {
    score += 30
    reasons.push('chrome')
  }
  if (/\b(?:prospects?|draft\s+pick)\b/i.test(description)) {
    score += 25
    reasons.push('prospect family')
  }
  if (/\bauto(?:graph|graphs|graphed)?\b/i.test(description)) score += 25

  return {
    eligible: score >= 80,
    score,
    reason: reasons.join(', ') || 'weak structured match',
  }
}

export function chooseBowmanBaseAutoCard(
  cards: CardHedgeCard[],
  playerName: string,
  releaseYear: number,
): { card: CardHedgeCard; evaluation: { eligible: boolean; score: number; reason: string } } | null {
  return cards
    .map((card) => ({ card, evaluation: evaluateBowmanBaseAutoCandidate(card, playerName, releaseYear) }))
    .filter((entry) => entry.evaluation.eligible && compact(entry.card.card_id))
    .sort((left, right) => {
      const scoreDifference = right.evaluation.score - left.evaluation.score
      if (scoreDifference) return scoreDifference
      const rightSales = numberValue(right.card['30 Day Sales']) + numberValue(right.card['7 Day Sales'])
      const leftSales = numberValue(left.card['30 Day Sales']) + numberValue(left.card['7 Day Sales'])
      return rightSales - leftSales
    })[0] ?? null
}

export function summarizeHostedCompSales(comps: CardHedgeComps, now = new Date()) {
  const seen = new Set<string>()
  const sales = (Array.isArray(comps.raw_prices) ? comps.raw_prices : [])
    .map((sale) => ({
      raw: sale,
      price: numberValue(sale.price),
      soldAt: compact(sale.sale_date),
      channel: channelFromSaleType(sale.sale_type),
    }))
    .filter((sale) => sale.price > 0 && sale.soldAt)
    .filter((sale) => {
      const key = compact(sale.raw.price_history_id) || `${sale.raw.sale_url}|${sale.soldAt}|${sale.price}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => Date.parse(right.soldAt) - Date.parse(left.soldAt))
  const prices = sales.map((sale) => sale.price).sort((left, right) => left - right)
  const cutoff30 = now.getTime() - 30 * DAY_MS
  const cutoff90 = now.getTime() - 90 * DAY_MS
  const upstreamComp = numberOrNull(comps.comp_price)
  const fallbackComp = timeWeightedMean(sales)
  const modelPrice = roundMoney(positive(upstreamComp) ? upstreamComp : fallbackComp)

  return {
    sales,
    modelPrice,
    compPrice: modelPrice,
    saleCount: Math.max(numberValue(comps.count_used), sales.length),
    sales30: sales.filter((sale) => Date.parse(sale.soldAt) >= cutoff30).length,
    sales90: sales.filter((sale) => Date.parse(sale.soldAt) >= cutoff90).length,
    auctionCount: sales.filter((sale) => sale.channel === 'Auction').length,
    binCount: sales.filter((sale) => sale.channel === 'Buy It Now' || sale.channel === 'Best Offer').length,
    minPrice: roundMoney(numberOrNull(comps.low) ?? (prices[0] ?? 0)) ?? 0,
    q1Price: roundMoney(percentile(prices, 0.25)) ?? 0,
    medianPrice: roundMoney(percentile(prices, 0.5)) ?? 0,
    avgPrice: roundMoney(mean(prices)) ?? 0,
    q3Price: roundMoney(percentile(prices, 0.75)) ?? 0,
    maxPrice: roundMoney(numberOrNull(comps.high) ?? (prices.at(-1) ?? 0)) ?? 0,
    recent3Avg: roundMoney(mean(sales.slice(0, 3).map((sale) => sale.price))),
    recent5Avg: roundMoney(mean(sales.slice(0, 5).map((sale) => sale.price))),
    latestSoldAt: sales[0]?.soldAt ?? '',
  }
}

export function blendHostedCompPrice(compPrice: number | null, saleCount: number, fmv: CardHedgeFmvResult) {
  const fmvPrice = numberOrNull(fmv.price)
  const confidence = numberValue(fmv.confidence)
  const method = compact(fmv.method).toLowerCase()
  const direct = method === 'direct' || method === 'direct_indexed'
  if (!positive(fmvPrice)) return roundMoney(compPrice)
  if (!positive(compPrice)) return direct && confidence >= 0.45 ? roundMoney(fmvPrice) : null
  if (!direct || confidence < 0.4) return roundMoney(compPrice)

  const compWeight = saleCount >= 8 ? 0.75 : saleCount >= 3 ? 0.62 : 0.42
  return roundMoney(compPrice * compWeight + fmvPrice * (1 - compWeight))
}

async function ensureHostedCompSchemaInternal(sql: HostedCompSql) {
  await sql`
    CREATE TABLE IF NOT EXISTS backstop_comp_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS backstop_comp_lanes (
      lane_key TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      player_lookup TEXT NOT NULL,
      release_year INTEGER NOT NULL,
      product_family TEXT NOT NULL DEFAULT 'Bowman Chrome',
      card_class TEXT NOT NULL DEFAULT 'auto',
      variation_label TEXT NOT NULL DEFAULT 'Base Auto',
      grade_bucket TEXT NOT NULL DEFAULT 'Raw',
      serial_denominator INTEGER,
      card_id TEXT,
      card_description TEXT NOT NULL DEFAULT '',
      card_match_score DOUBLE PRECISION NOT NULL DEFAULT 0,
      card_match_reason TEXT NOT NULL DEFAULT '',
      model_price DOUBLE PRECISION,
      comp_price DOUBLE PRECISION,
      fmv_price DOUBLE PRECISION,
      fmv_low DOUBLE PRECISION,
      fmv_high DOUBLE PRECISION,
      fmv_confidence DOUBLE PRECISION,
      fmv_confidence_grade TEXT NOT NULL DEFAULT '',
      fmv_method TEXT NOT NULL DEFAULT '',
      fmv_freshness_days INTEGER,
      min_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      q1_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      median_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      avg_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      q3_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      max_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      recent_3_avg DOUBLE PRECISION,
      recent_5_avg DOUBLE PRECISION,
      sale_count INTEGER NOT NULL DEFAULT 0,
      sales_30 INTEGER NOT NULL DEFAULT 0,
      sales_90 INTEGER NOT NULL DEFAULT 0,
      auction_count INTEGER NOT NULL DEFAULT 0,
      bin_count INTEGER NOT NULL DEFAULT 0,
      latest_sold_at TIMESTAMPTZ,
      last_comp_at TIMESTAMPTZ,
      last_fmv_at TIMESTAMPTZ,
      source TEXT NOT NULL DEFAULT 'card-hedge-hosted',
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (player_lookup, release_year, product_family, card_class, variation_label, grade_bucket)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_backstop_comp_lanes_player ON backstop_comp_lanes (player_lookup, release_year DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_backstop_comp_lanes_refresh ON backstop_comp_lanes (last_fmv_at, last_comp_at)`
  await sql`
    CREATE TABLE IF NOT EXISTS backstop_comp_sales (
      item_id TEXT PRIMARY KEY,
      lane_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      player_lookup TEXT NOT NULL,
      release_year INTEGER NOT NULL,
      card_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      sale_price DOUBLE PRECISION NOT NULL,
      sold_at TIMESTAMPTZ NOT NULL,
      sale_type TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'card-hedge-comps',
      sale_url TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      grade_bucket TEXT NOT NULL DEFAULT 'Raw',
      erroneous BOOLEAN NOT NULL DEFAULT FALSE,
      erroneous_note TEXT NOT NULL DEFAULT '',
      raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_backstop_comp_sales_player ON backstop_comp_sales (player_lookup, release_year, sold_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_backstop_comp_sales_lane ON backstop_comp_sales (lane_key, sold_at DESC)`
  await sql`
    CREATE TABLE IF NOT EXISTS backstop_comp_refresh_queue (
      player_name TEXT NOT NULL,
      player_lookup TEXT NOT NULL,
      release_year INTEGER NOT NULL,
      priority DOUBLE PRECISION NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      error TEXT NOT NULL DEFAULT '',
      claimed_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (player_lookup, release_year)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_backstop_comp_queue_claim ON backstop_comp_refresh_queue (status, next_attempt_at, priority DESC)`
  await sql`
    CREATE TABLE IF NOT EXISTS backstop_comp_sync_runs (
      run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      claimed_players INTEGER NOT NULL DEFAULT 0,
      completed_players INTEGER NOT NULL DEFAULT 0,
      matched_players INTEGER NOT NULL DEFAULT 0,
      missing_players INTEGER NOT NULL DEFAULT 0,
      failed_players INTEGER NOT NULL DEFAULT 0,
      comp_sales_upserted INTEGER NOT NULL DEFAULT 0,
      fmv_cards_refreshed INTEGER NOT NULL DEFAULT 0,
      daily_export_date TEXT NOT NULL DEFAULT '',
      daily_export_rows INTEGER NOT NULL DEFAULT 0,
      daily_export_matched_sales INTEGER NOT NULL DEFAULT 0,
      api_calls INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT ''
    )
  `
  await sql`ALTER TABLE backstop_comp_sync_runs ADD COLUMN IF NOT EXISTS daily_export_date TEXT NOT NULL DEFAULT ''`
  await sql`ALTER TABLE backstop_comp_sync_runs ADD COLUMN IF NOT EXISTS daily_export_rows INTEGER NOT NULL DEFAULT 0`
  await sql`ALTER TABLE backstop_comp_sync_runs ADD COLUMN IF NOT EXISTS daily_export_matched_sales INTEGER NOT NULL DEFAULT 0`
  await sql`
    INSERT INTO backstop_comp_meta (key, value, updated_at)
    VALUES ('schema_version', ${String(HOSTED_COMP_SCHEMA_VERSION)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
  `
}

export async function ensureHostedCompSchema(sql: HostedCompSql) {
  const existing = schemaPromises.get(sql)
  if (existing) return existing
  const next = ensureHostedCompSchemaInternal(sql).catch((error) => {
    schemaPromises.delete(sql)
    throw error
  })
  schemaPromises.set(sql, next)
  return next
}

export async function bootstrapHostedCompData(sql: HostedCompSql) {
  await ensureHostedCompSchema(sql)
  const [queueCountRow] = await sql`SELECT COUNT(*)::INTEGER AS count FROM backstop_comp_refresh_queue`
  const queueCount = numberValue(queueCountRow?.count)
  if (queueCount < HOSTED_COMP_QUEUE_SEEDS.length) {
    const payload = JSON.stringify(
      HOSTED_COMP_QUEUE_SEEDS.map(([playerName, releaseYear, priority]) => ({
        player_name: playerName,
        player_lookup: normalizedName(playerName),
        release_year: releaseYear,
        priority,
      })),
    )
    await sql`
      INSERT INTO backstop_comp_refresh_queue (
        player_name, player_lookup, release_year, priority, status, next_attempt_at, updated_at
      )
      SELECT
        seed.player_name,
        seed.player_lookup,
        seed.release_year,
        seed.priority,
        'queued',
        NOW(),
        NOW()
      FROM jsonb_to_recordset(${payload}::jsonb) AS seed(
        player_name TEXT,
        player_lookup TEXT,
        release_year INTEGER,
        priority DOUBLE PRECISION
      )
      ON CONFLICT (player_lookup, release_year) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        priority = GREATEST(backstop_comp_refresh_queue.priority, EXCLUDED.priority)
    `
  }

  const [laneCountRow] = await sql`SELECT COUNT(*)::INTEGER AS count FROM backstop_comp_lanes`
  const laneCount = numberValue(laneCountRow?.count)
  if (laneCount < HOSTED_COMP_LANE_SEEDS.length) {
    const payload = JSON.stringify(
      HOSTED_COMP_LANE_SEEDS.map((row) => ({
        player_name: row[0],
        player_lookup: normalizedName(row[0]),
        release_year: row[1],
        card_id: row[2],
        card_description: row[3],
        model_price: row[4],
        min_price: row[5],
        q1_price: row[6],
        median_price: row[7],
        avg_price: row[8],
        q3_price: row[9],
        max_price: row[10],
        sale_count: row[11],
        sales_30: row[12],
        sales_90: row[13],
        auction_count: row[14],
        bin_count: row[15],
        latest_sold_at: row[16] || null,
        generated_at: row[17] || new Date(0).toISOString(),
        lane_key: laneKeyFor(row[0], row[1]),
      })),
    )
    await sql`
      INSERT INTO backstop_comp_lanes (
        lane_key, player_name, player_lookup, release_year, card_id, card_description,
        model_price, comp_price, min_price, q1_price, median_price, avg_price, q3_price, max_price,
        sale_count, sales_30, sales_90, auction_count, bin_count, latest_sold_at, generated_at, updated_at,
        card_match_reason, source
      )
      SELECT
        seed.lane_key,
        seed.player_name,
        seed.player_lookup,
        seed.release_year,
        NULLIF(seed.card_id, ''),
        seed.card_description,
        seed.model_price,
        seed.model_price,
        seed.min_price,
        seed.q1_price,
        seed.median_price,
        seed.avg_price,
        seed.q3_price,
        seed.max_price,
        seed.sale_count,
        seed.sales_30,
        seed.sales_90,
        seed.auction_count,
        seed.bin_count,
        seed.latest_sold_at,
        seed.generated_at,
        seed.generated_at,
        'bootstrapped from canonical local model',
        'canonical-bootstrap'
      FROM jsonb_to_recordset(${payload}::jsonb) AS seed(
        lane_key TEXT,
        player_name TEXT,
        player_lookup TEXT,
        release_year INTEGER,
        card_id TEXT,
        card_description TEXT,
        model_price DOUBLE PRECISION,
        min_price DOUBLE PRECISION,
        q1_price DOUBLE PRECISION,
        median_price DOUBLE PRECISION,
        avg_price DOUBLE PRECISION,
        q3_price DOUBLE PRECISION,
        max_price DOUBLE PRECISION,
        sale_count INTEGER,
        sales_30 INTEGER,
        sales_90 INTEGER,
        auction_count INTEGER,
        bin_count INTEGER,
        latest_sold_at TIMESTAMPTZ,
        generated_at TIMESTAMPTZ
      )
      ON CONFLICT (lane_key) DO NOTHING
    `
  }

  return { queueSeeds: HOSTED_COMP_QUEUE_SEEDS.length, laneSeeds: HOSTED_COMP_LANE_SEEDS.length }
}

export async function queueHostedCompPlayer(sql: HostedCompSql, playerName: string, releaseYear: number) {
  await bootstrapHostedCompData(sql)
  const name = compact(playerName)
  const year = Math.floor(releaseYear)
  if (!name) throw new Error('Player is required')
  if (name.length > MAX_PLAYER_NAME_LENGTH) throw new Error('Player is too long')
  if (year < 2000 || year > new Date().getFullYear() + 1) throw new Error('Release year is invalid')

  await sql`
    INSERT INTO backstop_comp_refresh_queue (
      player_name, player_lookup, release_year, priority, status, next_attempt_at, error, claimed_by, updated_at
    )
    VALUES (${name}, ${normalizedName(name)}, ${year}, 1000000, 'queued', NOW(), '', '', NOW())
    ON CONFLICT (player_lookup, release_year) DO UPDATE SET
      player_name = EXCLUDED.player_name,
      priority = GREATEST(backstop_comp_refresh_queue.priority, EXCLUDED.priority),
      status = CASE WHEN backstop_comp_refresh_queue.status = 'running' THEN 'running' ELSE 'queued' END,
      next_attempt_at = CASE WHEN backstop_comp_refresh_queue.status = 'running' THEN backstop_comp_refresh_queue.next_attempt_at ELSE NOW() END,
      error = CASE WHEN backstop_comp_refresh_queue.status = 'running' THEN backstop_comp_refresh_queue.error ELSE '' END,
      claimed_by = CASE WHEN backstop_comp_refresh_queue.status = 'running' THEN backstop_comp_refresh_queue.claimed_by ELSE '' END,
      updated_at = NOW()
  `

  return { playerName: name, releaseYear: year }
}

function hostedLaneToBucket(row: Record<string, unknown>) {
  return {
    bucketKey: stringValue(row.laneKey),
    playerName: stringValue(row.playerName),
    releaseYear: numberOrNull(row.releaseYear),
    productFamily: stringValue(row.productFamily) || BASE_AUTO_PRODUCT_FAMILY,
    cardClass: stringValue(row.cardClass) || 'auto',
    variationLabel: stringValue(row.variationLabel) || BASE_AUTO_VARIATION,
    gradeBucket: stringValue(row.gradeBucket) || BASE_AUTO_GRADE,
    serialDenominator: numberOrNull(row.serialDenominator),
    saleCount: numberValue(row.saleCount),
    sales30: numberValue(row.sales30),
    sales90: numberValue(row.sales90),
    auctionCount: numberValue(row.auctionCount),
    binCount: numberValue(row.binCount),
    minPrice: numberValue(row.minPrice),
    q1Price: numberValue(row.q1Price),
    medianPrice: numberValue(row.medianPrice),
    avgPrice: numberValue(row.avgPrice),
    q3Price: numberValue(row.q3Price),
    maxPrice: numberValue(row.maxPrice),
    modelPrice: numberValue(row.modelPrice),
    baseAutoMultiple: 1,
    latestSoldAt: stringValue(row.latestSoldAt),
    generatedAt: stringValue(row.generatedAt),
  }
}

function hostedSaleToPublic(row: Record<string, unknown>) {
  const saleType = stringValue(row.saleType)
  const channel = stringValue(row.channel) || channelFromSaleType(saleType)
  const erroneous = row.erroneous === true
  return {
    itemId: stringValue(row.itemId),
    playerName: stringValue(row.playerName),
    title: stringValue(row.title),
    salePriceText: `$${numberValue(row.salePrice).toFixed(2)}`,
    salePrice: numberValue(row.salePrice),
    soldAt: stringValue(row.soldAt),
    saleType,
    channel,
    seller: '',
    sourcePage: null,
    sourceOffset: 0,
    releaseYear: numberOrNull(row.releaseYear),
    productFamily: BASE_AUTO_PRODUCT_FAMILY,
    cardClass: 'auto',
    variationLabel: BASE_AUTO_VARIATION,
    serialDenominator: null,
    gradeCompany: null,
    gradeValue: null,
    gradeBucket: BASE_AUTO_GRADE,
    insertName: null,
    bucketKey: stringValue(row.laneKey),
    modelEligible: !erroneous,
    exclusionReason: erroneous ? 'user flagged' : null,
    isAuto: true,
    isBowman: true,
    isChrome: true,
    isPaper: false,
    isCaseHit: false,
    isInsert: false,
    isRedemption: /redemption/i.test(stringValue(row.title)),
    isRedeemed: false,
    isDigital: false,
    isLot: false,
    erroneous,
    erroneousNote: stringValue(row.erroneousNote),
    flagUpdatedAt: '',
    saleUrl: stringValue(row.saleUrl),
  }
}

function rowsByPlayer(rows: Record<string, unknown>[]) {
  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const key = normalizedName(row.playerName)
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }
  return grouped
}

function playerModelFromLaneRows(playerName: string, rows: Record<string, unknown>[], sales: Record<string, unknown>[] = []) {
  const buckets = rows.map(hostedLaneToBucket).slice(0, MAX_BUCKETS_PER_PLAYER)
  const baseAutoBucket = [...buckets]
    .filter((bucket) => bucket.modelPrice > 0)
    .sort((left, right) => numberValue(right.releaseYear) - numberValue(left.releaseYear) || right.saleCount - left.saleCount)[0] ?? null
  const generatedAt = rows.map((row) => stringValue(row.generatedAt)).filter(Boolean).sort().at(-1) ?? ''
  return {
    available: buckets.length > 0,
    playerName: stringValue(rows[0]?.playerName) || playerName,
    generatedAt,
    totalRows: sales.length || buckets.reduce((sum, bucket) => sum + bucket.saleCount, 0),
    modelEligibleRows: sales.filter((sale) => sale.erroneous !== true).length || buckets.reduce((sum, bucket) => sum + bucket.saleCount, 0),
    excludedRows: sales.filter((sale) => sale.erroneous === true).length,
    bucketCount: buckets.length,
    modeledSales: buckets.reduce((sum, bucket) => sum + bucket.saleCount, 0),
    baseAutoPrice: baseAutoBucket?.modelPrice ?? null,
    baseAutoBucket,
    buckets,
    sales: sales.map(hostedSaleToPublic),
    exclusions: [],
    message: buckets.length ? undefined : 'No hosted sold model for this player yet.',
  }
}

export async function hostedCompPlayersPayload(sql: HostedCompSql, playerNames: string[]) {
  await bootstrapHostedCompData(sql)
  const uniqueNames = [...new Set(playerNames.map(compact).filter(Boolean))].slice(0, MAX_PLAYER_BATCH)
  if (!uniqueNames.length) return { available: true, dbName: 'neon', requested: 0, missing: [], players: [] }
  if (uniqueNames.some((name) => name.length > MAX_PLAYER_NAME_LENGTH)) throw new Error('One or more player names are too long')
  const lookups = uniqueNames.map(normalizedName)
  const rows = await sql`
    SELECT
      lane_key AS "laneKey", player_name AS "playerName", release_year AS "releaseYear",
      product_family AS "productFamily", card_class AS "cardClass", variation_label AS "variationLabel",
      grade_bucket AS "gradeBucket", serial_denominator AS "serialDenominator", sale_count AS "saleCount",
      sales_30 AS "sales30", sales_90 AS "sales90", auction_count AS "auctionCount", bin_count AS "binCount",
      min_price AS "minPrice", q1_price AS "q1Price", median_price AS "medianPrice", avg_price AS "avgPrice",
      q3_price AS "q3Price", max_price AS "maxPrice", model_price AS "modelPrice",
      latest_sold_at AS "latestSoldAt", generated_at AS "generatedAt"
    FROM backstop_comp_lanes
    WHERE player_lookup IN (SELECT value FROM jsonb_array_elements_text(${JSON.stringify(lookups)}::jsonb))
      AND model_price > 0
    ORDER BY player_lookup, release_year DESC, sale_count DESC
  `
  const grouped = rowsByPlayer(rows)
  const players = uniqueNames
    .map((playerName) => playerModelFromLaneRows(playerName, grouped.get(normalizedName(playerName)) ?? []))
    .filter((model) => model.available)
  const found = new Set(players.map((model) => normalizedName(model.playerName)))
  return {
    available: true,
    dbName: 'neon',
    requested: uniqueNames.length,
    missing: uniqueNames.filter((name) => !found.has(normalizedName(name))),
    players,
  }
}

export async function hostedCompPlayerPayload(sql: HostedCompSql, playerName: string) {
  await bootstrapHostedCompData(sql)
  const requestedName = compact(playerName)
  if (!requestedName) throw new Error('Player is required')
  if (requestedName.length > MAX_PLAYER_NAME_LENGTH) throw new Error('Player is too long')
  const lookup = normalizedName(requestedName)
  const rows = await sql`
    SELECT
      lane_key AS "laneKey", player_name AS "playerName", release_year AS "releaseYear",
      product_family AS "productFamily", card_class AS "cardClass", variation_label AS "variationLabel",
      grade_bucket AS "gradeBucket", serial_denominator AS "serialDenominator", sale_count AS "saleCount",
      sales_30 AS "sales30", sales_90 AS "sales90", auction_count AS "auctionCount", bin_count AS "binCount",
      min_price AS "minPrice", q1_price AS "q1Price", median_price AS "medianPrice", avg_price AS "avgPrice",
      q3_price AS "q3Price", max_price AS "maxPrice", model_price AS "modelPrice",
      latest_sold_at AS "latestSoldAt", generated_at AS "generatedAt"
    FROM backstop_comp_lanes
    WHERE player_lookup = ${lookup}
      AND model_price > 0
    ORDER BY release_year DESC, sale_count DESC
    LIMIT ${MAX_BUCKETS_PER_PLAYER}
  `
  if (!rows.length) return { available: false, playerName: requestedName, message: 'No hosted sold model for this player yet.' }
  const sales = await sql`
    SELECT
      item_id AS "itemId", lane_key AS "laneKey", player_name AS "playerName", release_year AS "releaseYear",
      title, sale_price AS "salePrice", sold_at AS "soldAt", sale_type AS "saleType", channel,
      sale_url AS "saleUrl", erroneous, erroneous_note AS "erroneousNote"
    FROM backstop_comp_sales
    WHERE player_lookup = ${lookup}
    ORDER BY sold_at ASC, sale_price ASC
    LIMIT ${MAX_SALES_PER_PLAYER}
  `
  return playerModelFromLaneRows(requestedName, rows, sales)
}

export async function hostedCompStatusPayload(sql: HostedCompSql) {
  const bootstrap = await bootstrapHostedCompData(sql)
  const [laneStats] = await sql`
    SELECT
      COUNT(*)::INTEGER AS "bucketCount",
      COUNT(DISTINCT player_lookup)::INTEGER AS "playerCount",
      COALESCE(SUM(sale_count), 0)::INTEGER AS "modeledSales",
      MAX(generated_at) AS "generatedAt",
      MAX(latest_sold_at) AS "latestSoldAt",
      MAX(updated_at) AS "updatedAt",
      COUNT(*) FILTER (WHERE card_id IS NOT NULL)::INTEGER AS "matchedCards",
      COUNT(*) FILTER (WHERE last_fmv_at >= NOW() - INTERVAL '24 hours')::INTEGER AS "freshFmvLanes",
      COUNT(*) FILTER (WHERE last_comp_at >= NOW() - INTERVAL '26 hours')::INTEGER AS "freshCompLanes"
    FROM backstop_comp_lanes
  `
  const [saleStats] = await sql`
    SELECT
      COUNT(*)::INTEGER AS rows,
      COUNT(DISTINCT player_lookup)::INTEGER AS players,
      MIN(sold_at) AS "earliestSoldAt",
      MAX(sold_at) AS "latestSoldAt",
      MAX(imported_at) AS "latestImportedAt"
    FROM backstop_comp_sales
  `
  const queueRows = await sql`
    SELECT status, COUNT(*)::INTEGER AS players
    FROM backstop_comp_refresh_queue
    GROUP BY status
    ORDER BY status
  `
  const [run] = await sql`
    SELECT
      run_id AS "runId", status, started_at AS "startedAt", completed_at AS "completedAt",
      claimed_players AS "claimedPlayers", completed_players AS "completedPlayers",
      matched_players AS "matchedPlayers", missing_players AS "missingPlayers", failed_players AS "failedPlayers",
      comp_sales_upserted AS "compSalesUpserted", fmv_cards_refreshed AS "fmvCardsRefreshed",
      daily_export_date AS "dailyExportDate", daily_export_rows AS "dailyExportRows",
      daily_export_matched_sales AS "dailyExportMatchedSales", api_calls AS "apiCalls", error
    FROM backstop_comp_sync_runs
    ORDER BY started_at DESC
    LIMIT 1
  `
  const playerCount = numberValue(laneStats?.playerCount)
  const bucketCount = numberValue(laneStats?.bucketCount)
  const modeledSales = numberValue(laneStats?.modeledSales)
  const generatedAt = stringValue(laneStats?.generatedAt)
  const latestSoldAt = stringValue(laneStats?.latestSoldAt)
  const updatedAt = stringValue(laneStats?.updatedAt)
  return {
    available: true,
    dbName: 'neon',
    configured: true,
    playerCount,
    bucketCount,
    modeledSales,
    generatedAt,
    raw: {
      rows: numberValue(saleStats?.rows),
      players: numberValue(saleStats?.players),
      earliestSoldAt: stringValue(saleStats?.earliestSoldAt),
      latestSoldAt: stringValue(saleStats?.latestSoldAt),
      latestImportedAt: stringValue(saleStats?.latestImportedAt),
    },
    normalized: { rows: numberValue(saleStats?.rows), modelEligibleRows: numberValue(saleStats?.rows), excludedRows: 0 },
    canonical: { cards: bucketCount, players: playerCount, summaries: bucketCount, summarizedSales: modeledSales, latestSoldAt, updatedAt },
    cardHedge: {
      cards: numberValue(laneStats?.matchedCards),
      players: playerCount,
      sales: numberValue(saleStats?.rows),
      latestSoldAt: stringValue(saleStats?.latestSoldAt),
      latestImportedAt: stringValue(saleStats?.latestImportedAt),
    },
    cleanup: { reviewedRows: 0, flaggedRows: 0, bucketOverrides: 0, latestOverrideAt: '' },
    hosted: {
      queueSeeds: bootstrap.queueSeeds,
      laneSeeds: bootstrap.laneSeeds,
      freshFmvLanes: numberValue(laneStats?.freshFmvLanes),
      freshCompLanes: numberValue(laneStats?.freshCompLanes),
      queue: queueRows.map((row) => ({ status: stringValue(row.status), players: numberValue(row.players) })),
      latestRun: run ?? null,
    },
  }
}

async function claimHostedTasks(sql: HostedCompSql, runId: string, limit: number) {
  const rows = await sql`
    WITH selected AS (
      SELECT queue.player_lookup, queue.release_year
      FROM backstop_comp_refresh_queue AS queue
      LEFT JOIN backstop_comp_lanes AS lane
        ON lane.player_lookup = queue.player_lookup
       AND lane.release_year = queue.release_year
      WHERE queue.next_attempt_at <= NOW()
        AND (
          queue.status IN ('queued', 'error', 'no-match', 'waiting-sales')
          OR (queue.status = 'done' AND COALESCE(queue.last_success_at, '-infinity'::timestamptz) < NOW() - INTERVAL '20 hours')
        )
      ORDER BY
        CASE WHEN lane.card_id IS NOT NULL AND lane.card_id <> '' THEN 0 ELSE 1 END,
        CASE queue.status WHEN 'queued' THEN 0 WHEN 'error' THEN 1 WHEN 'waiting-sales' THEN 2 WHEN 'no-match' THEN 3 ELSE 4 END,
        queue.priority DESC,
        queue.release_year DESC,
        queue.player_name
      LIMIT ${limit}
    )
    UPDATE backstop_comp_refresh_queue AS queue
    SET
      status = 'running',
      claimed_by = ${runId},
      attempts = attempts + 1,
      last_attempt_at = NOW(),
      updated_at = NOW(),
      error = ''
    FROM selected
    WHERE queue.player_lookup = selected.player_lookup
      AND queue.release_year = selected.release_year
      AND queue.status <> 'running'
    RETURNING queue.player_name AS "playerName", queue.player_lookup AS "playerLookup", queue.release_year AS "releaseYear", queue.priority
  `
  if (!rows.length) return [] satisfies HostedQueueTask[]
  const lookups = rows.map((row) => stringValue(row.playerLookup))
  const years = rows.map((row) => numberValue(row.releaseYear))
  const lanes = await sql`
    SELECT
      player_lookup AS "playerLookup", release_year AS "releaseYear", card_id AS "cardId",
      card_description AS "cardDescription", card_match_score AS "matchScore", card_match_reason AS "matchReason"
    FROM backstop_comp_lanes
    WHERE player_lookup IN (SELECT value FROM jsonb_array_elements_text(${JSON.stringify(lookups)}::jsonb))
      AND release_year IN (SELECT value::INTEGER FROM jsonb_array_elements_text(${JSON.stringify(years.map(String))}::jsonb))
  `
  const laneByPlayerYear = new Map(
    lanes.map((row) => [`${stringValue(row.playerLookup)}|${numberValue(row.releaseYear)}`, row]),
  )
  return rows.map((row) => {
    const lane = laneByPlayerYear.get(`${stringValue(row.playerLookup)}|${numberValue(row.releaseYear)}`)
    return {
      playerName: stringValue(row.playerName),
      releaseYear: numberValue(row.releaseYear),
      priority: numberValue(row.priority),
      cardId: stringValue(lane?.cardId),
      cardDescription: stringValue(lane?.cardDescription),
      matchScore: numberValue(lane?.matchScore),
      matchReason: stringValue(lane?.matchReason),
    }
  }) satisfies HostedQueueTask[]
}

async function updateQueueTask(
  sql: HostedCompSql,
  task: HostedQueueTask,
  status: 'done' | 'waiting-sales' | 'no-match' | 'error',
  error = '',
) {
  const retryHours = status === 'done' ? 20 : status === 'waiting-sales' ? 24 : status === 'no-match' ? 7 * 24 : 6
  await sql`
    UPDATE backstop_comp_refresh_queue
    SET
      status = ${status},
      last_success_at = CASE WHEN ${status} IN ('done', 'waiting-sales') THEN NOW() ELSE last_success_at END,
      next_attempt_at = NOW() + (${retryHours} * INTERVAL '1 hour'),
      error = ${error.slice(0, 1_000)},
      claimed_by = '',
      updated_at = NOW()
    WHERE player_lookup = ${normalizedName(task.playerName)}
      AND release_year = ${task.releaseYear}
  `
}

async function upsertHostedLane(sql: HostedCompSql, lane: HostedLaneRecord) {
  await upsertHostedLanes(sql, [lane])
}

async function upsertHostedLanes(sql: HostedCompSql, lanes: HostedLaneRecord[]) {
  if (!lanes.length) return 0
  const payload = JSON.stringify(
    lanes.map((lane) => ({
      lane_key: lane.laneKey,
      player_name: lane.playerName,
      player_lookup: normalizedName(lane.playerName),
      release_year: lane.releaseYear,
      card_id: lane.cardId,
      card_description: lane.cardDescription,
      card_match_score: lane.matchScore,
      card_match_reason: lane.matchReason,
      model_price: lane.modelPrice,
      comp_price: lane.compPrice,
      min_price: lane.minPrice,
      q1_price: lane.q1Price,
      median_price: lane.medianPrice,
      avg_price: lane.avgPrice,
      q3_price: lane.q3Price,
      max_price: lane.maxPrice,
      recent_3_avg: lane.recent3Avg,
      recent_5_avg: lane.recent5Avg,
      sale_count: lane.saleCount,
      sales_30: lane.sales30,
      sales_90: lane.sales90,
      auction_count: lane.auctionCount,
      bin_count: lane.binCount,
      latest_sold_at: lane.latestSoldAt || null,
      generated_at: lane.generatedAt,
    })),
  )
  await sql`
    INSERT INTO backstop_comp_lanes (
      lane_key, player_name, player_lookup, release_year, card_id, card_description,
      card_match_score, card_match_reason, model_price, comp_price,
      min_price, q1_price, median_price, avg_price, q3_price, max_price,
      recent_3_avg, recent_5_avg, sale_count, sales_30, sales_90, auction_count, bin_count,
      latest_sold_at, last_comp_at, source, generated_at, updated_at
    )
    SELECT
      lane.lane_key, lane.player_name, lane.player_lookup, lane.release_year, lane.card_id, lane.card_description,
      lane.card_match_score, lane.card_match_reason, lane.model_price, lane.comp_price,
      lane.min_price, lane.q1_price, lane.median_price, lane.avg_price, lane.q3_price, lane.max_price,
      lane.recent_3_avg, lane.recent_5_avg, lane.sale_count, lane.sales_30, lane.sales_90, lane.auction_count, lane.bin_count,
      lane.latest_sold_at, NOW(), 'card-hedge-hosted', lane.generated_at, NOW()
    FROM jsonb_to_recordset(${payload}::jsonb) AS lane(
      lane_key TEXT,
      player_name TEXT,
      player_lookup TEXT,
      release_year INTEGER,
      card_id TEXT,
      card_description TEXT,
      card_match_score DOUBLE PRECISION,
      card_match_reason TEXT,
      model_price DOUBLE PRECISION,
      comp_price DOUBLE PRECISION,
      min_price DOUBLE PRECISION,
      q1_price DOUBLE PRECISION,
      median_price DOUBLE PRECISION,
      avg_price DOUBLE PRECISION,
      q3_price DOUBLE PRECISION,
      max_price DOUBLE PRECISION,
      recent_3_avg DOUBLE PRECISION,
      recent_5_avg DOUBLE PRECISION,
      sale_count INTEGER,
      sales_30 INTEGER,
      sales_90 INTEGER,
      auction_count INTEGER,
      bin_count INTEGER,
      latest_sold_at TIMESTAMPTZ,
      generated_at TIMESTAMPTZ
    )
    ON CONFLICT (lane_key) DO UPDATE SET
      player_name = EXCLUDED.player_name,
      card_id = EXCLUDED.card_id,
      card_description = EXCLUDED.card_description,
      card_match_score = EXCLUDED.card_match_score,
      card_match_reason = EXCLUDED.card_match_reason,
      model_price = COALESCE(EXCLUDED.model_price, backstop_comp_lanes.model_price),
      comp_price = COALESCE(EXCLUDED.comp_price, backstop_comp_lanes.comp_price),
      min_price = EXCLUDED.min_price,
      q1_price = EXCLUDED.q1_price,
      median_price = EXCLUDED.median_price,
      avg_price = EXCLUDED.avg_price,
      q3_price = EXCLUDED.q3_price,
      max_price = EXCLUDED.max_price,
      recent_3_avg = EXCLUDED.recent_3_avg,
      recent_5_avg = EXCLUDED.recent_5_avg,
      sale_count = EXCLUDED.sale_count,
      sales_30 = EXCLUDED.sales_30,
      sales_90 = EXCLUDED.sales_90,
      auction_count = EXCLUDED.auction_count,
      bin_count = EXCLUDED.bin_count,
      latest_sold_at = EXCLUDED.latest_sold_at,
      last_comp_at = NOW(),
      source = EXCLUDED.source,
      generated_at = EXCLUDED.generated_at,
      updated_at = NOW()
  `
  return lanes.length
}

async function upsertHostedSales(sql: HostedCompSql, sales: HostedSaleRecord[]) {
  if (!sales.length) return 0
  const payload = JSON.stringify(
    sales.map((sale) => ({
      item_id: sale.itemId,
      lane_key: sale.laneKey,
      player_name: sale.playerName,
      player_lookup: normalizedName(sale.playerName),
      release_year: sale.releaseYear,
      card_id: sale.cardId,
      title: sale.title,
      sale_price: sale.salePrice,
      sold_at: sale.soldAt,
      sale_type: sale.saleType,
      channel: sale.channel,
      source: sale.source,
      sale_url: sale.saleUrl,
      image_url: sale.imageUrl,
      grade_bucket: sale.gradeBucket,
      raw_json: JSON.parse(sale.rawJson) as unknown,
    })),
  )
  await sql`
    INSERT INTO backstop_comp_sales (
      item_id, lane_key, player_name, player_lookup, release_year, card_id, title, sale_price,
      sold_at, sale_type, channel, source, sale_url, image_url, grade_bucket, raw_json, imported_at
    )
    SELECT
      sale.item_id,
      sale.lane_key,
      sale.player_name,
      sale.player_lookup,
      sale.release_year,
      sale.card_id,
      sale.title,
      sale.sale_price,
      sale.sold_at,
      sale.sale_type,
      sale.channel,
      sale.source,
      sale.sale_url,
      sale.image_url,
      sale.grade_bucket,
      sale.raw_json,
      NOW()
    FROM jsonb_to_recordset(${payload}::jsonb) AS sale(
      item_id TEXT,
      lane_key TEXT,
      player_name TEXT,
      player_lookup TEXT,
      release_year INTEGER,
      card_id TEXT,
      title TEXT,
      sale_price DOUBLE PRECISION,
      sold_at TIMESTAMPTZ,
      sale_type TEXT,
      channel TEXT,
      source TEXT,
      sale_url TEXT,
      image_url TEXT,
      grade_bucket TEXT,
      raw_json JSONB
    )
    ON CONFLICT (item_id) DO UPDATE SET
      lane_key = EXCLUDED.lane_key,
      player_name = EXCLUDED.player_name,
      player_lookup = EXCLUDED.player_lookup,
      release_year = EXCLUDED.release_year,
      card_id = EXCLUDED.card_id,
      title = EXCLUDED.title,
      sale_price = EXCLUDED.sale_price,
      sold_at = EXCLUDED.sold_at,
      sale_type = EXCLUDED.sale_type,
      channel = EXCLUDED.channel,
      sale_url = EXCLUDED.sale_url,
      image_url = EXCLUDED.image_url,
      raw_json = EXCLUDED.raw_json,
      imported_at = NOW()
  `
  return sales.length
}

async function hostedDailyExportAlreadyIngested(sql: HostedCompSql, date: string) {
  const [row] = await sql`SELECT value FROM backstop_comp_meta WHERE key = 'daily_export_date'`
  return stringValue(row?.value) === date
}

async function ingestHostedDailyExport(sql: HostedCompSql, text: string, date: string, now: Date) {
  const queueRows = await sql`
    SELECT player_name AS "playerName", player_lookup AS "playerLookup", release_year AS "releaseYear", priority
    FROM backstop_comp_refresh_queue
  `
  const laneRows = await sql`
    SELECT
      player_lookup AS "playerLookup", release_year AS "releaseYear", card_id AS "cardId",
      card_description AS "cardDescription", card_match_score AS "matchScore", card_match_reason AS "matchReason"
    FROM backstop_comp_lanes
    WHERE card_id IS NOT NULL AND card_id <> ''
  `
  const existingByKey = new Map(
    laneRows.map((row) => [`${stringValue(row.playerLookup)}|${numberValue(row.releaseYear)}`, row]),
  )
  const taskByKey = new Map<string, HostedQueueTask>()
  for (const row of queueRows) {
    const key = `${stringValue(row.playerLookup)}|${numberValue(row.releaseYear)}`
    const lane = existingByKey.get(key)
    taskByKey.set(key, {
      playerName: stringValue(row.playerName),
      releaseYear: numberValue(row.releaseYear),
      priority: numberValue(row.priority),
      cardId: stringValue(lane?.cardId),
      cardDescription: stringValue(lane?.cardDescription),
      matchScore: numberValue(lane?.matchScore),
      matchReason: stringValue(lane?.matchReason),
    })
  }

  const candidatesByTask = new Map<string, Map<string, DailyExportCandidate>>()
  const parsedRows = visitCsvRows(text, (row) => {
    if (!/^raw$/i.test(compact(row.grade))) return
    const playerName = compact(row.player)
    const releaseYear = Number(row.year ?? 0)
    const taskKey = `${normalizedName(playerName)}|${releaseYear}`
    const task = taskByKey.get(taskKey)
    if (!task) return
    const card: CardHedgeCard = {
      card_id: compact(row.card_id),
      player: playerName,
      description: compact(row.card_description),
      set: compact(row.card_set),
      number: compact(row.number),
      variant: compact(row.variant),
      category: compact(row.group),
      set_type: compact(row.card_set_type),
    }
    const evaluation = evaluateBowmanBaseAutoCandidate(card, task.playerName, task.releaseYear)
    if (!evaluation.eligible || !card.card_id) return
    if (task.cardId && task.cardId !== card.card_id) return

    const candidates = candidatesByTask.get(taskKey) ?? new Map<string, DailyExportCandidate>()
    const candidate = candidates.get(card.card_id) ?? { task, card, evaluation, sales: [] }
    candidate.sales.push({
      price_history_id: compact(row.price_history_id),
      price_source: compact(row.source),
      title: compact(row.description) || compact(row.card_description),
      price: numberValue(row.price),
      sale_date: compact(row.sale_date),
      sale_type: compact(row.sale_type),
      sale_url: compact(row.listing_url),
      image: compact(row.image_url),
      card_id: compact(row.card_id),
      grade: compact(row.grade),
    })
    candidates.set(card.card_id, candidate)
    candidatesByTask.set(taskKey, candidates)
  })

  const selected = [...candidatesByTask.values()].flatMap((candidates) => {
    const candidate = [...candidates.values()].sort(
      (left, right) => right.evaluation.score - left.evaluation.score || right.sales.length - left.sales.length,
    )[0]
    return candidate ? [candidate] : []
  })
  const importedSales = selected.flatMap((candidate) => {
    const cardId = compact(candidate.card.card_id)
    const laneKey = laneKeyFor(candidate.task.playerName, candidate.task.releaseYear)
    return candidate.sales
      .filter((sale) => numberValue(sale.price) > 0 && compact(sale.sale_date))
      .map((sale) => ({
        itemId: stableSaleId(sale, cardId),
        laneKey,
        playerName: candidate.task.playerName,
        releaseYear: candidate.task.releaseYear,
        cardId,
        title: compact(sale.title) || compact(candidate.card.description),
        salePrice: numberValue(sale.price),
        soldAt: compact(sale.sale_date),
        saleType: compact(sale.sale_type),
        channel: channelFromSaleType(sale.sale_type),
        source: compact(sale.price_source) || 'card-hedge-daily-export',
        saleUrl: compact(sale.sale_url),
        imageUrl: compact(sale.image),
        gradeBucket: BASE_AUTO_GRADE,
        rawJson: JSON.stringify(sale),
      }))
  })
  for (let index = 0; index < importedSales.length; index += 500) {
    await upsertHostedSales(sql, importedSales.slice(index, index + 500))
  }

  const laneKeys = selected.map((candidate) => laneKeyFor(candidate.task.playerName, candidate.task.releaseYear))
  const storedSales = laneKeys.length
    ? await sql`
        SELECT * FROM (
          SELECT
            lane_key AS "laneKey", item_id AS "itemId", card_id AS "cardId", title,
            sale_price AS "salePrice", sold_at AS "soldAt", sale_type AS "saleType", channel,
            source, sale_url AS "saleUrl", image_url AS "imageUrl",
            ROW_NUMBER() OVER (PARTITION BY lane_key ORDER BY sold_at DESC, sale_price DESC) AS row_number
          FROM backstop_comp_sales
          WHERE lane_key IN (SELECT value FROM jsonb_array_elements_text(${JSON.stringify(laneKeys)}::jsonb))
            AND erroneous = FALSE
        ) AS ranked
        WHERE row_number <= 100
        ORDER BY "laneKey", "soldAt" DESC
      `
    : []
  const storedByLane = new Map<string, Record<string, unknown>[]>()
  for (const row of storedSales) {
    const key = stringValue(row.laneKey)
    storedByLane.set(key, [...(storedByLane.get(key) ?? []), row])
  }
  const lanes = selected.map((candidate) => {
    const cardId = compact(candidate.card.card_id)
    const laneKey = laneKeyFor(candidate.task.playerName, candidate.task.releaseYear)
    const rows = storedByLane.get(laneKey) ?? []
    const summary = summarizeHostedCompSales(
      {
        count_used: rows.length,
        raw_prices: rows.map((row) => ({
          price_history_id: stringValue(row.itemId),
          card_id: stringValue(row.cardId),
          title: stringValue(row.title),
          price: numberValue(row.salePrice),
          sale_date: stringValue(row.soldAt),
          sale_type: stringValue(row.saleType) || stringValue(row.channel),
          price_source: stringValue(row.source),
          sale_url: stringValue(row.saleUrl),
          image: stringValue(row.imageUrl),
          grade: BASE_AUTO_GRADE,
        })),
      },
      now,
    )
    return {
      laneKey,
      playerName: candidate.task.playerName,
      releaseYear: candidate.task.releaseYear,
      cardId,
      cardDescription: compact(candidate.card.description),
      modelPrice: summary.modelPrice,
      compPrice: summary.compPrice,
      minPrice: summary.minPrice,
      q1Price: summary.q1Price,
      medianPrice: summary.medianPrice,
      avgPrice: summary.avgPrice,
      q3Price: summary.q3Price,
      maxPrice: summary.maxPrice,
      saleCount: summary.saleCount,
      sales30: summary.sales30,
      sales90: summary.sales90,
      auctionCount: summary.auctionCount,
      binCount: summary.binCount,
      recent3Avg: summary.recent3Avg,
      recent5Avg: summary.recent5Avg,
      latestSoldAt: summary.latestSoldAt,
      generatedAt: now.toISOString(),
      matchScore: candidate.evaluation.score,
      matchReason: `${candidate.evaluation.reason}, elite daily export`,
    } satisfies HostedLaneRecord
  })
  await upsertHostedLanes(sql, lanes)

  if (selected.length) {
    const completed = JSON.stringify(
      selected.map((candidate) => ({
        player_lookup: normalizedName(candidate.task.playerName),
        release_year: candidate.task.releaseYear,
      })),
    )
    await sql`
      UPDATE backstop_comp_refresh_queue AS queue
      SET
        status = 'done', last_success_at = NOW(), next_attempt_at = NOW() + INTERVAL '20 hours',
        error = '', claimed_by = '', updated_at = NOW()
      FROM jsonb_to_recordset(${completed}::jsonb) AS matched(player_lookup TEXT, release_year INTEGER)
      WHERE queue.player_lookup = matched.player_lookup AND queue.release_year = matched.release_year
    `
  }
  await sql`
    INSERT INTO backstop_comp_meta (key, value, updated_at)
    VALUES ('daily_export_date', ${date}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `

  return {
    date,
    parsedRows,
    matchedPlayers: selected.length,
    matchedSales: importedSales.length,
  }
}

async function staleFmvCards(sql: HostedCompSql, limit: number) {
  return sql`
    SELECT lane_key AS "laneKey", card_id AS "cardId", comp_price AS "compPrice", sale_count AS "saleCount"
    FROM backstop_comp_lanes
    WHERE card_id IS NOT NULL
      AND card_id <> ''
      AND (last_fmv_at IS NULL OR last_fmv_at < NOW() - INTERVAL '20 hours')
    ORDER BY last_fmv_at ASC NULLS FIRST, sale_count DESC, updated_at ASC
    LIMIT ${limit}
  `
}

async function applyFmvResults(sql: HostedCompSql, targets: Record<string, unknown>[], results: CardHedgeFmvResult[]) {
  const targetByCard = new Map(targets.map((row) => [stringValue(row.cardId), row]))
  const rows = results
    .map((result) => {
      const cardId = compact(result.card_id)
      const target = targetByCard.get(cardId)
      if (!target) return null
      const compPrice = numberOrNull(target.compPrice)
      const saleCount = numberValue(target.saleCount)
      return {
        laneKey: stringValue(target.laneKey),
        cardId,
        modelPrice: blendHostedCompPrice(compPrice, saleCount, result),
        fmvPrice: numberOrNull(result.price),
        fmvLow: numberOrNull(result.price_low),
        fmvHigh: numberOrNull(result.price_high),
        confidence: numberValue(result.confidence),
        confidenceGrade: compact(result.confidence_grade),
        method: compact(result.method),
        freshnessDays: numberOrNull(result.freshness_days),
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
  if (!rows.length) return 0
  const payload = JSON.stringify(
    rows.map((row) => ({
      lane_key: row.laneKey,
      card_id: row.cardId,
      model_price: row.modelPrice,
      fmv_price: row.fmvPrice,
      fmv_low: row.fmvLow,
      fmv_high: row.fmvHigh,
      confidence: row.confidence,
      confidence_grade: row.confidenceGrade,
      method: row.method,
      freshness_days: row.freshnessDays,
    })),
  )
  await sql`
    UPDATE backstop_comp_lanes AS lane
    SET
      model_price = COALESCE(result.model_price, lane.model_price),
      fmv_price = result.fmv_price,
      fmv_low = result.fmv_low,
      fmv_high = result.fmv_high,
      fmv_confidence = result.confidence,
      fmv_confidence_grade = result.confidence_grade,
      fmv_method = result.method,
      fmv_freshness_days = result.freshness_days,
      last_fmv_at = NOW(),
      generated_at = NOW(),
      updated_at = NOW()
    FROM jsonb_to_recordset(${payload}::jsonb) AS result(
      lane_key TEXT,
      card_id TEXT,
      model_price DOUBLE PRECISION,
      fmv_price DOUBLE PRECISION,
      fmv_low DOUBLE PRECISION,
      fmv_high DOUBLE PRECISION,
      confidence DOUBLE PRECISION,
      confidence_grade TEXT,
      method TEXT,
      freshness_days INTEGER
    )
    WHERE lane.lane_key = result.lane_key
      AND lane.card_id = result.card_id
  `
  return rows.length
}

export async function runHostedCompRefresh(options: HostedCompRefreshOptions) {
  const now = options.now ?? new Date()
  const startedAt = Date.now()
  const timeBudgetMs = Math.max(10_000, options.timeBudgetMs ?? 225_000)
  const maxPlayers = Math.max(0, Math.min(250, options.maxPlayers ?? 50))
  const maxTaskApiCalls = Math.max(0, Math.min(1_000, options.maxTaskApiCalls ?? maxPlayers * 2))
  const maxFmvCards = Math.max(0, Math.min(2_500, options.maxFmvCards ?? 500))
  const runId = randomUUID()
  let apiCalls = 0
  let completedPlayers = 0
  let matchedPlayers = 0
  let missingPlayers = 0
  let failedPlayers = 0
  let compSalesUpserted = 0
  let fmvCardsRefreshed = 0
  let dailyExportDate = ''
  let dailyExportRows = 0
  let dailyExportMatchedPlayers = 0
  let dailyExportMatchedSales = 0
  let dailyExportError = ''
  let runError = ''

  await bootstrapHostedCompData(options.sql)
  await options.sql`
    INSERT INTO backstop_comp_sync_runs (run_id, status, started_at)
    VALUES (${runId}, 'running', ${now.toISOString()})
  `
  if (options.fetchDailyExport && Date.now() - startedAt < timeBudgetMs * 0.35) {
    for (const candidateDate of dailyExportDateCandidates(now)) {
      if (Date.now() - startedAt >= timeBudgetMs * 0.35) break
      dailyExportDate = candidateDate
      try {
        if (await hostedDailyExportAlreadyIngested(options.sql, candidateDate)) break
        apiCalls += 1
        const exportText = await options.fetchDailyExport(candidateDate)
        const exportResult = await ingestHostedDailyExport(options.sql, exportText, candidateDate, now)
        dailyExportRows = exportResult.parsedRows
        dailyExportMatchedPlayers = exportResult.matchedPlayers
        dailyExportMatchedSales = exportResult.matchedSales
        compSalesUpserted += exportResult.matchedSales
        dailyExportError = ''
        break
      } catch (error) {
        dailyExportError = error instanceof Error ? error.message : 'Daily export ingest failed'
      }
    }
  }
  const tasks = maxPlayers ? await claimHostedTasks(options.sql, runId, maxPlayers) : []
  await options.sql`UPDATE backstop_comp_sync_runs SET claimed_players = ${tasks.length} WHERE run_id = ${runId}`

  try {
    for (const task of tasks) {
      if (Date.now() - startedAt > timeBudgetMs * 0.72) break
      const expectedCalls = task.cardId ? 1 : 2
      if (apiCalls + expectedCalls > maxTaskApiCalls) break
      try {
        let match: {
          card: CardHedgeCard
          evaluation: { eligible: boolean; score: number; reason: string }
        } | null = task.cardId
          ? {
              card: {
                card_id: task.cardId,
                player: task.playerName,
                description: task.cardDescription,
                variant: 'Base',
              },
              evaluation: {
                eligible: true,
                score: task.matchScore,
                reason: task.matchReason || 'stored structured card match',
              },
            }
          : null
        if (!match) {
          const searchPayload = (await options.requestCardHedge('/v1/cards/card-search', {
            search: `${task.playerName} ${task.releaseYear} Bowman`,
            category: 'Baseball',
            page: 1,
            page_size: 100,
          })) as { cards?: CardHedgeCard[] }
          apiCalls += 1
          match = chooseBowmanBaseAutoCard(
            Array.isArray(searchPayload?.cards) ? searchPayload.cards : [],
            task.playerName,
            task.releaseYear,
          )
        }
        if (!match) {
          missingPlayers += 1
          completedPlayers += 1
          await updateQueueTask(options.sql, task, 'no-match', 'No structured flagship Bowman Chrome base auto match found')
          continue
        }

        const cardId = compact(match.card.card_id)
        const comps = (await options.requestCardHedge('/v1/cards/comps', {
          card_id: cardId,
          count: 100,
          grade: 'Raw',
          time_weighted: true,
          include_raw_prices: true,
        })) as CardHedgeComps
        apiCalls += 1
        const summary = summarizeHostedCompSales(comps, now)
        const laneKey = laneKeyFor(task.playerName, task.releaseYear)
        const lane: HostedLaneRecord = {
          laneKey,
          playerName: task.playerName,
          releaseYear: task.releaseYear,
          cardId,
          cardDescription: compact(match.card.description),
          modelPrice: summary.modelPrice,
          compPrice: summary.compPrice,
          minPrice: summary.minPrice,
          q1Price: summary.q1Price,
          medianPrice: summary.medianPrice,
          avgPrice: summary.avgPrice,
          q3Price: summary.q3Price,
          maxPrice: summary.maxPrice,
          saleCount: summary.saleCount,
          sales30: summary.sales30,
          sales90: summary.sales90,
          auctionCount: summary.auctionCount,
          binCount: summary.binCount,
          recent3Avg: summary.recent3Avg,
          recent5Avg: summary.recent5Avg,
          latestSoldAt: summary.latestSoldAt,
          generatedAt: now.toISOString(),
          matchScore: match.evaluation.score,
          matchReason: match.evaluation.reason,
        }
        await upsertHostedLane(options.sql, lane)
        const sales = summary.sales.map(({ raw, price, soldAt, channel }) => ({
          itemId: stableSaleId(raw, cardId),
          laneKey,
          playerName: task.playerName,
          releaseYear: task.releaseYear,
          cardId,
          title: compact(raw.title) || compact(match.card.description),
          salePrice: price,
          soldAt,
          saleType: compact(raw.sale_type),
          channel,
          source: compact(raw.price_source) || 'card-hedge-comps',
          saleUrl: compact(raw.sale_url),
          imageUrl: compact(raw.image),
          gradeBucket: BASE_AUTO_GRADE,
          rawJson: JSON.stringify(raw),
        }))
        compSalesUpserted += await upsertHostedSales(options.sql, sales)
        matchedPlayers += 1
        completedPlayers += 1
        await updateQueueTask(options.sql, task, summary.modelPrice ? 'done' : 'waiting-sales')
      } catch (error) {
        failedPlayers += 1
        completedPlayers += 1
        await updateQueueTask(options.sql, task, 'error', error instanceof Error ? error.message : 'Card Hedge refresh failed')
      }
    }

    if (Date.now() - startedAt < timeBudgetMs * 0.82 && maxFmvCards > 0) {
      const targets = await staleFmvCards(options.sql, maxFmvCards)
      for (let index = 0; index < targets.length; index += 100) {
        if (Date.now() - startedAt > timeBudgetMs * 0.94) break
        const batch = targets.slice(index, index + 100)
        const response = (await options.requestCardHedge('/v1/cards/card-fmv-batch', {
          items: batch.map((row) => ({ card_id: stringValue(row.cardId), grade: BASE_AUTO_GRADE })),
        })) as { results?: CardHedgeFmvResult[] }
        apiCalls += 1
        fmvCardsRefreshed += await applyFmvResults(options.sql, batch, Array.isArray(response?.results) ? response.results : [])
      }
    }
  } catch (error) {
    runError = error instanceof Error ? error.message : 'Hosted comp refresh failed'
  } finally {
    const persistedError = runError || (dailyExportError && completedPlayers === 0 && compSalesUpserted === 0 ? dailyExportError : '')
    const unprocessed = tasks.length - completedPlayers
    if (unprocessed > 0) {
      await options.sql`
        UPDATE backstop_comp_refresh_queue
        SET status = 'queued', claimed_by = '', next_attempt_at = NOW(), updated_at = NOW()
        WHERE claimed_by = ${runId} AND status = 'running'
      `
    }
    await options.sql`
      UPDATE backstop_comp_sync_runs
      SET
        status = ${runError ? 'error' : 'complete'},
        completed_at = NOW(),
        completed_players = ${completedPlayers},
        matched_players = ${matchedPlayers},
        missing_players = ${missingPlayers},
        failed_players = ${failedPlayers},
        comp_sales_upserted = ${compSalesUpserted},
        fmv_cards_refreshed = ${fmvCardsRefreshed},
        daily_export_date = ${dailyExportDate},
        daily_export_rows = ${dailyExportRows},
        daily_export_matched_sales = ${dailyExportMatchedSales},
        api_calls = ${apiCalls},
        error = ${persistedError.slice(0, 1_000)}
      WHERE run_id = ${runId}
    `
  }

  return {
    ok: !runError,
    runId,
    durationMs: Date.now() - startedAt,
    claimedPlayers: tasks.length,
    completedPlayers,
    matchedPlayers,
    missingPlayers,
    failedPlayers,
    compSalesUpserted,
    fmvCardsRefreshed,
    dailyExportDate,
    dailyExportRows,
    dailyExportMatchedPlayers,
    dailyExportMatchedSales,
    dailyExportError,
    apiCalls,
    error: runError,
  }
}
