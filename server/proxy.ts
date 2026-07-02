/// <reference types="node" />

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, resolve } from 'node:path'

const DEFAULT_SUPABASE_URL = 'https://rhlontbdiezpefgbbkql.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobG9udGJkaWV6cGVmZ2Jia3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzIwNjcsImV4cCI6MjA4MTIwODA2N30.H12G7ZC2yUzpXZ0sCrqvhdlIiniGGP6uUgrmEqdOkpk'
const EBAY_OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope'
const EBAY_SEARCH_CONCURRENCY = 3
const EBAY_SOLD_SEARCH_CONCURRENCY = 2
const CARD_HEDGE_API_BASE = 'https://api.cardhedger.com'
const CARD_HEDGE_DEFAULT_RPM = 80
const CARD_HEDGE_DEFAULT_DAILY_LIMIT = 50_000
const EBAY_RATE_LIMIT_MESSAGE =
  'eBay is rate-limiting Browse API requests right now. Wait a minute, then retry with a smaller player scope or single-player scan.'
const EBAY_RATE_LIMIT_DEFAULT_MS = 60_000
const EBAY_RATE_LIMIT_RETRY_CAP_MS = 4_000
const EBAY_QUERY_CACHE_VERSION = 1
const EBAY_QUERY_CACHE_NAMESPACE = 'backstop-ebay-query-v1'
const UPSTASH_QUERY_CACHE_PREFIX = 'backstop:query-cache'
const NEON_LIVE_MARKET_SCHEMA_VERSION = 1
const FANATICS_COLLECT_GRAPHQL_URL = 'https://app.fanaticscollect.com/graphql'
const FANATICS_COLLECT_MARKETPLACE_URL = 'https://www.fanaticscollect.com/marketplace?type=FIXED&category=Sports+Cards+%3E+Baseball'
const FANATICS_COLLECT_ALGOLIA_APP_ID = '3XT9C4X62I'
const FANATICS_COLLECT_ALGOLIA_INDEX = 'prod_item_state_v1'
const FANATICS_COLLECT_QUERY_CACHE_NAMESPACE = 'backstop-fanatics-collect-query-v1'
const FANATICS_COLLECT_SEARCH_KEY_TTL_MS = 10 * 60 * 1000
const FANATICS_COLLECT_QUERY_BATCH_SIZE = 25
const FANATICS_COLLECT_QUERY_CACHE_TTL_SECONDS = 24 * 60 * 60
const RANKINGS_RUNTIME_CACHE_NAMESPACE = 'backstop-rankings-v1'
const RANKINGS_RUNTIME_CACHE_KEY = 'sts-ranking-csv-bundle'
const RANKINGS_RUNTIME_CACHE_TTL_SECONDS = 36 * 60 * 60
const EBAY_BIN_QUERY_CACHE_TTL_SECONDS = 24 * 60 * 60
const EBAY_AUCTION_QUERY_CACHE_TTL_SECONDS = 10 * 60
const EBAY_SOLD_QUERY_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
const EBAY_AUCTION_CACHE_BUCKET_MS = 5 * 60 * 1_000
const EBAY_QUERY_CACHE_MAX_BYTES = 1_800_000
const MAX_JSON_BODY_BYTES = 1_000_000
const MAX_EBAY_BODY_BYTES = 256_000
const MAX_CARD_HEDGE_BODY_BYTES = 128_000
const MAX_LOGIN_BODY_BYTES = 16_000
const MAX_EBAY_QUERIES = 140
const MAX_EBAY_QUERY_LENGTH = 140
const PROSPECTPULSE_FUNCTION_ROUTES = new Set(['api-checklists', 'api-listings'])
const EBAY_ROUTES = new Set(['search', 'sold'])
const FANATICS_COLLECT_ROUTES = new Set(['status', 'search'])
const CARD_HEDGE_ROUTES = new Set([
  'status',
  'search',
  'match',
  'comps',
  'all-prices',
  'prices-by-card',
  'price-updates',
  'price-estimate',
  'batch-price-estimate',
  'card-fmv-batch',
  'daily-export',
])
const SALES_CACHE_ROUTES = new Set(['status', 'player', 'players', 'flag-sale', 'merge-bucket'])
const SALES_CACHE_WRITE_ROUTES = new Set(['flag-sale', 'merge-bucket'])
const CHECKLIST_ROUTES = new Set(['status', 'universe', 'catalog', 'model'])
const LIVE_MARKET_ROUTES = new Set(['status', 'snapshot', 'latest', 'prune'])
const RANKINGS_ROUTES = new Set(['status', 'refresh', 'data'])
const MAX_SALES_CACHE_PLAYER_LENGTH = 100
const MAX_SALES_CACHE_BUCKETS = 72
const MAX_SALES_CACHE_SALES = 3_000
const MAX_CHECKLIST_UNIVERSE_ROWS = 1_000
const MAX_CHECKLIST_MODEL_PLAYERS = 2_500
const MAX_SALES_CACHE_NOTE_LENGTH = 240
const MAX_LIVE_MARKET_LISTINGS = 900
const MAX_LIVE_MARKET_SCAN_KEY_LENGTH = 180
const LIVE_MARKET_BIN_TTL_SECONDS = 45 * 60
const LIVE_MARKET_AUCTION_TTL_SECONDS = 10 * 60
const LIVE_MARKET_MAX_TTL_SECONDS = 6 * 60 * 60
const RANKINGS_REFRESH_TIMEOUT_MS = 90_000
const RANKINGS_FILES = [
  { population: 'hitter', type: 'hitting', file: 'src/data/sts_formulated_consensus_hitters.csv' },
  { population: 'pitcher', type: 'pitching', file: 'src/data/sts_formulated_consensus_pitchers.csv' },
  { population: 'mlb', type: 'oopsy-peak-mlb', file: 'src/data/sts_oopsy_peak_mlb.csv' },
]
const STS_CONSENSUS_API_BASE = 'https://scoutthestatline.com/wp-json/sts/v1/get-consensus'
const STS_OOPSY_PEAK_API_BASE = 'https://scoutthestatline.com/wp-json/sts/v1/get-leaderboard'
const STS_SOURCE_COLUMNS = [
  ['rank_bags', 'BaGS'],
  ['rank_fscore', 'FScore'],
  ['rank_pgplus', 'PG+'],
  ['rank_pl', 'PLFR'],
  ['rank_sts', 'OOPSY Peak'],
  ['rank_pars', 'PARS'],
  ['rank_ptilt', 'P.Tilt'],
  ['rank_colossus', 'Colossus'],
] as const

type ServerEnv = Record<string, string | undefined>
type SqliteValue = string | number | bigint | null
type SqliteRow = Record<string, SqliteValue>
type SqliteStatement = {
  all: (...params: unknown[]) => SqliteRow[]
  get: (...params: unknown[]) => SqliteRow | undefined
  run: (...params: unknown[]) => unknown
}
type SqliteDatabase = {
  exec: (sql: string) => void
  prepare: (sql: string) => SqliteStatement
  close: () => void
}
type SqliteModule = {
  DatabaseSync: new (path: string) => SqliteDatabase
}

class ProxyRequestError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

class EbayUpstreamError extends Error {
  upstreamStatus: number
  retryAfterMs: number | null

  constructor(message: string, upstreamStatus: number, retryAfterMs: number | null = null) {
    super(message)
    this.upstreamStatus = upstreamStatus
    this.retryAfterMs = retryAfterMs
  }
}

type EbaySearchJob = {
  q?: string
  playerName?: string
  release?: string
  releaseYear?: number
  category?: string
}

type EbaySearchPayload = {
  queries?: EbaySearchJob[]
  limit?: number
  maxPages?: number
  sort?: string
  minPrice?: number
  buyingOption?: string
  maxHoursToClose?: number
  categoryId?: string
  marketplaceId?: string
}

type EbayQueryCacheValue = {
  version: number
  route: 'search' | 'sold'
  buyingOption: string
  query: string
  page: number
  total: number
  pagesFetched: number
  items: Array<Record<string, unknown>>
  observedAt: string
  expiresAt: string
}

type EbayQueryCacheStats = {
  cacheHits: number
  cacheMisses: number
  cacheWrites: number
  cacheSkips: number
  redisCacheHits: number
  runtimeCacheHits: number
  sqliteCacheHits: number
  upstreamPagesFetched: number
}

type EbaySearchJobResult = {
  items: Array<Record<string, unknown>>
  pagesFetched: number
  total: number
  cache: EbayQueryCacheStats
}

type LiveMarketListingPayload = {
  itemId?: string
  listingKind?: string
  marketplace?: string
  marketplaceLabel?: string
  playerName?: string
  title?: string
  listingUrl?: string
  imageUrl?: string | null
  currentPrice?: number
  shippingCost?: number
  allInPrice?: number
  modelPrice?: number | null
  fairValue?: number
  edgeDollars?: number
  expectedRoiPct?: number
  action?: string
  lane?: string
  grade?: string
  variationLabel?: string
  matchedVariation?: string | null
  valuationSource?: string
  trustScore?: number
  score?: number
  bidCount?: number
  listingStatus?: string
  endTime?: string | null
  raw?: unknown
}

type LiveMarketSnapshotPayload = {
  scanType?: string
  scanKey?: string
  searchMode?: string
  playerScope?: string
  releaseScope?: string
  observedAt?: string
  ttlSeconds?: number
  request?: unknown
  stats?: unknown
  marketplaces?: string[]
  listings?: LiveMarketListingPayload[]
}

type EbayTokenCache = {
  cacheKey: string
  accessToken: string
  expiresAt: number
}

type FanaticsCollectSearchKeyCache = {
  cacheKey: string
  searchKey: string
  expiresAt: number
}

