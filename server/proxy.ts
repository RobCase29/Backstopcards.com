/// <reference types="node" />

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, resolve } from 'node:path'
import {
  hostedCompPlayerPayload,
  hostedCompPlayersPayload,
  hostedCompStatusPayload,
  queueHostedCompPlayer,
  runHostedCompRefresh,
  type HostedCompSql,
} from './hostedComps.js'

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
const FANATICS_COLLECT_TERMS_URL = 'https://support.fanaticscollect.com/en_us/terms-of-use-r11C70QTge'
const FANATICS_COLLECT_WIDE_DEFAULT_PAGE_SIZE = 250
const FANATICS_COLLECT_WIDE_DEFAULT_MAX_PAGES = 40
const FANATICS_COLLECT_WIDE_MAX_PAGES = 200
const FANATICS_COLLECT_WIDE_DEFAULT_TIME_BUDGET_MS = 25_000
const FANATICS_COLLECT_WIDE_MAX_TIME_BUDGET_MS = 50_000
const DAVE_ADAMS_BASE_URL = 'https://www.dacardworld.com'
const DAVE_ADAMS_QUERY_CACHE_NAMESPACE = 'backstop-dave-adams-query-v1'
const DAVE_ADAMS_QUERY_CACHE_TTL_SECONDS = 6 * 60 * 60
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
const FANATICS_COLLECT_ROUTES = new Set(['status', 'search', 'wide-scan'])
const DAVE_ADAMS_ROUTES = new Set(['status', 'search'])
const CARD_HEDGE_ROUTES = new Set([
  'status',
  'refresh',
  'search',
  'match',
  'comps',
  'all-prices',
  'prices-by-card',
  'price-updates',
  'sales-stats-by-player',
  'total-sales-by-player',
  'subscribe-price-updates',
  'price-estimate',
  'batch-price-estimate',
  'card-fmv-batch',
  'daily-export',
])
const SALES_CACHE_ROUTES = new Set(['status', 'player', 'players', 'flag-sale', 'merge-bucket'])
const SALES_CACHE_WRITE_ROUTES = new Set(['flag-sale', 'merge-bucket'])
const CHECKLIST_ROUTES = new Set(['status', 'universe', 'catalog', 'model', 'coverage'])
const LIVE_MARKET_ROUTES = new Set(['status', 'snapshot', 'latest', 'prune'])
const SCAN_COVERAGE_ROUTES = new Set(['status', 'run'])
const SCAN_QUEUE_ROUTES = new Set(['status', 'schedule', 'claim', 'complete', 'cron'])
const RANKINGS_ROUTES = new Set(['status', 'refresh', 'data'])
const MAX_SALES_CACHE_PLAYER_LENGTH = 100
const MAX_SALES_CACHE_BUCKETS = 72
const MAX_SALES_CACHE_SALES = 3_000
const MAX_CHECKLIST_UNIVERSE_ROWS = 1_000
const MAX_CHECKLIST_MODEL_PLAYERS = 2_500
const MAX_CHECKLIST_COVERAGE_ROWS = 2_500
const MAX_SALES_CACHE_NOTE_LENGTH = 240
const MAX_LIVE_MARKET_LISTINGS = 900
const MAX_LIVE_MARKET_SCAN_KEY_LENGTH = 180
const MAX_SCAN_COVERAGE_TARGETS = 3_000
const MAX_SCAN_COVERAGE_STATUS_ROWS = 1_000
const MAX_SCAN_QUEUE_JOBS = 3_000
const MAX_SCAN_QUEUE_CLAIM = 80
const MAX_SCAN_QUEUE_STATUS_ROWS = 500
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
  sealedWax?: boolean
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

type ScanCoverageTargetPayload = {
  targetKey?: string
  playerName?: string
  playerKey?: string
  releaseKey?: string
  releaseYear?: number
  releaseName?: string
  modelKey?: string
  teamCode?: string
  targetType?: string
  status?: string
  listingCount?: number
  opportunityCount?: number
  bestEdgeDollars?: number | null
  bestScore?: number | null
  marketplaces?: unknown
  error?: string
}

type ScanCoverageRunPayload = {
  runId?: string
  scanType?: string
  scanKey?: string
  teamCode?: string
  teamLabel?: string
  targetType?: string
  searchMode?: string
  playerScope?: string
  releaseScope?: string
  observedAt?: string
  status?: string
  marketplaces?: string[]
  request?: unknown
  stats?: unknown
  targets?: ScanCoverageTargetPayload[]
}

type ScanQueueJobPayload = {
  queueKey?: string
  teamCode?: string
  teamLabel?: string
  scanType?: string
  targetType?: string
  playerName?: string
  playerKey?: string
  releaseKey?: string
  releaseYear?: number
  releaseName?: string
  modelKey?: string
  searchMode?: string
  playerScope?: string
  priority?: number
  runAfter?: string
  maxAttempts?: number
  payload?: unknown
}

type ScanQueueSchedulePayload = {
  source?: string
  teamCode?: string
  teamLabel?: string
  scanType?: string
  targetType?: string
  runAfter?: string
  jobs?: ScanQueueJobPayload[]
}

type ScanQueueClaimPayload = {
  teamCode?: string
  scanType?: string
  targetType?: string
  leaseOwner?: string
  leaseSeconds?: number
  limit?: number
}