type PulseTokenCache = {
  cacheKey: string
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

let ebayTokenCache: EbayTokenCache | null = null
let pulseTokenCache: PulseTokenCache | null = null
let fanaticsCollectSearchKeyCache: FanaticsCollectSearchKeyCache | null = null
let ebayRateLimitedUntil = 0

function jsonResponse(statusCode: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

async function readRequestText(request: Request, maxBytes = MAX_JSON_BODY_BYTES) {
  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new ProxyRequestError(413, 'Request body is too large')
  }
  return body
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function isJsonPost(request: Request) {
  return String(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')
}

function trustedSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

async function readJsonBody<T>(request: Request, maxBytes = MAX_JSON_BODY_BYTES) {
  if (!isJsonPost(request)) throw new ProxyRequestError(415, 'Expected application/json')
  const body = await readRequestText(request, maxBytes)
  try {
    return JSON.parse(body) as T
  } catch {
    throw new ProxyRequestError(400, 'Invalid JSON body')
  }
}

function rejectUnsafePost(request: Request) {
  if (request.method !== 'POST') return null
  if (!trustedSameOrigin(request)) return jsonResponse(403, { error: 'Cross-origin requests are not allowed' })
  if (!isJsonPost(request)) return jsonResponse(415, { error: 'Expected application/json' })
  return null
}

function routeErrorStatus(error: unknown) {
  return error instanceof ProxyRequestError ? error.statusCode : 502
}

function routeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  return fallback
}

function ebayHost(sandbox: boolean) {
  return sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com'
}

function ebayRouteErrorMessage(route: string, message: string) {
  if (isEbayRateLimitMessage(message)) return EBAY_RATE_LIMIT_MESSAGE
  if (route === 'sold' && /403|access denied|insufficient permissions|marketplace.?insights/i.test(message)) {
    return 'Marketplace Insights access denied for eBay sold listings. Enable item-sales search permissions for this keyset, then retry.'
  }
  return message
}

function salesCacheDbPath(env: ServerEnv) {
  return resolve(env.BACKSTOP_SALES_DB?.trim() || 'local-data/backstop-sales.sqlite')
}

async function openSalesCacheDb(env: ServerEnv) {
  const dbPath = salesCacheDbPath(env)
  if (!existsSync(dbPath)) return { db: null, dbPath }

  const sqliteSpecifier = 'node:sqlite'
  const sqlite = (await import(sqliteSpecifier)) as unknown as SqliteModule
  return { db: new sqlite.DatabaseSync(dbPath), dbPath }
}

async function openWritableMarketDb(env: ServerEnv) {
  const dbPath = salesCacheDbPath(env)
  mkdirSync(dirname(dbPath), { recursive: true })

  const sqliteSpecifier = 'node:sqlite'
  const sqlite = (await import(sqliteSpecifier)) as unknown as SqliteModule
  return { db: new sqlite.DatabaseSync(dbPath), dbPath }
}

async function openOptionalWritableMarketDb(env: ServerEnv) {
  try {
    return await openWritableMarketDb(env)
  } catch {
    return { db: null, dbPath: salesCacheDbPath(env) }
  }
}

function ensureEbayQueryCacheSchema(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ebay_query_cache (
      cache_key TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      buying_option TEXT NOT NULL,
      query TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      page INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      total INTEGER NOT NULL,
      pages_fetched INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ebay_query_cache_fresh
      ON ebay_query_cache(route, buying_option, expires_at);
    CREATE INDEX IF NOT EXISTS idx_ebay_query_cache_query
      ON ebay_query_cache(query, expires_at);
  `)
}

function ensureLiveMarketSchema(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS live_market_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      scan_type TEXT NOT NULL,
      scan_key TEXT NOT NULL,
      search_mode TEXT,
      player_scope TEXT,
      release_scope TEXT,
      observed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      listing_count INTEGER NOT NULL,
      opportunity_count INTEGER NOT NULL,
      request_json TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS live_market_listings (
      snapshot_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      listing_kind TEXT NOT NULL,
      marketplace TEXT NOT NULL DEFAULT 'ebay',
      marketplace_label TEXT NOT NULL DEFAULT 'eBay',
      player_name TEXT,
      title TEXT,
      listing_url TEXT,
      image_url TEXT,
      current_price REAL NOT NULL,
      shipping_cost REAL NOT NULL,
      all_in_price REAL NOT NULL,
      model_price REAL,
      fair_value REAL NOT NULL,
      edge_dollars REAL NOT NULL,
      expected_roi_pct REAL NOT NULL,
      action TEXT,
      lane TEXT,
      grade TEXT,
      variation_label TEXT,
      matched_variation TEXT,
      valuation_source TEXT,
      trust_score REAL,
      score REAL,
      bid_count INTEGER NOT NULL,
      listing_status TEXT,
      end_time TEXT,
      observed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      PRIMARY KEY (snapshot_id, item_id),
      FOREIGN KEY(snapshot_id) REFERENCES live_market_snapshots(snapshot_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_live_market_snapshots_fresh
      ON live_market_snapshots(scan_type, scan_key, expires_at, observed_at);
    CREATE INDEX IF NOT EXISTS idx_live_market_listings_fresh
      ON live_market_listings(listing_kind, expires_at, edge_dollars);
    CREATE INDEX IF NOT EXISTS idx_live_market_listings_player
      ON live_market_listings(player_name, variation_label, expires_at);
  `)
  ensureSqliteColumn(db, 'live_market_listings', 'marketplace', "TEXT NOT NULL DEFAULT 'ebay'")
  ensureSqliteColumn(db, 'live_market_listings', 'marketplace_label', "TEXT NOT NULL DEFAULT 'eBay'")
}

function ensureCardHedgeUsageSchema(db: SqliteDatabase) {
  db.exec(`
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
  `)
}

function cardHedgeRateConfig(env: ServerEnv) {
  return {
    perMinute: clampInt(env.CARD_HEDGE_RATE_LIMIT_PER_MINUTE, CARD_HEDGE_DEFAULT_RPM, 1, 500),
    perDay: clampInt(env.CARD_HEDGE_DAILY_LIMIT, CARD_HEDGE_DEFAULT_DAILY_LIMIT, 1, 200_000),
  }
}

function cardHedgeEndpoint(route: string) {
  const endpoints: Record<string, string> = {
    search: '/v1/cards/card-search',
    match: '/v1/cards/card-match',
    comps: '/v1/cards/comps',
    'all-prices': '/v1/cards/all-prices-by-card',
    'prices-by-card': '/v1/cards/prices-by-card',
    'price-updates': '/v1/cards/price-updates',
    'price-estimate': '/v1/cards/price-estimate',
    'batch-price-estimate': '/v1/cards/batch-price-estimate',
    'card-fmv-batch': '/v1/cards/card-fmv-batch',
  }
  return endpoints[route] ?? ''
}

function cardHedgeDailyExportDate(request: Request) {
  const url = new URL(request.url)
  const date = String(url.searchParams.get('date') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ProxyRequestError(400, 'Daily export date must be YYYY-MM-DD')
  return date
}

function cardHedgeRateLimitError(db: SqliteDatabase, env: ServerEnv, requestedCalls = 1) {
  const { limits, usage } = cardHedgeUsagePayload(db, env)
  if (usage.minute + requestedCalls > limits.perMinute) {
    return {
      status: 429,
      payload: {
        error: 'Card Hedge minute limit would be exceeded; wait a minute or lower batch size.',
        limits,
        usage,
      },
    }
  }
  if (usage.day + requestedCalls > limits.perDay) {
    return {
      status: 429,
      payload: {
        error: 'Card Hedge daily limit would be exceeded; resume tomorrow or raise CARD_HEDGE_DAILY_LIMIT.',
        limits,
        usage,
      },
    }
  }
  return null
}

function cardHedgeUsageWindow(db: SqliteDatabase, now = new Date()) {
  const minuteStart = new Date(now.getTime() - 60_000).toISOString()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const minute = rowNumber(
    db.prepare('SELECT COALESCE(SUM(request_count), 0) AS total FROM card_hedge_api_calls WHERE requested_at >= ?').get(minuteStart),
    'total',
  )
  const day = rowNumber(
    db.prepare('SELECT COALESCE(SUM(request_count), 0) AS total FROM card_hedge_api_calls WHERE requested_at >= ?').get(dayStart),
    'total',
  )
  return { minute, day, minuteStart, dayStart }
}

function cardHedgeUsagePayload(db: SqliteDatabase, env: ServerEnv, now = new Date()) {
  const limits = cardHedgeRateConfig(env)
  const usage = cardHedgeUsageWindow(db, now)
  return {
    limits,
    usage: {
      minute: usage.minute,
      day: usage.day,
      remainingMinute: Math.max(0, limits.perMinute - usage.minute),
      remainingDay: Math.max(0, limits.perDay - usage.day),
      minuteWindowStart: usage.minuteStart,
      dayWindowStart: usage.dayStart,
    },
  }
}

function cardHedgeUsageFallback(env: ServerEnv, now = new Date()) {
  const limits = cardHedgeRateConfig(env)
  const minuteStart = new Date(now.getTime() - 60_000).toISOString()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  return {
    limits,
    usage: {
      minute: 0,
      day: 0,
      remainingMinute: limits.perMinute,
      remainingDay: limits.perDay,
      minuteWindowStart: minuteStart,
      dayWindowStart: dayStart,
    },
  }
}

function recordCardHedgeCall(db: SqliteDatabase, route: string, endpoint: string, statusCode: number, now = new Date()) {
  const requestedAt = now.toISOString()
  const callId = `${requestedAt}:${route}:${Math.random().toString(36).slice(2, 10)}`
  db.prepare(`
    INSERT INTO card_hedge_api_calls (call_id, route, endpoint, status_code, requested_at, request_count)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(callId, route, endpoint, statusCode, requestedAt)
}

function rowString(row: SqliteRow | null | undefined, key: string) {
  const value = row?.[key]
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function rowNumber(row: SqliteRow | null | undefined, key: string) {
  const value = row?.[key]
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function rowNumberOrNull(row: SqliteRow | null | undefined, key: string) {
  const value = row?.[key]
  if (value == null || value === '') return null
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function rowBool(row: SqliteRow | undefined, key: string) {
  return rowNumber(row, key) === 1
}

function parseCsvRows(input: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  function pushField() {
    row.push(field)
    field = ''
  }

  function pushRow() {
    pushField()
    if (row.some((cell) => cell.length > 0)) rows.push(row)
    row = []
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      pushField()
    } else if (char === '\n') {
      pushRow()
    } else if (char === '\r') {
      if (input[index + 1] === '\n') index += 1
      pushRow()
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) pushRow()
  return rows
}

function parseRankingNumber(value: string | undefined) {
  const parsed = Number(String(value ?? '').replace(/[$,%\s,]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function parseRankingTimestamp(value: string | undefined) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const direct = Date.parse(text)
  if (Number.isFinite(direct)) return direct
  const isoish = Date.parse(text.replace(' ', 'T'))
  return Number.isFinite(isoish) ? isoish : null
}

function rankingFreshWithin24Hours(value: string) {
  const time = parseRankingTimestamp(value)
  return time !== null && Date.now() - time <= 24 * 3_600_000
}

type RankingFileSpec = (typeof RANKINGS_FILES)[number]
type RankingCsvSource = RankingFileSpec & {
  available: boolean
  csv: string
  fileUpdatedAt: string
}
type RankingRuntimeCacheValue = {
  version: 1
  refreshedAt: string
  expiresAt: string
  sources: RankingCsvSource[]
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function apiString(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

function apiNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? '').replace(/[$,%\s,]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function stsSourceAverage(player: Record<string, unknown>) {
  const values = STS_SOURCE_COLUMNS.map(([key]) => apiNumber(player[key])).filter((value): value is number => value !== null)
  if (!values.length) return Number.POSITIVE_INFINITY
  return values.reduce((total, value) => total + value, 0) / values.length
}

function sortStsConsensusPlayers(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftAvg = apiNumber(left.avg_rank) ?? stsSourceAverage(left)
  const rightAvg = apiNumber(right.avg_rank) ?? stsSourceAverage(right)
  return leftAvg - rightAvg || apiString(left.name).localeCompare(apiString(right.name))
}

async function fetchJsonWithTimeout(url: URL, description: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RANKINGS_REFRESH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Backstop Card Finder rankings refresh',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${description} request failed: ${response.status} ${response.statusText}`)
    return (await response.json()) as unknown
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = new Error(`${description} request timed out`)
      ;(timeoutError as Error & { cause?: unknown }).cause = error
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function consensusCsv(population: string, updated: string, players: Array<Record<string, unknown>>) {
  const headers = [
    'Population',
    '#',
    'FgId',
    'Name',
    'Age',
    'Level',
    'Team',
    'Pos',
    'Avg Rank',
    'Coverage',
    'In Sts',
    ...STS_SOURCE_COLUMNS.map(([, label]) => label),
    'Updated',
  ]
  const rows = players.map((player, index) => [
    population,
    index + 1,
    player.fg_id ?? '',
    player.name ?? '',
    player.age ?? '',
    player.level ?? '',
    player.team ?? '',
    player.position ?? '',
    player.avg_rank ?? '',
    player.coverage ?? '',
    player.in_sts ?? '',
    ...STS_SOURCE_COLUMNS.map(([key]) => player[key] ?? ''),
    updated,
  ])
  return `${headers.map(csvCell).join(',')}\n${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`
}

function oopsyPeakMlbCsv(updated: string, players: Array<Record<string, unknown>>) {
  const headers = [
    'Source',
    '#',
    'PlayerId',
    'Name',
    'Age',
    'Level',
    'Team',
    'Pos',
    'Rank',
    'Prospect Rank',
    '1 Day Change',
    '3 Day Change',
    '7 Day Change',
    '14 Day Change',
    '30 Day Change',
    'WAR',
    'Summary',
    'Updated',
  ]
  const rows = players.map((player, index) => [
    'OOPSY Peak MLB',
    index + 1,
    player.player_id ?? player.id ?? '',
    player.player ?? player.name ?? '',
    player.age ?? '',
    player.highest_level ?? '',
    player.team_update ?? '',
    player.sp_rp ?? '',
    player.rank ?? '',
    player.prospect_rank ?? '',
    player.c_1_day_change ?? '',
    player.c_3_day_change ?? '',
    player.c_7_day_change ?? '',
    player.c_14_day_change ?? '',
    player.c_30_day_change ?? '',
    player.war ?? '',
    player.summary ?? '',
    updated,
  ])
  return `${headers.map(csvCell).join(',')}\n${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`
}

async function fetchStsRankingSource(spec: RankingFileSpec): Promise<RankingCsvSource> {
  const refreshedAt = new Date().toISOString()
  if (spec.type === 'oopsy-peak-mlb') {
    const url = new URL(STS_OOPSY_PEAK_API_BASE)
    url.searchParams.set('type', 'combined')
    const payload = await fetchJsonWithTimeout(url, 'OOPSY Peak MLB')
    const payloadRecord = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const players = (Array.isArray(payload) ? payload : Array.isArray(payloadRecord.players) ? payloadRecord.players : [])
      .filter((player): player is Record<string, unknown> => Boolean(player && typeof player === 'object'))
      .filter((player) => apiString(player.highest_level ?? player.level).toUpperCase() === 'MLB')
      .sort((left, right) => (apiNumber(left.rank) ?? Number.POSITIVE_INFINITY) - (apiNumber(right.rank) ?? Number.POSITIVE_INFINITY))
    if (!players.length) throw new Error('OOPSY Peak MLB request returned no MLB players')
    return { ...spec, available: true, csv: oopsyPeakMlbCsv(refreshedAt, players), fileUpdatedAt: refreshedAt }
  }

  const url = new URL(STS_CONSENSUS_API_BASE)
  url.searchParams.set('type', spec.type)
  url.searchParams.set('show_low', '1')
  const payload = await fetchJsonWithTimeout(url, `Consensus ${spec.type}`)
  const payloadRecord = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const players = (Array.isArray(payloadRecord.players) ? payloadRecord.players : Array.isArray(payload) ? payload : [])
    .filter((player): player is Record<string, unknown> => Boolean(player && typeof player === 'object'))
    .sort(sortStsConsensusPlayers)
  if (!players.length) throw new Error(`Consensus ${spec.type} request returned no players`)
  const updated = apiString(payloadRecord.updated) || refreshedAt
  return { ...spec, available: true, csv: consensusCsv(spec.population, updated, players), fileUpdatedAt: refreshedAt }
}

async function refreshStsRankingSources() {
  return Promise.all(RANKINGS_FILES.map(fetchStsRankingSource))
}

async function readRuntimeRankingSources() {
  const redis = await getUpstashRedis(process.env)
  if (redis) {
    try {
      const value = await redis.get<string>(redisQueryCacheKey(RANKINGS_RUNTIME_CACHE_NAMESPACE, RANKINGS_RUNTIME_CACHE_KEY))
      const parsed =
        typeof value === 'string'
          ? (parseJsonText(value, null) as RankingRuntimeCacheValue | null)
          : ((value ?? null) as RankingRuntimeCacheValue | null)
      if (
        parsed?.version === 1 &&
        Array.isArray(parsed.sources) &&
        parsed.sources.every((source) => typeof source.csv === 'string' && source.csv.trim()) &&
        Date.parse(parsed.expiresAt) > Date.now()
      ) {
        return { sources: parsed.sources, cache: 'redis' as const }
      }
    } catch {
      // Redis is preferred in production, but bundled data can still answer.
    }
  }

  const cache = await getVercelRuntimeCache(RANKINGS_RUNTIME_CACHE_NAMESPACE)
  if (!cache) return null
  try {
    const value = await cache.get<RankingRuntimeCacheValue>(RANKINGS_RUNTIME_CACHE_KEY)
    if (
      value?.version === 1 &&
      Array.isArray(value.sources) &&
      value.sources.every((source) => typeof source.csv === 'string' && source.csv.trim()) &&
      Date.parse(value.expiresAt) > Date.now()
    ) {
      return { sources: value.sources, cache: 'runtime' as const }
    }
  } catch {
    // Runtime Cache is an optimization; bundled data or live STS fetch can still answer.
  }
  return null
}

async function writeRuntimeRankingSources(sources: RankingCsvSource[]) {
  const refreshedAt = new Date().toISOString()
  const value: RankingRuntimeCacheValue = {
    version: 1,
    refreshedAt,
    expiresAt: new Date(Date.now() + RANKINGS_RUNTIME_CACHE_TTL_SECONDS * 1000).toISOString(),
    sources,
  }
  let wrote: 'redis-write' | 'runtime-write' | null = null
  const redis = await getUpstashRedis(process.env)
  if (redis) {
    try {
      await redis.set(redisQueryCacheKey(RANKINGS_RUNTIME_CACHE_NAMESPACE, RANKINGS_RUNTIME_CACHE_KEY), jsonText(value), {
        ex: RANKINGS_RUNTIME_CACHE_TTL_SECONDS,
      })
      wrote = 'redis-write'
    } catch {
      // Keep trying Runtime Cache below.
    }
  }

  const cache = await getVercelRuntimeCache(RANKINGS_RUNTIME_CACHE_NAMESPACE)
  if (!cache) return wrote
  try {
    await cache.set(RANKINGS_RUNTIME_CACHE_KEY, value, {
      ttl: RANKINGS_RUNTIME_CACHE_TTL_SECONDS,
      tags: ['rankings', 'sts'],
      name: 'Scout the Statline rankings',
    })
    return wrote ?? 'runtime-write'
  } catch {
    return wrote
  }
}

function readBundledRankingSources(): RankingCsvSource[] {
  const root = process.cwd()
  return RANKINGS_FILES.map((source) => {
    const target = resolve(root, source.file)
    if (!existsSync(target)) {
      return {
        ...source,
        available: false,
        csv: '',
        fileUpdatedAt: '',
      }
    }

    const stats = statSync(target)
    return {
      ...source,
      available: true,
      csv: readFileSync(target, 'utf8'),
      fileUpdatedAt: stats.mtime.toISOString(),
    }
  })
}

async function currentRankingSources(options: { allowLiveRefresh: boolean }) {
  const cached = await readRuntimeRankingSources()
  if (cached?.sources.length) return cached

  if (options.allowLiveRefresh) {
    try {
      const fresh = await refreshStsRankingSources()
      const cachedFresh = await writeRuntimeRankingSources(fresh)
      return { sources: fresh, cache: cachedFresh ?? ('live' as const) }
    } catch {
      // Fall through to bundled CSVs so the app remains usable if STS is unavailable.
    }
  }

  return { sources: readBundledRankingSources(), cache: 'bundled' as const }
}

function rankingStatusFromSources(sources: RankingCsvSource[]) {
  const summarizedSources = sources.map((source) => {
    if (!source.available || !source.csv.trim()) {
      return {
        population: source.population,
        file: source.file,
        available: false,
        rows: 0,
        matchedRows: 0,
        lowCoverageRows: 0,
        latestUpdated: '',
        fileUpdatedAt: '',
      }
    }

    const csvRows = parseCsvRows(source.csv)
    const headers = csvRows[0] ?? []
    const headerIndex = new Map(headers.map((header, index) => [header.trim(), index]))
    const updatedIndex = headerIndex.get('Updated') ?? -1
    const coverageIndex = headerIndex.get('Coverage') ?? -1
    const avgRankIndex = headerIndex.get('Avg Rank') ?? -1
    const rankIndex = headerIndex.get('#') ?? -1
    const nameIndex = headerIndex.get('Name') ?? -1
    const bodyRows = csvRows.slice(1).filter((row) => String(row[nameIndex] ?? '').trim())
    const latestUpdatedTime = Math.max(
      0,
      ...bodyRows.map((row) => parseRankingTimestamp(row[updatedIndex]) ?? 0).filter((time) => time > 0),
    )
    const lowCoverageRows = bodyRows.filter((row) => {
      const coverage = parseRankingNumber(row[coverageIndex])
      const avgRank = parseRankingNumber(row[avgRankIndex])
      return coverage !== null && coverage > 0 && (coverage < 3 || avgRank === null)
    }).length

    return {
      population: source.population,
      file: source.file,
      available: true,
      rows: bodyRows.length,
      matchedRows: bodyRows.filter((row) => parseRankingNumber(row[rankIndex]) !== null).length,
      lowCoverageRows,
      latestUpdated: latestUpdatedTime ? new Date(latestUpdatedTime).toISOString() : '',
      fileUpdatedAt: source.fileUpdatedAt,
    }
  })

  const latestUpdatedTime = Math.max(0, ...summarizedSources.map((source) => parseRankingTimestamp(source.latestUpdated) ?? 0))
  const fileUpdatedTime = Math.max(0, ...summarizedSources.map((source) => parseRankingTimestamp(source.fileUpdatedAt) ?? 0))
  const rows = summarizedSources.reduce((total, source) => total + source.rows, 0)
  const missing = summarizedSources.filter((source) => !source.available)

  return {
    available: missing.length === 0 && rows > 0,
    source: 'Scout the Statline formulated consensus + OOPSY Peak MLB',
    rows,
    matchedRows: summarizedSources.reduce((total, source) => total + source.matchedRows, 0),
    lowCoverageRows: summarizedSources.reduce((total, source) => total + source.lowCoverageRows, 0),
    latestUpdated: latestUpdatedTime ? new Date(latestUpdatedTime).toISOString() : '',
    fileUpdatedAt: fileUpdatedTime ? new Date(fileUpdatedTime).toISOString() : '',
    freshWithin24h: latestUpdatedTime ? rankingFreshWithin24Hours(new Date(latestUpdatedTime).toISOString()) : false,
    refreshable: true,
    sources: summarizedSources,
    message: missing.length ? `${missing.length} rankings file${missing.length === 1 ? '' : 's'} missing` : '',
  }
}

function sqliteTableExists(db: SqliteDatabase, table: string) {
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
      .get(table),
  )
}

function ensureSqliteColumn(db: SqliteDatabase, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (columns.some((row) => rowString(row, 'name') === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function jsonText(value: unknown, fallback = '{}') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback))
  } catch {
    return fallback
  }
}

function parseJsonText(value: string, fallback: unknown) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

type VercelRuntimeCache = {
  get: <T>(key: string) => Promise<T | undefined>
  set: <T>(key: string, value: T, options: { ttl: number; tags?: string[]; name?: string }) => Promise<void>
}

type EbayQueryCacheContext = {
  db: SqliteDatabase | null
  env: ServerEnv
}

type RedisClient = {
  get: <T = unknown>(key: string) => Promise<T | null>
  set: (key: string, value: unknown, options?: { ex?: number }) => Promise<unknown>
  ping?: () => Promise<unknown>
}

type NeonSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>

const runtimeCachePromises = new Map<string, Promise<VercelRuntimeCache | null>>()
const redisClientPromises = new Map<string, Promise<RedisClient | null>>()
const neonSqlPromises = new Map<string, Promise<NeonSql | null>>()

async function getVercelRuntimeCache(namespace = EBAY_QUERY_CACHE_NAMESPACE) {
  if (!process.env.VERCEL && !process.env.VERCEL_ENV) return null
  const existing = runtimeCachePromises.get(namespace)
  if (existing) return existing
  const nextPromise = (async () => {
    try {
      const specifier = '@vercel/functions'
      const module = (await import(specifier)) as {
        getCache?: (options?: { namespace?: string; namespaceSeparator?: string }) => VercelRuntimeCache
      }
      return module.getCache?.({ namespace, namespaceSeparator: ':' }) ?? null
    } catch {
      return null
    }
  })()
  runtimeCachePromises.set(namespace, nextPromise)
  return nextPromise
}

function upstashRedisEnv(env: ServerEnv) {
  const url = env.UPSTASH_REDIS_REST_URL?.trim() || env.KV_REST_API_URL?.trim() || ''
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() || env.KV_REST_API_TOKEN?.trim() || ''
  return { url, token, configured: Boolean(url && token) }
}

async function getUpstashRedis(env: ServerEnv) {
  const config = upstashRedisEnv(env)
  if (!config.configured) return null
  const cacheKey = sha256(`${config.url}:${config.token}`)
  const existing = redisClientPromises.get(cacheKey)
  if (existing) return existing
  const nextPromise = (async () => {
    try {
      const specifier = '@upstash/redis'
      const module = (await import(specifier)) as { Redis?: new (config: { url: string; token: string }) => RedisClient }
      return module.Redis ? new module.Redis({ url: config.url, token: config.token }) : null
    } catch {
      return null
    }
  })()
  redisClientPromises.set(cacheKey, nextPromise)
  return nextPromise
}

function redisQueryCacheKey(namespace: string, key: string) {
  return `${UPSTASH_QUERY_CACHE_PREFIX}:${namespace}:${key}`
}

function neonDatabaseUrl(env: ServerEnv) {
  return (
    env.DATABASE_URL?.trim() ||
    env.POSTGRES_URL?.trim() ||
    env.POSTGRES_URL_NON_POOLING?.trim() ||
    env.NEON_DATABASE_URL?.trim() ||
    ''
  )
}

async function getNeonSql(env: ServerEnv) {
  const databaseUrl = neonDatabaseUrl(env)
  if (!databaseUrl) return null
  const cacheKey = sha256(databaseUrl)
  const existing = neonSqlPromises.get(cacheKey)
  if (existing) return existing
  const nextPromise = (async () => {
    try {
      const specifier = '@neondatabase/serverless'
      const module = (await import(specifier)) as typeof import('@neondatabase/serverless')
      return module.neon(databaseUrl) as unknown as NeonSql
    } catch {
      return null
    }
  })()
  neonSqlPromises.set(cacheKey, nextPromise)
  return nextPromise
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function emptyEbayQueryCacheStats(): EbayQueryCacheStats {
  return {
    cacheHits: 0,
    cacheMisses: 0,
    cacheWrites: 0,
    cacheSkips: 0,
    redisCacheHits: 0,
    runtimeCacheHits: 0,
    sqliteCacheHits: 0,
    upstreamPagesFetched: 0,
  }
}

function ebayQueryCacheConfig(env: ServerEnv, route: 'search' | 'sold', payload: EbaySearchPayload) {
  const buyingOption = route === 'sold' ? 'SOLD' : safeBuyingOption(payload.buyingOption)
  const ttlDefault =
    route === 'sold'
      ? EBAY_SOLD_QUERY_CACHE_TTL_SECONDS
      : buyingOption === 'AUCTION'
        ? EBAY_AUCTION_QUERY_CACHE_TTL_SECONDS
        : EBAY_BIN_QUERY_CACHE_TTL_SECONDS
  const ttlEnvKey =
    route === 'sold'
      ? 'EBAY_SOLD_QUERY_CACHE_TTL_SECONDS'
      : buyingOption === 'AUCTION'
        ? 'EBAY_AUCTION_QUERY_CACHE_TTL_SECONDS'
        : 'EBAY_BIN_QUERY_CACHE_TTL_SECONDS'
  const ttlSeconds = clampInt(env[ttlEnvKey], ttlDefault, 0, route === 'sold' ? 30 * 24 * 60 * 60 : 24 * 60 * 60)
  const enabled = ttlSeconds > 0 && !/^(0|false|off|no)$/i.test(String(env.EBAY_QUERY_CACHE_ENABLED ?? 'true'))
  return { enabled, buyingOption, ttlSeconds }
}

function ebayCacheAnchorDate(payload: EbaySearchPayload) {
  if (safeBuyingOption(payload.buyingOption) !== 'AUCTION') return new Date()
  return new Date(Math.floor(Date.now() / EBAY_AUCTION_CACHE_BUCKET_MS) * EBAY_AUCTION_CACHE_BUCKET_MS)
}

function ebayQueryFingerprint(options: {
  route: 'search' | 'sold'
  sandbox: boolean
  marketplaceId: string
  defaultZipCode?: string
  url: URL
}) {
  return stableJson({
    version: EBAY_QUERY_CACHE_VERSION,
    route: options.route,
    sandbox: options.sandbox,
    marketplaceId: options.marketplaceId,
    zipCode: options.defaultZipCode || '',
    url: `${options.url.origin}${options.url.pathname}?${options.url.searchParams.toString()}`,
  })
}

function sqliteEbayQueryCacheRead(db: SqliteDatabase, cacheKey: string, nowIso: string) {
  const row = db
    .prepare(
      `
        SELECT response_json AS responseJson
        FROM ebay_query_cache
        WHERE cache_key = ? AND expires_at > ?
        LIMIT 1
      `,
    )
    .get(cacheKey, nowIso)
  if (!row) return null
  const value = parseJsonText(rowString(row, 'responseJson'), null) as EbayQueryCacheValue | null
  return validEbayQueryCacheValue(value, nowIso) ? value : null
}

function sqliteEbayQueryCacheWrite(db: SqliteDatabase, cacheKey: string, fingerprint: string, value: EbayQueryCacheValue, nowIso: string) {
  db.prepare(
    `
      INSERT INTO ebay_query_cache (
        cache_key, route, buying_option, query, request_fingerprint, page,
        observed_at, expires_at, total, pages_fetched, response_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        route = excluded.route,
        buying_option = excluded.buying_option,
        query = excluded.query,
        request_fingerprint = excluded.request_fingerprint,
        page = excluded.page,
        observed_at = excluded.observed_at,
        expires_at = excluded.expires_at,
        total = excluded.total,
        pages_fetched = excluded.pages_fetched,
        response_json = excluded.response_json,
        updated_at = excluded.updated_at
    `,
  ).run(
    cacheKey,
    value.route,
    value.buyingOption,
    value.query,
    fingerprint,
    value.page,
    value.observedAt,
    value.expiresAt,
    value.total,
    value.pagesFetched,
    jsonText(value),
    nowIso,
    nowIso,
  )
}

function validEbayQueryCacheValue(value: EbayQueryCacheValue | null, nowIso: string) {
  return Boolean(
    value &&
      value.version === EBAY_QUERY_CACHE_VERSION &&
      Array.isArray(value.items) &&
      Date.parse(value.expiresAt) > Date.parse(nowIso),
  )
}

function parseRedisEbayQueryCacheValue(value: unknown, nowIso: string) {
  const parsed =
    typeof value === 'string'
      ? (parseJsonText(value, null) as EbayQueryCacheValue | null)
      : ((value ?? null) as EbayQueryCacheValue | null)
  return validEbayQueryCacheValue(parsed, nowIso) ? parsed : null
}

async function readEbayQueryCache(options: {
  cache: EbayQueryCacheContext | null
  cacheKey: string
  nowIso: string
}) {
  const redis = options.cache?.env ? await getUpstashRedis(options.cache.env) : null
  if (redis) {
    try {
      const redisValue = await redis.get<string>(redisQueryCacheKey(EBAY_QUERY_CACHE_NAMESPACE, options.cacheKey))
      const parsed = parseRedisEbayQueryCacheValue(redisValue, options.nowIso)
      if (parsed) return { value: parsed, source: 'redis' as const }
    } catch {
      // Redis is the shared production cache; fall through if it is temporarily unavailable.
    }
  }

  const runtimeCache = await getVercelRuntimeCache()
  if (runtimeCache) {
    try {
      const runtimeValue = await runtimeCache.get<EbayQueryCacheValue>(options.cacheKey)
      if (validEbayQueryCacheValue(runtimeValue ?? null, options.nowIso)) {
        return { value: runtimeValue as EbayQueryCacheValue, source: 'runtime' as const }
      }
    } catch {
      // Runtime Cache is opportunistic; fall through to SQLite or upstream.
    }
  }

  if (options.cache?.db) {
    try {
      const sqliteValue = sqliteEbayQueryCacheRead(options.cache.db, options.cacheKey, options.nowIso)
      if (sqliteValue) return { value: sqliteValue, source: 'sqlite' as const }
    } catch {
      // Local SQLite is a dev/fallback cache; upstream can still answer.
    }
  }

  return { value: null, source: null }
}

async function writeEbayQueryCache(options: {
  cache: EbayQueryCacheContext | null
  cacheKey: string
  fingerprint: string
  value: EbayQueryCacheValue
  ttlSeconds: number
  nowIso: string
}) {
  const serialized = jsonText(options.value)
  if (new TextEncoder().encode(serialized).byteLength > EBAY_QUERY_CACHE_MAX_BYTES) {
    return { written: false, skipped: true }
  }

  let written = false
  const redis = options.cache?.env ? await getUpstashRedis(options.cache.env) : null
  if (redis) {
    try {
      await redis.set(redisQueryCacheKey(EBAY_QUERY_CACHE_NAMESPACE, options.cacheKey), serialized, { ex: options.ttlSeconds })
      written = true
    } catch {
      // Keep going; Runtime Cache or SQLite may still save the page.
    }
  }

  const runtimeCache = await getVercelRuntimeCache()
  if (runtimeCache) {
    try {
      await runtimeCache.set(options.cacheKey, options.value, {
        ttl: options.ttlSeconds,
        tags: ['ebay-query-cache', `ebay:${options.value.buyingOption.toLowerCase()}`],
        name: 'eBay query page',
      })
      written = true
    } catch {
      // Keep going; SQLite may still save the page locally.
    }
  }

  if (options.cache?.db) {
    try {
      sqliteEbayQueryCacheWrite(options.cache.db, options.cacheKey, options.fingerprint, options.value, options.nowIso)
      written = true
    } catch {
      // Cache write failures should never block a live scan.
    }
  }

  return { written, skipped: !written }
}

function decorateEbayItems(items: Array<Record<string, unknown>>, job: EbaySearchJob) {
  return items.map((item) => ({
    ...item,
    _bowmanTraderQuery: job,
  }))
}

function safeIsoDate(value: unknown, fallback = new Date()) {
  const parsed = new Date(String(value ?? ''))
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback.toISOString()
}

function safeLiveScanType(value: unknown) {
  const scanType = String(value ?? 'bin').trim().toLowerCase()
  return scanType === 'auction' ? 'auction' : 'bin'
}

function defaultLiveMarketTtlSeconds(scanType: string) {
  return scanType === 'auction' ? LIVE_MARKET_AUCTION_TTL_SECONDS : LIVE_MARKET_BIN_TTL_SECONDS
}

function liveMarketSnapshotId(scanType: string, scanKey: string, observedAt: string) {
  const randomPart = Math.random().toString(36).slice(2, 10)
  const compactKey = scanKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'scan'
  return `${scanType}:${compactKey}:${Date.parse(observedAt) || Date.now()}:${randomPart}`
}

function liveMarketListingId(listing: LiveMarketListingPayload, index: number) {
  return String(listing.itemId ?? listing.listingUrl ?? `${listing.playerName ?? 'listing'}:${listing.title ?? ''}:${index}`)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

function liveMarketListingExpiresAt(listing: LiveMarketListingPayload, snapshotExpiresAt: string, scanType: string) {
  if (scanType !== 'auction' || !listing.endTime) return snapshotExpiresAt
  const endTime = Date.parse(listing.endTime)
  const snapshotTime = Date.parse(snapshotExpiresAt)
  if (!Number.isFinite(endTime) || !Number.isFinite(snapshotTime)) return snapshotExpiresAt
  return new Date(Math.min(endTime, snapshotTime)).toISOString()
}

function pruneExpiredLiveMarketRows(db: SqliteDatabase, asOf = new Date().toISOString()) {
  const expiredSnapshots = db.prepare('SELECT snapshot_id AS snapshotId FROM live_market_snapshots WHERE expires_at <= ?').all(asOf)
  for (const row of expiredSnapshots) {
    db.prepare('DELETE FROM live_market_listings WHERE snapshot_id = ?').run(rowString(row, 'snapshotId'))
  }
  db.prepare('DELETE FROM live_market_snapshots WHERE expires_at <= ?').run(asOf)
  db.prepare('DELETE FROM live_market_listings WHERE expires_at <= ?').run(asOf)
  return expiredSnapshots.length
}

function mapLiveMarketSnapshot(row: SqliteRow) {
  return {
    snapshotId: rowString(row, 'snapshotId'),
    scanType: rowString(row, 'scanType'),
    scanKey: rowString(row, 'scanKey'),
    searchMode: rowString(row, 'searchMode'),
    playerScope: rowString(row, 'playerScope'),
    releaseScope: rowString(row, 'releaseScope'),
    observedAt: rowString(row, 'observedAt'),
    expiresAt: rowString(row, 'expiresAt'),
    listingCount: rowNumber(row, 'listingCount'),
    opportunityCount: rowNumber(row, 'opportunityCount'),
    request: parseJsonText(rowString(row, 'requestJson'), {}),
    stats: parseJsonText(rowString(row, 'statsJson'), {}),
    createdAt: rowString(row, 'createdAt'),
  }
}

function mapLiveMarketListing(row: SqliteRow) {
  return {
    snapshotId: rowString(row, 'snapshotId'),
    itemId: rowString(row, 'itemId'),
    listingKind: rowString(row, 'listingKind'),
    marketplace: rowString(row, 'marketplace') || 'unknown',
    marketplaceLabel: rowString(row, 'marketplaceLabel') || rowString(row, 'marketplace') || 'Unknown',
    playerName: rowString(row, 'playerName'),
    title: rowString(row, 'title'),
    listingUrl: rowString(row, 'listingUrl'),
    imageUrl: rowString(row, 'imageUrl') || null,
    currentPrice: rowNumber(row, 'currentPrice'),
    shippingCost: rowNumber(row, 'shippingCost'),
    allInPrice: rowNumber(row, 'allInPrice'),
    modelPrice: rowNumber(row, 'modelPrice') || null,
    fairValue: rowNumber(row, 'fairValue'),
    edgeDollars: rowNumber(row, 'edgeDollars'),
    expectedRoiPct: rowNumber(row, 'expectedRoiPct'),
    action: rowString(row, 'action'),
    lane: rowString(row, 'lane'),
    grade: rowString(row, 'grade'),
    variationLabel: rowString(row, 'variationLabel'),
    matchedVariation: rowString(row, 'matchedVariation') || null,
    valuationSource: rowString(row, 'valuationSource'),
    trustScore: rowNumber(row, 'trustScore'),
    score: rowNumber(row, 'score'),
    bidCount: rowNumber(row, 'bidCount'),
    listingStatus: rowString(row, 'listingStatus'),
    endTime: rowString(row, 'endTime') || null,
    observedAt: rowString(row, 'observedAt'),
    expiresAt: rowString(row, 'expiresAt'),
    raw: parseJsonText(rowString(row, 'rawJson'), null),
  }
}

async function ensureNeonLiveMarketSchema(sql: NeonSql) {
  await sql`
    CREATE TABLE IF NOT EXISTS live_market_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL DEFAULT ${NEON_LIVE_MARKET_SCHEMA_VERSION},
      scan_type TEXT NOT NULL,
      scan_key TEXT NOT NULL,
      search_mode TEXT,
      player_scope TEXT,
      release_scope TEXT,
      observed_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      listing_count INTEGER NOT NULL,
      opportunity_count INTEGER NOT NULL,
      request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS live_market_listings (
      snapshot_id TEXT NOT NULL REFERENCES live_market_snapshots(snapshot_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      listing_kind TEXT NOT NULL,
      marketplace TEXT NOT NULL DEFAULT 'unknown',
      marketplace_label TEXT NOT NULL DEFAULT 'Unknown',
      player_name TEXT,
      title TEXT,
      listing_url TEXT,
      image_url TEXT,
      current_price DOUBLE PRECISION NOT NULL,
      shipping_cost DOUBLE PRECISION NOT NULL,
      all_in_price DOUBLE PRECISION NOT NULL,
      model_price DOUBLE PRECISION,
      fair_value DOUBLE PRECISION NOT NULL,
      edge_dollars DOUBLE PRECISION NOT NULL,
      expected_roi_pct DOUBLE PRECISION NOT NULL,
      action TEXT,
      lane TEXT,
      grade TEXT,
      variation_label TEXT,
      matched_variation TEXT,
      valuation_source TEXT,
      trust_score DOUBLE PRECISION,
      score DOUBLE PRECISION,
      bid_count INTEGER NOT NULL DEFAULT 0,
      listing_status TEXT,
      end_time TIMESTAMPTZ,
      observed_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      raw_json JSONB NOT NULL DEFAULT 'null'::jsonb,
      PRIMARY KEY (snapshot_id, item_id)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_live_market_snapshots_fresh ON live_market_snapshots(scan_type, scan_key, expires_at, observed_at)`
  await sql`CREATE INDEX IF NOT EXISTS idx_live_market_listings_fresh ON live_market_listings(listing_kind, expires_at, edge_dollars)`
  await sql`CREATE INDEX IF NOT EXISTS idx_live_market_listings_player ON live_market_listings(player_name, variation_label, expires_at)`
}

function neonRow(row: Record<string, unknown> | undefined | null): SqliteRow {
  return (row ?? {}) as SqliteRow
}

async function pruneExpiredNeonLiveMarketRows(sql: NeonSql, asOf: string) {
  const listingsDeleted = await sql`
    WITH deleted AS (
      DELETE FROM live_market_listings
      WHERE expires_at <= ${asOf}::timestamptz
      RETURNING item_id
    )
    SELECT COUNT(*) AS "deletedListings" FROM deleted
  `
  const snapshotsDeleted = await sql`
    WITH deleted AS (
      DELETE FROM live_market_snapshots
      WHERE expires_at <= ${asOf}::timestamptz
      RETURNING snapshot_id
    )
    SELECT COUNT(*) AS "deletedSnapshots" FROM deleted
  `
  return {
    listings: rowNumber(neonRow(listingsDeleted[0]), 'deletedListings'),
    snapshots: rowNumber(neonRow(snapshotsDeleted[0]), 'deletedSnapshots'),
  }
}

async function insertNeonLiveMarketListings(sql: NeonSql, snapshotId: string, scanType: string, snapshotExpiresAt: string, listings: LiveMarketListingPayload[], observedAt: string) {
  for (const [index, listing] of listings.entries()) {
    const itemId = liveMarketListingId(listing, index)
    const listingExpiresAt = liveMarketListingExpiresAt(listing, snapshotExpiresAt, scanType)
    const imageUrl = typeof listing.imageUrl === 'string' ? listing.imageUrl : ''
    const matchedVariation = typeof listing.matchedVariation === 'string' ? listing.matchedVariation : ''
    const endTime = typeof listing.endTime === 'string' && listing.endTime ? listing.endTime : null
    await sql`
      INSERT INTO live_market_listings (
        snapshot_id, item_id, listing_kind, marketplace, marketplace_label, player_name, title, listing_url, image_url,
        current_price, shipping_cost, all_in_price, model_price, fair_value, edge_dollars,
        expected_roi_pct, action, lane, grade, variation_label, matched_variation, valuation_source,
        trust_score, score, bid_count, listing_status, end_time, observed_at, expires_at, raw_json
      )
      VALUES (
        ${snapshotId},
        ${itemId},
        ${String(listing.listingKind ?? scanType)},
        ${String(listing.marketplace ?? 'unknown')},
        ${String(listing.marketplaceLabel ?? listing.marketplace ?? 'Unknown')},
        ${String(listing.playerName ?? '')},
        ${String(listing.title ?? '')},
        ${String(listing.listingUrl ?? '')},
        ${imageUrl},
        ${Number(listing.currentPrice ?? 0) || 0},
        ${Number(listing.shippingCost ?? 0) || 0},
        ${Number(listing.allInPrice ?? 0) || 0},
        ${Number.isFinite(Number(listing.modelPrice)) ? Number(listing.modelPrice) : null},
        ${Number(listing.fairValue ?? 0) || 0},
        ${Number(listing.edgeDollars ?? 0) || 0},
        ${Number(listing.expectedRoiPct ?? 0) || 0},
        ${String(listing.action ?? '')},
        ${String(listing.lane ?? '')},
        ${String(listing.grade ?? '')},
        ${String(listing.variationLabel ?? '')},
        ${matchedVariation},
        ${String(listing.valuationSource ?? '')},
        ${Number(listing.trustScore ?? 0) || 0},
        ${Number(listing.score ?? 0) || 0},
        ${Number(listing.bidCount ?? 0) || 0},
        ${String(listing.listingStatus ?? '')},
        ${endTime}::timestamptz,
        ${observedAt}::timestamptz,
        ${listingExpiresAt}::timestamptz,
        ${jsonText(listing.raw, 'null')}::jsonb
      )
      ON CONFLICT (snapshot_id, item_id) DO NOTHING
    `
  }
}

async function handleNeonLiveMarketRoute(route: string, request: Request, sql: NeonSql) {
  await ensureNeonLiveMarketSchema(sql)

  const now = new Date()
  const nowIso = now.toISOString()

  if (route === 'prune') {
    const pruned = await pruneExpiredNeonLiveMarketRows(sql, nowIso)
    return jsonResponse(200, { pruned: pruned.snapshots + pruned.listings, ...pruned, asOf: nowIso, storage: 'neon' })
  }

  await pruneExpiredNeonLiveMarketRows(sql, nowIso)

  if (route === 'status') {
    const stats = await sql`
      SELECT
        COUNT(*) AS "snapshotCount",
        COALESCE(SUM(listing_count), 0) AS "listingCount",
        COALESCE(SUM(opportunity_count), 0) AS "opportunityCount",
        MAX(observed_at)::text AS "latestObservedAt",
        MIN(expires_at)::text AS "nextExpiresAt"
      FROM live_market_snapshots
      WHERE expires_at > ${nowIso}::timestamptz
    `
    const byType = await sql`
      SELECT scan_type AS "scanType", COUNT(*) AS "snapshotCount", COALESCE(SUM(listing_count), 0) AS "listingCount"
      FROM live_market_snapshots
      WHERE expires_at > ${nowIso}::timestamptz
      GROUP BY scan_type
      ORDER BY scan_type
    `
    const byMarketplace = await sql`
      SELECT
        marketplace,
        COALESCE(NULLIF(marketplace_label, ''), marketplace) AS "marketplaceLabel",
        COUNT(DISTINCT snapshot_id) AS "snapshotCount",
        COUNT(*) AS "listingCount"
      FROM live_market_listings
      WHERE expires_at > ${nowIso}::timestamptz
      GROUP BY marketplace, marketplace_label
      ORDER BY "listingCount" DESC, marketplace
    `

    return jsonResponse(200, {
      available: true,
      storage: 'neon',
      dbName: 'Neon Postgres',
      freshSnapshots: rowNumber(neonRow(stats[0]), 'snapshotCount'),
      freshListings: rowNumber(neonRow(stats[0]), 'listingCount'),
      freshOpportunities: rowNumber(neonRow(stats[0]), 'opportunityCount'),
      latestObservedAt: rowString(neonRow(stats[0]), 'latestObservedAt'),
      nextExpiresAt: rowString(neonRow(stats[0]), 'nextExpiresAt'),
      byType: byType.map((row) => ({
        scanType: rowString(neonRow(row), 'scanType'),
        snapshots: rowNumber(neonRow(row), 'snapshotCount'),
        listings: rowNumber(neonRow(row), 'listingCount'),
      })),
      byMarketplace: byMarketplace.map((row) => ({
        marketplace: rowString(neonRow(row), 'marketplace'),
        label: rowString(neonRow(row), 'marketplaceLabel'),
        snapshots: rowNumber(neonRow(row), 'snapshotCount'),
        listings: rowNumber(neonRow(row), 'listingCount'),
      })),
    })
  }

  if (route === 'latest') {
    const params = new URL(request.url).searchParams
    const scanType = params.get('scanType') ? safeLiveScanType(params.get('scanType')) : ''
    const scanKey = String(params.get('scanKey') ?? '').trim().slice(0, MAX_LIVE_MARKET_SCAN_KEY_LENGTH)
    const limit = clampInt(params.get('limit'), 160, 1, MAX_LIVE_MARKET_LISTINGS)
    const snapshots = await sql`
      SELECT
        snapshot_id AS "snapshotId",
        scan_type AS "scanType",
        scan_key AS "scanKey",
        search_mode AS "searchMode",
        player_scope AS "playerScope",
        release_scope AS "releaseScope",
        observed_at::text AS "observedAt",
        expires_at::text AS "expiresAt",
        listing_count AS "listingCount",
        opportunity_count AS "opportunityCount",
        request_json::text AS "requestJson",
        stats_json::text AS "statsJson",
        created_at::text AS "createdAt"
      FROM live_market_snapshots
      WHERE expires_at > ${nowIso}::timestamptz
        AND (${scanType} = '' OR scan_type = ${scanType})
        AND (${scanKey} = '' OR scan_key = ${scanKey})
      ORDER BY observed_at DESC
      LIMIT 1
    `
    const snapshot = snapshots[0]

    if (!snapshot) {
      return jsonResponse(200, {
        available: false,
        storage: 'neon',
        message: 'No fresh live-market snapshot is available.',
        listings: [],
      })
    }

    const listings = await sql`
      SELECT
        snapshot_id AS "snapshotId",
        item_id AS "itemId",
        listing_kind AS "listingKind",
        marketplace,
        marketplace_label AS "marketplaceLabel",
        player_name AS "playerName",
        title,
        listing_url AS "listingUrl",
        image_url AS "imageUrl",
        current_price AS "currentPrice",
        shipping_cost AS "shippingCost",
        all_in_price AS "allInPrice",
        model_price AS "modelPrice",
        fair_value AS "fairValue",
        edge_dollars AS "edgeDollars",
        expected_roi_pct AS "expectedRoiPct",
        action,
        lane,
        grade,
        variation_label AS "variationLabel",
        matched_variation AS "matchedVariation",
        valuation_source AS "valuationSource",
        trust_score AS "trustScore",
        score,
        bid_count AS "bidCount",
        listing_status AS "listingStatus",
        end_time::text AS "endTime",
        observed_at::text AS "observedAt",
        expires_at::text AS "expiresAt",
        raw_json::text AS "rawJson"
      FROM live_market_listings
      WHERE snapshot_id = ${rowString(neonRow(snapshot), 'snapshotId')}
        AND expires_at > ${nowIso}::timestamptz
      ORDER BY edge_dollars DESC, score DESC
      LIMIT ${limit}
    `

    return jsonResponse(200, {
      available: true,
      storage: 'neon',
      snapshot: mapLiveMarketSnapshot(neonRow(snapshot)),
      listings: listings.map((row) => mapLiveMarketListing(neonRow(row))),
    })
  }

  const payload = await readJsonBody<LiveMarketSnapshotPayload>(request, MAX_EBAY_BODY_BYTES)
  const scanType = safeLiveScanType(payload.scanType)
  const scanKey = String(payload.scanKey ?? `${scanType}:manual`).trim().slice(0, MAX_LIVE_MARKET_SCAN_KEY_LENGTH)
  const observedAt = safeIsoDate(payload.observedAt, now)
  const ttlSeconds = clampInt(
    payload.ttlSeconds,
    defaultLiveMarketTtlSeconds(scanType),
    60,
    Math.min(defaultLiveMarketTtlSeconds(scanType) * 8, LIVE_MARKET_MAX_TTL_SECONDS),
  )
  const snapshotExpiresAt = new Date(Date.parse(observedAt) + ttlSeconds * 1_000).toISOString()
  const listings = (payload.listings ?? [])
    .filter((listing) => Number.isFinite(Number(listing.allInPrice)) && Number(listing.allInPrice) > 0)
    .slice(0, MAX_LIVE_MARKET_LISTINGS)
  const snapshotId = liveMarketSnapshotId(scanType, scanKey, observedAt)
  const createdAt = nowIso

  await sql`
    INSERT INTO live_market_snapshots (
      snapshot_id, schema_version, scan_type, scan_key, search_mode, player_scope, release_scope,
      observed_at, expires_at, listing_count, opportunity_count, request_json, stats_json, created_at
    )
    VALUES (
      ${snapshotId},
      ${NEON_LIVE_MARKET_SCHEMA_VERSION},
      ${scanType},
      ${scanKey},
      ${String(payload.searchMode ?? '')},
      ${String(payload.playerScope ?? '')},
      ${String(payload.releaseScope ?? '')},
      ${observedAt}::timestamptz,
      ${snapshotExpiresAt}::timestamptz,
      ${listings.length},
      ${listings.filter((listing) => Number(listing.edgeDollars ?? 0) >= 0).length},
      ${jsonText(payload.request)}::jsonb,
      ${jsonText(payload.stats)}::jsonb,
      ${createdAt}::timestamptz
    )
  `
  await insertNeonLiveMarketListings(sql, snapshotId, scanType, snapshotExpiresAt, listings, observedAt)

  return jsonResponse(200, {
    available: true,
    storage: 'neon',
    snapshotId,
    scanType,
    scanKey,
    observedAt,
    expiresAt: snapshotExpiresAt,
    listingCount: listings.length,
    opportunityCount: listings.filter((listing) => Number(listing.edgeDollars ?? 0) >= 0).length,
  })
}

function mapSalesCacheBucket(row: SqliteRow) {
  return {
    bucketKey: rowString(row, 'bucketKey'),
    playerName: rowString(row, 'playerName'),
    releaseYear: rowNumber(row, 'releaseYear') || null,
    productFamily: rowString(row, 'productFamily'),
    cardClass: rowString(row, 'cardClass'),
    variationLabel: rowString(row, 'variationLabel'),
    gradeBucket: rowString(row, 'gradeBucket'),
    serialDenominator: rowNumber(row, 'serialDenominator') || null,
    saleCount: rowNumber(row, 'saleCount'),
    sales30: rowNumber(row, 'sales30'),
    sales90: rowNumber(row, 'sales90'),
    auctionCount: rowNumber(row, 'auctionCount'),
    binCount: rowNumber(row, 'binCount'),
    minPrice: rowNumber(row, 'minPrice'),
    q1Price: rowNumber(row, 'q1Price'),
    medianPrice: rowNumber(row, 'medianPrice'),
    avgPrice: rowNumber(row, 'avgPrice'),
    q3Price: rowNumber(row, 'q3Price'),
    maxPrice: rowNumber(row, 'maxPrice'),
    modelPrice: rowNumber(row, 'modelPrice'),
    baseAutoMultiple: rowNumber(row, 'baseAutoMultiple') || null,
    latestSoldAt: rowString(row, 'latestSoldAt'),
    generatedAt: rowString(row, 'generatedAt'),
  }
}

function inferredBaseAutoPriceFromBuckets(buckets: ReturnType<typeof mapSalesCacheBucket>[]) {
  const candidates = buckets
    .map((bucket) => {
      if (bucket.cardClass !== 'auto' || bucket.gradeBucket !== 'Raw') return null
      if (!bucket.modelPrice || !bucket.baseAutoMultiple) return null
      const value = bucket.modelPrice / bucket.baseAutoMultiple
      const weight = Math.sqrt(Math.min(16, Math.max(1, bucket.saleCount || 1)))
      return Number.isFinite(value) && value > 0 ? { value, weight } : null
    })
    .filter((candidate): candidate is { value: number; weight: number } => Boolean(candidate))
    .sort((left, right) => left.value - right.value)

  if (candidates.length === 0) return null
  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0)
  let runningWeight = 0
  for (const candidate of candidates) {
    runningWeight += candidate.weight
    if (runningWeight >= totalWeight / 2) return candidate.value
  }
  return candidates[candidates.length - 1]?.value ?? null
}

function mapChecklistUniverseRow(row: SqliteRow) {
  return {
    universeCardKey: rowString(row, 'universeCardKey'),
    checklistCardKey: rowString(row, 'checklistCardKey'),
    templateKey: rowString(row, 'templateKey'),
    releaseKey: rowString(row, 'releaseKey'),
    releaseYear: rowNumber(row, 'releaseYear'),
    cardNo: rowString(row, 'cardNo'),
    playerName: rowString(row, 'playerName'),
    team: rowString(row, 'team'),
    productFamily: rowString(row, 'productFamily'),
    cardFamily: rowString(row, 'cardFamily'),
    cardClass: rowString(row, 'cardClass'),
    variationLabel: rowString(row, 'variationLabel'),
    serialDenominator: rowNumber(row, 'serialDenominator') || null,
    printRun: rowNumber(row, 'printRun') || null,
    scarcityRank: rowNumber(row, 'scarcityRank') || null,
    gradeBucket: rowString(row, 'gradeBucket'),
    firstStatus: rowString(row, 'firstStatus'),
    firstConfidence: rowNumber(row, 'firstConfidence'),
    firstEvidenceCount: rowNumber(row, 'firstEvidenceCount'),
    chaseCategory: rowString(row, 'chaseCategory'),
    updatedAt: rowString(row, 'updatedAt'),
  }
}

function checklistCategoryFromReleaseName(releaseName: string) {
  const text = releaseName.toLowerCase()
  if (/\bdraft\b/.test(text)) return 'draft'
  if (/\bchrome\b/.test(text)) return 'chrome'
  return 'bowman'
}

function checklistReleaseSlug(releaseName: string, releaseKey: string) {
  const label = releaseName
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-')
  return label || releaseKey
}

function compactSqlText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function mapChecklistCatalogRelease(row: SqliteRow) {
  const releaseName = rowString(row, 'releaseName')
  const releaseKey = rowString(row, 'releaseKey')
  const category = checklistCategoryFromReleaseName(releaseName)
  const releaseYear = rowNumber(row, 'releaseYear')
  const totalPlayers = rowNumber(row, 'totalPlayers')
  const pricedBaseAutos = rowNumber(row, 'pricedBaseAutos')
  const confirmedFirstPlayers = rowNumber(row, 'confirmedFirstPlayers')

  return {
    id: releaseKey,
    label: releaseName,
    category,
    categoryLabel: category === 'draft' ? 'Bowman Draft' : category === 'chrome' ? 'Bowman Chrome' : 'Bowman',
    year: releaseYear,
    release: checklistReleaseSlug(releaseName, releaseKey),
    releaseKey,
    source: rowString(row, 'source'),
    totalPlayers,
    firstChromeAutos: confirmedFirstPlayers || totalPlayers || null,
    activeChecklistPlayers: pricedBaseAutos || null,
    pricedBaseAutos,
    queuedPlayers: rowNumber(row, 'queuedPlayers'),
    donePlayers: rowNumber(row, 'donePlayers'),
    importedAt: rowString(row, 'importedAt'),
  }
}

function localChecklistModelQuery(db: SqliteDatabase, releaseKey: string, source = '') {
  const sourceFilter = source === 'waxpackhero' ? "AND c.source_sheet = 'Wax Pack Hero First Bowman'" : ''
  return db.prepare(`
    WITH players AS (
      SELECT
        c.release_key,
        c.release_year,
        c.player_key,
        MAX(c.player_name) AS player_name,
        MAX(NULLIF(c.team, '')) AS team,
        MAX(CASE WHEN c.first_status = 'confirmed_1st' THEN 1 ELSE 0 END) AS confirmed_first,
        COUNT(*) AS checklist_rows
      FROM checklist_cards c
      WHERE c.release_key = ?
        ${sourceFilter}
      GROUP BY c.release_key, c.release_year, c.player_key
    ),
    base_candidates AS (
      SELECT
        p.player_key,
        cc.product_family,
        cc.variation_label,
        s.sale_count,
        s.sales_30,
        s.sales_90,
        s.auction_count,
        s.bin_count,
        s.twma_30,
        s.twma_90,
        s.recent_3_avg,
        s.recent_5_avg,
        s.median_price,
        s.avg_price,
        s.latest_sold_at,
        ROW_NUMBER() OVER (
          PARTITION BY p.player_key
          ORDER BY
            CASE WHEN lower(cc.product_family) LIKE '%chrome%' THEN 0 ELSE 1 END,
            s.sale_count DESC,
            s.sales_30 DESC,
            s.latest_sold_at DESC
        ) AS rn
      FROM players p
      JOIN canonical_cards cc
        ON cc.release_year = p.release_year
       AND lower(cc.player_name) = lower(p.player_name)
      JOIN canonical_comp_summary s
        ON s.canonical_card_key = cc.canonical_card_key
      WHERE cc.grade_bucket = 'Raw'
        AND cc.card_class IN ('auto', 'paper-auto')
        AND cc.variation_label IN ('Base Auto', 'Base', '')
    )
    SELECT
      p.player_name AS playerName,
      p.player_key AS playerKey,
      p.team AS team,
      p.confirmed_first AS confirmedFirst,
      p.checklist_rows AS checklistRows,
      b.product_family AS productFamily,
      b.sale_count AS saleCount,
      b.sales_30 AS sales30,
      b.sales_90 AS sales90,
      b.auction_count AS auctionCount,
      b.bin_count AS binCount,
      b.twma_30 AS twma30,
      b.twma_90 AS twma90,
      b.recent_3_avg AS recent3Avg,
      b.recent_5_avg AS recent5Avg,
      b.median_price AS medianPrice,
      b.avg_price AS avgPrice,
      b.latest_sold_at AS latestSoldAt
    FROM players p
    LEFT JOIN base_candidates b ON b.player_key = p.player_key AND b.rn = 1
    ORDER BY
      CASE WHEN b.sale_count IS NULL OR b.sale_count <= 0 THEN 1 ELSE 0 END,
      COALESCE(b.twma_30, b.recent_5_avg, b.twma_90, b.median_price, b.avg_price, 0) DESC,
      p.player_name
    LIMIT ?
  `).all(releaseKey, MAX_CHECKLIST_MODEL_PLAYERS)
}

function mapLocalChecklistPlayer(row: SqliteRow) {
  const baseAvgPrice =
    rowNumber(row, 'twma30') ||
    rowNumber(row, 'recent5Avg') ||
    rowNumber(row, 'twma90') ||
    rowNumber(row, 'medianPrice') ||
    rowNumber(row, 'avgPrice')
  const saleCount = rowNumber(row, 'saleCount')

  return {
    playerName: rowString(row, 'playerName'),
    team: rowString(row, 'team') || null,
    status: rowNumber(row, 'confirmedFirst') ? 'confirmed_1st' : 'first_bowman',
    prospectId: rowString(row, 'playerKey') || null,
    baseAvgPrice: Number(baseAvgPrice.toFixed(2)),
    baseSalesCount: saleCount,
    baseSales: [],
    variations: [],
  }
}

function localChecklistReleaseLookup(db: SqliteDatabase, requestedRelease: string) {
  return db.prepare(`
    SELECT
      release_key AS releaseKey,
      release_year AS releaseYear,
      release_name AS releaseName,
      product_line AS productLine,
      imported_at AS importedAt,
      source_path AS sourcePath,
      source_hash AS sourceHash
    FROM checklist_releases
    WHERE release_key = ?
       OR lower(release_name) = lower(replace(?, '-', ' '))
       OR lower(release_key) = lower(?)
    LIMIT 1
  `).get(requestedRelease, requestedRelease, requestedRelease)
}

function mapSalesCacheSale(row: SqliteRow) {
  return {
    itemId: rowString(row, 'itemId'),
    playerName: rowString(row, 'playerName'),
    title: rowString(row, 'title'),
    salePriceText: rowString(row, 'salePriceText'),
    salePrice: rowNumber(row, 'salePrice'),
    soldAt: rowString(row, 'soldAt'),
    saleType: rowString(row, 'saleType'),
    channel: rowString(row, 'channel'),
    seller: rowString(row, 'seller'),
    sourcePage: rowNumber(row, 'sourcePage') || null,
    sourceOffset: rowNumber(row, 'sourceOffset'),
    releaseYear: rowNumber(row, 'releaseYear') || null,
    productFamily: rowString(row, 'productFamily'),
    cardClass: rowString(row, 'cardClass'),
    variationLabel: rowString(row, 'variationLabel'),
    serialDenominator: rowNumber(row, 'serialDenominator') || null,
    gradeCompany: rowString(row, 'gradeCompany') || null,
    gradeValue: rowNumber(row, 'gradeValue') || null,
    gradeBucket: rowString(row, 'gradeBucket'),
    insertName: rowString(row, 'insertName') || null,
    bucketKey: rowString(row, 'bucketKey'),
    sourceBucketKey: rowString(row, 'sourceBucketKey') || rowString(row, 'bucketKey'),
    sourceProductFamily: rowString(row, 'sourceProductFamily') || rowString(row, 'productFamily'),
    sourceCardClass: rowString(row, 'sourceCardClass') || rowString(row, 'cardClass'),
    sourceVariationLabel: rowString(row, 'sourceVariationLabel') || rowString(row, 'variationLabel'),
    sourceSerialDenominator: rowNumber(row, 'sourceSerialDenominator') || rowNumber(row, 'serialDenominator') || null,
    sourceGradeBucket: rowString(row, 'sourceGradeBucket') || rowString(row, 'gradeBucket'),
    sourceInsertName: rowString(row, 'sourceInsertName') || rowString(row, 'insertName') || null,
    sourceIsAuto: rowBool(row, 'sourceIsAuto'),
    sourceIsBowman: rowBool(row, 'sourceIsBowman'),
    sourceIsChrome: rowBool(row, 'sourceIsChrome'),
    sourceIsPaper: rowBool(row, 'sourceIsPaper'),
    sourceIsCaseHit: rowBool(row, 'sourceIsCaseHit'),
    sourceIsInsert: rowBool(row, 'sourceIsInsert'),
    bucketMergeNote: rowString(row, 'bucketMergeNote'),
    bucketMergeUpdatedAt: rowString(row, 'bucketMergeUpdatedAt'),
    modelEligible: rowBool(row, 'modelEligible'),
    exclusionReason: rowString(row, 'exclusionReason') || null,
    isAuto: rowBool(row, 'isAuto'),
    isBowman: rowBool(row, 'isBowman'),
    isChrome: rowBool(row, 'isChrome'),
    isPaper: rowBool(row, 'isPaper'),
    isCaseHit: rowBool(row, 'isCaseHit'),
    isInsert: rowBool(row, 'isInsert'),
    isRedemption: rowBool(row, 'isRedemption'),
    isRedeemed: rowBool(row, 'isRedeemed'),
    isDigital: rowBool(row, 'isDigital'),
    isLot: rowBool(row, 'isLot'),
    erroneous: rowBool(row, 'erroneous'),
    erroneousNote: rowString(row, 'erroneousNote'),
    flagUpdatedAt: rowString(row, 'flagUpdatedAt'),
  }
}

function ensureSalesCacheFlagSchema(db: SqliteDatabase) {
  db.exec(`
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
      updated_at TEXT NOT NULL
    );
  `)

  ensureSqliteColumn(db, 'market_movers_bucket_overrides', 'target_release_year', 'INTEGER')
  ensureSqliteColumn(db, 'market_movers_bucket_overrides', 'target_product_family', 'TEXT')
  ensureSqliteColumn(db, 'market_movers_bucket_overrides', 'target_card_class', 'TEXT')
  ensureSqliteColumn(db, 'market_movers_bucket_overrides', 'target_variation_label', 'TEXT')
  ensureSqliteColumn(db, 'market_movers_bucket_overrides', 'target_serial_denominator', 'INTEGER')
  ensureSqliteColumn(db, 'market_movers_bucket_overrides', 'target_grade_bucket', 'TEXT')
  ensureSqliteColumn(db, 'market_movers_bucket_overrides', 'target_insert_name', 'TEXT')
}

function isEbayRateLimitMessage(message: string) {
  return /(?:^|\D)429(?:\D|$)|rate.?limit|too many requests/i.test(message)
}

function ebayResponseStatusForErrors(errors: Array<{ error: string }>) {
  if (errors.some((error) => isEbayRateLimitMessage(error.error))) return 429
  return 502
}

function retryAfterMs(headers: Headers) {
  const value = headers.get('retry-after')
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
  const dateMs = Date.parse(value)
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function hasManagedPulseCredentials(env: ServerEnv) {
  return Boolean(env.PROSPECTPULSE_ACCESS_TOKEN || (env.PROSPECTPULSE_EMAIL && env.PROSPECTPULSE_PASSWORD))
}

async function getManagedPulseAccessToken(env: ServerEnv, supabaseUrl: string, anonKey: string) {
  if (env.PROSPECTPULSE_ACCESS_TOKEN) return env.PROSPECTPULSE_ACCESS_TOKEN

  const email = env.PROSPECTPULSE_EMAIL
  const password = env.PROSPECTPULSE_PASSWORD
  if (!email || !password) return null

  const cacheKey = `${supabaseUrl}:${email}:${password}`
  if (pulseTokenCache?.cacheKey === cacheKey && pulseTokenCache.expiresAt > Date.now() + 60_000) {
    return pulseTokenCache.accessToken
  }

  const upstream = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      email,
      password,
    }),
  })

  const text = await upstream.text()
  if (!upstream.ok) throw new Error(`ProspectPulse managed login failed (${upstream.status})`)

  const session = JSON.parse(text) as {
    access_token?: string
    refresh_token?: string
    expires_at?: number
    expires_in?: number
  }
  if (!session.access_token) throw new Error('ProspectPulse managed login did not include an access token')

  pulseTokenCache = {
    cacheKey,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at
      ? session.expires_at * 1_000
      : Date.now() + Math.max(60, session.expires_in ?? 3_600) * 1_000,
  }

  return session.access_token
}

async function getEbayAccessToken(env: ServerEnv, sandbox: boolean, scope = EBAY_OAUTH_SCOPE) {
  const clientId = env.EBAY_CLIENT_ID
  const clientSecret = env.EBAY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in Vercel environment variables')

  const cacheKey = `${sandbox ? 'sandbox' : 'production'}:${clientId}:${clientSecret}:${scope}`
  if (ebayTokenCache?.cacheKey === cacheKey && ebayTokenCache.expiresAt > Date.now() + 60_000) {
    return ebayTokenCache.accessToken
  }

  const upstream = await fetch(`${ebayHost(sandbox)}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope,
    }),
  })

  const text = await upstream.text()
  if (!upstream.ok) throw new Error(`eBay OAuth failed (${upstream.status})`)

  const token = JSON.parse(text) as { access_token?: string; expires_in?: number }
  if (!token.access_token) throw new Error('eBay OAuth response did not include an access token')

  ebayTokenCache = {
    cacheKey,
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(60, token.expires_in ?? 7_200) * 1_000,
  }

  return token.access_token
}

async function mapWithLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = []
  let cursor = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await worker(items[index], index)
      }
    }),
  )

  return results
}

function safeBuyingOption(value: unknown) {
  const option = String(value ?? 'FIXED_PRICE').trim().toUpperCase()
  return option === 'AUCTION' ? 'AUCTION' : 'FIXED_PRICE'
}

function ebayDate(value: Date) {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function ebayFilter(payload: EbaySearchPayload, anchorDate = new Date()) {
  const buyingOption = safeBuyingOption(payload.buyingOption)
  const filters = [`buyingOptions:{${buyingOption}}`]
  const minPrice = Number(payload.minPrice)
  if (Number.isFinite(minPrice) && minPrice > 0) {
    filters.push(`price:[${minPrice}]`, 'priceCurrency:USD')
  }
  const maxHoursToClose = Number(payload.maxHoursToClose)
  if (buyingOption === 'AUCTION' && Number.isFinite(maxHoursToClose) && maxHoursToClose > 0) {
    const start = anchorDate
    const end = new Date(start.getTime() + Math.min(maxHoursToClose, 168) * 60 * 60 * 1_000)
    filters.push(`itemEndDate:[${ebayDate(start)}..${ebayDate(end)}]`)
  }
  return filters.join(',')
}

function ebayItemKey(item: Record<string, unknown>) {
  return String(item.itemId ?? item.legacyItemId ?? item.itemWebUrl ?? item.title ?? '')
}

function dedupeEbayItems(items: Array<Record<string, unknown>>) {
  const seen = new Set<string>()
  const deduped: Array<Record<string, unknown>> = []
  for (const item of items) {
    const key = ebayItemKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

async function searchEbayJob(options: {
  accessToken: string
  sandbox: boolean
  job: EbaySearchJob
  payload: EbaySearchPayload
  defaultCategoryId?: string
  defaultMarketplaceId: string
  defaultZipCode?: string
  cache?: EbayQueryCacheContext | null
}): Promise<EbaySearchJobResult> {
  const { accessToken, sandbox, job, payload, defaultCategoryId, defaultMarketplaceId, defaultZipCode, cache } = options
  const query = String(job.q ?? '').trim()
  if (!query) return { items: [] as Array<Record<string, unknown>>, pagesFetched: 0, total: 0, cache: emptyEbayQueryCacheStats() }

  const limit = clampInt(payload.limit, 100, 1, 200)
  const maxPages = clampInt(payload.maxPages, 1, 1, 3)
  const marketplaceId = String(defaultMarketplaceId || 'EBAY_US')
  const categoryId = String(defaultCategoryId || '').trim()
  const allItems: Array<Record<string, unknown>> = []
  const cacheConfig = ebayQueryCacheConfig(cache?.env ?? {}, 'search', payload)
  const cacheStats = emptyEbayQueryCacheStats()
  const filterAnchor = ebayCacheAnchorDate(payload)
  let total = 0
  let pagesFetched = 0

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * limit
    const url = new URL(`${ebayHost(sandbox)}/buy/browse/v1/item_summary/search`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('filter', ebayFilter(payload, filterAnchor))
    if (payload.sort) url.searchParams.set('sort', String(payload.sort))
    if (categoryId) url.searchParams.set('category_ids', categoryId)

    const fingerprint = ebayQueryFingerprint({
      route: 'search',
      sandbox,
      marketplaceId,
      defaultZipCode,
      url,
    })
    const cacheKey = `ebay-query:${sha256(fingerprint)}`
    const nowIso = new Date().toISOString()

    if (cacheConfig.enabled) {
      const cached = await readEbayQueryCache({ cache: cache ?? null, cacheKey, nowIso })
      if (cached.value) {
        cacheStats.cacheHits += 1
        if (cached.source === 'redis') cacheStats.redisCacheHits += 1
        if (cached.source === 'runtime') cacheStats.runtimeCacheHits += 1
        if (cached.source === 'sqlite') cacheStats.sqliteCacheHits += 1
        const items = cached.value.items ?? []
        total = Number(cached.value.total ?? total) || total
        pagesFetched += 1
        allItems.push(...decorateEbayItems(items, job))
        if (items.length < limit || offset + limit >= Math.min(total || 0, 10_000)) break
        continue
      }
      cacheStats.cacheMisses += 1
    }

    if (ebayRateLimitedUntil > Date.now()) {
      throw new EbayUpstreamError(EBAY_RATE_LIMIT_MESSAGE, 429, ebayRateLimitedUntil - Date.now())
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
    }
    if (defaultZipCode) {
      headers['X-EBAY-C-ENDUSERCTX'] = `contextualLocation=country%3DUS%2Czip%3D${encodeURIComponent(defaultZipCode)}`
    }

    let upstream: Response | null = null
    let text = ''
    for (let attempt = 0; attempt < 2; attempt += 1) {
      upstream = await fetch(url, { headers })
      text = await upstream.text()
      if (upstream.ok) break
      if (upstream.status === 429) {
        const retryMs = Math.min(retryAfterMs(upstream.headers) ?? 1_500, EBAY_RATE_LIMIT_RETRY_CAP_MS)
        ebayRateLimitedUntil = Date.now() + Math.max(retryAfterMs(upstream.headers) ?? EBAY_RATE_LIMIT_DEFAULT_MS, EBAY_RATE_LIMIT_DEFAULT_MS)
        if (attempt === 0) {
          await wait(retryMs)
          continue
        }
      }
      throw new EbayUpstreamError(`eBay search failed for "${query}" (${upstream.status})`, upstream.status, retryAfterMs(upstream.headers))
    }

    if (!upstream?.ok) throw new EbayUpstreamError(`eBay search failed for "${query}"`, 502)

    const data = JSON.parse(text) as { itemSummaries?: Array<Record<string, unknown>>; total?: number }
    const items = data.itemSummaries ?? []
    total = Number(data.total ?? total) || total
    pagesFetched += 1
    cacheStats.upstreamPagesFetched += 1

    if (cacheConfig.enabled) {
      const observedAt = new Date().toISOString()
      const expiresAt = new Date(Date.parse(observedAt) + cacheConfig.ttlSeconds * 1_000).toISOString()
      const write = await writeEbayQueryCache({
        cache: cache ?? null,
        cacheKey,
        fingerprint,
        ttlSeconds: cacheConfig.ttlSeconds,
        nowIso: observedAt,
        value: {
          version: EBAY_QUERY_CACHE_VERSION,
          route: 'search',
          buyingOption: cacheConfig.buyingOption,
          query,
          page,
          total,
          pagesFetched: 1,
          items,
          observedAt,
          expiresAt,
        },
      })
      if (write.written) cacheStats.cacheWrites += 1
      if (write.skipped) cacheStats.cacheSkips += 1
    }

    allItems.push(...decorateEbayItems(items, job))

    if (items.length < limit || offset + limit >= Math.min(total || 0, 10_000)) break
  }

  return { items: allItems, pagesFetched, total, cache: cacheStats }
}

async function searchEbaySoldJob(options: {
  accessToken: string
  sandbox: boolean
  job: EbaySearchJob
  payload: EbaySearchPayload
  defaultCategoryId?: string
  defaultMarketplaceId: string
  cache?: EbayQueryCacheContext | null
}): Promise<EbaySearchJobResult> {
  const { accessToken, sandbox, job, payload, defaultCategoryId, defaultMarketplaceId, cache } = options
  const query = String(job.q ?? '').trim()
  if (!query) return { items: [] as Array<Record<string, unknown>>, pagesFetched: 0, total: 0, cache: emptyEbayQueryCacheStats() }

  const limit = clampInt(payload.limit, 100, 1, 200)
  const maxPages = clampInt(payload.maxPages, 1, 1, 3)
  const marketplaceId = String(defaultMarketplaceId || 'EBAY_US')
  const categoryId = String(defaultCategoryId || '').trim()
  const allItems: Array<Record<string, unknown>> = []
  const cacheConfig = ebayQueryCacheConfig(cache?.env ?? {}, 'sold', payload)
  const cacheStats = emptyEbayQueryCacheStats()
  let total = 0
  let pagesFetched = 0

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * limit
    const url = new URL(`${ebayHost(sandbox)}/buy/marketplace_insights/v1_beta/item_sales/search`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))
    if (payload.sort) url.searchParams.set('sort', String(payload.sort))
    if (categoryId) url.searchParams.set('category_ids', categoryId)

    const fingerprint = ebayQueryFingerprint({
      route: 'sold',
      sandbox,
      marketplaceId,
      url,
    })
    const cacheKey = `ebay-query:${sha256(fingerprint)}`
    const nowIso = new Date().toISOString()

    if (cacheConfig.enabled) {
      const cached = await readEbayQueryCache({ cache: cache ?? null, cacheKey, nowIso })
      if (cached.value) {
        cacheStats.cacheHits += 1
        if (cached.source === 'redis') cacheStats.redisCacheHits += 1
        if (cached.source === 'runtime') cacheStats.runtimeCacheHits += 1
        if (cached.source === 'sqlite') cacheStats.sqliteCacheHits += 1
        const items = cached.value.items ?? []
        total = Number(cached.value.total ?? total) || total
        pagesFetched += 1
        allItems.push(...decorateEbayItems(items, job))
        if (items.length < limit || offset + limit >= Math.min(total || 0, 10_000)) break
        continue
      }
      cacheStats.cacheMisses += 1
    }

    if (ebayRateLimitedUntil > Date.now()) {
      throw new EbayUpstreamError(EBAY_RATE_LIMIT_MESSAGE, 429, ebayRateLimitedUntil - Date.now())
    }

    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
    }
    let upstream: Response | null = null
    let text = ''
    for (let attempt = 0; attempt < 2; attempt += 1) {
      upstream = await fetch(url, { headers })
      text = await upstream.text()
      if (upstream.ok) break
      if (upstream.status === 429) {
        const retryMs = Math.min(retryAfterMs(upstream.headers) ?? 1_500, EBAY_RATE_LIMIT_RETRY_CAP_MS)
        ebayRateLimitedUntil = Date.now() + Math.max(retryAfterMs(upstream.headers) ?? EBAY_RATE_LIMIT_DEFAULT_MS, EBAY_RATE_LIMIT_DEFAULT_MS)
        if (attempt === 0) {
          await wait(retryMs)
          continue
        }
      }
      throw new EbayUpstreamError(`eBay sold search failed for "${query}" (${upstream.status})`, upstream.status, retryAfterMs(upstream.headers))
    }

    if (!upstream?.ok) throw new EbayUpstreamError(`eBay sold search failed for "${query}"`, 502)

    const data = JSON.parse(text) as {
      itemSales?: Array<Record<string, unknown>>
      itemSummaries?: Array<Record<string, unknown>>
      items?: Array<Record<string, unknown>>
      total?: number
    }
    const items = data.itemSales ?? data.itemSummaries ?? data.items ?? []
    total = Number(data.total ?? total) || total
    pagesFetched += 1
    cacheStats.upstreamPagesFetched += 1

    if (cacheConfig.enabled) {
      const observedAt = new Date().toISOString()
      const expiresAt = new Date(Date.parse(observedAt) + cacheConfig.ttlSeconds * 1_000).toISOString()
      const write = await writeEbayQueryCache({
        cache: cache ?? null,
        cacheKey,
        fingerprint,
        ttlSeconds: cacheConfig.ttlSeconds,
        nowIso: observedAt,
        value: {
          version: EBAY_QUERY_CACHE_VERSION,
          route: 'sold',
          buyingOption: cacheConfig.buyingOption,
          query,
          page,
          total,
          pagesFetched: 1,
          items,
          observedAt,
          expiresAt,
        },
      })
      if (write.written) cacheStats.cacheWrites += 1
      if (write.skipped) cacheStats.cacheSkips += 1
    }

    allItems.push(...decorateEbayItems(items, job))

    if (items.length < limit || offset + limit >= Math.min(total || 0, 10_000)) break
  }

  return { items: allItems, pagesFetched, total, cache: cacheStats }
}

function canUsePublicChecklist(body: string) {
  try {
    const payload = JSON.parse(body) as { action?: string }
    return payload.action === 'getCategoryOverview' || payload.action === 'getCategoryYearMultipliers'
  } catch {
    return false
  }
}

function safeEbayQueries(payload: EbaySearchPayload) {
  return (payload.queries ?? [])
    .flatMap((query) => {
      const q = String(query.q ?? '').replace(/\s+/g, ' ').trim()
      if (!q) return []
      if (q.length > MAX_EBAY_QUERY_LENGTH) throw new ProxyRequestError(400, 'eBay query is too long')
      if (!/\bbowman\b/i.test(q)) throw new ProxyRequestError(400, 'eBay queries must be scoped to Bowman cards')
      return [{ ...query, q }]
    })
    .slice(0, MAX_EBAY_QUERIES)
}

export async function handleProspectPulseRoute(route: string, request: Request, env: ServerEnv) {
  const supabaseUrl = env.PROSPECTPULSE_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const anonKey = env.PROSPECTPULSE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
  const managedConnection = hasManagedPulseCredentials(env)

  if (request.method === 'GET' && route === 'status') {
    return jsonResponse(200, {
      connected: managedConnection,
      serverConnected: managedConnection,
      authMode: managedConnection ? 'server' : 'public',
      hasAnonKey: Boolean(anonKey),
      message: managedConnection ? 'ProspectPulse managed connection loaded' : 'No server access token configured',
    })
  }

  const unsafePost = rejectUnsafePost(request)
  if (unsafePost) return unsafePost

  if (request.method === 'POST' && route === 'login') {
    try {
      const payload = await readJsonBody<{
        email?: string
        password?: string
      }>(request, MAX_LOGIN_BODY_BYTES)
      if (!payload.email || !payload.password) {
        return jsonResponse(400, { error: 'Email and password are required' })
      }

      const upstream = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          email: payload.email,
          password: payload.password,
        }),
      })
      const text = await upstream.text()
      return new Response(text, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    } catch (error) {
      return jsonResponse(routeErrorStatus(error), {
        error: routeErrorMessage(error, 'Login request failed'),
      })
    }
  }

  if (!route || request.method !== 'POST') return new Response(null, { status: 404 })

  if (!PROSPECTPULSE_FUNCTION_ROUTES.has(route)) {
    return jsonResponse(404, { error: 'Unknown ProspectPulse route' })
  }

  let body: string
  try {
    body = await readRequestText(request, MAX_JSON_BODY_BYTES)
    JSON.parse(body)
  } catch (error) {
    return jsonResponse(routeErrorStatus(error), { error: routeErrorMessage(error, 'Invalid ProspectPulse request') })
  }

  const headerToken = request.headers.get('x-prospectpulse-access-token')?.trim()
  let accessToken = headerToken || undefined

  if (!accessToken && managedConnection) {
    try {
      accessToken = (await getManagedPulseAccessToken(env, supabaseUrl, anonKey)) || undefined
    } catch (error) {
      return jsonResponse(routeErrorStatus(error), {
        error: routeErrorMessage(error, 'ProspectPulse managed login failed'),
      })
    }
  }

  accessToken ||= route === 'api-checklists' && canUsePublicChecklist(body) ? anonKey : undefined

  if (!accessToken) {
    return jsonResponse(401, { error: 'Connect ProspectPulse or set server-managed ProspectPulse credentials' })
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
      body,
    })
    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return jsonResponse(502, {
      error: error instanceof Error ? error.message : 'ProspectPulse proxy request failed',
    })
  }
}

export async function handleEbayRoute(route: string, request: Request, env: ServerEnv) {
  const sandbox = env.EBAY_ENV === 'sandbox'
  const configured = Boolean(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET)

  if (request.method === 'GET' && route === 'status') {
    const runtimeCache = await getVercelRuntimeCache()
    const redisConfig = upstashRedisEnv(env)
    return jsonResponse(200, {
      configured,
      environment: sandbox ? 'sandbox' : 'production',
      marketplaceId: env.EBAY_MARKETPLACE_ID || 'EBAY_US',
      hasCategoryId: Boolean(env.EBAY_CATEGORY_ID),
      cache: {
        enabled: !/^(0|false|off|no)$/i.test(String(env.EBAY_QUERY_CACHE_ENABLED ?? 'true')),
        fixedPriceTtlSeconds: clampInt(env.EBAY_BIN_QUERY_CACHE_TTL_SECONDS, EBAY_BIN_QUERY_CACHE_TTL_SECONDS, 0, 24 * 60 * 60),
        auctionTtlSeconds: clampInt(env.EBAY_AUCTION_QUERY_CACHE_TTL_SECONDS, EBAY_AUCTION_QUERY_CACHE_TTL_SECONDS, 0, 24 * 60 * 60),
        soldTtlSeconds: clampInt(env.EBAY_SOLD_QUERY_CACHE_TTL_SECONDS, EBAY_SOLD_QUERY_CACHE_TTL_SECONDS, 0, 30 * 24 * 60 * 60),
        redisCache: redisConfig.configured,
        runtimeCache: Boolean(runtimeCache),
        localCache: true,
      },
      message: configured ? 'eBay Browse API configured' : 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in Vercel environment variables',
    })
  }

  if (request.method !== 'POST' || !EBAY_ROUTES.has(route)) return new Response(null, { status: 404 })

  const unsafePost = rejectUnsafePost(request)
  if (unsafePost) return unsafePost

  if (!configured) return jsonResponse(401, { error: 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in Vercel environment variables' })

  let cacheDb: SqliteDatabase | null = null
  try {
    const payload = await readJsonBody<EbaySearchPayload>(request, MAX_EBAY_BODY_BYTES)
    const queries = safeEbayQueries(payload)

    if (queries.length === 0) return jsonResponse(400, { error: 'At least one eBay query is required' })

    const opened = await openOptionalWritableMarketDb(env)
    cacheDb = opened.db
    if (cacheDb) ensureEbayQueryCacheSchema(cacheDb)
    const cacheContext = { db: cacheDb, env }

    const accessToken = await getEbayAccessToken(
      env,
      sandbox,
      route === 'sold' ? env.EBAY_MARKETPLACE_INSIGHTS_SCOPE || EBAY_OAUTH_SCOPE : EBAY_OAUTH_SCOPE,
    )
    const concurrency = route === 'sold' ? EBAY_SOLD_SEARCH_CONCURRENCY : EBAY_SEARCH_CONCURRENCY
    const settled = await mapWithLimit(queries, concurrency, async (job) => {
      try {
        const value =
          route === 'sold'
            ? await searchEbaySoldJob({
                accessToken,
                sandbox,
                job,
                payload,
                defaultCategoryId: env.EBAY_CATEGORY_ID,
                defaultMarketplaceId: env.EBAY_MARKETPLACE_ID || 'EBAY_US',
                cache: cacheContext,
              })
            : await searchEbayJob({
                accessToken,
                sandbox,
                job,
                payload,
                defaultCategoryId: env.EBAY_CATEGORY_ID,
                defaultMarketplaceId: env.EBAY_MARKETPLACE_ID || 'EBAY_US',
                defaultZipCode: env.EBAY_ZIP_CODE,
                cache: cacheContext,
              })
        return {
          status: 'fulfilled' as const,
          value,
        }
      } catch (error) {
        return {
          status: 'rejected' as const,
          reason: ebayRouteErrorMessage(route, error instanceof Error ? error.message : 'eBay query failed'),
          query: job.q,
        }
      }
    })

    const fulfilled = settled.filter((result) => result.status === 'fulfilled')
    const errors = settled
      .filter((result) => result.status === 'rejected')
      .map((result) => ({ query: result.query, error: result.reason }))
    const items = dedupeEbayItems(fulfilled.flatMap((result) => result.value.items))

    if (items.length === 0 && errors.length > 0) {
      return jsonResponse(ebayResponseStatusForErrors(errors), { error: errors[0]?.error ?? 'eBay search failed', errors })
    }

    return jsonResponse(200, {
      items,
      errors,
      fetchedAt: new Date().toISOString(),
      stats: {
        queriesRun: queries.length,
        queriesSucceeded: fulfilled.length,
        queriesFailed: errors.length,
        pagesFetched: fulfilled.reduce((total, result) => total + result.value.pagesFetched, 0),
        upstreamTotal: fulfilled.reduce((total, result) => total + result.value.total, 0),
        dedupedItems: items.length,
        cacheHits: fulfilled.reduce((total, result) => total + result.value.cache.cacheHits, 0),
        cacheMisses: fulfilled.reduce((total, result) => total + result.value.cache.cacheMisses, 0),
        cacheWrites: fulfilled.reduce((total, result) => total + result.value.cache.cacheWrites, 0),
        cacheSkips: fulfilled.reduce((total, result) => total + result.value.cache.cacheSkips, 0),
        redisCacheHits: fulfilled.reduce((total, result) => total + result.value.cache.redisCacheHits, 0),
        runtimeCacheHits: fulfilled.reduce((total, result) => total + result.value.cache.runtimeCacheHits, 0),
        sqliteCacheHits: fulfilled.reduce((total, result) => total + result.value.cache.sqliteCacheHits, 0),
        upstreamPagesFetched: fulfilled.reduce((total, result) => total + result.value.cache.upstreamPagesFetched, 0),
      },
    })
  } catch (error) {
    const message = ebayRouteErrorMessage(route, error instanceof Error ? error.message : 'eBay proxy request failed')
    return jsonResponse(error instanceof EbayUpstreamError && error.upstreamStatus === 429 ? 429 : routeErrorStatus(error), {
      error: message,
    })
  } finally {
    cacheDb?.close()
  }
}

type FanaticsCollectQueryMeta = {
  q?: string
  playerName?: string
  release?: string
  releaseYear?: number
  category?: string
  variationTerm?: string
  baseAutoOnly?: boolean
  lowSerialNonAuto?: boolean
  serialDenominator?: number
}

type FanaticsCollectSearchPayload = {
  queries?: Array<FanaticsCollectQueryMeta | string>
  minPrice?: number | string
  limit?: number | string
}

type FanaticsCollectSearchResult = {
  items: Array<Record<string, unknown>>
  errors: Array<{ query?: string; error: string }>
  fetchedAt: string
  stats: EbayQueryCacheStats
}

function fanaticsCollectString(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function fanaticsCollectNumber(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,%\s,]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function fanaticsCollectQueryFrom(value: FanaticsCollectQueryMeta | string) {
  if (typeof value === 'string') {
    return {
      q: fanaticsCollectString(value).replace(/\s+/g, ' ').slice(0, MAX_EBAY_QUERY_LENGTH),
      playerName: '',
      release: '',
      category: '',
      variationTerm: '',
      baseAutoOnly: false,
      lowSerialNonAuto: false,
    }
  }
  return {
    q: fanaticsCollectString(value.q).replace(/\s+/g, ' ').slice(0, MAX_EBAY_QUERY_LENGTH),
    playerName: fanaticsCollectString(value.playerName),
    release: fanaticsCollectString(value.release),
    releaseYear: fanaticsCollectNumber(value.releaseYear, 0) || undefined,
    category: fanaticsCollectString(value.category),
    variationTerm: fanaticsCollectString(value.variationTerm),
    baseAutoOnly: Boolean(value.baseAutoOnly),
    lowSerialNonAuto: Boolean(value.lowSerialNonAuto),
    serialDenominator: fanaticsCollectNumber(value.serialDenominator, 0) || undefined,
  }
}

function sanitizeFanaticsCollectQueries(payload: FanaticsCollectSearchPayload) {
  const rawQueries = Array.isArray(payload.queries) ? payload.queries : []
  const queries = rawQueries
    .map(fanaticsCollectQueryFrom)
    .filter((query) => query.q)
    .slice(0, MAX_EBAY_QUERIES)

  if (queries.length === 0) throw new ProxyRequestError(400, 'At least one Fanatics Collect query is required')
  return queries
}

async function fetchFanaticsCollectSearchKey(graphqlUrl: string) {
  const cacheKey = graphqlUrl
  if (
    fanaticsCollectSearchKeyCache?.cacheKey === cacheKey &&
    fanaticsCollectSearchKeyCache.expiresAt > Date.now() + 60_000
  ) {
    return fanaticsCollectSearchKeyCache.searchKey
  }

  const upstream = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://www.fanaticscollect.com',
      Referer: FANATICS_COLLECT_MARKETPLACE_URL,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'x-apollo-operation-name': 'webSearchKeyQuery',
    },
    body: JSON.stringify({
      operationName: 'webSearchKeyQuery',
      variables: {},
      query: 'query webSearchKeyQuery { collectSearchKey }',
    }),
    signal: AbortSignal.timeout(5_000),
  })

  const payload = (await upstream.json().catch(() => null)) as
    | { data?: { collectSearchKey?: string }; errors?: Array<{ message?: string }> }
    | null
  const searchKey = fanaticsCollectString(payload?.data?.collectSearchKey)
  if (!upstream.ok || !searchKey) {
    const message = payload?.errors?.[0]?.message ?? `${upstream.status} ${upstream.statusText}`.trim()
    throw new ProxyRequestError(upstream.status || 502, `Fanatics Collect search key request failed: ${message}`)
  }

  fanaticsCollectSearchKeyCache = {
    cacheKey,
    searchKey,
    expiresAt: Date.now() + FANATICS_COLLECT_SEARCH_KEY_TTL_MS,
  }
  return searchKey
}

function dedupeFanaticsCollectHits(items: Array<Record<string, unknown>>) {
  const seen = new Set<string>()
  const deduped: Array<Record<string, unknown>> = []
  for (const item of items) {
    const key = fanaticsCollectString(item.objectID) || fanaticsCollectString(item.listingUuid) || fanaticsCollectString(item.title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

async function searchFanaticsCollect(payload: FanaticsCollectSearchPayload, env: ServerEnv): Promise<FanaticsCollectSearchResult> {
  const graphqlUrl = env.FANATICS_COLLECT_GRAPHQL_URL?.trim() || FANATICS_COLLECT_GRAPHQL_URL
  const appId = env.FANATICS_COLLECT_ALGOLIA_APP_ID?.trim() || FANATICS_COLLECT_ALGOLIA_APP_ID
  const indexName = env.FANATICS_COLLECT_ALGOLIA_INDEX?.trim() || FANATICS_COLLECT_ALGOLIA_INDEX
  const queries = sanitizeFanaticsCollectQueries(payload)
  const minPrice = Math.max(0, fanaticsCollectNumber(payload.minPrice, 0))
  const limit = clampInt(payload.limit, 40, 1, 100)
  const filters = 'marketplace:FIXED AND status:Live AND marketplaceSource:bo'
  const requests = queries.map((query) => ({
    indexName,
    query: query.q,
    hitsPerPage: limit,
    page: 0,
    filters,
    numericFilters: minPrice > 0 ? [`askingPrice>=${minPrice}`] : [],
    attributesToRetrieve: [
      'title',
      'listingUuid',
      'slug',
      'marketplace',
      'marketplaceSource',
      'status',
      'askingPrice',
      'currentPrice',
      'buyNowPrice',
      'price',
      'imageSets',
      'images',
      'allowOffers',
      'quantityAvailable',
    ],
    attributesToHighlight: [],
  }))

  const redis = await getUpstashRedis(env)
  const cacheTtlSeconds = clampInt(
    env.FANATICS_QUERY_CACHE_TTL_SECONDS,
    FANATICS_COLLECT_QUERY_CACHE_TTL_SECONDS,
    0,
    24 * 60 * 60,
  )
  const cacheKey =
    redis && cacheTtlSeconds > 0
      ? redisQueryCacheKey(
          FANATICS_COLLECT_QUERY_CACHE_NAMESPACE,
          sha256(stableJson({ appId, indexName, requests, version: 1 })),
        )
      : ''
  if (redis && cacheKey) {
    try {
      const cached = await redis.get<string>(cacheKey)
      const parsed =
        typeof cached === 'string'
          ? (parseJsonText(cached, null) as Partial<FanaticsCollectSearchResult> | null)
          : ((cached ?? null) as Partial<FanaticsCollectSearchResult> | null)
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items) && parsed.stats) {
        const cachedPayload = parsed as FanaticsCollectSearchResult
        return {
          ...cachedPayload,
          stats: {
            ...cachedPayload.stats,
            cacheHits: Math.max(queries.length, cachedPayload.stats.cacheHits ?? 0),
            redisCacheHits: Math.max(queries.length, cachedPayload.stats.redisCacheHits ?? 0),
            upstreamPagesFetched: 0,
          },
        }
      }
    } catch {
      // Fanatics cache failures should never block the live search route.
    }
  }

  const searchKey = await fetchFanaticsCollectSearchKey(graphqlUrl)
  const resultBatches: Array<{ hits?: Array<Record<string, unknown>>; nbHits?: number; error?: string }> = []
  for (let index = 0; index < requests.length; index += FANATICS_COLLECT_QUERY_BATCH_SIZE) {
    const batch = requests.slice(index, index + FANATICS_COLLECT_QUERY_BATCH_SIZE)
    const upstream = await fetch(`https://${appId}-dsn.algolia.net/1/indexes/*/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Algolia-API-Key': searchKey,
        'X-Algolia-Application-Id': appId,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ requests: batch }),
      signal: AbortSignal.timeout(10_000),
    })

    const algoliaPayload = (await upstream.json().catch(() => null)) as
      | { results?: Array<{ hits?: Array<Record<string, unknown>>; nbHits?: number; error?: string }> ; message?: string }
      | null
    if (!upstream.ok) {
      const message = algoliaPayload?.message ?? `${upstream.status} ${upstream.statusText}`.trim()
      throw new ProxyRequestError(upstream.status || 502, `Fanatics Collect search failed: ${message}`)
    }
    if (Array.isArray(algoliaPayload?.results)) resultBatches.push(...algoliaPayload.results)
  }

  const results = resultBatches
  const errors: Array<{ query?: string; error: string }> = []
  const items = dedupeFanaticsCollectHits(
    results.flatMap((result, index) => {
      const query = queries[index]
      if (result?.error) {
        errors.push({ query: query?.q, error: result.error })
        return []
      }
      return (Array.isArray(result?.hits) ? result.hits : []).map((hit) => ({
        ...hit,
        _backstopQuery: query,
      }))
    }),
  )

  const response = {
    items,
    errors,
    fetchedAt: new Date().toISOString(),
    stats: {
      queriesRun: queries.length,
      queriesSucceeded: Math.max(0, results.length - errors.length),
      queriesFailed: errors.length,
      pagesFetched: results.length,
      upstreamTotal: results.reduce((total, result) => total + fanaticsCollectNumber(result?.nbHits, 0), 0),
      dedupedItems: items.length,
      cacheHits: 0,
      cacheMisses: 0,
      cacheWrites: 0,
      cacheSkips: 0,
      redisCacheHits: 0,
      runtimeCacheHits: 0,
      sqliteCacheHits: 0,
      upstreamPagesFetched: Math.ceil(requests.length / FANATICS_COLLECT_QUERY_BATCH_SIZE),
    },
  }

  if (redis && cacheKey) {
    try {
      await redis.set(cacheKey, jsonText(response), { ex: cacheTtlSeconds })
      response.stats.cacheWrites = 1
    } catch {
      response.stats.cacheSkips = 1
    }
  }

  return response
}