type ScanQueueCompletePayload = {
  leaseOwner?: string
  jobs?: Array<{
    jobId?: string
    status?: string
    error?: string
  }>
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

function ensureScanCoverageSchema(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_coverage_runs (
      run_id TEXT PRIMARY KEY,
      scan_type TEXT NOT NULL,
      scan_key TEXT NOT NULL,
      team_code TEXT NOT NULL DEFAULT '',
      team_label TEXT NOT NULL DEFAULT '',
      target_type TEXT NOT NULL DEFAULT 'listing',
      search_mode TEXT NOT NULL DEFAULT '',
      player_scope TEXT NOT NULL DEFAULT '',
      release_scope TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'complete',
      observed_at TEXT NOT NULL,
      target_count INTEGER NOT NULL DEFAULT 0,
      listing_count INTEGER NOT NULL DEFAULT 0,
      opportunity_count INTEGER NOT NULL DEFAULT 0,
      queries_run INTEGER NOT NULL DEFAULT 0,
      queries_succeeded INTEGER NOT NULL DEFAULT 0,
      queries_failed INTEGER NOT NULL DEFAULT 0,
      marketplaces_json TEXT NOT NULL DEFAULT '[]',
      request_json TEXT NOT NULL DEFAULT '{}',
      stats_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scan_coverage_targets (
      run_id TEXT NOT NULL,
      target_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      player_key TEXT NOT NULL DEFAULT '',
      release_key TEXT NOT NULL DEFAULT '',
      release_year INTEGER,
      release_name TEXT NOT NULL DEFAULT '',
      model_key TEXT NOT NULL DEFAULT '',
      team_code TEXT NOT NULL DEFAULT '',
      target_type TEXT NOT NULL DEFAULT 'listing',
      status TEXT NOT NULL DEFAULT 'scanned_no_hits',
      listing_count INTEGER NOT NULL DEFAULT 0,
      opportunity_count INTEGER NOT NULL DEFAULT 0,
      best_edge_dollars REAL,
      best_score REAL,
      marketplaces_json TEXT NOT NULL DEFAULT '[]',
      error TEXT NOT NULL DEFAULT '',
      observed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (run_id, target_key),
      FOREIGN KEY(run_id) REFERENCES scan_coverage_runs(run_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scan_coverage_runs_team
      ON scan_coverage_runs(team_code, scan_type, observed_at);
    CREATE INDEX IF NOT EXISTS idx_scan_coverage_runs_key
      ON scan_coverage_runs(scan_key, observed_at);
    CREATE INDEX IF NOT EXISTS idx_scan_coverage_targets_latest
      ON scan_coverage_targets(team_code, target_type, player_key, release_key, observed_at);
    CREATE INDEX IF NOT EXISTS idx_scan_coverage_targets_status
      ON scan_coverage_targets(status, observed_at);
  `)
}

function ensureScanQueueSchema(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_queue_jobs (
      job_id TEXT PRIMARY KEY,
      queue_key TEXT NOT NULL UNIQUE,
      team_code TEXT NOT NULL DEFAULT '',
      team_label TEXT NOT NULL DEFAULT '',
      scan_type TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'listing',
      player_name TEXT NOT NULL,
      player_key TEXT NOT NULL DEFAULT '',
      release_key TEXT NOT NULL DEFAULT '',
      release_year INTEGER,
      release_name TEXT NOT NULL DEFAULT '',
      model_key TEXT NOT NULL DEFAULT '',
      search_mode TEXT NOT NULL DEFAULT 'checklist',
      player_scope TEXT NOT NULL DEFAULT 'all',
      priority INTEGER NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'queued',
      run_after TEXT NOT NULL,
      lease_owner TEXT NOT NULL DEFAULT '',
      lease_expires_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scan_queue_due
      ON scan_queue_jobs(status, run_after, priority);
    CREATE INDEX IF NOT EXISTS idx_scan_queue_team
      ON scan_queue_jobs(team_code, scan_type, target_type, status, run_after);
    CREATE INDEX IF NOT EXISTS idx_scan_queue_player
      ON scan_queue_jobs(player_key, release_key, scan_type);
  `)
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
    'sales-stats-by-player': '/v1/cards/sales-stats-by-player',
    'total-sales-by-player': '/v1/cards/total-sales-by-player',
    'subscribe-price-updates': '/v1/cards/subscribe-price-updates',
    'price-estimate': '/v1/cards/price-estimate',
    'batch-price-estimate': '/v1/cards/batch-price-estimate',
    'card-fmv-batch': '/v1/cards/card-fmv-batch',
  }
  return endpoints[route] ?? ''
}

function cardHedgeRedisUsageKeys(now = new Date()) {
  const minuteStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000)
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return {
    minuteKey: `backstop:card-hedge:usage:minute:${minuteStart.toISOString().slice(0, 16)}`,
    dayKey: `backstop:card-hedge:usage:day:${dayStart.toISOString().slice(0, 10)}`,
    minuteStart: minuteStart.toISOString(),
    dayStart: dayStart.toISOString(),
  }
}

async function cardHedgeRedisUsagePayload(redis: RedisClient, env: ServerEnv, now = new Date()) {
  const limits = cardHedgeRateConfig(env)
  const keys = cardHedgeRedisUsageKeys(now)
  const [minuteRaw, dayRaw] = await Promise.all([redis.get<number | string>(keys.minuteKey), redis.get<number | string>(keys.dayKey)])
  const minute = Number(minuteRaw ?? 0)
  const day = Number(dayRaw ?? 0)
  const safeMinute = Number.isFinite(minute) ? minute : 0
  const safeDay = Number.isFinite(day) ? day : 0
  return {
    limits,
    usage: {
      minute: safeMinute,
      day: safeDay,
      remainingMinute: Math.max(0, limits.perMinute - safeMinute),
      remainingDay: Math.max(0, limits.perDay - safeDay),
      minuteWindowStart: keys.minuteStart,
      dayWindowStart: keys.dayStart,
    },
  }
}

async function cardHedgeRedisRateLimitError(redis: RedisClient, env: ServerEnv, requestedCalls = 1) {
  const { limits, usage } = await cardHedgeRedisUsagePayload(redis, env)
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

async function incrementRedisCounter(redis: RedisClient, key: string, ttlSeconds: number) {
  try {
    if (redis.incrby) {
      const next = await redis.incrby(key, 1)
      await redis.expire?.(key, ttlSeconds)
      return next
    }
    const currentRaw = await redis.get<number | string>(key)
    const current = Number(currentRaw ?? 0)
    const next = (Number.isFinite(current) ? current : 0) + 1
    await redis.set(key, next, { ex: ttlSeconds })
    return next
  } catch {
    return null
  }
}

async function recordCardHedgeRedisCall(redis: RedisClient, route: string, endpoint: string, statusCode: number, now = new Date()) {
  const keys = cardHedgeRedisUsageKeys(now)
  const requestedAt = now.toISOString()
  await Promise.all([
    incrementRedisCounter(redis, keys.minuteKey, 2 * 60),
    incrementRedisCounter(redis, keys.dayKey, 2 * 24 * 60 * 60),
    redis.set(
      'backstop:card-hedge:usage:last-call',
      {
        route,
        endpoint,
        statusCode,
        requestedAt,
      },
      { ex: 2 * 24 * 60 * 60 },
    ),
  ])
}

function cardHedgeRefreshCheckpointKey() {
  return 'backstop:card-hedge:price-updates:checkpoint'
}

function cardHedgeRefreshFallbackSince(now = new Date()) {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
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

function sqliteTableHasColumn(db: SqliteDatabase, table: string, column: string) {
  if (!sqliteTableExists(db, table)) return false
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => rowString(row, 'name') === column)
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
  incrby?: (key: string, increment: number) => Promise<number>
  expire?: (key: string, seconds: number) => Promise<number>
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

function compactScanCoverageText(value: unknown, maxLength = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function scanCoverageKeyText(value: unknown, maxLength = 80) {
  return compactScanCoverageText(value, maxLength)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function scanCoveragePlayerKey(playerName: string, fallback = '') {
  return (
    playerName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-') ||
    scanCoverageKeyText(fallback) ||
    'unknown-player'
  )
}

function safeScanCoverageType(value: unknown) {
  const scanType = compactScanCoverageText(value || 'bin', 40).toLowerCase()
  if (scanType === 'auction' || scanType === 'superfractor') return scanType
  return 'bin'
}

function safeScanCoverageStatus(value: unknown) {
  const status = compactScanCoverageText(value || 'complete', 40).toLowerCase()
  if (status === 'partial' || status === 'failed' || status === 'running') return status
  return 'complete'
}

function safeScanCoverageTargetStatus(value: unknown, listingCount: number, opportunityCount: number) {
  const status = compactScanCoverageText(value, 60).toLowerCase()
  if (
    status === 'live_opportunity' ||
    status === 'live_hits' ||
    status === 'scanned_no_hits' ||
    status === 'failed' ||
    status === 'not_scanned'
  ) {
    return status
  }
  if (opportunityCount > 0) return 'live_opportunity'
  if (listingCount > 0) return 'live_hits'
  return 'scanned_no_hits'
}

function scanCoverageRunId(scanType: string, scanKey: string, observedAt: string, explicit?: string) {
  const cleaned = compactScanCoverageText(explicit, 220)
  if (cleaned) return cleaned
  const digest = sha256(stableJson({ scanType, scanKey, observedAt, random: Math.random() })).slice(0, 12)
  const compactKey = scanCoverageKeyText(scanKey, 48) || 'manual'
  return `${scanType}:${compactKey}:${Date.parse(observedAt) || Date.now()}:${digest}`
}

function scanCoverageTargetKey(scanType: string, run: ScanCoverageRunPayload, target: ScanCoverageTargetPayload, index: number) {
  const explicit = compactScanCoverageText(target.targetKey, 220)
  if (explicit) return explicit
  const playerName = compactScanCoverageText(target.playerName, 140)
  const playerKey = scanCoveragePlayerKey(playerName, String(index))
  const releaseKey = scanCoverageKeyText(target.releaseKey || target.modelKey || target.releaseName || target.releaseYear || 'release')
  const targetType = scanCoverageKeyText(target.targetType || run.targetType || 'listing')
  return [scanType, targetType, releaseKey || 'release', playerKey].join(':')
}

function scanCoverageTargetFromPayload(
  scanType: string,
  run: ScanCoverageRunPayload,
  target: ScanCoverageTargetPayload,
  index: number,
) {
  const playerName = compactScanCoverageText(target.playerName || `Target ${index + 1}`, 140)
  const playerKey = compactScanCoverageText(target.playerKey || scanCoveragePlayerKey(playerName), 120)
  const listingCount = Math.max(0, Math.floor(Number(target.listingCount ?? 0) || 0))
  const opportunityCount = Math.max(0, Math.floor(Number(target.opportunityCount ?? 0) || 0))
  const bestEdge = Number(target.bestEdgeDollars)
  const bestScore = Number(target.bestScore)
  return {
    targetKey: scanCoverageTargetKey(scanType, run, target, index),
    playerName,
    playerKey,
    releaseKey: compactScanCoverageText(target.releaseKey, 120),
    releaseYear: Number.isFinite(Number(target.releaseYear)) ? Number(target.releaseYear) : null,
    releaseName: compactScanCoverageText(target.releaseName, 180),
    modelKey: compactScanCoverageText(target.modelKey, 160),
    teamCode: compactScanCoverageText(target.teamCode || run.teamCode, 20).toUpperCase(),
    targetType: compactScanCoverageText(target.targetType || run.targetType || 'listing', 60).toLowerCase(),
    status: safeScanCoverageTargetStatus(target.status, listingCount, opportunityCount),
    listingCount,
    opportunityCount,
    bestEdgeDollars: Number.isFinite(bestEdge) ? bestEdge : null,
    bestScore: Number.isFinite(bestScore) ? bestScore : null,
    marketplaces: target.marketplaces ?? [],
    error: compactScanCoverageText(target.error, 500),
  }
}

function scanCoverageStatsNumber(stats: unknown, key: string) {
  if (!stats || typeof stats !== 'object') return 0
  const parsed = Number((stats as Record<string, unknown>)[key])
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

function insertScanCoverageRun(db: SqliteDatabase, payload: ScanCoverageRunPayload, nowIso = new Date().toISOString()) {
  ensureScanCoverageSchema(db)
  const scanType = safeScanCoverageType(payload.scanType)
  const scanKey = compactScanCoverageText(payload.scanKey || `${scanType}:manual`, MAX_LIVE_MARKET_SCAN_KEY_LENGTH)
  const observedAt = safeIsoDate(payload.observedAt, new Date(nowIso))
  const runId = scanCoverageRunId(scanType, scanKey, observedAt, payload.runId)
  const targets = (payload.targets ?? [])
    .slice(0, MAX_SCAN_COVERAGE_TARGETS)
    .map((target, index) => scanCoverageTargetFromPayload(scanType, payload, target, index))
  const listingCount = targets.reduce((total, target) => total + target.listingCount, 0)
  const opportunityCount = targets.reduce((total, target) => total + target.opportunityCount, 0)
  const stats = payload.stats

  db.exec('BEGIN')
  try {
    db.prepare(`
      INSERT OR REPLACE INTO scan_coverage_runs (
        run_id, scan_type, scan_key, team_code, team_label, target_type, search_mode, player_scope,
        release_scope, status, observed_at, target_count, listing_count, opportunity_count,
        queries_run, queries_succeeded, queries_failed, marketplaces_json, request_json, stats_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      scanType,
      scanKey,
      compactScanCoverageText(payload.teamCode, 20).toUpperCase(),
      compactScanCoverageText(payload.teamLabel, 80),
      compactScanCoverageText(payload.targetType || 'listing', 60).toLowerCase(),
      compactScanCoverageText(payload.searchMode, 80),
      compactScanCoverageText(payload.playerScope, 80),
      compactScanCoverageText(payload.releaseScope, 80),
      safeScanCoverageStatus(payload.status),
      observedAt,
      targets.length,
      listingCount,
      opportunityCount,
      scanCoverageStatsNumber(stats, 'queriesRun'),
      scanCoverageStatsNumber(stats, 'queriesSucceeded'),
      scanCoverageStatsNumber(stats, 'queriesFailed'),
      jsonText(payload.marketplaces ?? [], '[]'),
      jsonText(payload.request),
      jsonText(payload.stats),
      nowIso,
    )

    db.prepare('DELETE FROM scan_coverage_targets WHERE run_id = ?').run(runId)
    const insertTarget = db.prepare(`
      INSERT INTO scan_coverage_targets (
        run_id, target_key, player_name, player_key, release_key, release_year, release_name, model_key,
        team_code, target_type, status, listing_count, opportunity_count, best_edge_dollars, best_score,
        marketplaces_json, error, observed_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const target of targets) {
      insertTarget.run(
        runId,
        target.targetKey,
        target.playerName,
        target.playerKey,
        target.releaseKey,
        target.releaseYear,
        target.releaseName,
        target.modelKey,
        target.teamCode,
        target.targetType,
        target.status,
        target.listingCount,
        target.opportunityCount,
        target.bestEdgeDollars,
        target.bestScore,
        jsonText(target.marketplaces, '[]'),
        target.error,
        observedAt,
        nowIso,
      )
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return {
    available: true,
    runId,
    scanType,
    scanKey,
    observedAt,
    targetCount: targets.length,
    listingCount,
    opportunityCount,
    status: safeScanCoverageStatus(payload.status),
  }
}

function mapScanCoverageRun(row: SqliteRow) {
  return {
    runId: rowString(row, 'runId'),
    scanType: rowString(row, 'scanType'),
    scanKey: rowString(row, 'scanKey'),
    teamCode: rowString(row, 'teamCode'),
    teamLabel: rowString(row, 'teamLabel'),
    targetType: rowString(row, 'targetType'),
    searchMode: rowString(row, 'searchMode'),
    playerScope: rowString(row, 'playerScope'),
    releaseScope: rowString(row, 'releaseScope'),
    status: rowString(row, 'status'),
    observedAt: rowString(row, 'observedAt'),
    targetCount: rowNumber(row, 'targetCount'),
    listingCount: rowNumber(row, 'listingCount'),
    opportunityCount: rowNumber(row, 'opportunityCount'),
    queriesRun: rowNumber(row, 'queriesRun'),
    queriesSucceeded: rowNumber(row, 'queriesSucceeded'),
    queriesFailed: rowNumber(row, 'queriesFailed'),
    marketplaces: parseJsonText(rowString(row, 'marketplacesJson'), []),
    createdAt: rowString(row, 'createdAt'),
  }
}

function mapScanCoverageTarget(row: SqliteRow) {
  return {
    runId: rowString(row, 'runId'),
    targetKey: rowString(row, 'targetKey'),
    playerName: rowString(row, 'playerName'),
    playerKey: rowString(row, 'playerKey'),
    releaseKey: rowString(row, 'releaseKey'),
    releaseYear: rowNumberOrNull(row, 'releaseYear'),
    releaseName: rowString(row, 'releaseName'),
    modelKey: rowString(row, 'modelKey'),
    teamCode: rowString(row, 'teamCode'),
    targetType: rowString(row, 'targetType'),
    status: rowString(row, 'targetStatus') || rowString(row, 'status'),
    listingCount: rowNumber(row, 'listingCount'),
    opportunityCount: rowNumber(row, 'opportunityCount'),
    bestEdgeDollars: rowNumberOrNull(row, 'bestEdgeDollars'),
    bestScore: rowNumberOrNull(row, 'bestScore'),
    marketplaces: parseJsonText(rowString(row, 'marketplacesJson'), []),
    error: rowString(row, 'error'),
    observedAt: rowString(row, 'observedAt'),
  }
}

function safeScanQueueStatus(value: unknown) {
  const status = compactScanCoverageText(value || 'queued', 40).toLowerCase()
  if (status === 'leased' || status === 'done' || status === 'failed' || status === 'cancelled') return status
  return 'queued'
}

function safeScanQueueRunAfter(value: unknown, fallback = new Date()) {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback.toISOString()
}

function scanQueueJobId(queueKey: string) {
  return `sq:${sha256(queueKey).slice(0, 24)}`
}

function scanQueueKey(job: ScanQueueJobPayload, fallback: ScanQueueSchedulePayload, index: number) {
  const explicit = compactScanCoverageText(job.queueKey, 260)
  if (explicit) return explicit
  const scanType = safeScanCoverageType(job.scanType || fallback.scanType)
  const targetType = compactScanCoverageText(job.targetType || fallback.targetType || 'listing', 60).toLowerCase()
  const teamCode = compactScanCoverageText(job.teamCode || fallback.teamCode, 20).toUpperCase()
  const releaseKey = scanCoverageKeyText(job.releaseKey || job.modelKey || job.releaseName || job.releaseYear || 'release')
  const playerKey = compactScanCoverageText(job.playerKey || scanCoveragePlayerKey(compactScanCoverageText(job.playerName), String(index)), 120)
  return [teamCode || 'team', scanType, targetType, releaseKey || 'release', playerKey || `target-${index + 1}`].join(':')
}

function normalizeScanQueueJob(job: ScanQueueJobPayload, fallback: ScanQueueSchedulePayload, index: number, nowIso: string) {
  const queueKey = scanQueueKey(job, fallback, index)
  const playerName = compactScanCoverageText(job.playerName || `Target ${index + 1}`, 140)
  const priority = clampInt(job.priority, 50, 0, 100)
  const maxAttempts = clampInt(job.maxAttempts, 3, 1, 10)
  const runAfter = safeScanQueueRunAfter(job.runAfter || fallback.runAfter, new Date(nowIso))
  return {
    jobId: scanQueueJobId(queueKey),
    queueKey,
    teamCode: compactScanCoverageText(job.teamCode || fallback.teamCode, 20).toUpperCase(),
    teamLabel: compactScanCoverageText(job.teamLabel || fallback.teamLabel, 80),
    scanType: safeScanCoverageType(job.scanType || fallback.scanType),
    targetType: compactScanCoverageText(job.targetType || fallback.targetType || 'listing', 60).toLowerCase(),
    playerName,
    playerKey: compactScanCoverageText(job.playerKey || scanCoveragePlayerKey(playerName, String(index)), 120),
    releaseKey: compactScanCoverageText(job.releaseKey, 120),
    releaseYear: Number.isFinite(Number(job.releaseYear)) ? Number(job.releaseYear) : null,
    releaseName: compactScanCoverageText(job.releaseName, 180),
    modelKey: compactScanCoverageText(job.modelKey, 160),
    searchMode: compactScanCoverageText(job.searchMode || 'checklist', 80),
    playerScope: compactScanCoverageText(job.playerScope || 'all', 80),
    priority,
    runAfter,
    maxAttempts,
    payload: job.payload ?? {},
  }
}

function scheduleScanQueueJobs(db: SqliteDatabase, payload: ScanQueueSchedulePayload, nowIso = new Date().toISOString()) {
  ensureScanQueueSchema(db)
  const jobs = (payload.jobs ?? [])
    .slice(0, MAX_SCAN_QUEUE_JOBS)
    .map((job, index) => normalizeScanQueueJob(job, payload, index, nowIso))
  if (jobs.length === 0) return { queued: 0, updated: 0, skipped: 0, jobs: [] as ReturnType<typeof mapScanQueueJob>[] }

  const existingStatement = db.prepare('SELECT queue_key AS queueKey, status, run_after AS runAfter FROM scan_queue_jobs WHERE queue_key = ?')
  const upsert = db.prepare(`
    INSERT INTO scan_queue_jobs (
      job_id, queue_key, team_code, team_label, scan_type, target_type, player_name, player_key,
      release_key, release_year, release_name, model_key, search_mode, player_scope, priority, status,
      run_after, attempts, max_attempts, payload_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, 0, ?, ?, ?, ?)
    ON CONFLICT(queue_key) DO UPDATE SET
      team_code = excluded.team_code,
      team_label = excluded.team_label,
      scan_type = excluded.scan_type,
      target_type = excluded.target_type,
      player_name = excluded.player_name,
      player_key = excluded.player_key,
      release_key = excluded.release_key,
      release_year = excluded.release_year,
      release_name = excluded.release_name,
      model_key = excluded.model_key,
      search_mode = excluded.search_mode,
      player_scope = excluded.player_scope,
      priority = MAX(scan_queue_jobs.priority, excluded.priority),
      status = CASE
        WHEN scan_queue_jobs.status = 'leased' AND COALESCE(scan_queue_jobs.lease_expires_at, '') > excluded.updated_at THEN scan_queue_jobs.status
        ELSE 'queued'
      END,
      run_after = CASE
        WHEN scan_queue_jobs.status = 'leased' AND COALESCE(scan_queue_jobs.lease_expires_at, '') > excluded.updated_at THEN scan_queue_jobs.run_after
        ELSE excluded.run_after
      END,
      lease_owner = CASE
        WHEN scan_queue_jobs.status = 'leased' AND COALESCE(scan_queue_jobs.lease_expires_at, '') > excluded.updated_at THEN scan_queue_jobs.lease_owner
        ELSE ''
      END,
      lease_expires_at = CASE
        WHEN scan_queue_jobs.status = 'leased' AND COALESCE(scan_queue_jobs.lease_expires_at, '') > excluded.updated_at THEN scan_queue_jobs.lease_expires_at
        ELSE NULL
      END,
      last_error = '',
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at,
      completed_at = NULL
  `)

  let queued = 0
  let updated = 0
  db.exec('BEGIN')
  try {
    for (const job of jobs) {
      const existed = Boolean(existingStatement.get(job.queueKey))
      upsert.run(
        job.jobId,
        job.queueKey,
        job.teamCode,
        job.teamLabel,
        job.scanType,
        job.targetType,
        job.playerName,
        job.playerKey,
        job.releaseKey,
        job.releaseYear,
        job.releaseName,
        job.modelKey,
        job.searchMode,
        job.playerScope,
        job.priority,
        job.runAfter,
        job.maxAttempts,
        jsonText(job.payload),
        nowIso,
        nowIso,
      )
      if (existed) updated += 1
      else queued += 1
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  const rows = db.prepare(`
    SELECT
      job_id AS jobId,
      queue_key AS queueKey,
      team_code AS teamCode,
      team_label AS teamLabel,
      scan_type AS scanType,
      target_type AS targetType,
      player_name AS playerName,
      player_key AS playerKey,
      release_key AS releaseKey,
      release_year AS releaseYear,
      release_name AS releaseName,
      model_key AS modelKey,
      search_mode AS searchMode,
      player_scope AS playerScope,
      priority,
      status,
      run_after AS runAfter,
      lease_owner AS leaseOwner,
      lease_expires_at AS leaseExpiresAt,
      attempts,
      max_attempts AS maxAttempts,
      last_error AS lastError,
      payload_json AS payloadJson,
      created_at AS createdAt,
      updated_at AS updatedAt,
      completed_at AS completedAt
    FROM scan_queue_jobs
    WHERE queue_key IN (${jobs.map(() => '?').join(', ')})
    ORDER BY priority DESC, run_after, player_name
  `).all(...jobs.map((job) => job.queueKey))

  return { queued, updated, skipped: 0, jobs: rows.map(mapScanQueueJob) }
}

function requeueExpiredScanQueueJobs(db: SqliteDatabase, nowIso: string) {
  ensureScanQueueSchema(db)
  const expired = db.prepare(`
    SELECT job_id AS jobId
    FROM scan_queue_jobs
    WHERE status = 'leased'
      AND COALESCE(lease_expires_at, '') <= ?
  `).all(nowIso)
  db.prepare(`
    UPDATE scan_queue_jobs
    SET status = 'queued',
        lease_owner = '',
        lease_expires_at = NULL,
        updated_at = ?
    WHERE status = 'leased'
      AND COALESCE(lease_expires_at, '') <= ?
  `).run(nowIso, nowIso)
  return expired.length
}

function mapScanQueueJob(row: SqliteRow) {
  return {
    jobId: rowString(row, 'jobId'),
    queueKey: rowString(row, 'queueKey'),
    teamCode: rowString(row, 'teamCode'),
    teamLabel: rowString(row, 'teamLabel'),
    scanType: rowString(row, 'scanType'),
    targetType: rowString(row, 'targetType'),
    playerName: rowString(row, 'playerName'),
    playerKey: rowString(row, 'playerKey'),
    releaseKey: rowString(row, 'releaseKey'),
    releaseYear: rowNumberOrNull(row, 'releaseYear'),
    releaseName: rowString(row, 'releaseName'),
    modelKey: rowString(row, 'modelKey'),
    searchMode: rowString(row, 'searchMode'),
    playerScope: rowString(row, 'playerScope'),
    priority: rowNumber(row, 'priority'),
    status: rowString(row, 'status'),
    runAfter: rowString(row, 'runAfter'),
    leaseOwner: rowString(row, 'leaseOwner'),
    leaseExpiresAt: rowString(row, 'leaseExpiresAt') || null,
    attempts: rowNumber(row, 'attempts'),
    maxAttempts: rowNumber(row, 'maxAttempts'),
    lastError: rowString(row, 'lastError'),
    payload: parseJsonText(rowString(row, 'payloadJson'), {}),
    createdAt: rowString(row, 'createdAt'),
    updatedAt: rowString(row, 'updatedAt'),
    completedAt: rowString(row, 'completedAt') || null,
  }
}

function claimScanQueueJobs(db: SqliteDatabase, payload: ScanQueueClaimPayload, nowIso = new Date().toISOString()) {
  ensureScanQueueSchema(db)
  const limit = clampInt(payload.limit, 20, 1, MAX_SCAN_QUEUE_CLAIM)
  const leaseSeconds = clampInt(payload.leaseSeconds, 15 * 60, 60, 60 * 60)
  const leaseOwner = compactScanCoverageText(payload.leaseOwner || `worker:${Math.random().toString(36).slice(2, 10)}`, 120)
  const teamCode = compactScanCoverageText(payload.teamCode, 20).toUpperCase()
  const scanType = compactScanCoverageText(payload.scanType, 40).toLowerCase()
  const targetType = compactScanCoverageText(payload.targetType, 60).toLowerCase()
  const leaseExpiresAt = new Date(Date.parse(nowIso) + leaseSeconds * 1_000).toISOString()
  requeueExpiredScanQueueJobs(db, nowIso)

  const filters = [
    "status = 'queued'",
    'run_after <= ?',
    'attempts < max_attempts',
  ]
  const values: Array<string | number> = [nowIso]
  if (teamCode) {
    filters.push('team_code = ?')
    values.push(teamCode)
  }
  if (scanType) {
    filters.push('scan_type = ?')
    values.push(scanType)
  }
  if (targetType) {
    filters.push('target_type = ?')
    values.push(targetType)
  }

  const candidates = db.prepare(`
    SELECT job_id AS jobId
    FROM scan_queue_jobs
    WHERE ${filters.join(' AND ')}
    ORDER BY priority DESC, run_after, updated_at
    LIMIT ?
  `).all(...values, limit)
  const jobIds = candidates.map((row) => rowString(row, 'jobId')).filter(Boolean)
  if (jobIds.length === 0) return { leaseOwner, leaseExpiresAt, claimed: 0, jobs: [] as ReturnType<typeof mapScanQueueJob>[] }

  db.prepare(`
    UPDATE scan_queue_jobs
    SET status = 'leased',
        lease_owner = ?,
        lease_expires_at = ?,
        attempts = attempts + 1,
        updated_at = ?
    WHERE job_id IN (${jobIds.map(() => '?').join(', ')})
  `).run(leaseOwner, leaseExpiresAt, nowIso, ...jobIds)

  const rows = db.prepare(`
    SELECT
      job_id AS jobId,
      queue_key AS queueKey,
      team_code AS teamCode,
      team_label AS teamLabel,
      scan_type AS scanType,
      target_type AS targetType,
      player_name AS playerName,
      player_key AS playerKey,
      release_key AS releaseKey,
      release_year AS releaseYear,
      release_name AS releaseName,
      model_key AS modelKey,
      search_mode AS searchMode,
      player_scope AS playerScope,
      priority,
      status,
      run_after AS runAfter,
      lease_owner AS leaseOwner,
      lease_expires_at AS leaseExpiresAt,
      attempts,
      max_attempts AS maxAttempts,
      last_error AS lastError,
      payload_json AS payloadJson,
      created_at AS createdAt,
      updated_at AS updatedAt,
      completed_at AS completedAt
    FROM scan_queue_jobs
    WHERE job_id IN (${jobIds.map(() => '?').join(', ')})
    ORDER BY priority DESC, run_after, player_name
  `).all(...jobIds)

  return { leaseOwner, leaseExpiresAt, claimed: rows.length, jobs: rows.map(mapScanQueueJob) }
}

function completeScanQueueJobs(db: SqliteDatabase, payload: ScanQueueCompletePayload, nowIso = new Date().toISOString()) {
  ensureScanQueueSchema(db)
  const jobs = (payload.jobs ?? []).slice(0, MAX_SCAN_QUEUE_CLAIM)
  const leaseOwner = compactScanCoverageText(payload.leaseOwner, 120)
  let completed = 0
  let failed = 0
  let skipped = 0

  const update = db.prepare(`
    UPDATE scan_queue_jobs
    SET status = ?,
        lease_owner = '',
        lease_expires_at = NULL,
        last_error = ?,
        updated_at = ?,
        completed_at = CASE WHEN ? = 'done' THEN ? ELSE completed_at END
    WHERE job_id = ?
      AND (? = '' OR lease_owner = ?)
  `)

  for (const job of jobs) {
    const jobId = compactScanCoverageText(job.jobId, 140)
    if (!jobId) {
      skipped += 1
      continue
    }
    const status = safeScanQueueStatus(job.status === 'done' ? 'done' : job.status === 'failed' ? 'failed' : 'queued')
    const before = db.prepare('SELECT status, lease_owner AS leaseOwner FROM scan_queue_jobs WHERE job_id = ?').get(jobId)
    if (!before || (leaseOwner && rowString(before, 'leaseOwner') !== leaseOwner)) {
      skipped += 1
      continue
    }
    update.run(status, compactScanCoverageText(job.error, 500), nowIso, status, nowIso, jobId, leaseOwner, leaseOwner)
    const after = db.prepare('SELECT status FROM scan_queue_jobs WHERE job_id = ?').get(jobId)
    if (rowString(after, 'status') !== status) {
      skipped += 1
      continue
    }
    if (status === 'done') completed += 1
    if (status === 'failed') failed += 1
  }

  return { completed, failed, skipped }
}

function scanQueueRefreshMinutes(scanType: string, status: string, targetType: string) {
  if (status === 'failed') return 30
  if (scanType === 'auction') return status === 'live_opportunity' || status === 'live_hits' ? 10 : 90
  if (scanType === 'superfractor' || targetType === 'superfractor') return status === 'live_opportunity' || status === 'live_hits' ? 6 * 60 : 24 * 60
  if (status === 'live_opportunity') return 45
  if (status === 'live_hits') return 2 * 60
  return 8 * 60
}

function scanQueuePriority(scanType: string, status: string, targetType: string) {
  let priority = 45
  if (status === 'live_opportunity') priority = 95
  else if (status === 'failed') priority = 85
  else if (status === 'live_hits') priority = 75
  else if (status === 'scanned_no_hits') priority = 45
  if (scanType === 'auction') priority += 5
  if (scanType === 'superfractor' || targetType === 'superfractor') priority += 8
  return Math.min(100, priority)
}

function scheduleScanQueueJobsFromCoverage(
  db: SqliteDatabase,
  options: { teamCode?: string; limit?: number } = {},
  nowIso = new Date().toISOString(),
) {
  ensureScanCoverageSchema(db)
  ensureScanQueueSchema(db)
  const teamCode = compactScanCoverageText(options.teamCode, 20).toUpperCase()
  const limit = clampInt(options.limit, 500, 1, MAX_SCAN_QUEUE_JOBS)
  const rows = db.prepare(`
    WITH ranked_targets AS (
      SELECT
        r.scan_type AS scanType,
        r.team_code AS teamCode,
        r.team_label AS teamLabel,
        r.search_mode AS searchMode,
        r.player_scope AS playerScope,
        t.target_key AS targetKey,
        t.player_name AS playerName,
        t.player_key AS playerKey,
        t.release_key AS releaseKey,
        t.release_year AS releaseYear,
        t.release_name AS releaseName,
        t.model_key AS modelKey,
        t.target_type AS targetType,
        t.status AS targetStatus,
        t.listing_count AS listingCount,
        t.opportunity_count AS opportunityCount,
        t.observed_at AS observedAt,
        ROW_NUMBER() OVER (
          PARTITION BY r.scan_type, t.target_key
          ORDER BY t.observed_at DESC, r.created_at DESC
        ) AS rowNum
      FROM scan_coverage_targets t
      JOIN scan_coverage_runs r ON r.run_id = t.run_id
      WHERE (? = '' OR UPPER(t.team_code) = ? OR UPPER(r.team_code) = ?)
    )
    SELECT *
    FROM ranked_targets
    WHERE rowNum = 1
    ORDER BY observedAt ASC, playerName
    LIMIT ?
  `).all(teamCode, teamCode, teamCode, limit)

  const nowMs = Date.parse(nowIso)
  const jobs: ScanQueueJobPayload[] = []
  for (const row of rows) {
    const scanType = safeScanCoverageType(rowString(row, 'scanType'))
    const targetType = compactScanCoverageText(rowString(row, 'targetType') || 'listing', 60).toLowerCase()
    const status = rowString(row, 'targetStatus')
    const observedAt = Date.parse(rowString(row, 'observedAt'))
    const refreshMinutes = scanQueueRefreshMinutes(scanType, status, targetType)
    const dueAt = Number.isFinite(observedAt) ? observedAt + refreshMinutes * 60_000 : 0
    if (Number.isFinite(nowMs) && dueAt > nowMs) continue
    jobs.push({
      queueKey: rowString(row, 'targetKey') ? `coverage:${scanType}:${rowString(row, 'targetKey')}` : undefined,
      teamCode: rowString(row, 'teamCode') || teamCode,
      teamLabel: rowString(row, 'teamLabel'),
      scanType,
      targetType,
      playerName: rowString(row, 'playerName'),
      playerKey: rowString(row, 'playerKey'),
      releaseKey: rowString(row, 'releaseKey'),
      releaseYear: rowNumberOrNull(row, 'releaseYear') ?? undefined,
      releaseName: rowString(row, 'releaseName'),
      modelKey: rowString(row, 'modelKey'),
      searchMode: rowString(row, 'searchMode') || (targetType === 'superfractor' ? 'superfractor' : 'checklist'),
      playerScope: rowString(row, 'playerScope') || 'all',
      priority: scanQueuePriority(scanType, status, targetType),
      runAfter: nowIso,
      payload: {
        source: 'coverage-ledger',
        previousStatus: status,
        listingCount: rowNumber(row, 'listingCount'),
        opportunityCount: rowNumber(row, 'opportunityCount'),
        observedAt: rowString(row, 'observedAt'),
      },
    })
  }

  const scheduled = scheduleScanQueueJobs(
    db,
    {
      source: 'coverage-ledger',
      teamCode,
      jobs,
    },
    nowIso,
  )
  return {
    evaluated: rows.length,
    due: jobs.length,
    ...scheduled,
  }
}

function scanQueueStatusPayload(
  db: SqliteDatabase,
  dbPath: string,
  params: URLSearchParams,
  nowIso = new Date().toISOString(),
) {
  ensureScanQueueSchema(db)
  const teamCode = compactScanCoverageText(params.get('team') ?? params.get('teamCode'), 20).toUpperCase()
  const scanType = compactScanCoverageText(params.get('scanType'), 40).toLowerCase()
  const targetType = compactScanCoverageText(params.get('targetType'), 60).toLowerCase()
  const limit = clampInt(params.get('limit'), 120, 1, MAX_SCAN_QUEUE_STATUS_ROWS)
  const filters = ['1 = 1']
  const values: Array<string | number> = []
  if (teamCode) {
    filters.push('team_code = ?')
    values.push(teamCode)
  }
  if (scanType) {
    filters.push('scan_type = ?')
    values.push(scanType)
  }
  if (targetType) {
    filters.push('target_type = ?')
    values.push(targetType)
  }
  const whereSql = filters.join(' AND ')
  const byStatus = db.prepare(`
    SELECT
      status,
      COUNT(*) AS jobs,
      MIN(CASE WHEN status = 'queued' THEN run_after ELSE NULL END) AS nextRunAfter,
      MAX(updated_at) AS latestUpdatedAt
    FROM scan_queue_jobs
    WHERE ${whereSql}
    GROUP BY status
    ORDER BY jobs DESC, status
  `).all(...values)
  const byScanType = db.prepare(`
    SELECT
      scan_type AS scanType,
      target_type AS targetType,
      COUNT(*) AS jobs,
      SUM(CASE WHEN status = 'queued' AND run_after <= ? THEN 1 ELSE 0 END) AS dueJobs,
      MIN(CASE WHEN status = 'queued' THEN run_after ELSE NULL END) AS nextRunAfter,
      MAX(updated_at) AS latestUpdatedAt
    FROM scan_queue_jobs
    WHERE ${whereSql}
    GROUP BY scan_type, target_type
    ORDER BY jobs DESC, scan_type, target_type
  `).all(nowIso, ...values)
  const recentJobs = db.prepare(`
    SELECT
      job_id AS jobId,
      queue_key AS queueKey,
      team_code AS teamCode,
      team_label AS teamLabel,
      scan_type AS scanType,
      target_type AS targetType,
      player_name AS playerName,
      player_key AS playerKey,
      release_key AS releaseKey,
      release_year AS releaseYear,
      release_name AS releaseName,
      model_key AS modelKey,
      search_mode AS searchMode,
      player_scope AS playerScope,
      priority,
      status,
      run_after AS runAfter,
      lease_owner AS leaseOwner,
      lease_expires_at AS leaseExpiresAt,
      attempts,
      max_attempts AS maxAttempts,
      last_error AS lastError,
      payload_json AS payloadJson,
      created_at AS createdAt,
      updated_at AS updatedAt,
      completed_at AS completedAt
    FROM scan_queue_jobs
    WHERE ${whereSql}
    ORDER BY
      CASE status
        WHEN 'queued' THEN 0
        WHEN 'leased' THEN 1
        WHEN 'failed' THEN 2
        WHEN 'done' THEN 3
        ELSE 4
      END,
      priority DESC,
      run_after,
      updated_at DESC
    LIMIT ?
  `).all(...values, limit)
  const countRow = db.prepare(`
    SELECT
      COUNT(*) AS totalJobs,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queuedJobs,
      SUM(CASE WHEN status = 'queued' AND run_after <= ? THEN 1 ELSE 0 END) AS dueJobs,
      SUM(CASE WHEN status = 'leased' THEN 1 ELSE 0 END) AS leasedJobs,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS doneJobs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedJobs,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledJobs,
      MIN(CASE WHEN status = 'queued' THEN run_after ELSE NULL END) AS nextRunAfter,
      MAX(updated_at) AS latestUpdatedAt
    FROM scan_queue_jobs
    WHERE ${whereSql}
  `).get(nowIso, ...values)

  return {
    available: true,
    dbName: basename(dbPath),
    filters: {
      teamCode,
      scanType,
      targetType,
      limit,
    },
    summary: {
      totalJobs: rowNumber(countRow, 'totalJobs'),
      queuedJobs: rowNumber(countRow, 'queuedJobs'),
      dueJobs: rowNumber(countRow, 'dueJobs'),
      leasedJobs: rowNumber(countRow, 'leasedJobs'),
      doneJobs: rowNumber(countRow, 'doneJobs'),
      failedJobs: rowNumber(countRow, 'failedJobs'),
      cancelledJobs: rowNumber(countRow, 'cancelledJobs'),
      nextRunAfter: rowString(countRow, 'nextRunAfter'),
      latestUpdatedAt: rowString(countRow, 'latestUpdatedAt'),
      byStatus: byStatus.map((row) => ({
        status: rowString(row, 'status'),
        jobs: rowNumber(row, 'jobs'),
        nextRunAfter: rowString(row, 'nextRunAfter'),
        latestUpdatedAt: rowString(row, 'latestUpdatedAt'),
      })),
      byScanType: byScanType.map((row) => ({
        scanType: rowString(row, 'scanType'),
        targetType: rowString(row, 'targetType'),
        jobs: rowNumber(row, 'jobs'),
        dueJobs: rowNumber(row, 'dueJobs'),
        nextRunAfter: rowString(row, 'nextRunAfter'),
        latestUpdatedAt: rowString(row, 'latestUpdatedAt'),
      })),
    },
    recentJobs: recentJobs.map(mapScanQueueJob),
  }
}

async function ensureNeonLiveMarketSchema(sql: NeonSql) {
  await sql`
    CREATE TABLE IF NOT EXISTS live_market_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL DEFAULT 1,
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
      WHERE expires_at <= ${asOf}
      RETURNING item_id
    )
    SELECT COUNT(*) AS "deletedListings" FROM deleted
  `
  const snapshotsDeleted = await sql`
    WITH deleted AS (
      DELETE FROM live_market_snapshots
      WHERE expires_at <= ${asOf}
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
        ${endTime},
        ${observedAt},
        ${listingExpiresAt},
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
      WHERE expires_at > ${nowIso}
    `
    const byType = await sql`
      SELECT scan_type AS "scanType", COUNT(*) AS "snapshotCount", COALESCE(SUM(listing_count), 0) AS "listingCount"
      FROM live_market_snapshots
      WHERE expires_at > ${nowIso}
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
      WHERE expires_at > ${nowIso}
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
    const allFreshSnapshots = params.get('snapshotScope') === 'all' || params.get('all') === '1'
    if (allFreshSnapshots) {
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
        WHERE expires_at > ${nowIso}
          AND (${scanType} = '' OR scan_type = ${scanType})
          AND (${scanKey} = '' OR scan_key = ${scanKey})
        ORDER BY observed_at DESC
        LIMIT 80
      `

      if (snapshots.length === 0) {
        return jsonResponse(200, {
          available: false,
          storage: 'neon',
          message: 'No fresh live-market snapshot is available.',
          listings: [],
        })
      }

      const listings = await sql`
        WITH ranked_live_listings AS (
          SELECT
            l.snapshot_id AS "snapshotId",
            l.item_id AS "itemId",
            l.listing_kind AS "listingKind",
            l.marketplace,
            l.marketplace_label AS "marketplaceLabel",
            l.player_name AS "playerName",
            l.title,
            l.listing_url AS "listingUrl",
            l.image_url AS "imageUrl",
            l.current_price AS "currentPrice",
            l.shipping_cost AS "shippingCost",
            l.all_in_price AS "allInPrice",
            l.model_price AS "modelPrice",
            l.fair_value AS "fairValue",
            l.edge_dollars AS "edgeDollars",
            l.expected_roi_pct AS "expectedRoiPct",
            l.action,
            l.lane,
            l.grade,
            l.variation_label AS "variationLabel",
            l.matched_variation AS "matchedVariation",
            l.valuation_source AS "valuationSource",
            l.trust_score AS "trustScore",
            l.score,
            l.bid_count AS "bidCount",
            l.listing_status AS "listingStatus",
            l.end_time::text AS "endTime",
            l.observed_at::text AS "observedAt",
            l.expires_at::text AS "expiresAt",
            l.raw_json::text AS "rawJson",
            ROW_NUMBER() OVER (
              PARTITION BY l.item_id
              ORDER BY l.observed_at DESC, l.edge_dollars DESC, l.score DESC
            ) AS row_num
          FROM live_market_listings l
          JOIN live_market_snapshots s ON s.snapshot_id = l.snapshot_id
          WHERE s.expires_at > ${nowIso}
            AND l.expires_at > ${nowIso}
            AND (${scanType} = '' OR s.scan_type = ${scanType})
            AND (${scanKey} = '' OR s.scan_key = ${scanKey})
        )
        SELECT *
        FROM ranked_live_listings
        WHERE row_num = 1
        ORDER BY "edgeDollars" DESC, score DESC
        LIMIT ${limit}
      `

      return jsonResponse(200, {
        available: true,
        storage: 'neon',
        snapshot: mapLiveMarketSnapshot(neonRow(snapshots[0])),
        snapshotCount: snapshots.length,
        listings: listings.map((row) => mapLiveMarketListing(neonRow(row))),
      })
    }

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
      WHERE expires_at > ${nowIso}
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
        AND expires_at > ${nowIso}
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
      ${observedAt},
      ${snapshotExpiresAt},
      ${listings.length},
      ${listings.filter((listing) => Number(listing.edgeDollars ?? 0) >= 0).length},
      ${jsonText(payload.request)}::jsonb,
      ${jsonText(payload.stats)}::jsonb,
      ${createdAt}
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

function compactCoveragePlayerList(value: string) {
  return [
    ...new Set(
      value
        .split(/[|\n,]+/)
        .map(compactSqlText)
        .filter(Boolean)
        .slice(0, MAX_CHECKLIST_COVERAGE_ROWS),
    ),
  ]
}

function coverageAgeDays(value: string, nowMs = Date.now()) {
  const parsed = value ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.round((nowMs - parsed) / 86_400_000))
}

function coverageLatestCheckedDays(row: SqliteRow) {
  return coverageAgeDays(rowString(row, 'lastSuccessAt') || rowString(row, 'lastAttemptAt'))
}

function coverageConfidenceTier(row: SqliteRow, staleDays: number) {
  const price = rowNumber(row, 'basePrice')
  if (price <= 0) return 'Unpriced'
  const sales = rowNumber(row, 'baseSaleCount')
  const sales30 = rowNumber(row, 'baseSales30')
  const sales90 = rowNumber(row, 'baseSales90')
  const ageDays = coverageAgeDays(rowString(row, 'latestSoldAt'))
  if (sales >= 40 && (ageDays === null || ageDays <= staleDays) && sales30 >= 3) return 'A'
  if (sales >= 15 && (ageDays === null || ageDays <= staleDays * 2) && sales90 >= 4) return 'B'
  if (sales >= 4 || sales90 > 0) return 'C'
  return 'D'
}

function coverageState(row: SqliteRow, staleDays: number, retryCooldownDays: number) {
  const price = rowNumber(row, 'basePrice')
  const saleCount = rowNumber(row, 'baseSaleCount')
  const status = rowString(row, 'queueStatus') || 'unqueued'
  const error = rowString(row, 'queueError')
  const ageDays = coverageAgeDays(rowString(row, 'latestSoldAt'))
  const stale = ageDays !== null && ageDays > staleDays
  const checkedDays = coverageLatestCheckedDays(row)
  const recentlyChecked = retryCooldownDays > 0 && status === 'done' && checkedDays !== null && checkedDays <= retryCooldownDays

  if (recentlyChecked && price > 0) return 'recently-checked'
  if (recentlyChecked) return 'recently-checked-no-lane'
  if (price > 0 && stale) return 'stale'
  if (price > 0 && saleCount > 0 && saleCount < 5) return 'thin'
  if (price > 0) return 'priced'
  if (status === 'running') return 'running'
  if (/timeout/i.test(error) || status === 'timeout') return 'timeout'
  if (status === 'error') return 'error'
  if (status === 'done') return 'no-clean-base'
  if (status === 'queued') return 'queued'
  return 'missing'
}

function coveragePriorityScore(row: SqliteRow, staleDays: number, retryCooldownDays: number) {
  const state = coverageState(row, staleDays, retryCooldownDays)
  const saleCount = rowNumber(row, 'baseSaleCount')
  const releaseYear = rowNumber(row, 'releaseYear')
  const yearSignal = Math.max(0, releaseYear - 2020) * 1.5
  const stateScore: Record<string, number> = {
    timeout: 96,
    error: 92,
    missing: 88,
    queued: 84,
    'no-clean-base': 74,
    stale: 58,
    thin: 48,
    running: 0,
    priced: 0,
    'recently-checked': 0,
    'recently-checked-no-lane': 0,
  }
  const base = stateScore[state] ?? 0
  if (base <= 0) return 0
  return Math.round(base + yearSignal + Math.min(8, saleCount / 6))
}

function coverageActionForState(state: string) {
  if (state === 'timeout' || state === 'error') return 'Retry smaller comp sync'
  if (state === 'missing' || state === 'queued') return 'Run comp sync'
  if (state === 'no-clean-base') return 'Try alternate query'
  if (state === 'stale') return 'Refresh sold comps'
  if (state === 'thin') return 'Add comp depth'
  if (state === 'running') return 'Let current sync finish'
  if (state === 'recently-checked' || state === 'recently-checked-no-lane') return 'Monitor cooldown'
  return 'Monitor'
}

function coverageReasonForState(row: SqliteRow, staleDays: number, retryCooldownDays: number) {
  const state = coverageState(row, staleDays, retryCooldownDays)
  const ageDays = coverageAgeDays(rowString(row, 'latestSoldAt'))
  const checkedDays = coverageLatestCheckedDays(row)
  if (state === 'stale' && ageDays !== null) return `Latest modeled comp is ${ageDays.toLocaleString()}d old`
  if (state === 'thin') return `${rowNumber(row, 'baseSaleCount').toLocaleString()} strict base-auto sale${rowNumber(row, 'baseSaleCount') === 1 ? '' : 's'}`
  if (state === 'timeout') return 'Previous comp search timed out'
  if (state === 'error') return rowString(row, 'queueError') || 'Previous comp search errored'
  if (state === 'no-clean-base') return 'Sales imported, but no trusted raw base-auto lane'
  if (state === 'queued') return 'Waiting in the comp refresh queue'
  if (state === 'missing') return 'No comp refresh queue row yet'
  if (state === 'running') return 'Comp refresh currently running'
  if (state === 'recently-checked' || state === 'recently-checked-no-lane') {
    return checkedDays === null ? 'Recently checked by comp sync' : `Checked ${checkedDays.toLocaleString()}d ago`
  }
  return 'Modeled price lane is usable'
}

function mapChecklistCoverageRow(row: SqliteRow, staleDays: number, retryCooldownDays: number) {
  const state = coverageState(row, staleDays, retryCooldownDays)
  const price = rowNumber(row, 'basePrice')
  const latestSoldAt = rowString(row, 'latestSoldAt') || null
  const saleCount = rowNumber(row, 'baseSaleCount')
  return {
    playerName: rowString(row, 'playerName'),
    playerKey: rowString(row, 'playerKey'),
    releaseYear: rowNumber(row, 'releaseYear'),
    releaseName: rowString(row, 'releaseName'),
    releaseKey: rowString(row, 'releaseKey'),
    team: rowString(row, 'team') || null,
    checklistRows: rowNumber(row, 'checklistRows'),
    queueStatus: rowString(row, 'queueStatus') || 'unqueued',
    queueError: rowString(row, 'queueError'),
    lastAttemptAt: rowString(row, 'lastAttemptAt') || null,
    lastSuccessAt: rowString(row, 'lastSuccessAt') || null,
    basePrice: price ? Number(price.toFixed(2)) : 0,
    baseSaleCount: saleCount,
    baseSales30: rowNumber(row, 'baseSales30'),
    baseSales90: rowNumber(row, 'baseSales90'),
    latestSoldAt,
    ageDays: latestSoldAt ? coverageAgeDays(latestSoldAt) : null,
    laneState: state,
    confidenceTier: coverageConfidenceTier(row, staleDays),
    priorityScore: coveragePriorityScore(row, staleDays, retryCooldownDays),
    action: coverageActionForState(state),
    reason: coverageReasonForState(row, staleDays, retryCooldownDays),
  }
}

function summarizeChecklistCoverage(rows: ReturnType<typeof mapChecklistCoverageRow>[]) {
  const byState = new Map<string, number>()
  const byTier = new Map<string, number>()
  const byQueue = new Map<string, number>()
  for (const row of rows) {
    byState.set(row.laneState, (byState.get(row.laneState) ?? 0) + 1)
    byTier.set(row.confidenceTier, (byTier.get(row.confidenceTier) ?? 0) + 1)
    byQueue.set(row.queueStatus, (byQueue.get(row.queueStatus) ?? 0) + 1)
  }
  const pricedPlayers = rows.filter((row) => row.basePrice > 0).length
  const stalePlayers = rows.filter((row) => row.laneState === 'stale').length
  const missingPriceLanePlayers = rows.filter((row) => row.basePrice <= 0).length
  const latestCompAt = rows
    .map((row) => (row.latestSoldAt ? Date.parse(row.latestSoldAt) : Number.NaN))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0]

  return {
    totalPlayers: rows.length,
    pricedPlayers,
    missingPriceLanePlayers,
    stalePlayers,
    thinPlayers: rows.filter((row) => row.laneState === 'thin').length,
    retryPlayers: rows.filter((row) => row.laneState === 'timeout' || row.laneState === 'error').length,
    coveragePct: rows.length ? Number(((pricedPlayers / rows.length) * 100).toFixed(1)) : 0,
    healthyPct: rows.length ? Number((((pricedPlayers - stalePlayers) / rows.length) * 100).toFixed(1)) : 0,
    latestCompAt: Number.isFinite(latestCompAt) ? new Date(latestCompAt).toISOString() : '',
    byState: [...byState.entries()].map(([state, players]) => ({ state, players })).sort((left, right) => right.players - left.players),
    byTier: [...byTier.entries()].map(([tier, players]) => ({ tier, players })).sort((left, right) => tierOrder(left.tier) - tierOrder(right.tier)),
    byQueue: [...byQueue.entries()].map(([status, players]) => ({ status, players })).sort((left, right) => right.players - left.players),
  }
}

function tierOrder(tier: string) {
  return tier === 'A' ? 0 : tier === 'B' ? 1 : tier === 'C' ? 2 : tier === 'D' ? 3 : 4
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
  const categoryOverride = Object.prototype.hasOwnProperty.call(payload, 'categoryId')
    ? String(payload.categoryId ?? '').trim()
    : undefined
  const categoryId = categoryOverride ?? String(defaultCategoryId || '').trim()
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
  const categoryOverride = Object.prototype.hasOwnProperty.call(payload, 'categoryId')
    ? String(payload.categoryId ?? '').trim()
    : undefined
  const categoryId = categoryOverride ?? String(defaultCategoryId || '').trim()
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
  const sealedWax = Boolean(payload.sealedWax)
  return (payload.queries ?? [])
    .flatMap((query) => {
      const q = String(query.q ?? '').replace(/\s+/g, ' ').trim()
      if (!q) return []
      if (q.length > MAX_EBAY_QUERY_LENGTH) throw new ProxyRequestError(400, 'eBay query is too long')
      if (sealedWax) {
        const hasTradingCardScope = /\b(?:bowman|topps|panini|pokemon|trading\s+cards?|sports\s+cards?|baseball|basketball|football|hockey|soccer)\b/i.test(q)
        const hasWaxScope = /\b(?:sealed|wax|box|boxes|case|cases|hobby|jumbo|super\s+jumbo|blaster|mega|sapphire|delight|pack|packs)\b/i.test(q)
        if (!hasTradingCardScope || !hasWaxScope) {
          throw new ProxyRequestError(400, 'Sealed wax eBay queries must be scoped to trading card boxes, packs, or cases')
        }
      } else if (!/\bbowman\b/i.test(q)) {
        throw new ProxyRequestError(400, 'eBay queries must be scoped to Bowman cards')
      }
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
  superfractorOnly?: boolean
  serialDenominator?: number
}

type FanaticsCollectSearchPayload = {
  queries?: Array<FanaticsCollectQueryMeta | string>
  scope?: {
    type?: string
    value?: string
  }
  minPrice?: number | string
  limit?: number | string
}

type FanaticsCollectSearchResult = {
  items: Array<Record<string, unknown>>
  errors: Array<{ query?: string; error: string }>
  fetchedAt: string
  stats: EbayQueryCacheStats
  provenance?: {
    mode: 'authorized-targeted-search' | 'user-scoped-search'
    scopeType: string
    scopeValue: string
  }
}

type FanaticsCollectWideScanPayload = {
  minPrice?: number | string
  pageSize?: number | string
  maxPages?: number | string
}

type FanaticsCollectAuthorizedFeedPage = {
  items?: Array<Record<string, unknown>>
  listings?: Array<Record<string, unknown>>
  data?: Array<Record<string, unknown>>
  nextCursor?: string | null
  next_cursor?: string | null
  cursor?: string | null
  hasMore?: boolean
  has_more?: boolean
  total?: number | string
  fetchedAt?: string
  observedAt?: string
}

type FanaticsCollectAuthorization = {
  authorizationId: string
  searchAuthorized: boolean
  feedAuthorized: boolean
  feedUrl: string
  feedToken: string
  imageRights: boolean
  issue?: string
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

function fanaticsCollectEnabled(value: unknown) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim())
}

function fanaticsCollectAuthorization(env: ServerEnv): FanaticsCollectAuthorization {
  const authorizationId = fanaticsCollectString(env.FANATICS_COLLECT_AUTHORIZATION_ID)
  const feedUrl = fanaticsCollectString(env.FANATICS_COLLECT_AUTHORIZED_FEED_URL)
  const feedToken = fanaticsCollectString(env.FANATICS_COLLECT_AUTHORIZED_FEED_TOKEN)
  const searchAttested = fanaticsCollectEnabled(env.FANATICS_COLLECT_SEARCH_AUTHORIZED)
  const feedAttested = fanaticsCollectEnabled(env.FANATICS_COLLECT_WIDE_SCAN_AUTHORIZED)
  const imageRights = fanaticsCollectEnabled(env.FANATICS_COLLECT_IMAGE_RIGHTS_AUTHORIZED)

  let normalizedFeedUrl = ''
  let issue = ''
  if (feedUrl) {
    try {
      const parsed = new URL(feedUrl)
      const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
      if (parsed.protocol !== 'https:' && !localHttp) {
        issue = 'The authorized Fanatics feed URL must use HTTPS (localhost HTTP is allowed for development).'
      } else {
        normalizedFeedUrl = parsed.toString()
      }
    } catch {
      issue = 'The authorized Fanatics feed URL is invalid.'
    }
  }

  if ((searchAttested || feedAttested) && !authorizationId) {
    issue = 'Set FANATICS_COLLECT_AUTHORIZATION_ID to the written permission or licensed-feed reference.'
  }

  return {
    authorizationId,
    searchAuthorized: searchAttested && Boolean(authorizationId),
    feedAuthorized: feedAttested && Boolean(authorizationId) && Boolean(normalizedFeedUrl) && !issue,
    feedUrl: normalizedFeedUrl,
    feedToken,
    imageRights,
    issue: issue || undefined,
  }
}

function fanaticsCollectUserScope(payload: FanaticsCollectSearchPayload) {
  const type = fanaticsCollectString(payload.scope?.type).toLowerCase()
  const value = fanaticsCollectString(payload.scope?.value)
  if (!['player', 'team', 'set'].includes(type)) {
    throw new ProxyRequestError(400, 'Choose a player, team, or set before searching Fanatics Collect.')
  }
  if (value.length < 2 || value.length > 80 || /[*?%]/.test(value)) {
    throw new ProxyRequestError(400, 'Enter a specific player, team, or set between 2 and 80 characters.')
  }
  return { type, value }
}

function requireFanaticsCollectSearchAuthorization(env: ServerEnv, payload: FanaticsCollectSearchPayload) {
  const authorization = fanaticsCollectAuthorization(env)
  const scope = fanaticsCollectUserScope(payload)
  return {
    authorization,
    scope,
    mode: authorization.searchAuthorized ? 'authorized-targeted-search' as const : 'user-scoped-search' as const,
  }
}

function requireFanaticsCollectFeedAuthorization(env: ServerEnv) {
  const authorization = fanaticsCollectAuthorization(env)
  if (!authorization.feedAuthorized) {
    throw new ProxyRequestError(
      503,
      authorization.issue ??
        `Fanatics Collect wide scan requires an authorized feed and written data-access permission. See ${FANATICS_COLLECT_TERMS_URL}`,
    )
  }
  return authorization
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
    superfractorOnly: Boolean(value.superfractorOnly),
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
  const searchAccess = requireFanaticsCollectSearchAuthorization(env, payload)
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
      'year',
      'productTitle',
      'categoryParent',
      'subCategory1',
      'cardNumber',
      'serial',
      'grade',
      'gradingService',
      'listedAt',
      'updatedAt',
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
    provenance: {
      mode: searchAccess.mode,
      scopeType: searchAccess.scope.type,
      scopeValue: searchAccess.scope.value,
    },
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

function fanaticsCollectWideItemIdentity(item: Record<string, unknown>) {
  return fanaticsCollectString(item.listingUuid) ||
    fanaticsCollectString(item.listing_id) ||
    fanaticsCollectString(item.listingId) ||
    fanaticsCollectString(item.objectID) ||
    fanaticsCollectString(item.id) ||
    fanaticsCollectString(item.url) ||
    fanaticsCollectString(item.listingUrl)
}

function fanaticsCollectWideItemPrice(item: Record<string, unknown>) {
  const values = [
    item.askingPrice,
    item.asking_price,
    item.buyNowPrice,
    item.buy_now_price,
    item.currentPrice,
    item.current_price,
    item.price,
  ]
  for (const value of values) {
    const parsed = fanaticsCollectNumber(value, Number.NaN)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 0
}

function fanaticsCollectWideFeedItems(page: FanaticsCollectAuthorizedFeedPage) {
  if (Array.isArray(page.items)) return page.items
  if (Array.isArray(page.listings)) return page.listings
  if (Array.isArray(page.data)) return page.data
  return []
}

function fanaticsCollectWideNextCursor(page: FanaticsCollectAuthorizedFeedPage) {
  return fanaticsCollectString(page.nextCursor) ||
    fanaticsCollectString(page.next_cursor) ||
    fanaticsCollectString(page.cursor)
}

function stripUnlicensedFanaticsImages(item: Record<string, unknown>, imageRights: boolean) {
  if (imageRights) return item
  const sanitized = { ...item }
  for (const key of ['image', 'images', 'imageSets', 'imageUrl', 'image_url', 'thumbnail', 'thumbnailUrl']) {
    delete sanitized[key]
  }
  return sanitized
}

function fanaticsCollectFeedRetryDelay(response: Response) {
  const retryAfter = response.headers.get('retry-after')
  if (!retryAfter) return 0
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds)) return Math.min(2_000, Math.max(0, seconds * 1_000))
  const dateMs = Date.parse(retryAfter)
  return Number.isFinite(dateMs) ? Math.min(2_000, Math.max(0, dateMs - Date.now())) : 0
}

async function waitForFanaticsFeedRetry(delayMs: number) {
  if (delayMs <= 0) return
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function fetchFanaticsCollectAuthorizedPage(options: {
  authorization: FanaticsCollectAuthorization
  cursor: string
  pageSize: number
  signal: AbortSignal
}) {
  const url = new URL(options.authorization.feedUrl)
  url.searchParams.set('limit', String(options.pageSize))
  url.searchParams.set('query', 'Bowman')
  url.searchParams.set('saleType', 'FIXED')
  url.searchParams.set('status', 'active')
  url.searchParams.set('category', 'baseball')
  if (options.cursor) url.searchParams.set('cursor', options.cursor)

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Backstop-Authorization-Id': options.authorization.authorizationId,
  }
  if (options.authorization.feedToken) headers.Authorization = `Bearer ${options.authorization.feedToken}`

  let upstream = await fetch(url, { method: 'GET', headers, signal: options.signal })
  if (upstream.status === 429 || upstream.status === 503) {
    await waitForFanaticsFeedRetry(fanaticsCollectFeedRetryDelay(upstream))
    upstream = await fetch(url, { method: 'GET', headers, signal: options.signal })
  }

  const payload = (await upstream.json().catch(() => null)) as FanaticsCollectAuthorizedFeedPage | { error?: string; message?: string } | null
  if (!upstream.ok || !payload || typeof payload !== 'object') {
    const message = payload && 'message' in payload
      ? fanaticsCollectString(payload.message)
      : payload && 'error' in payload
        ? fanaticsCollectString(payload.error)
        : `${upstream.status} ${upstream.statusText}`.trim()
    throw new ProxyRequestError(upstream.status || 502, `Authorized Fanatics feed failed: ${message || 'invalid response'}`)
  }
  return payload as FanaticsCollectAuthorizedFeedPage
}

async function scanAuthorizedFanaticsCollectFeed(payload: FanaticsCollectWideScanPayload, env: ServerEnv) {
  const authorization = requireFanaticsCollectFeedAuthorization(env)
  const minPrice = Math.max(0, fanaticsCollectNumber(payload.minPrice, 0))
  const pageSize = clampInt(payload.pageSize, FANATICS_COLLECT_WIDE_DEFAULT_PAGE_SIZE, 1, 1_000)
  const configuredMaxPages = clampInt(
    env.FANATICS_COLLECT_WIDE_MAX_PAGES,
    FANATICS_COLLECT_WIDE_DEFAULT_MAX_PAGES,
    1,
    FANATICS_COLLECT_WIDE_MAX_PAGES,
  )
  const maxPages = clampInt(payload.maxPages, configuredMaxPages, 1, configuredMaxPages)
  const timeBudgetMs = clampInt(
    env.FANATICS_COLLECT_WIDE_TIME_BUDGET_MS,
    FANATICS_COLLECT_WIDE_DEFAULT_TIME_BUDGET_MS,
    1_000,
    FANATICS_COLLECT_WIDE_MAX_TIME_BUDGET_MS,
  )
  const startedAt = Date.now()
  const deadline = startedAt + timeBudgetMs
  const seenCursors = new Set<string>()
  const itemsById = new Map<string, Record<string, unknown>>()
  let cursor = ''
  let pagesFetched = 0
  let upstreamTotal = 0
  let sourceFetchedAt = ''
  let stoppedReason: 'complete' | 'page-budget' | 'time-budget' | 'cursor-loop' = 'complete'

  while (pagesFetched < maxPages) {
    if (Date.now() >= deadline) {
      stoppedReason = 'time-budget'
      break
    }
    if (cursor && seenCursors.has(cursor)) {
      stoppedReason = 'cursor-loop'
      break
    }
    if (cursor) seenCursors.add(cursor)

    const remainingMs = Math.max(500, deadline - Date.now())
    const page = await fetchFanaticsCollectAuthorizedPage({
      authorization,
      cursor,
      pageSize,
      signal: AbortSignal.timeout(remainingMs),
    })
    pagesFetched += 1
    const pageItems = fanaticsCollectWideFeedItems(page)
    upstreamTotal = Math.max(upstreamTotal, fanaticsCollectNumber(page.total, 0))
    sourceFetchedAt = fanaticsCollectString(page.fetchedAt) || fanaticsCollectString(page.observedAt) || sourceFetchedAt

    for (const rawItem of pageItems) {
      const identity = fanaticsCollectWideItemIdentity(rawItem)
      if (!identity || (minPrice > 0 && fanaticsCollectWideItemPrice(rawItem) < minPrice)) continue
      itemsById.set(identity, stripUnlicensedFanaticsImages(rawItem, authorization.imageRights))
    }

    const nextCursor = fanaticsCollectWideNextCursor(page)
    const hasMore = page.hasMore ?? page.has_more ?? Boolean(nextCursor)
    if (!hasMore || !nextCursor) {
      stoppedReason = 'complete'
      cursor = ''
      break
    }
    cursor = nextCursor
  }

  if (cursor && stoppedReason === 'complete' && pagesFetched >= maxPages) stoppedReason = 'page-budget'
  const complete = stoppedReason === 'complete'
  return {
    items: [...itemsById.values()],
    errors: complete ? [] : [{ error: `Authorized Fanatics feed stopped at the ${stoppedReason.replace('-', ' ')}.` }],
    fetchedAt: sourceFetchedAt || new Date().toISOString(),
    provenance: {
      mode: 'authorized-feed',
      authorizationId: authorization.authorizationId,
      imageRights: authorization.imageRights,
    },
    coverage: {
      complete,
      stoppedReason,
      nextCursor: cursor || null,
      pageSize,
      maxPages,
      pagesFetched,
      durationMs: Date.now() - startedAt,
    },
    stats: {
      queriesRun: 1,
      queriesSucceeded: complete ? 1 : 0,
      queriesFailed: complete ? 0 : 1,
      pagesFetched,
      upstreamTotal: upstreamTotal || itemsById.size,
      dedupedItems: itemsById.size,
      cacheHits: 0,
      cacheMisses: 0,
      cacheWrites: 0,
      cacheSkips: 0,
      redisCacheHits: 0,
      runtimeCacheHits: 0,
      sqliteCacheHits: 0,
      upstreamPagesFetched: pagesFetched,
    },
  }
}

export async function handleFanaticsCollectRoute(route: string, request: Request, env: ServerEnv) {
  if (!FANATICS_COLLECT_ROUTES.has(route)) return new Response(null, { status: 404 })
  if (route === 'status' && request.method !== 'GET') return new Response(null, { status: 404 })
  if (route === 'search' && request.method !== 'POST') return new Response(null, { status: 404 })
  if (route === 'wide-scan' && request.method !== 'POST') return new Response(null, { status: 404 })

  try {
    if (route === 'search') {
      const unsafePost = rejectUnsafePost(request)
      if (unsafePost) return unsafePost
      const payload = await readJsonBody<FanaticsCollectSearchPayload>(request, MAX_EBAY_BODY_BYTES)
      const search = await searchFanaticsCollect(payload, env)
      return jsonResponse(200, search)
    }

    if (route === 'wide-scan') {
      const unsafePost = rejectUnsafePost(request)
      if (unsafePost) return unsafePost
      const payload = await readJsonBody<FanaticsCollectWideScanPayload>(request, MAX_EBAY_BODY_BYTES)
      return jsonResponse(200, await scanAuthorizedFanaticsCollectFeed(payload, env))
    }

    const authorization = fanaticsCollectAuthorization(env)
    const graphqlUrl = env.FANATICS_COLLECT_GRAPHQL_URL?.trim() || FANATICS_COLLECT_GRAPHQL_URL
    let reachable = false
    let message = authorization.issue ?? 'Fanatics Collect search requires written data-access permission.'
    {
      try {
        await fetchFanaticsCollectSearchKey(graphqlUrl)
        reachable = true
        message = authorization.searchAuthorized
          ? 'Authorized Fanatics Collect targeted search is ready.'
          : 'User-scoped Fanatics Collect search is ready.'
      } catch (error) {
        message = error instanceof Error ? error.message : 'Authorized Fanatics Collect search is unavailable.'
      }
    }

    return jsonResponse(200, {
      provider: 'fanatics-collect',
      label: 'Fanatics Collect',
      configured: reachable,
      reachable,
      mode: reachable
        ? authorization.searchAuthorized ? 'authorized-targeted-search' : 'user-scoped-search'
        : 'disabled',
      marketplaceUrl: FANATICS_COLLECT_MARKETPLACE_URL,
      termsUrl: FANATICS_COLLECT_TERMS_URL,
      authorization: {
        configured: Boolean(authorization.authorizationId),
        authorizationId: authorization.authorizationId || null,
      },
      targetedSearch: {
        configured: reachable,
        reachable,
        mode: authorization.searchAuthorized ? 'authorized-targeted-search' : 'user-scoped-search',
      },
      wideScan: {
        configured: authorization.feedAuthorized,
        mode: authorization.feedAuthorized ? 'authorized-feed' : 'disabled',
        imageRights: authorization.imageRights,
        maxPages: clampInt(
          env.FANATICS_COLLECT_WIDE_MAX_PAGES,
          FANATICS_COLLECT_WIDE_DEFAULT_MAX_PAGES,
          1,
          FANATICS_COLLECT_WIDE_MAX_PAGES,
        ),
        message: authorization.feedAuthorized
          ? 'Authorized Fanatics Collect wide feed is ready.'
          : authorization.issue ?? 'Configure a licensed/authorized Fanatics feed to enable wide scan.',
      },
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

type DaveAdamsSearchPayload = {
  query?: string
  minPrice?: number | string
  limit?: number | string
}

type DaveAdamsSearchResult = {
  items: Array<Record<string, unknown>>
  errors: Array<{ query?: string; error: string }>
  fetchedAt: string
  blocked: boolean
  sourceUrl: string
  stats: EbayQueryCacheStats & {
    queriesRun: number
    queriesSucceeded: number
    queriesFailed: number
    pagesFetched: number
    upstreamTotal: number
    dedupedItems: number
  }
}

function daveAdamsString(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function daveAdamsNumber(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,%\s,]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function daveAdamsSearchUrl(query: string) {
  return `${DAVE_ADAMS_BASE_URL}/search?Search=${encodeURIComponent(query)}`
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCharCode(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripHtml(value: string) {
  return decodeBasicHtmlEntities(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function absoluteDaveAdamsUrl(value: string) {
  try {
    return new URL(decodeBasicHtmlEntities(value), DAVE_ADAMS_BASE_URL).toString()
  } catch {
    return DAVE_ADAMS_BASE_URL
  }
}

function looksLikeDaveAdamsBlock(html: string) {
  return /just a moment|cf_chl|challenges\.cloudflare\.com|enable javascript and cookies|checking your browser/i.test(html)
}

function daveAdamsPriceFrom(value: string) {
  const match = value.match(/\$\s*([0-9][0-9,]*(?:\.\d{2})?)/)
  return match ? daveAdamsNumber(match[1], 0) : 0
}

function daveAdamsImageFrom(value: string) {
  const match = value.match(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i)
  return match?.[1] ? absoluteDaveAdamsUrl(match[1]) : ''
}

function daveAdamsTitleFrom(anchorHtml: string, fallback: string) {
  const explicitTitle = anchorHtml.match(/\btitle=["']([^"']+)["']/i)?.[1]
  const imageAlt = anchorHtml.match(/\balt=["']([^"']+)["']/i)?.[1]
  return stripHtml(explicitTitle || imageAlt || anchorHtml || fallback)
}

function dedupeDaveAdamsItems(items: Array<Record<string, unknown>>) {
  const seen = new Set<string>()
  const deduped: Array<Record<string, unknown>> = []
  for (const item of items) {
    const key = daveAdamsString(item.listingUrl) || daveAdamsString(item.title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

function parseDaveAdamsJsonLdProducts(html: string, sourceUrl: string) {
  const items: Array<Record<string, unknown>> = []
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const script of scripts) {
    const parsed = parseJsonText(decodeBasicHtmlEntities(script[1] ?? ''), null) as unknown
    const nodes = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['@graph'])
        ? ((parsed as Record<string, unknown>)['@graph'] as unknown[])
        : parsed
          ? [parsed]
          : []
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      const record = node as Record<string, unknown>
      const type = String(record['@type'] ?? '').toLowerCase()
      if (!type.includes('product')) continue
      const title = daveAdamsString(record.name)
      const offers = record.offers && typeof record.offers === 'object' ? (record.offers as Record<string, unknown>) : {}
      const price = daveAdamsNumber(offers.price, 0) || daveAdamsNumber(record.price, 0)
      if (!title || price <= 0) continue
      items.push({
        id: sha256(`${title}:${price}:${daveAdamsString(record.url)}`).slice(0, 18),
        title,
        listingUrl: absoluteDaveAdamsUrl(daveAdamsString(record.url, sourceUrl)),
        imageUrl: Array.isArray(record.image)
          ? absoluteDaveAdamsUrl(daveAdamsString(record.image[0]))
          : absoluteDaveAdamsUrl(daveAdamsString(record.image)),
        price,
        shipping: 0,
        allIn: price,
        availability: daveAdamsString(offers.availability),
        sourceUrl,
      })
    }
  }
  return items
}

function parseDaveAdamsSearchHtml(html: string, sourceUrl: string, minPrice: number, limit: number) {
  const items = parseDaveAdamsJsonLdProducts(html, sourceUrl)
  const anchorMatches = html.matchAll(/<a\b([^>]*href=["'][^"']*(?:\/sports-cards\/|\/gaming-cards\/|\/entertainment-cards\/)[^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi)
  for (const match of anchorMatches) {
    const attributes = match[1] ?? ''
    const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1]
    if (!href) continue
    const listingUrl = absoluteDaveAdamsUrl(href)
    const anchorHtml = `${attributes}${match[2] ?? ''}`
    const title = daveAdamsTitleFrom(anchorHtml, '')
    if (!title || title.length < 8 || /view details|add to cart|wishlist/i.test(title)) continue
    const context = html.slice(Math.max(0, (match.index ?? 0) - 900), Math.min(html.length, (match.index ?? 0) + 2400))
    const price = daveAdamsPriceFrom(context)
    if (price <= 0) continue
    items.push({
      id: sha256(`${listingUrl}:${title}`).slice(0, 18),
      title,
      listingUrl,
      imageUrl: daveAdamsImageFrom(context),
      price,
      shipping: 0,
      allIn: price,
      availability: /out of stock|sold out/i.test(context) ? 'out-of-stock' : 'available',
      sourceUrl,
    })
  }

  return dedupeDaveAdamsItems(items)
    .filter((item) => daveAdamsNumber(item.price, 0) >= minPrice)
    .slice(0, limit)
}

async function fetchDaveAdamsHtml(sourceUrl: string) {
  const upstream = await fetch(sourceUrl, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'BackstopCardFinder/1.0 (+https://backstopcards.com; sealed wax market research)',
    },
    signal: AbortSignal.timeout(10_000),
  })
  const html = await upstream.text()
  return { html, status: upstream.status, statusText: upstream.statusText }
}

async function searchDaveAdams(payload: DaveAdamsSearchPayload, env: ServerEnv): Promise<DaveAdamsSearchResult> {
  const query = daveAdamsString(payload.query).replace(/\s+/g, ' ').slice(0, MAX_EBAY_QUERY_LENGTH)
  if (query.length < 3) throw new ProxyRequestError(400, 'Enter a Dave & Adams product search')
  const minPrice = Math.max(0, daveAdamsNumber(payload.minPrice, 0))
  const limit = clampInt(payload.limit, 40, 1, 80)
  const sourceUrl = daveAdamsSearchUrl(query)
  const redis = await getUpstashRedis(env)
  const cacheTtlSeconds = clampInt(
    env.DAVE_ADAMS_QUERY_CACHE_TTL_SECONDS,
    DAVE_ADAMS_QUERY_CACHE_TTL_SECONDS,
    0,
    24 * 60 * 60,
  )
  const cacheKey =
    redis && cacheTtlSeconds > 0
      ? redisQueryCacheKey(DAVE_ADAMS_QUERY_CACHE_NAMESPACE, sha256(stableJson({ query, minPrice, limit, version: 1 })))
      : ''

  if (redis && cacheKey) {
    try {
      const cached = await redis.get<string>(cacheKey)
      const parsed =
        typeof cached === 'string'
          ? (parseJsonText(cached, null) as Partial<DaveAdamsSearchResult> | null)
          : ((cached ?? null) as Partial<DaveAdamsSearchResult> | null)
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items) && parsed.stats) {
        const cachedPayload = parsed as DaveAdamsSearchResult
        return {
          ...cachedPayload,
          stats: {
            ...cachedPayload.stats,
            cacheHits: Math.max(1, cachedPayload.stats.cacheHits ?? 0),
            redisCacheHits: Math.max(1, cachedPayload.stats.redisCacheHits ?? 0),
            upstreamPagesFetched: 0,
          },
        }
      }
    } catch {
      // A cache miss should not block a fresh storefront read.
    }
  }

  const { html, status, statusText } = await fetchDaveAdamsHtml(sourceUrl)
  if (looksLikeDaveAdamsBlock(html)) {
    throw new ProxyRequestError(
      502,
      'Dave & Adams is blocking automated public reads right now. Use the D&A quote paste fallback or connect an approved product feed.',
    )
  }
  if (status >= 400) throw new ProxyRequestError(status, `Dave & Adams returned ${status} ${statusText}`.trim())

  const items = parseDaveAdamsSearchHtml(html, sourceUrl, minPrice, limit)
  const response: DaveAdamsSearchResult = {
    items,
    errors: [],
    fetchedAt: new Date().toISOString(),
    blocked: false,
    sourceUrl,
    stats: {
      ...emptyEbayQueryCacheStats(),
      queriesRun: 1,
      queriesSucceeded: 1,
      queriesFailed: 0,
      pagesFetched: 1,
      upstreamTotal: items.length,
      dedupedItems: items.length,
      upstreamPagesFetched: 1,
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

export async function handleDaveAdamsRoute(route: string, request: Request, env: ServerEnv) {
  if (!DAVE_ADAMS_ROUTES.has(route)) return new Response(null, { status: 404 })
  if (route === 'status' && request.method !== 'GET') return new Response(null, { status: 404 })
  if (route === 'search' && request.method !== 'POST') return new Response(null, { status: 404 })

  try {
    if (route === 'search') {
      const unsafePost = rejectUnsafePost(request)
      if (unsafePost) return unsafePost
      const payload = await readJsonBody<DaveAdamsSearchPayload>(request, MAX_EBAY_BODY_BYTES)
      const search = await searchDaveAdams(payload, env)
      return jsonResponse(200, search)
    }

    const probeUrl = daveAdamsSearchUrl('2026 Bowman Baseball Hobby Box')
    let reachable = false
    let blocked = false
    let message = 'Dave & Adams public search is ready.'
    try {
      const { html, status, statusText } = await fetchDaveAdamsHtml(probeUrl)
      blocked = looksLikeDaveAdamsBlock(html)
      reachable = status < 400 && !blocked
      if (blocked) {
        message = 'Dave & Adams public storefront is blocking automated reads; quote paste fallback is available.'
      } else if (!reachable) {
        message = `Dave & Adams returned ${status} ${statusText}`.trim()
      }
    } catch (error) {
      message = error instanceof Error ? error.message : 'Dave & Adams public search is unavailable.'
    }

    return jsonResponse(200, {
      provider: 'dave-adams',
      label: 'Dave & Adams',
      configured: true,
      reachable,
      blocked,
      mode: reachable ? 'public-html-search' : 'quote-paste-fallback',
      searchUrl: probeUrl,
      message,
    })
  } catch (error) {
    console.warn('[dave-adams] route failed', {
      route,
      status: routeErrorStatus(error),
      error: routeErrorMessage(error, 'Dave & Adams request failed'),
    })
    return jsonResponse(routeErrorStatus(error), {
      error: routeErrorMessage(error, 'Dave & Adams request failed'),
    })
  }
}

export async function handleCardHedgeRoute(route: string, request: Request, env: ServerEnv) {
  if (!CARD_HEDGE_ROUTES.has(route)) return new Response(null, { status: 404 })

  let db: SqliteDatabase | null = null
  let redis: RedisClient | null = null
  try {
    const configured = Boolean(env.CARD_HEDGE_API_KEY)
    const plan = String(env.CARD_HEDGE_PLAN ?? '').trim().toLowerCase()
    const eliteAccessExpected = /^(elite|enterprise)$/i.test(plan)

    if (route === 'status') {
      if (request.method !== 'GET') return new Response(null, { status: 404 })
      const opened = await openOptionalWritableMarketDb(env)
      db = opened.db
      let usageTracking = false
      let usageBackend = 'none'
      let usagePayload = cardHedgeUsageFallback(env)
      if (db) {
        try {
          ensureCardHedgeUsageSchema(db)
          usagePayload = cardHedgeUsagePayload(db, env)
          usageTracking = true
          usageBackend = 'sqlite'
        } catch {
          db.close()
          db = null
        }
      }
      if (!db) {
        redis = await getUpstashRedis(env)
        if (redis) {
          try {
            usagePayload = await cardHedgeRedisUsagePayload(redis, env)
            usageTracking = true
            usageBackend = 'redis'
          } catch {
            usagePayload = cardHedgeUsageFallback(env)
            usageTracking = false
            usageBackend = 'none'
          }
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
        usageBackend,
        ...usagePayload,
        endpoints: {
          refresh: '/api/card-hedge/refresh',
          search: '/api/card-hedge/search',
          match: '/api/card-hedge/match',
          comps: '/api/card-hedge/comps',
          allPrices: '/api/card-hedge/all-prices',
          pricesByCard: '/api/card-hedge/prices-by-card',
          priceUpdates: '/api/card-hedge/price-updates',
          salesStatsByPlayer: '/api/card-hedge/sales-stats-by-player',
          totalSalesByPlayer: '/api/card-hedge/total-sales-by-player',
          subscribePriceUpdates: '/api/card-hedge/subscribe-price-updates',
          priceEstimate: '/api/card-hedge/price-estimate',
          batchPriceEstimate: '/api/card-hedge/batch-price-estimate',
          cardFmvBatch: '/api/card-hedge/card-fmv-batch',
          dailyExport: '/api/card-hedge/daily-export?date=YYYY-MM-DD',
        },
        message: configured ? 'Card Hedge API configured' : 'Set CARD_HEDGE_API_KEY in environment variables',
      })
    }

    const opened = await openOptionalWritableMarketDb(env)
    db = opened.db
    let usageBackend = 'none'
    if (db) {
      try {
        ensureCardHedgeUsageSchema(db)
        usageBackend = 'sqlite'
      } catch {
        db.close()
        db = null
      }
    }
    if (!db) {
      redis = await getUpstashRedis(env)
      usageBackend = redis ? 'redis' : 'none'
    }

    if (!configured) return jsonResponse(401, { error: 'Set CARD_HEDGE_API_KEY in environment variables' })

    const rateLimit = db ? cardHedgeRateLimitError(db, env) : redis ? await cardHedgeRedisRateLimitError(redis, env) : null
    if (rateLimit) return jsonResponse(rateLimit.status, rateLimit.payload)

    const recordCall = async (routeName: string, endpointName: string, statusCode: number) => {
      if (db) {
        recordCardHedgeCall(db, routeName, endpointName, statusCode)
      } else if (redis) {
        await recordCardHedgeRedisCall(redis, routeName, endpointName, statusCode)
      }
    }

    if (route === 'refresh') {
      let targetedRefresh: { playerName: string; releaseYear: number } | null = null
      if (request.method === 'GET') {
        const secret = env.CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || ''
        const authHeader = request.headers.get('authorization')
        if (!secret || authHeader !== `Bearer ${secret}`) return jsonResponse(401, { error: 'Unauthorized Card Hedge refresh' })
      } else if (request.method === 'POST') {
        const unsafePost = rejectUnsafePost(request)
        if (unsafePost) return unsafePost
        const payload = await readJsonBody<{ playerName?: unknown; releaseYear?: unknown }>(request)
        const playerName = String(payload.playerName ?? '').replace(/\s+/g, ' ').trim()
        const releaseYear = Number(payload.releaseYear ?? 0)
        if (playerName || releaseYear) {
          if (!playerName || !Number.isInteger(releaseYear)) {
            return jsonResponse(400, { error: 'Targeted comp refresh requires playerName and releaseYear' })
          }
          targetedRefresh = { playerName, releaseYear }
        }
      } else {
        return new Response(null, { status: 404 })
      }

      const neonSql = await getNeonSql(env)
      if (neonSql) {
        if (targetedRefresh) {
          await queueHostedCompPlayer(neonSql as HostedCompSql, targetedRefresh.playerName, targetedRefresh.releaseYear)
        }
        const usagePayload = db
          ? cardHedgeUsagePayload(db, env)
          : redis
            ? await cardHedgeRedisUsagePayload(redis, env)
            : cardHedgeUsageFallback(env)
        const availableMinute = Math.max(0, usagePayload.usage.remainingMinute)
        const availableDay = Math.max(0, usagePayload.usage.remainingDay)
        const configuredMaxCalls = Math.max(1, Number(env.CARD_HEDGE_REFRESH_MAX_CALLS ?? 0) || Math.floor(usagePayload.limits.perMinute * 0.8))
        const callBudget = Math.max(0, Math.min(configuredMaxCalls, availableMinute, availableDay))
        if (callBudget < 2) {
          if (targetedRefresh) {
            return jsonResponse(202, {
              ok: true,
              mode: 'hosted-comp-queued',
              target: targetedRefresh,
              runId: '',
              durationMs: 0,
              claimedPlayers: 0,
              completedPlayers: 0,
              matchedPlayers: 0,
              missingPlayers: 0,
              failedPlayers: 0,
              compSalesUpserted: 0,
              fmvCardsRefreshed: 0,
              apiCalls: 0,
              message: 'Comp refresh queued until API capacity is available.',
              usageBackend,
              limits: usagePayload.limits,
              usage: usagePayload.usage,
            })
          }
          return jsonResponse(429, {
            error: 'Card Hedge refresh budget is temporarily exhausted.',
            usageBackend,
            limits: usagePayload.limits,
            usage: usagePayload.usage,
          })
        }

        const desiredPlayers = targetedRefresh
          ? 1
          : Math.max(0, Math.min(250, Number(env.CARD_HEDGE_REFRESH_MAX_PLAYERS ?? 180) || 180))
        const reservedExportCalls = !targetedRefresh && eliteAccessExpected ? 1 : 0
        const reservedFmvCalls = targetedRefresh
          ? 0
          : Math.max(1, Math.min(20, Math.floor((callBudget - reservedExportCalls) * 0.2)))
        const taskCallBudget = Math.max(0, callBudget - reservedExportCalls - reservedFmvCalls)
        const maxPlayers = Math.max(0, Math.min(desiredPlayers, taskCallBudget))
        const maxFmvCards = Math.max(0, Math.min(2_000, reservedFmvCalls * 100))
        const minimumDelayMs = Math.ceil(60_000 / Math.max(1, usagePayload.limits.perMinute))
        let nextCallAt = 0
        let callStartQueue = Promise.resolve()

        const waitForCallSlot = async () => {
          const scheduled = callStartQueue.then(async () => {
            const delay = Math.max(0, nextCallAt - Date.now())
            if (delay) await wait(delay)
            nextCallAt = Date.now() + minimumDelayMs
          })
          callStartQueue = scheduled.catch(() => undefined)
          await scheduled
        }

        const requestCardHedge = async (endpoint: string, payload: Record<string, unknown>) => {
          await waitForCallSlot()
          const upstream = await fetch(`${CARD_HEDGE_API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-API-Key': env.CARD_HEDGE_API_KEY ?? '',
              'User-Agent': 'Backstop Card Finder hosted comp refresh',
            },
            body: JSON.stringify(payload),
          })
          const text = await upstream.text()
          await recordCall(route, endpoint, upstream.status)
          const parsed = parseJsonText(text, null)
          if (!upstream.ok) {
            const message =
              parsed && typeof parsed === 'object' && 'error' in parsed
                ? String((parsed as { error?: unknown }).error ?? '')
                : text.slice(0, 500)
            throw new ProxyRequestError(upstream.status, message || `Card Hedge ${endpoint} failed`)
          }
          return parsed
        }

        const fetchDailyExport = !targetedRefresh && eliteAccessExpected
          ? async (date: string) => {
              const endpoint = `/v1/download/daily-price-export/${date}`
              const upstream = await fetch(`${CARD_HEDGE_API_BASE}${endpoint}`, {
                headers: {
                  Accept: 'text/csv, application/json',
                  'X-API-Key': env.CARD_HEDGE_API_KEY ?? '',
                  'User-Agent': 'Backstop Card Finder hosted daily export',
                },
              })
              const text = await upstream.text()
              await recordCall(route, endpoint, upstream.status)
              if (!upstream.ok) throw new ProxyRequestError(upstream.status, text.slice(0, 500) || 'Card Hedge daily export failed')
              return text
            }
          : undefined

        const result = await runHostedCompRefresh({
          sql: neonSql as HostedCompSql,
          requestCardHedge,
          fetchDailyExport,
          maxPlayers,
          maxTaskApiCalls: taskCallBudget,
          maxFmvCards,
          timeBudgetMs: targetedRefresh
            ? Math.max(15_000, Number(env.CARD_HEDGE_TARGET_REFRESH_TIME_BUDGET_MS ?? 35_000) || 35_000)
            : Math.min(108_000, Math.max(30_000, Number(env.CARD_HEDGE_REFRESH_TIME_BUDGET_MS ?? 96_000) || 96_000)),
        })
        const status = await hostedCompStatusPayload(neonSql as HostedCompSql)
        return jsonResponse(result.ok ? 200 : 502, {
          ...result,
          mode: 'hosted-comp-refresh',
          usageBackend,
          callBudget,
          maxPlayers,
          maxFmvCards,
          reservedExportCalls,
          target: targetedRefresh,
          hosted: status.hosted,
        })
      }

      const endpoint = cardHedgeEndpoint('price-updates')
      const checkpointKey = cardHedgeRefreshCheckpointKey()
      const since = (redis ? await redis.get<string>(checkpointKey).catch(() => null) : null) || cardHedgeRefreshFallbackSince()
      const upstream = await fetch(`${CARD_HEDGE_API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-Key': env.CARD_HEDGE_API_KEY ?? '',
        },
        body: JSON.stringify({ since }),
      })
      const text = await upstream.text()
      await recordCall(route, endpoint, upstream.status)
      const payload = parseJsonText(text, null) as { updates?: Array<{ update_timestamp?: string }>; count?: number; error?: string } | null
      const updates = Array.isArray(payload?.updates) ? payload.updates : []
      const latestUpdate = updates
        .map((update) => String(update.update_timestamp ?? ''))
        .filter(Boolean)
        .sort()
        .slice(-1)[0]
      const nextCheckpoint = upstream.ok ? latestUpdate || new Date().toISOString() : ''
      if (redis && nextCheckpoint) await redis.set(checkpointKey, nextCheckpoint, { ex: 90 * 24 * 60 * 60 })

      return jsonResponse(upstream.status, {
        ok: upstream.ok,
        mode: 'price-updates-fallback',
        usageBackend,
        since,
        nextCheckpoint,
        count: Number(payload?.count ?? updates.length ?? 0),
        payload,
      })
    }

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
      await recordCall(route, endpoint, upstream.status)
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
    await recordCall(route, endpoint, upstream.status)
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
      const allFreshSnapshots = params.get('snapshotScope') === 'all' || params.get('all') === '1'
      if (allFreshSnapshots) {
        const snapshots = db.prepare(`
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
          LIMIT 80
        `).all(nowIso, scanType, scanType, scanKey, scanKey)

        if (snapshots.length === 0) {
          return jsonResponse(200, {
            available: false,
            message: 'No fresh live-market snapshot is available.',
            listings: [],
          })
        }

        const listings = db.prepare(`
          WITH ranked_live_listings AS (
            SELECT
              l.snapshot_id AS snapshotId,
              l.item_id AS itemId,
              l.listing_kind AS listingKind,
              l.marketplace,
              l.marketplace_label AS marketplaceLabel,
              l.player_name AS playerName,
              l.title,
              l.listing_url AS listingUrl,
              l.image_url AS imageUrl,
              l.current_price AS currentPrice,
              l.shipping_cost AS shippingCost,
              l.all_in_price AS allInPrice,
              l.model_price AS modelPrice,
              l.fair_value AS fairValue,
              l.edge_dollars AS edgeDollars,
              l.expected_roi_pct AS expectedRoiPct,
              l.action,
              l.lane,
              l.grade,
              l.variation_label AS variationLabel,
              l.matched_variation AS matchedVariation,
              l.valuation_source AS valuationSource,
              l.trust_score AS trustScore,
              l.score,
              l.bid_count AS bidCount,
              l.listing_status AS listingStatus,
              l.end_time AS endTime,
              l.observed_at AS observedAt,
              l.expires_at AS expiresAt,
              l.raw_json AS rawJson,
              ROW_NUMBER() OVER (
                PARTITION BY l.item_id
                ORDER BY l.observed_at DESC, l.edge_dollars DESC, l.score DESC
              ) AS rowNum
            FROM live_market_listings l
            JOIN live_market_snapshots s ON s.snapshot_id = l.snapshot_id
            WHERE s.expires_at > ?
              AND l.expires_at > ?
              AND (? = '' OR s.scan_type = ?)
              AND (? = '' OR s.scan_key = ?)
          )
          SELECT *
          FROM ranked_live_listings
          WHERE rowNum = 1
          ORDER BY edgeDollars DESC, score DESC
          LIMIT ?
        `).all(nowIso, nowIso, scanType, scanType, scanKey, scanKey, limit)

        return jsonResponse(200, {
          available: true,
          snapshot: mapLiveMarketSnapshot(snapshots[0]),
          snapshotCount: snapshots.length,
          listings: listings.map(mapLiveMarketListing),
        })
      }

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

export async function handleScanCoverageRoute(route: string, request: Request, env: ServerEnv) {
  if (!SCAN_COVERAGE_ROUTES.has(route)) return new Response(null, { status: 404 })
  if (route === 'run' && request.method !== 'POST') return new Response(null, { status: 404 })
  if (route === 'status' && request.method !== 'GET') return new Response(null, { status: 404 })

  let db: SqliteDatabase | null = null
  try {
    if (route === 'run') {
      const unsafePost = rejectUnsafePost(request)
      if (unsafePost) return unsafePost
    }

    const opened = route === 'run' ? await openOptionalWritableMarketDb(env) : await openSalesCacheDb(env)
    db = opened.db
    if (!db) {
      return jsonResponse(200, {
        available: false,
        dbName: basename(opened.dbPath),
        message: 'Scan coverage ledger is unavailable until the local market database exists.',
        summary: {
          totalTargets: 0,
          scannedTargets: 0,
          liveHitTargets: 0,
          opportunityTargets: 0,
          noHitTargets: 0,
          failedTargets: 0,
          listingCount: 0,
          opportunityCount: 0,
          latestObservedAt: '',
          byStatus: [],
          byScanType: [],
        },
        latestRuns: [],
        targets: [],
      })
    }

    ensureScanCoverageSchema(db)

    if (route === 'run') {
      const payload = await readJsonBody<ScanCoverageRunPayload>(request, MAX_JSON_BODY_BYTES)
      const saved = insertScanCoverageRun(db, payload)
      return jsonResponse(200, saved)
    }

    const params = new URL(request.url).searchParams
    const teamCode = compactScanCoverageText(params.get('team') ?? params.get('teamCode'), 20).toUpperCase()
    const scanType = compactScanCoverageText(params.get('scanType'), 40).toLowerCase()
    const targetType = compactScanCoverageText(params.get('targetType'), 60).toLowerCase()
    const limit = clampInt(params.get('limit'), 240, 1, MAX_SCAN_COVERAGE_STATUS_ROWS)

    const filters = ['1 = 1']
    const values: Array<string | number> = []
    if (teamCode) {
      filters.push('UPPER(r.team_code) = ?')
      values.push(teamCode)
    }
    if (scanType) {
      filters.push('r.scan_type = ?')
      values.push(scanType)
    }
    if (targetType) {
      filters.push('t.target_type = ?')
      values.push(targetType)
    }
    const whereSql = filters.join(' AND ')
    const runFilters = ['1 = 1']
    const runValues: Array<string | number> = []
    if (teamCode) {
      runFilters.push('UPPER(r.team_code) = ?')
      runValues.push(teamCode)
    }
    if (scanType) {
      runFilters.push('r.scan_type = ?')
      runValues.push(scanType)
    }

    const targets = db.prepare(`
      WITH ranked_targets AS (
        SELECT
          r.run_id AS runId,
          r.scan_type AS scanType,
          r.scan_key AS scanKey,
          t.target_key AS targetKey,
          t.player_name AS playerName,
          t.player_key AS playerKey,
          t.release_key AS releaseKey,
          t.release_year AS releaseYear,
          t.release_name AS releaseName,
          t.model_key AS modelKey,
          t.team_code AS teamCode,
          t.target_type AS targetType,
          t.status AS targetStatus,
          t.listing_count AS listingCount,
          t.opportunity_count AS opportunityCount,
          t.best_edge_dollars AS bestEdgeDollars,
          t.best_score AS bestScore,
          t.marketplaces_json AS marketplacesJson,
          t.error,
          t.observed_at AS observedAt,
          ROW_NUMBER() OVER (
            PARTITION BY r.scan_type, t.target_key
            ORDER BY t.observed_at DESC, r.created_at DESC
          ) AS rowNum
        FROM scan_coverage_targets t
        JOIN scan_coverage_runs r ON r.run_id = t.run_id
        WHERE ${whereSql}
      )
      SELECT *
      FROM ranked_targets
      WHERE rowNum = 1
      ORDER BY
        CASE targetStatus
          WHEN 'live_opportunity' THEN 0
          WHEN 'live_hits' THEN 1
          WHEN 'failed' THEN 2
          WHEN 'scanned_no_hits' THEN 3
          ELSE 4
        END,
        observedAt DESC,
        playerName
      LIMIT ?
    `).all(...values, limit)

    const byStatus = db.prepare(`
      WITH ranked_targets AS (
        SELECT
          r.scan_type,
          t.target_key,
          t.status,
          t.listing_count,
          t.opportunity_count,
          t.observed_at,
          ROW_NUMBER() OVER (
            PARTITION BY r.scan_type, t.target_key
            ORDER BY t.observed_at DESC, r.created_at DESC
          ) AS rowNum
        FROM scan_coverage_targets t
        JOIN scan_coverage_runs r ON r.run_id = t.run_id
        WHERE ${whereSql}
      )
      SELECT
        status,
        COUNT(*) AS targets,
        COALESCE(SUM(listing_count), 0) AS listingCount,
        COALESCE(SUM(opportunity_count), 0) AS opportunityCount,
        MAX(observed_at) AS latestObservedAt
      FROM ranked_targets
      WHERE rowNum = 1
      GROUP BY status
      ORDER BY targets DESC, status
    `).all(...values)

    const byScanType = db.prepare(`
      WITH ranked_targets AS (
        SELECT
          r.scan_type,
          t.target_key,
          t.status,
          t.listing_count,
          t.opportunity_count,
          t.observed_at,
          ROW_NUMBER() OVER (
            PARTITION BY r.scan_type, t.target_key
            ORDER BY t.observed_at DESC, r.created_at DESC
          ) AS rowNum
        FROM scan_coverage_targets t
        JOIN scan_coverage_runs r ON r.run_id = t.run_id
        WHERE ${whereSql}
      )
      SELECT
        scan_type AS scanType,
        COUNT(*) AS targets,
        COALESCE(SUM(listing_count), 0) AS listingCount,
        COALESCE(SUM(opportunity_count), 0) AS opportunityCount,
        MAX(observed_at) AS latestObservedAt
      FROM ranked_targets
      WHERE rowNum = 1
      GROUP BY scan_type
      ORDER BY scan_type
    `).all(...values)

    const latestRuns = db.prepare(`
      SELECT
        run_id AS runId,
        scan_type AS scanType,
        scan_key AS scanKey,
        team_code AS teamCode,
        team_label AS teamLabel,
        target_type AS targetType,
        search_mode AS searchMode,
        player_scope AS playerScope,
        release_scope AS releaseScope,
        status,
        observed_at AS observedAt,
        target_count AS targetCount,
        listing_count AS listingCount,
        opportunity_count AS opportunityCount,
        queries_run AS queriesRun,
        queries_succeeded AS queriesSucceeded,
        queries_failed AS queriesFailed,
        marketplaces_json AS marketplacesJson,
        created_at AS createdAt
      FROM scan_coverage_runs r
      WHERE ${runFilters.join(' AND ')}
      ORDER BY observed_at DESC, created_at DESC
      LIMIT 20
    `).all(...runValues)

    const totalTargets = byStatus.reduce((total, row) => total + rowNumber(row, 'targets'), 0)
    const listingCount = byStatus.reduce((total, row) => total + rowNumber(row, 'listingCount'), 0)
    const opportunityCount = byStatus.reduce((total, row) => total + rowNumber(row, 'opportunityCount'), 0)
    const latestObservedAt = byStatus
      .map((row) => Date.parse(rowString(row, 'latestObservedAt')))
      .filter(Number.isFinite)
      .sort((left, right) => right - left)[0]

    return jsonResponse(200, {
      available: true,
      dbName: basename(opened.dbPath),
      filters: {
        teamCode,
        scanType,
        targetType,
        limit,
      },
      summary: {
        totalTargets,
        scannedTargets: totalTargets - (byStatus.find((row) => rowString(row, 'status') === 'not_scanned') ? rowNumber(byStatus.find((row) => rowString(row, 'status') === 'not_scanned'), 'targets') : 0),
        liveHitTargets: byStatus
          .filter((row) => rowString(row, 'status') === 'live_hits' || rowString(row, 'status') === 'live_opportunity')
          .reduce((total, row) => total + rowNumber(row, 'targets'), 0),
        opportunityTargets: byStatus
          .filter((row) => rowString(row, 'status') === 'live_opportunity')
          .reduce((total, row) => total + rowNumber(row, 'targets'), 0),
        noHitTargets: byStatus
          .filter((row) => rowString(row, 'status') === 'scanned_no_hits')
          .reduce((total, row) => total + rowNumber(row, 'targets'), 0),
        failedTargets: byStatus
          .filter((row) => rowString(row, 'status') === 'failed')
          .reduce((total, row) => total + rowNumber(row, 'targets'), 0),
        listingCount,
        opportunityCount,
        latestObservedAt: Number.isFinite(latestObservedAt) ? new Date(latestObservedAt).toISOString() : '',
        byStatus: byStatus.map((row) => ({
          status: rowString(row, 'status'),
          targets: rowNumber(row, 'targets'),
          listingCount: rowNumber(row, 'listingCount'),
          opportunityCount: rowNumber(row, 'opportunityCount'),
          latestObservedAt: rowString(row, 'latestObservedAt'),
        })),
        byScanType: byScanType.map((row) => ({
          scanType: rowString(row, 'scanType'),
          targets: rowNumber(row, 'targets'),
          listingCount: rowNumber(row, 'listingCount'),
          opportunityCount: rowNumber(row, 'opportunityCount'),
          latestObservedAt: rowString(row, 'latestObservedAt'),
        })),
      },
      latestRuns: latestRuns.map(mapScanCoverageRun),
      targets: targets.map(mapScanCoverageTarget),
    })
  } catch (error) {
    return jsonResponse(routeErrorStatus(error), { error: routeErrorMessage(error, 'Scan coverage request failed') })
  } finally {
    db?.close()
  }
}

function scanQueueWorkerAuth(request: Request, env: ServerEnv) {
  const secret = env.SCAN_QUEUE_SECRET || env.CRON_SECRET
  if (!secret) return null
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return jsonResponse(401, { error: 'Unauthorized scan queue worker' })
  }
  return null
}

function emptyScanQueueStatus(dbPath: string) {
  return {
    available: false,
    dbName: basename(dbPath),
    message: 'Scan queue is unavailable until the local market database exists.',
    summary: {
      totalJobs: 0,
      queuedJobs: 0,
      dueJobs: 0,
      leasedJobs: 0,
      doneJobs: 0,
      failedJobs: 0,
      cancelledJobs: 0,
      nextRunAfter: '',
      latestUpdatedAt: '',
      byStatus: [],
      byScanType: [],
    },
    recentJobs: [],
  }
}

export async function handleScanQueueRoute(route: string, request: Request, env: ServerEnv) {
  if (!SCAN_QUEUE_ROUTES.has(route)) return new Response(null, { status: 404 })
  if (route === 'status' && request.method !== 'GET') return new Response(null, { status: 404 })
  if (route === 'cron' && request.method !== 'GET') return new Response(null, { status: 404 })
  if ((route === 'schedule' || route === 'claim' || route === 'complete') && request.method !== 'POST') {
    return new Response(null, { status: 404 })
  }

  let db: SqliteDatabase | null = null
  try {
    if (route === 'schedule' || route === 'claim' || route === 'complete') {
      const unsafePost = rejectUnsafePost(request)
      if (unsafePost) return unsafePost
    }
    if (route === 'claim' || route === 'complete') {
      const unauthorized = scanQueueWorkerAuth(request, env)
      if (unauthorized) return unauthorized
    }
    if (route === 'cron') {
      const secret = env.CRON_SECRET
      if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return jsonResponse(401, { error: 'Unauthorized scan queue maintenance' })
      }
    }

    const opened = route === 'status' ? await openSalesCacheDb(env) : await openOptionalWritableMarketDb(env)
    db = opened.db
    if (!db) return jsonResponse(200, emptyScanQueueStatus(opened.dbPath))

    if (route === 'status') {
      return jsonResponse(200, scanQueueStatusPayload(db, opened.dbPath, new URL(request.url).searchParams))
    }
    if (route === 'schedule') {
      const payload = await readJsonBody<ScanQueueSchedulePayload>(request, MAX_JSON_BODY_BYTES)
      const scheduled = scheduleScanQueueJobs(db, payload)
      return jsonResponse(200, { available: true, ...scheduled })
    }
    if (route === 'claim') {
      const payload = await readJsonBody<ScanQueueClaimPayload>(request, MAX_JSON_BODY_BYTES)
      const claimed = claimScanQueueJobs(db, payload)
      return jsonResponse(200, { available: true, ...claimed })
    }
    if (route === 'complete') {
      const payload = await readJsonBody<ScanQueueCompletePayload>(request, MAX_JSON_BODY_BYTES)
      const completed = completeScanQueueJobs(db, payload)
      return jsonResponse(200, { available: true, ...completed })
    }

    const nowIso = new Date().toISOString()
    const params = new URL(request.url).searchParams
    const expiredLeases = requeueExpiredScanQueueJobs(db, nowIso)
    const scheduledFromCoverage = scheduleScanQueueJobsFromCoverage(
      db,
      {
        teamCode: params.get('team') ?? params.get('teamCode') ?? undefined,
        limit: clampInt(params.get('limit'), 1_000, 1, MAX_SCAN_QUEUE_JOBS),
      },
      nowIso,
    )
    return jsonResponse(200, {
      ...scanQueueStatusPayload(db, opened.dbPath, params, nowIso),
      expiredLeases,
      scheduledFromCoverage,
    })
  } catch (error) {
    return jsonResponse(routeErrorStatus(error), { error: routeErrorMessage(error, 'Scan queue request failed') })
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

    if (route === 'coverage') {
      const minYear = clampInt(params.get('minYear'), 2020, 1900, 9999)
      const staleDays = clampInt(params.has('staleDays') ? params.get('staleDays') : undefined, 60, 7, 730)
      const retryCooldownDays = clampInt(params.has('retryCooldownDays') ? params.get('retryCooldownDays') : undefined, 7, 0, 90)
      const requestedRelease = compactSqlText(String(params.get('release') ?? params.get('releaseKey') ?? ''))
      const source = compactSqlText(String(params.get('source') ?? ''))
      const team = compactSqlText(String(params.get('team') ?? ''))
      const playerNames = compactCoveragePlayerList(String(params.get('players') ?? ''))
      const limit = clampInt(
        params.has('limit') ? params.get('limit') : undefined,
        playerNames.length ? Math.min(MAX_CHECKLIST_COVERAGE_ROWS, Math.max(160, playerNames.length)) : 240,
        1,
        MAX_CHECKLIST_COVERAGE_ROWS,
      )
      const hasSourceSheet = sqliteTableHasColumn(db, 'checklist_cards', 'source_sheet')
      const hasChecklistTeam = sqliteTableHasColumn(db, 'checklist_cards', 'team')
      const hasReleaseYear = sqliteTableHasColumn(db, 'checklist_cards', 'release_year')
      const hasCanonical =
        sqliteTableExists(db, 'canonical_cards') && sqliteTableExists(db, 'canonical_comp_summary')
      const hasQueue = sqliteTableExists(db, 'canonical_refresh_queue')
      const queueHasError = hasQueue && sqliteTableHasColumn(db, 'canonical_refresh_queue', 'error')
      const queueHasLastAttempt = hasQueue && sqliteTableHasColumn(db, 'canonical_refresh_queue', 'last_attempt_at')
      const queueHasLastSuccess = hasQueue && sqliteTableHasColumn(db, 'canonical_refresh_queue', 'last_success_at')

      const releaseYearExpression = hasReleaseYear ? 'c.release_year' : 'r.release_year'
      const teamExpression = hasChecklistTeam ? "MAX(NULLIF(c.team, ''))" : "''"
      const where = ['r.release_year >= ?']
      const values: Array<string | number> = [minYear]
      if (requestedRelease) {
        where.push('(r.release_key = ? OR lower(r.release_name) = lower(replace(?, \'-\', \' \')) OR lower(r.release_key) = lower(?))')
        values.push(requestedRelease, requestedRelease, requestedRelease)
      }
      if (source === 'waxpackhero' && hasSourceSheet) {
        where.push("c.source_sheet = 'Wax Pack Hero First Bowman'")
      }
      if (team && hasChecklistTeam) {
        where.push('(lower(c.team) = lower(?) OR lower(c.team) = lower(replace(?, \'-\', \' \')))')
        values.push(team, team)
      }
      if (playerNames.length > 0) {
        where.push(`lower(c.player_name) IN (${playerNames.map(() => '?').join(', ')})`)
        values.push(...playerNames.map((playerName) => playerName.toLowerCase()))
      }

      const baseCte = hasCanonical
        ? `,
        base_candidates AS (
          SELECT
            cc.release_year,
            lower(cc.player_name) AS player_lookup,
            cc.product_family,
            cc.variation_label,
            s.sale_count,
            s.sales_30,
            s.sales_90,
            COALESCE(NULLIF(s.twma_30, 0), NULLIF(s.recent_5_avg, 0), NULLIF(s.twma_90, 0), NULLIF(s.median_price, 0), NULLIF(s.avg_price, 0), 0) AS base_price,
            s.latest_sold_at,
            ROW_NUMBER() OVER (
              PARTITION BY cc.release_year, lower(cc.player_name)
              ORDER BY
                CASE WHEN lower(cc.product_family) LIKE '%chrome%' THEN 0 ELSE 1 END,
                s.sale_count DESC,
                s.sales_30 DESC,
                s.latest_sold_at DESC
            ) AS rn
          FROM canonical_cards cc
          JOIN canonical_comp_summary s
            ON s.canonical_card_key = cc.canonical_card_key
          WHERE cc.release_year >= ?
            AND cc.grade_bucket = 'Raw'
            AND cc.card_class IN ('auto', 'paper-auto')
            AND cc.variation_label IN ('Base Auto', 'Base', '')
            AND s.sale_count > 0
        )`
        : ''
      const baseParams = hasCanonical ? [minYear] : []
      const baseSelect = hasCanonical
        ? `
          COALESCE(b.base_price, 0) AS basePrice,
          COALESCE(b.sale_count, 0) AS baseSaleCount,
          COALESCE(b.sales_30, 0) AS baseSales30,
          COALESCE(b.sales_90, 0) AS baseSales90,
          COALESCE(b.latest_sold_at, '') AS latestSoldAt`
        : `
          0 AS basePrice,
          0 AS baseSaleCount,
          0 AS baseSales30,
          0 AS baseSales90,
          '' AS latestSoldAt`
      const baseJoin = hasCanonical
        ? `
        LEFT JOIN base_candidates b
          ON b.release_year = cp.release_year
         AND b.player_lookup = lower(cp.player_name)
         AND b.rn = 1`
        : ''
      const queueSelect = hasQueue
        ? `
          COALESCE(q.status, 'unqueued') AS queueStatus,
          ${queueHasError ? "COALESCE(q.error, '')" : "''"} AS queueError,
          ${queueHasLastAttempt ? "COALESCE(q.last_attempt_at, '')" : "''"} AS lastAttemptAt,
          ${queueHasLastSuccess ? "COALESCE(q.last_success_at, '')" : "''"} AS lastSuccessAt`
        : `
          'unqueued' AS queueStatus,
          '' AS queueError,
          '' AS lastAttemptAt,
          '' AS lastSuccessAt`
      const queueJoin = hasQueue
        ? `
        LEFT JOIN canonical_refresh_queue q
          ON q.release_year = cp.release_year
         AND lower(q.player_name) = lower(cp.player_name)`
        : ''

      const rows = db.prepare(`
        WITH checklist_players AS (
          SELECT
            r.release_key,
            r.release_year,
            r.release_name,
            c.player_key,
            MAX(c.player_name) AS player_name,
            ${teamExpression} AS team,
            COUNT(*) AS checklist_rows
          FROM checklist_cards c
          JOIN checklist_releases r ON r.release_key = c.release_key
          WHERE ${where.join(' AND ')}
          GROUP BY r.release_key, ${releaseYearExpression}, r.release_name, c.player_key
        )
        ${baseCte}
        SELECT
          cp.release_key AS releaseKey,
          cp.release_year AS releaseYear,
          cp.release_name AS releaseName,
          cp.player_key AS playerKey,
          cp.player_name AS playerName,
          cp.team AS team,
          cp.checklist_rows AS checklistRows,
          ${baseSelect},
          ${queueSelect}
        FROM checklist_players cp
        ${baseJoin}
        ${queueJoin}
        ORDER BY cp.release_year DESC, cp.release_name, cp.player_name
        LIMIT ?
      `).all(...values, ...baseParams, limit)

      const coverageRows = rows.map((row) => mapChecklistCoverageRow(row, staleDays, retryCooldownDays))
      coverageRows.sort((left, right) => right.priorityScore - left.priorityScore || right.releaseYear - left.releaseYear || left.playerName.localeCompare(right.playerName))
      const summary = summarizeChecklistCoverage(coverageRows)
      const releaseMap = new Map<string, {
        releaseKey: string
        releaseYear: number
        releaseName: string
        players: number
        pricedPlayers: number
        missingPriceLanePlayers: number
        stalePlayers: number
      }>()
      for (const row of coverageRows) {
        const current =
          releaseMap.get(row.releaseKey) ??
          {
            releaseKey: row.releaseKey,
            releaseYear: row.releaseYear,
            releaseName: row.releaseName,
            players: 0,
            pricedPlayers: 0,
            missingPriceLanePlayers: 0,
            stalePlayers: 0,
          }
        current.players += 1
        if (row.basePrice > 0) current.pricedPlayers += 1
        else current.missingPriceLanePlayers += 1
        if (row.laneState === 'stale') current.stalePlayers += 1
        releaseMap.set(row.releaseKey, current)
      }

      return jsonResponse(200, {
        available: true,
        dbName: basename(dbPath),
        filters: {
          minYear,
          staleDays,
          retryCooldownDays,
          release: requestedRelease,
          source,
          team,
          playerCount: playerNames.length,
          limit,
        },
        summary,
        cadence: {
          hot: 'Hourly for players with fresh live-market hits and stale or missing price lanes.',
          priority: 'Nightly for ranked, team-page, and recently listed players.',
          longTail: 'Weekly for the remaining 2020+ checklist backlog.',
          retry: 'Timeout/error rows retry with smaller Card Hedge searches and alternate query wording.',
        },
        releases: [...releaseMap.values()].sort((left, right) => right.releaseYear - left.releaseYear || left.releaseName.localeCompare(right.releaseName)),
        nextRefresh: coverageRows.filter((row) => row.priorityScore > 0 && row.laneState !== 'priced').slice(0, Math.min(30, limit)),
        players: coverageRows,
      })
    }

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

    if (!writeRoute) {
      const neonSql = await getNeonSql(env)
      if (neonSql) {
        try {
          if (route === 'status') {
            return jsonResponse(200, await hostedCompStatusPayload(neonSql as HostedCompSql))
          }
          if (route === 'players') {
            const params = new URL(request.url).searchParams
            const requestedPlayers = [...params.getAll('player'), ...(params.get('players') ?? '').split(/[|,]/)]
              .map((player) => player.trim())
              .filter(Boolean)
            if (!requestedPlayers.length) return jsonResponse(400, { error: 'At least one player is required' })
            return jsonResponse(200, await hostedCompPlayersPayload(neonSql as HostedCompSql, requestedPlayers))
          }
          if (route === 'player') {
            const player = new URL(request.url).searchParams.get('player')?.trim() ?? ''
            if (!player) return jsonResponse(400, { error: 'Player is required' })
            return jsonResponse(200, await hostedCompPlayerPayload(neonSql as HostedCompSql, player))
          }
        } catch (error) {
          console.warn('[sales-cache] hosted comp read failed; trying local cache', {
            route,
            error: routeErrorMessage(error, 'Hosted comp read failed'),
          })
        }
      }
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

export async function handleDaveAdamsNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleDaveAdamsRoute(prefixedNodeRoute(request, '/api/dave-adams'), fetchRequest, env))
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

export async function handleScanCoverageNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleScanCoverageRoute(nodeRoute(request), fetchRequest, env))
}

export async function handleScanQueueNodeRequest(request: IncomingMessage, response: ServerResponse, env: ServerEnv) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleScanQueueRoute(nodeRoute(request), fetchRequest, env))
}

export async function handleRankingsNodeRequest(request: IncomingMessage, response: ServerResponse) {
  const fetchRequest = await nodeToFetchRequest(request)
  await writeNodeResponse(response, await handleRankingsRoute(nodeRoute(request), fetchRequest))
}