export async function handleFanaticsCollectRoute(route: string, request: Request, env: ServerEnv) {
  if (!FANATICS_COLLECT_ROUTES.has(route)) return new Response(null, { status: 404 })
  if (route === 'status' && request.method !== 'GET') return new Response(null, { status: 404 })
  if (route === 'search' && request.method !== 'POST') return new Response(null, { status: 404 })

  try {
    if (route === 'search') {
      const unsafePost = rejectUnsafePost(request)
      if (unsafePost) return unsafePost
      const payload = await readJsonBody<FanaticsCollectSearchPayload>(request, MAX_EBAY_BODY_BYTES)
      const search = await searchFanaticsCollect(payload, env)
      return jsonResponse(200, search)
    }

    const graphqlUrl = env.FANATICS_COLLECT_GRAPHQL_URL?.trim() || FANATICS_COLLECT_GRAPHQL_URL
    const appId = env.FANATICS_COLLECT_ALGOLIA_APP_ID?.trim() || FANATICS_COLLECT_ALGOLIA_APP_ID
    const indexName = env.FANATICS_COLLECT_ALGOLIA_INDEX?.trim() || FANATICS_COLLECT_ALGOLIA_INDEX
    let reachable = false
    let message = 'Fanatics Collect public search is ready.'
    try {
      await fetchFanaticsCollectSearchKey(graphqlUrl)
      reachable = true
    } catch (error) {
      message = error instanceof Error ? error.message : 'Fanatics Collect public search is unavailable.'
    }

    return jsonResponse(200, {
      provider: 'fanatics-collect',
      label: 'Fanatics Collect',
      configured: reachable,
      reachable,
      mode: reachable ? 'public-algolia-search' : 'offline',
      graphqlUrl,
      marketplaceUrl: FANATICS_COLLECT_MARKETPLACE_URL,
      algoliaAppId: appId,
      algoliaIndex: indexName,
      message,
    })
  } catch (error) {
    console.warn('[fanatics-collect] route failed', {
      route,
      status: routeErrorStatus(error),
      error: routeErrorMessage(error, 'Fanatics Collect request failed'),
    })
    return jsonResponse(routeErrorStatus(error), {
      error: routeErrorMessage(error, 'Fanatics Collect request failed'),
    })
  }
}

export async function handleCardHedgeRoute(route: string, request: Request, env: ServerEnv) {
  if (!CARD_HEDGE_ROUTES.has(route)) return new Response(null, { status: 404 })

  let db: SqliteDatabase | null = null
  try {
    const configured = Boolean(env.CARD_HEDGE_API_KEY)
    const plan = String(env.CARD_HEDGE_PLAN ?? '').trim().toLowerCase()
    const eliteAccessExpected = /^(elite|enterprise)$/i.test(plan)

    if (route === 'status') {
      if (request.method !== 'GET') return new Response(null, { status: 404 })
      const opened = await openOptionalWritableMarketDb(env)
      db = opened.db
      let usageTracking = false
      let usagePayload = cardHedgeUsageFallback(env)
      if (db) {
        try {
          ensureCardHedgeUsageSchema(db)
          usagePayload = cardHedgeUsagePayload(db, env)
          usageTracking = true
        } catch {
          db.close()
          db = null
        }
      }

      return jsonResponse(200, {
        connected: configured,
        configured,
        plan: plan || 'unknown',
        eliteAccessExpected,
        baseUrl: CARD_HEDGE_API_BASE,
        dbName: basename(opened.dbPath),
        usageTracking,
        ...usagePayload,
        endpoints: {
          search: '/api/card-hedge/search',
          match: '/api/card-hedge/match',
          comps: '/api/card-hedge/comps',
          allPrices: '/api/card-hedge/all-prices',
          pricesByCard: '/api/card-hedge/prices-by-card',
          priceUpdates: '/api/card-hedge/price-updates',
          priceEstimate: '/api/card-hedge/price-estimate',
          batchPriceEstimate: '/api/card-hedge/batch-price-estimate',
          cardFmvBatch: '/api/card-hedge/card-fmv-batch',
          dailyExport: '/api/card-hedge/daily-export?date=YYYY-MM-DD',
        },
        message: configured ? 'Card Hedge API configured' : 'Set CARD_HEDGE_API_KEY in environment variables',
      })
    }

    const opened = await openWritableMarketDb(env)
    db = opened.db
    ensureCardHedgeUsageSchema(db)

    if (!configured) return jsonResponse(401, { error: 'Set CARD_HEDGE_API_KEY in environment variables' })

    const rateLimit = cardHedgeRateLimitError(db, env)
    if (rateLimit) return jsonResponse(rateLimit.status, rateLimit.payload)

    if (route === 'daily-export') {
      if (request.method !== 'GET') return new Response(null, { status: 404 })
      const date = cardHedgeDailyExportDate(request)
      const endpoint = `/v1/download/daily-price-export/${date}`
      const upstream = await fetch(`${CARD_HEDGE_API_BASE}${endpoint}`, {
        method: 'GET',
        headers: {
          'X-API-Key': env.CARD_HEDGE_API_KEY ?? '',
          Accept: 'text/csv, application/json',
        },
      })
      recordCardHedgeCall(db, route, endpoint, upstream.status)
      const body = await upstream.arrayBuffer()
      return new Response(body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? (upstream.ok ? 'text/csv' : 'application/json'),
          'Cache-Control': 'no-store',
        },
      })
    }

    if (request.method !== 'POST') return new Response(null, { status: 404 })
    const unsafePost = rejectUnsafePost(request)
    if (unsafePost) return unsafePost

    const endpoint = cardHedgeEndpoint(route)
    if (!endpoint) return jsonResponse(404, { error: 'Unknown Card Hedge route' })
    const body = await readRequestText(request, MAX_CARD_HEDGE_BODY_BYTES)
    try {
      JSON.parse(body)
    } catch {
      throw new ProxyRequestError(400, 'Invalid JSON body')
    }

    const upstream = await fetch(`${CARD_HEDGE_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-Key': env.CARD_HEDGE_API_KEY ?? '',
      },
      body,
    })
    const text = await upstream.text()
    recordCardHedgeCall(db, route, endpoint, upstream.status)
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return jsonResponse(routeErrorStatus(error), {
      error: routeErrorMessage(error, 'Card Hedge request failed'),
    })
  } finally {
    db?.close()
  }
}

export async function handleLiveMarketRoute(route: string, request: Request, env: ServerEnv) {
  if (!LIVE_MARKET_ROUTES.has(route)) return new Response(null, { status: 404 })
  if ((route === 'snapshot' || route === 'prune') && request.method !== 'POST') return new Response(null, { status: 404 })
  if (route !== 'snapshot' && route !== 'prune' && request.method !== 'GET') return new Response(null, { status: 404 })

  let db: SqliteDatabase | null = null
  try {
    if (route === 'snapshot' || route === 'prune') {
      const unsafePost = rejectUnsafePost(request)
      if (unsafePost) return unsafePost
    }

    const neonSql = await getNeonSql(env)
    if (neonSql) return await handleNeonLiveMarketRoute(route, request, neonSql)

    const opened = await openOptionalWritableMarketDb(env)
    db = opened.db
    if (!db) {
      const message = 'Live market cache is unavailable in this environment; scans still run without saved snapshots.'
      if (route === 'status') {
        return jsonResponse(200, {
          available: false,
          dbName: basename(opened.dbPath),
          freshSnapshots: 0,
          freshListings: 0,
          freshOpportunities: 0,
          latestObservedAt: '',
          nextExpiresAt: '',
          byType: [],
          byMarketplace: [],
          message,
        })
      }
      if (route === 'latest') {
        return jsonResponse(200, {
          available: false,
          message,
          listings: [],
        })
      }
      return jsonResponse(200, {
        available: false,
        message,
        listingCount: 0,
        opportunityCount: 0,
      })
    }

    ensureLiveMarketSchema(db)
    const now = new Date()
    const nowIso = now.toISOString()

    if (route === 'prune') {
      const pruned = pruneExpiredLiveMarketRows(db, nowIso)
      return jsonResponse(200, { pruned, asOf: nowIso })
    }

    pruneExpiredLiveMarketRows(db, nowIso)

    if (route === 'status') {
      const stats = db.prepare(`
        SELECT
          COUNT(*) AS snapshotCount,
          COALESCE(SUM(listing_count), 0) AS listingCount,
          COALESCE(SUM(opportunity_count), 0) AS opportunityCount,
          MAX(observed_at) AS latestObservedAt,
          MIN(expires_at) AS nextExpiresAt
        FROM live_market_snapshots
        WHERE expires_at > ?
      `).get(nowIso)
      const byType = db.prepare(`
        SELECT scan_type AS scanType, COUNT(*) AS snapshotCount, COALESCE(SUM(listing_count), 0) AS listingCount
        FROM live_market_snapshots
        WHERE expires_at > ?
        GROUP BY scan_type
        ORDER BY scan_type
      `).all(nowIso)
      const byMarketplace = db.prepare(`
        SELECT
          marketplace,
          COALESCE(NULLIF(marketplace_label, ''), marketplace) AS marketplaceLabel,
          COUNT(DISTINCT snapshot_id) AS snapshotCount,
          COUNT(*) AS listingCount
        FROM live_market_listings
        WHERE expires_at > ?
        GROUP BY marketplace, marketplace_label
        ORDER BY listingCount DESC, marketplace
      `).all(nowIso)

      return jsonResponse(200, {
        available: true,
        dbName: basename(opened.dbPath),
        freshSnapshots: rowNumber(stats, 'snapshotCount'),
        freshListings: rowNumber(stats, 'listingCount'),
        freshOpportunities: rowNumber(stats, 'opportunityCount'),
        latestObservedAt: rowString(stats, 'latestObservedAt'),
        nextExpiresAt: rowString(stats, 'nextExpiresAt'),
        byType: byType.map((row) => ({
          scanType: rowString(row, 'scanType'),
          snapshots: rowNumber(row, 'snapshotCount'),
          listings: rowNumber(row, 'listingCount'),
        })),
        byMarketplace: byMarketplace.map((row) => ({
          marketplace: rowString(row, 'marketplace'),
          label: rowString(row, 'marketplaceLabel'),
          snapshots: rowNumber(row, 'snapshotCount'),
          listings: rowNumber(row, 'listingCount'),
        })),
      })
    }

    if (route === 'latest') {
      const params = new URL(request.url).searchParams
      const scanType = params.get('scanType') ? safeLiveScanType(params.get('scanType')) : ''
      const scanKey = String(params.get('scanKey') ?? '').trim().slice(0, MAX_LIVE_MARKET_SCAN_KEY_LENGTH)
      const limit = clampInt(params.get('limit'), 160, 1, MAX_LIVE_MARKET_LISTINGS)
      const snapshot = db.prepare(`
        SELECT
          snapshot_id AS snapshotId,
          scan_type AS scanType,
          scan_key AS scanKey,
          search_mode AS searchMode,
          player_scope AS playerScope,
          release_scope AS releaseScope,
          observed_at AS observedAt,
          expires_at AS expiresAt,
          listing_count AS listingCount,
          opportunity_count AS opportunityCount,
          request_json AS requestJson,
          stats_json AS statsJson,
          created_at AS createdAt
        FROM live_market_snapshots
        WHERE expires_at > ?
          AND (? = '' OR scan_type = ?)
          AND (? = '' OR scan_key = ?)
        ORDER BY observed_at DESC
        LIMIT 1
      `).get(nowIso, scanType, scanType, scanKey, scanKey)

      if (!snapshot) {
        return jsonResponse(200, {
          available: false,
          message: 'No fresh live-market snapshot is available.',
          listings: [],
        })
      }

      const listings = db.prepare(`
        SELECT
          snapshot_id AS snapshotId,
          item_id AS itemId,
          listing_kind AS listingKind,
          marketplace,
          marketplace_label AS marketplaceLabel,
          player_name AS playerName,
          title,
          listing_url AS listingUrl,
          image_url AS imageUrl,
          current_price AS currentPrice,
          shipping_cost AS shippingCost,
          all_in_price AS allInPrice,
          model_price AS modelPrice,
          fair_value AS fairValue,
          edge_dollars AS edgeDollars,
          expected_roi_pct AS expectedRoiPct,
          action,
          lane,
          grade,
          variation_label AS variationLabel,
          matched_variation AS matchedVariation,
          valuation_source AS valuationSource,
          trust_score AS trustScore,
          score,
          bid_count AS bidCount,
          listing_status AS listingStatus,
          end_time AS endTime,
          observed_at AS observedAt,
          expires_at AS expiresAt,
          raw_json AS rawJson
        FROM live_market_listings
        WHERE snapshot_id = ? AND expires_at > ?
        ORDER BY edge_dollars DESC, score DESC
        LIMIT ?
      `).all(rowString(snapshot, 'snapshotId'), nowIso, limit)

      return jsonResponse(200, {
        available: true,
        snapshot: mapLiveMarketSnapshot(snapshot),
        listings: listings.map(mapLiveMarketListing),
      })
    }

    const payload = await readJsonBody<LiveMarketSnapshotPayload>(request, MAX_EBAY_BODY_BYTES)
    const scanType = safeLiveScanType(payload.scanType)
    const scanKey = String(payload.scanKey ?? `${scanType}:manual`).trim().slice(0, MAX_LIVE_MARKET_SCAN_KEY_LENGTH)
    const observedAt = safeIsoDate(payload.observedAt, now)
    const ttlSeconds = clampInt(
      payload.ttlSeconds,
      defaultLiveMarketTtlSeconds(scanType),
      60,
      Math.min(defaultLiveMarketTtlSeconds(scanType) * 8, LIVE_MARKET_MAX_TTL_SECONDS),
    )
    const snapshotExpiresAt = new Date(Date.parse(observedAt) + ttlSeconds * 1_000).toISOString()
    const listings = (payload.listings ?? [])
      .filter((listing) => Number.isFinite(Number(listing.allInPrice)) && Number(listing.allInPrice) > 0)
      .slice(0, MAX_LIVE_MARKET_LISTINGS)
    const snapshotId = liveMarketSnapshotId(scanType, scanKey, observedAt)
    const createdAt = nowIso

    db.prepare(`
      INSERT INTO live_market_snapshots (
        snapshot_id, scan_type, scan_key, search_mode, player_scope, release_scope,
        observed_at, expires_at, listing_count, opportunity_count, request_json, stats_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshotId,
      scanType,
      scanKey,
      String(payload.searchMode ?? ''),
      String(payload.playerScope ?? ''),
      String(payload.releaseScope ?? ''),
      observedAt,
      snapshotExpiresAt,
      listings.length,
      listings.filter((listing) => Number(listing.edgeDollars ?? 0) >= 0).length,
      jsonText(payload.request),
      jsonText(payload.stats),
      createdAt,
    )

    const insertListing = db.prepare(`
      INSERT INTO live_market_listings (
        snapshot_id, item_id, listing_kind, marketplace, marketplace_label, player_name, title, listing_url, image_url,
        current_price, shipping_cost, all_in_price, model_price, fair_value, edge_dollars,
        expected_roi_pct, action, lane, grade, variation_label, matched_variation, valuation_source,
        trust_score, score, bid_count, listing_status, end_time, observed_at, expires_at, raw_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    listings.forEach((listing, index) => {
      const itemId = liveMarketListingId(listing, index)
      const listingExpiresAt = liveMarketListingExpiresAt(listing, snapshotExpiresAt, scanType)
      insertListing.run(
        snapshotId,
        itemId,
        String(listing.listingKind ?? scanType),
        String(listing.marketplace ?? 'unknown'),
        String(listing.marketplaceLabel ?? listing.marketplace ?? 'Unknown'),
        String(listing.playerName ?? ''),
        String(listing.title ?? ''),
        String(listing.listingUrl ?? ''),
        typeof listing.imageUrl === 'string' ? listing.imageUrl : '',
        Number(listing.currentPrice ?? 0) || 0,
        Number(listing.shippingCost ?? 0) || 0,
        Number(listing.allInPrice ?? 0) || 0,
        Number.isFinite(Number(listing.modelPrice)) ? Number(listing.modelPrice) : null,
        Number(listing.fairValue ?? 0) || 0,
        Number(listing.edgeDollars ?? 0) || 0,
        Number(listing.expectedRoiPct ?? 0) || 0,
        String(listing.action ?? ''),
        String(listing.lane ?? ''),
        String(listing.grade ?? ''),
        String(listing.variationLabel ?? ''),
        typeof listing.matchedVariation === 'string' ? listing.matchedVariation : '',
        String(listing.valuationSource ?? ''),
        Number(listing.trustScore ?? 0) || 0,
        Number(listing.score ?? 0) || 0,
        Number(listing.bidCount ?? 0) || 0,
        String(listing.listingStatus ?? ''),
        typeof listing.endTime === 'string' ? listing.endTime : '',
        observedAt,
        listingExpiresAt,
        jsonText(listing.raw, 'null'),
      )
    })

    return jsonResponse(200, {
      available: true,
      snapshotId,
      scanType,
      scanKey,
      observedAt,
      expiresAt: snapshotExpiresAt,
      listingCount: listings.length,
      opportunityCount: listings.filter((listing) => Number(listing.edgeDollars ?? 0) >= 0).length,
    })
  } catch (error) {
    return jsonResponse(routeErrorStatus(error), { error: routeErrorMessage(error, 'Live market cache request failed') })
  } finally {
    db?.close()
  }
}

export async function handleRankingsRoute(route: string, request: Request) {
  if (!RANKINGS_ROUTES.has(route)) return new Response(null, { status: 404 })
  if (route === 'status') {
    if (request.method !== 'GET') return new Response(null, { status: 404 })
    const { sources, cache } = await currentRankingSources({ allowLiveRefresh: false })
    return jsonResponse(200, { ...rankingStatusFromSources(sources), cache })
  }
  if (route === 'data') {
    if (request.method !== 'GET') return new Response(null, { status: 404 })
    const { sources, cache } = await currentRankingSources({ allowLiveRefresh: true })
    return jsonResponse(200, {
      ...rankingStatusFromSources(sources),
      cache,
      sources: sources.map((source) => ({
        ...source,
        ...rankingStatusFromSources([source]).sources[0],
      })),
    })
  }
  if (route === 'refresh') {
    if (request.method === 'GET') {
      const secret = process.env.CRON_SECRET
      const authHeader = request.headers.get('authorization')
      if (!secret || authHeader !== `Bearer ${secret}`) {
        return jsonResponse(401, { error: 'Unauthorized rankings refresh' })
      }
    } else if (request.method === 'POST') {
      const unsafePost = rejectUnsafePost(request)
      if (unsafePost) return unsafePost
    } else {
      return new Response(null, { status: 404 })
    }

    try {
      const sources = await refreshStsRankingSources()
      const cached = await writeRuntimeRankingSources(sources)
      const status = rankingStatusFromSources(sources)
      return jsonResponse(200, {
        ...status,
        cache: cached ?? 'live',
        refreshedAt: new Date().toISOString(),
        output: `Refreshed ${status.rows.toLocaleString()} Scout the Statline ranking rows`,
        sources: sources.map((source) => ({
          ...source,
          ...rankingStatusFromSources([source]).sources[0],
        })),
      })
    } catch (error) {
      return jsonResponse(502, {
        error: error instanceof Error ? error.message : 'Rankings refresh failed',
      })
    }
  }
  return new Response(null, { status: 404 })
}

export async function handleChecklistRoute(route: string, request: Request, env: ServerEnv) {
  if (!CHECKLIST_ROUTES.has(route)) return new Response(null, { status: 404 })
  if (request.method !== 'GET') return new Response(null, { status: 404 })

  let db: SqliteDatabase | null = null
  let dbPath: string
  try {
    const opened = await openSalesCacheDb(env)
    db = opened.db
    dbPath = opened.dbPath

    if (!db) {
      return jsonResponse(200, {
        available: false,
        dbName: basename(dbPath),
        configured: Boolean(env.BACKSTOP_SALES_DB),
        message: 'No local market database found. Import a checklist to enable the checklist ledger.',
      })
    }

    const requiredTables =
      route === 'universe'
        ? ['checklist_releases', 'checklist_cards', 'checklist_card_universe', 'checklist_variation_templates']
        : ['checklist_releases', 'checklist_cards']
    const missingTables = requiredTables.filter((table) => !sqliteTableExists(db as SqliteDatabase, table))
    if (missingTables.length > 0) {
      return jsonResponse(200, {
        available: false,
        dbName: basename(dbPath),
        missingTables,
        message: 'Checklist ledger has not been imported yet.',
      })
    }

    const params = new URL(request.url).searchParams

    if (route === 'catalog') {
      const minYear = clampInt(params.get('minYear'), 0, 1900, 9999)
      const source = compactSqlText(String(params.get('source') ?? ''))
      const cardSourceFilter = source === 'waxpackhero' ? "AND c.source_sheet = 'Wax Pack Hero First Bowman'" : ''
      const pricedCardSourceFilter = source === 'waxpackhero' ? "AND c.source_sheet = 'Wax Pack Hero First Bowman'" : ''
      const where = ['r.release_year >= ?']
      const values: Array<string | number> = [minYear]
      if (source === 'waxpackhero') {
        where.push("EXISTS (SELECT 1 FROM checklist_cards source_cards WHERE source_cards.release_key = r.release_key AND source_cards.source_sheet = 'Wax Pack Hero First Bowman')")
      }
      const rows = db.prepare(`
        WITH priced AS (
          SELECT
            c.release_key,
            COUNT(DISTINCT c.player_key) AS priced_base_autos
          FROM checklist_cards c
          JOIN canonical_cards cc
            ON cc.release_year = c.release_year
           AND lower(cc.player_name) = lower(c.player_name)
          JOIN canonical_comp_summary s
            ON s.canonical_card_key = cc.canonical_card_key
          WHERE cc.grade_bucket = 'Raw'
            AND cc.card_class IN ('auto', 'paper-auto')
            AND cc.variation_label IN ('Base Auto', 'Base', '')
            AND s.sale_count > 0
            ${pricedCardSourceFilter}
          GROUP BY c.release_key
        ),
        queue AS (
          SELECT
            release_year,
            SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_players,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_players
          FROM canonical_refresh_queue
          GROUP BY release_year
        )
        SELECT
          r.release_key AS releaseKey,
          r.release_year AS releaseYear,
          r.release_name AS releaseName,
          r.imported_at AS importedAt,
          CASE
            WHEN SUM(CASE WHEN c.source_sheet = 'Wax Pack Hero First Bowman' THEN 1 ELSE 0 END) > 0 THEN 'waxpackhero'
            ELSE 'checklist'
          END AS source,
          COUNT(DISTINCT c.player_key) AS totalPlayers,
          COUNT(DISTINCT CASE WHEN c.first_status = 'confirmed_1st' THEN c.player_key END) AS confirmedFirstPlayers,
          COALESCE(MAX(priced.priced_base_autos), 0) AS pricedBaseAutos,
          COALESCE(MAX(queue.queued_players), 0) AS queuedPlayers,
          COALESCE(MAX(queue.done_players), 0) AS donePlayers
        FROM checklist_releases r
        LEFT JOIN checklist_cards c ON c.release_key = r.release_key ${cardSourceFilter}
        LEFT JOIN priced ON priced.release_key = r.release_key
        LEFT JOIN queue ON queue.release_year = r.release_year
        WHERE ${where.join(' AND ')}
        GROUP BY r.release_key
        ORDER BY r.release_year DESC, r.release_name
      `).all(...values)

      return jsonResponse(200, {
        available: true,
        dbName: basename(dbPath),
        releases: rows.map(mapChecklistCatalogRelease),
      })
    }

    const requestedReleaseKey = String(params.get('release') ?? params.get('releaseKey') ?? '').trim()
    const release = requestedReleaseKey
      ? localChecklistReleaseLookup(db, requestedReleaseKey)
      : db.prepare(
          `
            SELECT
              release_key AS releaseKey,
              release_year AS releaseYear,
              release_name AS releaseName,
              product_line AS productLine,
              imported_at AS importedAt,
              source_path AS sourcePath,
              source_hash AS sourceHash
            FROM checklist_releases
            ORDER BY imported_at DESC, release_year DESC
            LIMIT 1
          `,
        ).get()

    if (!release) {
      return jsonResponse(200, {
        available: false,
        dbName: basename(dbPath),
        releaseKey: requestedReleaseKey,
        message: 'Requested checklist release was not found.',
      })
    }

    const releaseKey = rowString(release, 'releaseKey')

    if (route === 'model') {
      const source = compactSqlText(String(params.get('source') ?? ''))
      const players = localChecklistModelQuery(db, releaseKey, source).map(mapLocalChecklistPlayer)
      const pricedPlayers = players.filter((player) => player.baseAvgPrice > 0 && player.baseSalesCount > 0)
      return jsonResponse(200, {
        available: true,
        dbName: basename(dbPath),
        category: checklistCategoryFromReleaseName(rowString(release, 'releaseName')),
        release: checklistReleaseSlug(rowString(release, 'releaseName'), releaseKey),
        releaseKey,
        releaseYear: rowNumber(release, 'releaseYear'),
        totalPlayers: players.length,
        firstChromeAutos: players.length,
        activeChecklistPlayers: pricedPlayers.length,
        multipliers: [
          {
            variation: 'Base Auto',
            avgMultiplier: 1,
            playerCount: pricedPlayers.length || players.length,
            totalSales: pricedPlayers.reduce((total, player) => total + player.baseSalesCount, 0),
            sortOrder: -1,
          },
        ],
        players,
        fetchedAt: new Date().toISOString(),
        source: 'canonical-sold-model',
        coverage: {
          pricedPlayers: pricedPlayers.length,
          unpricedPlayers: Math.max(0, players.length - pricedPlayers.length),
        },
      })
    }

    if (route === 'status') {
      const cards = db.prepare(`
        SELECT
          COUNT(*) AS cardCount,
          COUNT(DISTINCT player_key) AS playerCount,
          COALESCE(SUM(CASE WHEN is_auto = 1 THEN 1 ELSE 0 END), 0) AS autoCards,
          COALESCE(SUM(CASE WHEN chase_category = 'flagship-auto' THEN 1 ELSE 0 END), 0) AS flagshipAutoCards
        FROM checklist_cards
        WHERE release_key = ?
      `).get(releaseKey)
      const universe = db.prepare(`
        SELECT COUNT(*) AS cardCount, COUNT(DISTINCT player_key) AS playerCount
        FROM checklist_card_universe
        WHERE release_key = ?
      `).get(releaseKey)
      const templates = db.prepare(`
        SELECT COUNT(*) AS templateCount
        FROM checklist_variation_templates
        WHERE release_key = ?
      `).get(releaseKey)
      const firstStatuses = sqliteTableExists(db, 'checklist_player_signals')
        ? db
            .prepare(
              `
                SELECT first_status AS status, COUNT(*) AS players
                FROM checklist_player_signals
                WHERE release_key = ?
                GROUP BY first_status
                ORDER BY players DESC
              `,
            )
            .all(releaseKey)
        : []
      const cardFirstStatuses = db.prepare(`
        SELECT first_status AS status, COUNT(*) AS cards
        FROM checklist_cards
        WHERE release_key = ?
        GROUP BY first_status
        ORDER BY cards DESC
      `).all(releaseKey)
      const sections = db.prepare(`
        SELECT
          section,
          chase_category AS chaseCategory,
          COUNT(*) AS cards,
          COUNT(DISTINCT player_key) AS players
        FROM checklist_cards
        WHERE release_key = ?
        GROUP BY section, chase_category
        ORDER BY cards DESC, section
        LIMIT 32
      `).all(releaseKey)
      const queue = sqliteTableExists(db, 'canonical_refresh_queue')
        ? db
            .prepare(
              `
                SELECT status, COUNT(*) AS players
                FROM canonical_refresh_queue
                WHERE release_year = ?
                GROUP BY status
                ORDER BY players DESC
              `,
            )
            .all(rowNumber(release, 'releaseYear'))
        : []

      return jsonResponse(200, {
        available: true,
        dbName: basename(dbPath),
        release: {
          releaseKey,
          releaseYear: rowNumber(release, 'releaseYear'),
          releaseName: rowString(release, 'releaseName'),
          productLine: rowString(release, 'productLine'),
          importedAt: rowString(release, 'importedAt'),
          sourceHash: rowString(release, 'sourceHash'),
        },
        cards: {
          total: rowNumber(cards, 'cardCount'),
          players: rowNumber(cards, 'playerCount'),
          autos: rowNumber(cards, 'autoCards'),
          flagshipAutos: rowNumber(cards, 'flagshipAutoCards'),
        },
        universe: {
          total: rowNumber(universe, 'cardCount'),
          players: rowNumber(universe, 'playerCount'),
        },
        templates: rowNumber(templates, 'templateCount'),
        firstStatuses: firstStatuses.map((row) => ({
          status: rowString(row, 'status'),
          players: rowNumber(row, 'players'),
        })),
        cardFirstStatuses: cardFirstStatuses.map((row) => ({
          status: rowString(row, 'status'),
          cards: rowNumber(row, 'cards'),
        })),
        sections: sections.map((row) => ({
          section: rowString(row, 'section'),
          chaseCategory: rowString(row, 'chaseCategory'),
          cards: rowNumber(row, 'cards'),
          players: rowNumber(row, 'players'),
        })),
        queue: queue.map((row) => ({
          status: rowString(row, 'status'),
          players: rowNumber(row, 'players'),
        })),
      })
    }

    const player = String(params.get('player') ?? '').trim()
    const search = String(params.get('q') ?? '').trim()
    const cardClass = String(params.get('cardClass') ?? '').trim()
    const chaseCategory = String(params.get('chaseCategory') ?? '').trim()
    const firstStatus = String(params.get('firstStatus') ?? '').trim()
    const limit = clampInt(params.has('limit') ? params.get('limit') : undefined, player ? 240 : 160, 1, MAX_CHECKLIST_UNIVERSE_ROWS)
    if (player.length > MAX_SALES_CACHE_PLAYER_LENGTH) return jsonResponse(400, { error: 'Player is too long' })
    if (search.length > 120) return jsonResponse(400, { error: 'Search query is too long' })

    const where = ['u.release_key = ?']
    const values: Array<string | number> = [releaseKey]
    if (player) {
      where.push('lower(u.player_name) = lower(?)')
      values.push(player)
    }
    if (search) {
      where.push('(u.player_name LIKE ? OR u.variation_label LIKE ? OR u.card_family LIKE ? OR u.card_no LIKE ?)')
      const like = `%${search}%`
      values.push(like, like, like, like)
    }
    if (cardClass) {
      where.push('u.card_class = ?')
      values.push(cardClass)
    }
    if (chaseCategory) {
      where.push('u.chase_category = ?')
      values.push(chaseCategory)
    }
    if (firstStatus) {
      where.push('u.first_status = ?')
      values.push(firstStatus)
    }
    const whereSql = where.join(' AND ')
    const total = db.prepare(`SELECT COUNT(*) AS total FROM checklist_card_universe u WHERE ${whereSql}`).get(...values)
    const rows = db
      .prepare(
        `
          SELECT
            u.universe_card_key AS universeCardKey,
            u.checklist_card_key AS checklistCardKey,
            u.template_key AS templateKey,
            u.release_key AS releaseKey,
            u.release_year AS releaseYear,
            u.card_no AS cardNo,
            u.player_name AS playerName,
            u.team,
            u.product_family AS productFamily,
            u.card_family AS cardFamily,
            u.card_class AS cardClass,
            u.variation_label AS variationLabel,
            u.serial_denominator AS serialDenominator,
            u.print_run AS printRun,
            u.scarcity_rank AS scarcityRank,
            u.grade_bucket AS gradeBucket,
            u.first_status AS firstStatus,
            COALESCE(s.first_confidence, 0) AS firstConfidence,
            COALESCE(s.first_evidence_count, 0) AS firstEvidenceCount,
            u.chase_category AS chaseCategory,
            u.updated_at AS updatedAt
          FROM checklist_card_universe u
          LEFT JOIN checklist_player_signals s
            ON s.release_key = u.release_key AND s.player_key = u.player_key
          WHERE ${whereSql}
          ORDER BY
            u.player_name,
            CASE u.chase_category
              WHEN 'flagship-auto' THEN 0
              WHEN 'parallel-auto' THEN 1
              WHEN 'auto' THEN 2
              WHEN 'chrome-prospect' THEN 3
              WHEN 'case-hit' THEN 4
              WHEN 'insert' THEN 5
              ELSE 6
            END,
            COALESCE(u.scarcity_rank, 999999) DESC,
            u.variation_label
          LIMIT ?
        `,
      )
      .all(...values, limit)

    return jsonResponse(200, {
      available: true,
      dbName: basename(dbPath),
      releaseKey,
      total: rowNumber(total, 'total'),
      returned: rows.length,
      limit,
      filters: { player, q: search, cardClass, chaseCategory, firstStatus },
      cards: rows.map(mapChecklistUniverseRow),
    })
  } catch (error) {
    return jsonResponse(routeErrorStatus(error), { error: routeErrorMessage(error, 'Checklist ledger request failed') })
  } finally {
    db?.close()
  }
}

export async function handleSalesCacheRoute(route: string, request: Request, env: ServerEnv) {
  if (!SALES_CACHE_ROUTES.has(route)) return new Response(null, { status: 404 })
  const writeRoute = SALES_CACHE_WRITE_ROUTES.has(route)
  if (writeRoute && request.method !== 'POST') return new Response(null, { status: 404 })
  if (!writeRoute && request.method !== 'GET') return new Response(null, { status: 404 })

  let db: SqliteDatabase | null = null
  let dbPath: string
  try {
    if (writeRoute) {
      const unsafePost = rejectUnsafePost(request)
      if (unsafePost) return unsafePost
    }

    const opened = await openSalesCacheDb(env)
    db = opened.db
    dbPath = opened.dbPath

    if (!db) {
      return jsonResponse(200, {
        available: false,
        dbName: basename(dbPath),
        configured: Boolean(env.BACKSTOP_SALES_DB),
        message: 'No local sales cache found. Import sold rows to enable cached sold models.',
      })
    }
    ensureSalesCacheFlagSchema(db)

    if (route === 'flag-sale') {
      const payload = await readJsonBody<{
        itemId?: string
        erroneous?: boolean
        note?: string
      }>(request, 16_000)
      const itemId = String(payload.itemId ?? '').trim()
      if (!itemId) return jsonResponse(400, { error: 'Sale item ID is required' })
      const note = String(payload.note ?? '').trim().slice(0, MAX_SALES_CACHE_NOTE_LENGTH)
      const exists = db.prepare('SELECT item_id AS itemId FROM market_movers_sales_raw WHERE item_id = ? LIMIT 1').get(itemId)
      if (!exists) return jsonResponse(404, { error: 'Sale row was not found in the local cache' })

      db.prepare(`
        INSERT INTO market_movers_sale_flags (item_id, erroneous, note, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET
          erroneous = excluded.erroneous,
          note = excluded.note,
          updated_at = excluded.updated_at
      `).run(itemId, payload.erroneous ? 1 : 0, note, new Date().toISOString())

      const flag = db.prepare(`
        SELECT item_id AS itemId, erroneous, note, updated_at AS updatedAt
        FROM market_movers_sale_flags
        WHERE item_id = ?
      `).get(itemId)

      return jsonResponse(200, {
        itemId: rowString(flag, 'itemId'),
        erroneous: rowBool(flag, 'erroneous'),
        note: rowString(flag, 'note'),
        updatedAt: rowString(flag, 'updatedAt'),
      })
    }

	    if (route === 'merge-bucket') {
	      const payload = await readJsonBody<{
	        sourceBucketKey?: string
	        targetBucketKey?: string
	        note?: string
	        targetReleaseYear?: number | string | null
	        targetProductFamily?: string
	        targetCardClass?: string
	        targetVariationLabel?: string
	        targetSerialDenominator?: number | string | null
	        targetGradeBucket?: string
	        targetInsertName?: string | null
	      }>(request, 16_000)
	      const sourceBucketKey = String(payload.sourceBucketKey ?? '').trim()
	      const targetBucketKey = String(payload.targetBucketKey ?? '').trim()
	      if (!sourceBucketKey || !targetBucketKey) return jsonResponse(400, { error: 'Source and target bucket keys are required' })
	      const payloadNumber = (value: number | string | null | undefined) => {
	        if (value == null || value === '') return null
	        const parsed = Number(value)
	        return Number.isFinite(parsed) && parsed > 0 ? parsed : null
	      }
	      const payloadString = (value: string | null | undefined) => String(value ?? '').trim()

	      const source = db.prepare(`
	        SELECT
	          bucket_key AS bucketKey,
	          player_name AS playerName,
	          release_year AS releaseYear,
	          product_family AS productFamily,
	          card_class AS cardClass,
	          variation_label AS variationLabel,
	          serial_denominator AS serialDenominator,
	          grade_bucket AS gradeBucket,
	          insert_name AS insertName
	        FROM market_movers_sales_normalized
	        WHERE bucket_key = ?
	        LIMIT 1
	      `).get(sourceBucketKey)
	      const target = db.prepare(`
	        SELECT
	          bucket_key AS bucketKey,
	          player_name AS playerName,
	          release_year AS releaseYear,
	          product_family AS productFamily,
	          card_class AS cardClass,
	          variation_label AS variationLabel,
	          serial_denominator AS serialDenominator,
	          grade_bucket AS gradeBucket,
	          insert_name AS insertName
	        FROM market_movers_sales_normalized
	        WHERE bucket_key = ?
	        LIMIT 1
	      `).get(targetBucketKey)
	      if (!source) return jsonResponse(404, { error: 'Source bucket was not found in the local cache' })
	      if (target && rowString(source, 'playerName') !== rowString(target, 'playerName')) {
	        return jsonResponse(400, { error: 'Buckets must belong to the same player' })
	      }
	      const targetProductFamily = rowString(target, 'productFamily') || payloadString(payload.targetProductFamily)
	      const targetCardClass = rowString(target, 'cardClass') || payloadString(payload.targetCardClass)
	      const targetVariationLabel = rowString(target, 'variationLabel') || payloadString(payload.targetVariationLabel)
	      const targetGradeBucket = rowString(target, 'gradeBucket') || payloadString(payload.targetGradeBucket)
	      const targetReleaseYear = rowNumberOrNull(target, 'releaseYear') ?? payloadNumber(payload.targetReleaseYear) ?? rowNumberOrNull(source, 'releaseYear')
	      const targetSerialDenominator = rowNumberOrNull(target, 'serialDenominator') ?? payloadNumber(payload.targetSerialDenominator)
	      const targetInsertName = target ? rowString(target, 'insertName') || null : payloadString(payload.targetInsertName) || null
	      if (!target && (!targetProductFamily || !targetCardClass || !targetVariationLabel || !targetGradeBucket)) {
	        return jsonResponse(404, { error: 'Target bucket was not found, and no canonical target metadata was provided' })
	      }

	      const note = String(payload.note ?? '').trim().slice(0, MAX_SALES_CACHE_NOTE_LENGTH)
	      const updatedAt = new Date().toISOString()

      if (sourceBucketKey === targetBucketKey) {
        db.prepare(`
          DELETE FROM market_movers_bucket_overrides
          WHERE source_bucket_key = ?
        `).run(sourceBucketKey)

        return jsonResponse(200, {
          sourceBucketKey,
          targetBucketKey,
          playerName: rowString(source, 'playerName'),
          note,
          restored: true,
          updatedAt,
        })
      }

      const targetRestore = db.prepare(`
        DELETE FROM market_movers_bucket_overrides
        WHERE source_bucket_key = ?
      `).run(targetBucketKey)
	      const targetRestored = Boolean((targetRestore as { changes?: number }).changes)
	      db.prepare(`
	        INSERT INTO market_movers_bucket_overrides (
	          source_bucket_key,
	          target_bucket_key,
	          note,
	          updated_at,
	          target_release_year,
	          target_product_family,
	          target_card_class,
	          target_variation_label,
	          target_serial_denominator,
	          target_grade_bucket,
	          target_insert_name
	        )
	        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	        ON CONFLICT(source_bucket_key) DO UPDATE SET
	          target_bucket_key = excluded.target_bucket_key,
	          note = excluded.note,
	          updated_at = excluded.updated_at,
	          target_release_year = excluded.target_release_year,
	          target_product_family = excluded.target_product_family,
	          target_card_class = excluded.target_card_class,
	          target_variation_label = excluded.target_variation_label,
	          target_serial_denominator = excluded.target_serial_denominator,
	          target_grade_bucket = excluded.target_grade_bucket,
	          target_insert_name = excluded.target_insert_name
	      `).run(
	        sourceBucketKey,
	        targetBucketKey,
	        note,
	        updatedAt,
	        targetReleaseYear,
	        targetProductFamily,
	        targetCardClass,
	        targetVariationLabel,
	        targetSerialDenominator,
	        targetGradeBucket,
	        targetInsertName,
	      )

	      return jsonResponse(200, {
	        sourceBucketKey,
	        targetBucketKey,
	        playerName: rowString(source, 'playerName'),
	        note,
	        targetSynthetic: !target,
	        targetRestored,
	        updatedAt,
	      })
    }

    if (route === 'status') {
      const hasRawSales = sqliteTableExists(db, 'market_movers_sales_raw')
      const hasNormalizedSales = sqliteTableExists(db, 'market_movers_sales_normalized')
      const hasModelBuckets = sqliteTableExists(db, 'market_movers_model_buckets')
      const hasCanonicalCards = sqliteTableExists(db, 'canonical_cards')
      const hasCanonicalSummaries = sqliteTableExists(db, 'canonical_comp_summary')
      const hasCardHedgeCards = sqliteTableExists(db, 'card_hedge_cards')
      const hasCardHedgeSales = sqliteTableExists(db, 'card_hedge_sales')
      const hasBucketOverrides = sqliteTableExists(db, 'market_movers_bucket_overrides')
      const hasSaleFlags = sqliteTableExists(db, 'market_movers_sale_flags')

      const stats = hasModelBuckets
        ? db.prepare(`
          SELECT
            COUNT(DISTINCT player_name) AS playerCount,
            COUNT(*) AS bucketCount,
            COALESCE(SUM(sale_count), 0) AS modeledSales,
            MAX(generated_at) AS generatedAt
          FROM market_movers_model_buckets
        `).get()
        : null
      const raw = hasRawSales
        ? db.prepare(`
          SELECT
            COUNT(*) AS rows,
            COUNT(DISTINCT player_name) AS players,
            MIN(sold_at) AS earliestSoldAt,
            MAX(sold_at) AS latestSoldAt,
            MAX(imported_at) AS latestImportedAt
          FROM market_movers_sales_raw
        `).get()
        : null
      const normalized = hasNormalizedSales
        ? db.prepare(`
          SELECT
            COUNT(*) AS rows,
            COALESCE(SUM(model_eligible), 0) AS modelEligibleRows,
            COALESCE(SUM(CASE WHEN model_eligible = 0 THEN 1 ELSE 0 END), 0) AS excludedRows
          FROM market_movers_sales_normalized
        `).get()
        : null
      const canonical =
        hasCanonicalCards && hasCanonicalSummaries
          ? db.prepare(`
            SELECT
              COUNT(DISTINCT c.canonical_card_key) AS cards,
              COUNT(DISTINCT c.player_name) AS players,
              COUNT(s.canonical_card_key) AS summaries,
              COALESCE(SUM(s.sale_count), 0) AS summarizedSales,
              MAX(s.latest_sold_at) AS latestSoldAt,
              MAX(s.updated_at) AS updatedAt
            FROM canonical_cards c
            LEFT JOIN canonical_comp_summary s ON s.canonical_card_key = c.canonical_card_key
          `).get()
          : null
      const cardHedge =
        hasCardHedgeCards && hasCardHedgeSales
          ? db.prepare(`
            SELECT
              COUNT(DISTINCT c.card_id) AS cards,
              COUNT(DISTINCT c.player_name) AS players,
              COUNT(s.price_history_id) AS sales,
              MAX(s.sold_at) AS latestSoldAt,
              MAX(s.imported_at) AS latestImportedAt
            FROM card_hedge_cards c
            LEFT JOIN card_hedge_sales s ON s.card_id = c.card_id
          `).get()
          : null
      const cleanup = {
        reviewedRows: hasSaleFlags
          ? rowNumber(db.prepare('SELECT COUNT(*) AS reviewedRows FROM market_movers_sale_flags').get(), 'reviewedRows')
          : 0,
        flaggedRows: hasSaleFlags
          ? rowNumber(db.prepare('SELECT COALESCE(SUM(erroneous), 0) AS flaggedRows FROM market_movers_sale_flags').get(), 'flaggedRows')
          : 0,
        bucketOverrides: hasBucketOverrides
          ? rowNumber(db.prepare('SELECT COUNT(*) AS bucketOverrides FROM market_movers_bucket_overrides').get(), 'bucketOverrides')
          : 0,
        latestOverrideAt: hasBucketOverrides
          ? rowString(db.prepare('SELECT MAX(updated_at) AS latestOverrideAt FROM market_movers_bucket_overrides').get(), 'latestOverrideAt')
          : '',
      }

      return jsonResponse(200, {
        available: true,
        dbName: basename(dbPath),
        configured: Boolean(env.BACKSTOP_SALES_DB),
        playerCount: rowNumber(stats, 'playerCount'),
        bucketCount: rowNumber(stats, 'bucketCount'),
        modeledSales: rowNumber(stats, 'modeledSales'),
        generatedAt: rowString(stats, 'generatedAt'),
        raw: {
          rows: rowNumber(raw, 'rows'),
          players: rowNumber(raw, 'players'),
          earliestSoldAt: rowString(raw, 'earliestSoldAt'),
          latestSoldAt: rowString(raw, 'latestSoldAt'),
          latestImportedAt: rowString(raw, 'latestImportedAt'),
        },
        normalized: {
          rows: rowNumber(normalized, 'rows'),
          modelEligibleRows: rowNumber(normalized, 'modelEligibleRows'),
          excludedRows: rowNumber(normalized, 'excludedRows'),
        },
        canonical: {
          cards: rowNumber(canonical, 'cards'),
          players: rowNumber(canonical, 'players'),
          summaries: rowNumber(canonical, 'summaries'),
          summarizedSales: rowNumber(canonical, 'summarizedSales'),
          latestSoldAt: rowString(canonical, 'latestSoldAt'),
          updatedAt: rowString(canonical, 'updatedAt'),
        },
        cardHedge: {
          cards: rowNumber(cardHedge, 'cards'),
          players: rowNumber(cardHedge, 'players'),
          sales: rowNumber(cardHedge, 'sales'),
          latestSoldAt: rowString(cardHedge, 'latestSoldAt'),
          latestImportedAt: rowString(cardHedge, 'latestImportedAt'),
        },
        cleanup,
      })
    }

    if (route === 'players') {
      const params = new URL(request.url).searchParams
      const packedPlayers = params.get('players') ?? ''
      const requestedPlayers = [
        ...params.getAll('player'),
        ...packedPlayers.split(/[|,]/),
      ]
        .map((player) => player.trim())
        .filter(Boolean)
      const playerNames = [...new Set(requestedPlayers)].slice(0, 160)

      if (playerNames.length === 0) return jsonResponse(400, { error: 'At least one player is required' })
      if (playerNames.some((player) => player.length > MAX_SALES_CACHE_PLAYER_LENGTH)) {
        return jsonResponse(400, { error: 'One or more player names are too long' })
      }

      const lowerNames = [...new Set(playerNames.map((player) => player.toLowerCase()))]
      const placeholders = lowerNames.map(() => '?').join(',')
      const summaries = db.prepare(`
        SELECT
          player_name AS playerName,
          COUNT(*) AS bucketCount,
          COALESCE(SUM(sale_count), 0) AS modeledSales,
          MAX(generated_at) AS generatedAt
        FROM market_movers_model_buckets
        WHERE lower(player_name) IN (${placeholders})
        GROUP BY player_name
      `).all(...lowerNames)

      const foundNames = summaries.map((row) => rowString(row, 'playerName'))
      const foundLowerNames = new Set(foundNames.map((player) => player.toLowerCase()))
      const missing = playerNames.filter((player) => !foundLowerNames.has(player.toLowerCase()))
      const bucketsByPlayer = new Map<string, SqliteRow[]>()

      if (foundNames.length > 0) {
        const foundPlaceholders = foundNames.map(() => '?').join(',')
        const bucketRows = db.prepare(`
          WITH ranked AS (
            SELECT
              bucket_key AS bucketKey,
              player_name AS playerName,
              release_year AS releaseYear,
              product_family AS productFamily,
              card_class AS cardClass,
              variation_label AS variationLabel,
              grade_bucket AS gradeBucket,
              serial_denominator AS serialDenominator,
              sale_count AS saleCount,
              sales_30 AS sales30,
              sales_90 AS sales90,
              auction_count AS auctionCount,
              bin_count AS binCount,
              min_price AS minPrice,
              q1_price AS q1Price,
              median_price AS medianPrice,
              avg_price AS avgPrice,
              q3_price AS q3Price,
              max_price AS maxPrice,
              model_price AS modelPrice,
              base_auto_multiple AS baseAutoMultiple,
              latest_sold_at AS latestSoldAt,
              generated_at AS generatedAt,
              ROW_NUMBER() OVER (
                PARTITION BY player_name
                ORDER BY
                  CASE WHEN card_class = 'auto' AND grade_bucket = 'Raw' THEN 0 ELSE 1 END,
                  model_price DESC,
                  sale_count DESC
              ) AS bucketRank
            FROM market_movers_model_buckets
            WHERE player_name IN (${foundPlaceholders})
          )
          SELECT *
          FROM ranked
          WHERE bucketRank <= ?
          ORDER BY playerName, modelPrice DESC, saleCount DESC
        `).all(...foundNames, MAX_SALES_CACHE_BUCKETS)

        for (const row of bucketRows) {
          const playerName = rowString(row, 'playerName')
          bucketsByPlayer.set(playerName, [...(bucketsByPlayer.get(playerName) ?? []), row])
        }
      }

      return jsonResponse(200, {
        available: true,
        dbName: basename(dbPath),
        requested: playerNames.length,
        missing,
        players: summaries.map((summary) => {
          const playerName = rowString(summary, 'playerName')
          const buckets = (bucketsByPlayer.get(playerName) ?? []).map(mapSalesCacheBucket)
          const baseAutoBucket =
            buckets.find(
              (bucket) =>
                bucket.cardClass === 'auto' &&
                bucket.gradeBucket === 'Raw' &&
                bucket.variationLabel === 'Base Auto' &&
                bucket.productFamily === 'Bowman Chrome',
            ) ??
            buckets.find(
              (bucket) => bucket.cardClass === 'auto' && bucket.gradeBucket === 'Raw' && bucket.variationLabel === 'Base Auto',
            ) ??
            null

          return {
            available: true,
            playerName,
            generatedAt: rowString(summary, 'generatedAt'),
            bucketCount: rowNumber(summary, 'bucketCount'),
            modeledSales: rowNumber(summary, 'modeledSales'),
            baseAutoPrice: baseAutoBucket?.modelPrice ?? inferredBaseAutoPriceFromBuckets(buckets),
            baseAutoBucket,
            buckets,
            sales: [],
            exclusions: [],
          }
        }),
      })
    }

    const player = new URL(request.url).searchParams.get('player')?.trim() ?? ''
    if (!player) return jsonResponse(400, { error: 'Player is required' })
    if (player.length > MAX_SALES_CACHE_PLAYER_LENGTH) return jsonResponse(400, { error: 'Player is too long' })

    const playerSummary = db.prepare(`
      SELECT
        player_name AS playerName,
        COUNT(*) AS bucketCount,
        COALESCE(SUM(sale_count), 0) AS modeledSales,
        MAX(generated_at) AS generatedAt
      FROM market_movers_model_buckets
      WHERE lower(player_name) = lower(?)
      GROUP BY player_name
      LIMIT 1
    `).get(player)

    if (!playerSummary) {
      return jsonResponse(200, {
        available: false,
        playerName: player,
        message: 'No cached sold model for this player yet.',
      })
    }

    const playerName = rowString(playerSummary, 'playerName')
    const salesSummary = db.prepare(`
      SELECT
        COUNT(*) AS totalRows,
        COALESCE(SUM(model_eligible), 0) AS modelEligibleRows,
        COALESCE(SUM(CASE WHEN model_eligible = 0 THEN 1 ELSE 0 END), 0) AS excludedRows
      FROM market_movers_sales_normalized
      WHERE player_name = ?
    `).get(playerName)
    const baseAutoBucket = db.prepare(`
      SELECT
        bucket_key AS bucketKey,
        player_name AS playerName,
        release_year AS releaseYear,
        product_family AS productFamily,
        card_class AS cardClass,
        variation_label AS variationLabel,
        grade_bucket AS gradeBucket,
        serial_denominator AS serialDenominator,
        sale_count AS saleCount,
        sales_30 AS sales30,
        sales_90 AS sales90,
        auction_count AS auctionCount,
        bin_count AS binCount,
        min_price AS minPrice,
        q1_price AS q1Price,
        median_price AS medianPrice,
        avg_price AS avgPrice,
        q3_price AS q3Price,
        max_price AS maxPrice,
        model_price AS modelPrice,
        base_auto_multiple AS baseAutoMultiple,
        latest_sold_at AS latestSoldAt,
        generated_at AS generatedAt
      FROM market_movers_model_buckets
      WHERE player_name = ?
        AND card_class = 'auto'
        AND grade_bucket = 'Raw'
        AND variation_label = 'Base Auto'
      ORDER BY
        CASE WHEN product_family = 'Bowman Chrome' THEN 0 ELSE 1 END,
        sale_count DESC,
        model_price DESC
      LIMIT 1
    `).get(playerName)
    const buckets = db.prepare(`
      SELECT
        bucket_key AS bucketKey,
        player_name AS playerName,
        release_year AS releaseYear,
        product_family AS productFamily,
        card_class AS cardClass,
        variation_label AS variationLabel,
        grade_bucket AS gradeBucket,
        serial_denominator AS serialDenominator,
        sale_count AS saleCount,
        sales_30 AS sales30,
        sales_90 AS sales90,
        auction_count AS auctionCount,
        bin_count AS binCount,
        min_price AS minPrice,
        q1_price AS q1Price,
        median_price AS medianPrice,
        avg_price AS avgPrice,
        q3_price AS q3Price,
        max_price AS maxPrice,
        model_price AS modelPrice,
        base_auto_multiple AS baseAutoMultiple,
        latest_sold_at AS latestSoldAt,
        generated_at AS generatedAt
      FROM market_movers_model_buckets
      WHERE player_name = ?
      ORDER BY model_price DESC, sale_count DESC
      LIMIT ?
    `).all(playerName, MAX_SALES_CACHE_BUCKETS)
    const exclusions = db.prepare(`
      SELECT exclusion_reason AS reason, COUNT(*) AS count
      FROM market_movers_sales_normalized
      WHERE player_name = ? AND exclusion_reason IS NOT NULL
      GROUP BY exclusion_reason
      ORDER BY count DESC
    `).all(playerName)
    const sales = db.prepare(`
      WITH target_bucket AS (
        SELECT *
        FROM market_movers_sales_normalized
        GROUP BY bucket_key
      )
      SELECT
        n.item_id AS itemId,
        n.player_name AS playerName,
        r.title AS title,
        r.sale_price_text AS salePriceText,
        r.sale_price AS salePrice,
        r.sold_at AS soldAt,
        r.sale_type AS saleType,
        n.channel AS channel,
        r.seller AS seller,
        r.source_page AS sourcePage,
        r.source_offset AS sourceOffset,
	        CASE
	          WHEN o.target_product_family IS NOT NULL THEN COALESCE(o.target_release_year, n.release_year)
	          ELSE COALESCE(t.release_year, n.release_year)
	        END AS releaseYear,
	        CASE
	          WHEN o.target_product_family IS NOT NULL THEN o.target_product_family
	          ELSE COALESCE(t.product_family, n.product_family)
	        END AS productFamily,
	        CASE
	          WHEN o.target_product_family IS NOT NULL THEN o.target_card_class
	          ELSE COALESCE(t.card_class, n.card_class)
	        END AS cardClass,
	        CASE
	          WHEN o.target_product_family IS NOT NULL THEN o.target_variation_label
	          ELSE COALESCE(t.variation_label, n.variation_label)
	        END AS variationLabel,
	        CASE
	          WHEN o.target_product_family IS NOT NULL THEN o.target_serial_denominator
	          ELSE COALESCE(t.serial_denominator, n.serial_denominator)
	        END AS serialDenominator,
	        COALESCE(t.grade_company, n.grade_company) AS gradeCompany,
	        COALESCE(t.grade_value, n.grade_value) AS gradeValue,
	        CASE
	          WHEN o.target_product_family IS NOT NULL THEN o.target_grade_bucket
	          ELSE COALESCE(t.grade_bucket, n.grade_bucket)
	        END AS gradeBucket,
	        CASE
	          WHEN o.target_product_family IS NOT NULL THEN o.target_insert_name
	          ELSE COALESCE(t.insert_name, n.insert_name)
	        END AS insertName,
        COALESCE(o.target_bucket_key, n.bucket_key) AS bucketKey,
        n.bucket_key AS sourceBucketKey,
        n.product_family AS sourceProductFamily,
        n.card_class AS sourceCardClass,
        n.variation_label AS sourceVariationLabel,
        n.serial_denominator AS sourceSerialDenominator,
        n.grade_bucket AS sourceGradeBucket,
        n.insert_name AS sourceInsertName,
        COALESCE(o.note, '') AS bucketMergeNote,
        COALESCE(o.updated_at, '') AS bucketMergeUpdatedAt,
        n.model_eligible AS modelEligible,
        n.exclusion_reason AS exclusionReason,
        COALESCE(t.is_auto, n.is_auto) AS isAuto,
        COALESCE(t.is_bowman, n.is_bowman) AS isBowman,
        COALESCE(t.is_chrome, n.is_chrome) AS isChrome,
        COALESCE(t.is_paper, n.is_paper) AS isPaper,
        COALESCE(t.is_case_hit, n.is_case_hit) AS isCaseHit,
        COALESCE(t.is_insert, n.is_insert) AS isInsert,
        n.is_auto AS sourceIsAuto,
        n.is_bowman AS sourceIsBowman,
        n.is_chrome AS sourceIsChrome,
        n.is_paper AS sourceIsPaper,
        n.is_case_hit AS sourceIsCaseHit,
        n.is_insert AS sourceIsInsert,
        n.is_redemption AS isRedemption,
        n.is_redeemed AS isRedeemed,
        n.is_digital AS isDigital,
        n.is_lot AS isLot,
        COALESCE(f.erroneous, 0) AS erroneous,
        COALESCE(f.note, '') AS erroneousNote,
        COALESCE(f.updated_at, '') AS flagUpdatedAt
      FROM market_movers_sales_normalized n
      JOIN market_movers_sales_raw r ON r.item_id = n.item_id
      LEFT JOIN market_movers_sale_flags f ON f.item_id = n.item_id
      LEFT JOIN market_movers_bucket_overrides o ON o.source_bucket_key = n.bucket_key
      LEFT JOIN target_bucket t ON t.bucket_key = o.target_bucket_key
      WHERE n.player_name = ?
      ORDER BY r.sold_at ASC, r.sale_price ASC
      LIMIT ?
    `).all(playerName, MAX_SALES_CACHE_SALES)

    const mappedBuckets = buckets.map(mapSalesCacheBucket)
    const mappedBaseAutoBucket = baseAutoBucket ? mapSalesCacheBucket(baseAutoBucket) : null

    return jsonResponse(200, {
      available: true,
      playerName,
      generatedAt: rowString(playerSummary, 'generatedAt'),
      totalRows: rowNumber(salesSummary, 'totalRows'),
      modelEligibleRows: rowNumber(salesSummary, 'modelEligibleRows'),
      excludedRows: rowNumber(salesSummary, 'excludedRows'),
      bucketCount: rowNumber(playerSummary, 'bucketCount'),
      modeledSales: rowNumber(playerSummary, 'modeledSales'),
      baseAutoPrice: mappedBaseAutoBucket?.modelPrice ?? inferredBaseAutoPriceFromBuckets(mappedBuckets),
      baseAutoBucket: mappedBaseAutoBucket,
      buckets: mappedBuckets,
      sales: sales.map(mapSalesCacheSale),
      exclusions: exclusions.map((row) => ({
        reason: rowString(row, 'reason'),
        count: rowNumber(row, 'count'),
      })),
    })
  } catch (error) {
    return jsonResponse(routeErrorStatus(error), { error: routeErrorMessage(error, 'Sales cache read failed') })
  } finally {
    db?.close()
  }
}

function nodeRoute(request: IncomingMessage) {
  return (request.url ?? '').replace(/^\/+/, '').split('?')[0]
}

function prefixedNodeRoute(request: IncomingMessage, prefix: string) {
  const route = nodeRoute(request)
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '')
  if (route === normalizedPrefix) return ''
  if (route.startsWith(`${normalizedPrefix}/`)) return route.slice(normalizedPrefix.length + 1)
  return route
}

function nodeHeaders(request: IncomingMessage) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '))
    else if (typeof value === 'string') headers.set(key, value)
  }
  return headers
}

async function nodeRequestBody(request: IncomingMessage) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined

  let body = ''
  for await (const chunk of request) {
    body += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
  }
  return body
}

async function nodeToFetchRequest(request: IncomingMessage) {
  const host = request.headers.host || 'localhost'
  const url = new URL(request.url || '/', `http://${host}`)
  return new Request(url, {
    method: request.method,
    headers: nodeHeaders(request),
    body: await nodeRequestBody(request),
  })
}

async function writeNodeResponse(response: ServerResponse, fetchResponse: Response) {
  response.statusCode = fetchResponse.status
  fetchResponse.headers.forEach((value, key) => {
    response.setHeader(key, value)
  })
  response.end(Buffer.from(await fetchResponse.arrayBuffer()))
}

export async function handleProspectPulseNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleProspectPulseRoute(nodeRoute(request), fetchRequest, env))
}

export async function handleEbayNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleEbayRoute(nodeRoute(request), fetchRequest, env))
}

export async function handleFanaticsCollectNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(
    response,
    await handleFanaticsCollectRoute(prefixedNodeRoute(request, '/api/fanatics-collect'), fetchRequest, env),
  )
}

export async function handleCardHedgeNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleCardHedgeRoute(nodeRoute(request), fetchRequest, env))
}

export async function handleSalesCacheNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleSalesCacheRoute(nodeRoute(request), fetchRequest, env))
}

export async function handleChecklistNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleChecklistRoute(nodeRoute(request), fetchRequest, env))
}

export async function handleLiveMarketNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleLiveMarketRoute(nodeRoute(request), fetchRequest, env))
}

export async function handleRankingsNodeRequest(request: IncomingMessage, response: ServerResponse) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleRankingsRoute(nodeRoute(request), fetchRequest))
}
