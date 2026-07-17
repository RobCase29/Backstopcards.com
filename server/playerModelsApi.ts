/// <reference types="node" />

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Redis } from '@upstash/redis'
import { neon } from '@neondatabase/serverless'
import { FAIR_VALUE_MODEL_VERSION } from '../shared/fairValueEngine.js'
import { STATIC_CHECKLIST_GENERATED_AT, STATIC_CHECKLIST_MODELS } from '../src/data/staticChecklistSnapshot.js'
import { applySalesCacheModelToPricingRow, canonicalBaseBucketForRow } from '../src/lib/canonicalPricing.js'
import { normalizeLiveCompText } from '../src/lib/liveComps.js'
import { buildPricingMatrix, variationKey, type PricingRow } from '../src/lib/matrix.js'
import type { SalesCachePlayerModel } from '../src/lib/salesCache.js'
import { hostedCompPlayersPayload, type HostedCompSql } from './hostedComps.js'

type PublicApiEnv = Record<string, string | undefined>

type RateLimitState = {
  limit: number
  remaining: number
  resetAt: number
  allowed: boolean
}

type ApiKeyMatch = {
  key: string
  id: string
}

type PublicModelItem = ReturnType<typeof publicModelItem>

const API_SCHEMA_VERSION = 'player-models.v1'
const API_CONTRACT_VERSION = 'backstop-public-api/v1'
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const DEFAULT_RATE_LIMIT = 120
const RATE_WINDOW_SECONDS = 60
const MAX_BATCH_PLAYERS = 100
const API_CACHE_SECONDS = 300
const API_STALE_SECONDS = 3_600
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>()

let baseRowsCache: PricingRow[] | null = null
let redisCache: Redis | null | undefined
let redisCacheKey = ''
let neonCache: HostedCompSql | null | undefined
let neonCacheKey = ''

function clampInt(value: string | null | undefined, fallback: number, min: number, max: number) {
  if (value == null || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function roundMoney(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : null
}

function ageDays(value: string | null | undefined, now = Date.now()) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / 86_400_000)) : null
}

function stableHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function configuredApiKeys(env: PublicApiEnv) {
  return [env.BACKSTOP_API_KEYS, env.BACKSTOP_API_KEY]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[\n,]/))
    .map((value) => value.trim())
    .filter(Boolean)
}

function presentedApiKey(request: Request) {
  const authorization = request.headers.get('authorization')?.trim() ?? ''
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, '').trim()
  return request.headers.get('x-api-key')?.trim() ?? ''
}

function authenticate(request: Request, env: PublicApiEnv): ApiKeyMatch | null {
  const presented = presentedApiKey(request)
  if (!presented) return null
  const match = configuredApiKeys(env).find((candidate) => secureEqual(candidate, presented))
  return match ? { key: match, id: stableHash(match).slice(0, 12) } : null
}

function redisConfig(env: PublicApiEnv) {
  const url = env.UPSTASH_REDIS_REST_URL?.trim() || env.KV_REST_API_URL?.trim() || ''
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() || env.KV_REST_API_TOKEN?.trim() || ''
  return { url, token }
}

function publicApiRedis(env: PublicApiEnv) {
  const config = redisConfig(env)
  if (!config.url || !config.token) return null
  const key = stableHash(`${config.url}:${config.token}`)
  if (redisCache !== undefined && redisCacheKey === key) return redisCache
  redisCacheKey = key
  redisCache = new Redis(config)
  return redisCache
}

function databaseUrl(env: PublicApiEnv) {
  return (
    env.DATABASE_URL?.trim() ||
    env.POSTGRES_URL?.trim() ||
    env.POSTGRES_URL_NON_POOLING?.trim() ||
    env.NEON_DATABASE_URL?.trim() ||
    ''
  )
}

function publicApiSql(env: PublicApiEnv) {
  const url = databaseUrl(env)
  if (!url) return null
  const key = stableHash(url)
  if (neonCache !== undefined && neonCacheKey === key) return neonCache
  neonCacheKey = key
  neonCache = neon(url) as unknown as HostedCompSql
  return neonCache
}

function memoryRateLimit(key: string, limit: number, now: number): RateLimitState {
  const windowStart = Math.floor(now / (RATE_WINDOW_SECONDS * 1_000)) * RATE_WINDOW_SECONDS * 1_000
  const resetAt = windowStart + RATE_WINDOW_SECONDS * 1_000
  const current = memoryRateLimits.get(key)
  const next = !current || current.resetAt <= now ? { count: 1, resetAt } : { count: current.count + 1, resetAt: current.resetAt }
  memoryRateLimits.set(key, next)
  if (memoryRateLimits.size > 1_000) {
    for (const [candidate, value] of memoryRateLimits) {
      if (value.resetAt <= now) memoryRateLimits.delete(candidate)
    }
  }
  return {
    limit,
    remaining: Math.max(0, limit - next.count),
    resetAt: next.resetAt,
    allowed: next.count <= limit,
  }
}

async function rateLimit(keyId: string, env: PublicApiEnv): Promise<RateLimitState> {
  const limit = clampInt(env.BACKSTOP_API_RATE_LIMIT, DEFAULT_RATE_LIMIT, 10, 10_000)
  const now = Date.now()
  const redis = publicApiRedis(env)
  if (!redis) return memoryRateLimit(keyId, limit, now)

  const minute = Math.floor(now / (RATE_WINDOW_SECONDS * 1_000))
  const key = `backstop:public-api:v1:${keyId}:${minute}`
  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, RATE_WINDOW_SECONDS + 5)
    return {
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: (minute + 1) * RATE_WINDOW_SECONDS * 1_000,
      allowed: count <= limit,
    }
  } catch {
    return memoryRateLimit(keyId, limit, now)
  }
}

function allowedOrigins(env: PublicApiEnv) {
  return String(env.BACKSTOP_API_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function corsHeaders(request: Request, env: PublicApiEnv) {
  const origin = request.headers.get('origin')?.trim() ?? ''
  if (!origin) return new Headers()
  const allowed = allowedOrigins(env)
  if (!allowed.includes('*') && !allowed.includes(origin)) return null
  const headers = new Headers({
    'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type, If-None-Match',
    'Access-Control-Max-Age': '86400',
  })
  if (!allowed.includes('*')) headers.set('Vary', 'Origin')
  return headers
}

function apiHeaders(requestId: string, rate?: RateLimitState) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `private, max-age=${API_CACHE_SECONDS}, stale-while-revalidate=${API_STALE_SECONDS}`,
    'X-Request-Id': requestId,
    'X-Backstop-Schema': API_SCHEMA_VERSION,
  })
  if (rate) {
    headers.set('X-RateLimit-Limit', String(rate.limit))
    headers.set('X-RateLimit-Remaining', String(rate.remaining))
    headers.set('X-RateLimit-Reset', String(Math.ceil(rate.resetAt / 1_000)))
  }
  return headers
}

function mergeHeaders(target: Headers, source: Headers | null) {
  source?.forEach((value, key) => {
    if (key.toLowerCase() === 'vary' && target.has('Vary')) {
      target.set('Vary', `${target.get('Vary')}, ${value}`)
    } else {
      target.set(key, value)
    }
  })
  return target
}

function jsonResponse(
  request: Request,
  env: PublicApiEnv,
  status: number,
  payload: unknown,
  options: { requestId: string; rate?: RateLimitState; cache?: boolean; etagSeed?: unknown },
) {
  const body = JSON.stringify(payload)
  const headers = mergeHeaders(apiHeaders(options.requestId, options.rate), corsHeaders(request, env))
  if (options.cache === false) headers.set('Cache-Control', 'no-store')
  const etag = `"${stableHash(JSON.stringify(options.etagSeed ?? payload)).slice(0, 32)}"`
  headers.set('ETag', etag)
  headers.set('Vary', [headers.get('Vary'), 'Authorization', 'X-API-Key'].filter(Boolean).join(', '))
  if (request.headers.get('if-none-match') === etag && status === 200) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(body, { status, headers })
}

function errorResponse(
  request: Request,
  env: PublicApiEnv,
  status: number,
  code: string,
  message: string,
  requestId: string,
  rate?: RateLimitState,
) {
  return jsonResponse(
    request,
    env,
    status,
    {
      schemaVersion: API_SCHEMA_VERSION,
      requestId,
      error: { code, message },
    },
    { requestId, rate, cache: false },
  )
}

function sourcePriority(row: PricingRow) {
  const priorities: Record<PricingRow['basePriceSource'], number> = {
    'weighted-sales': 5,
    'blended-sales': 4,
    'variation-implied': 3,
    'twma-fallback': 2,
    unpriced: 1,
  }
  return priorities[row.basePriceSource]
}

function preferredDuplicate(left: PricingRow, right: PricingRow) {
  const leftScore = (left.baseTwmaPrice > 0 ? 1_000 : 0) + sourcePriority(left) * 100 + left.baseConfidence * 10 + left.baseEffectiveSales
  const rightScore =
    (right.baseTwmaPrice > 0 ? 1_000 : 0) + sourcePriority(right) * 100 + right.baseConfidence * 10 + right.baseEffectiveSales
  return rightScore > leftScore ? right : left
}

function baseRows() {
  if (baseRowsCache) return baseRowsCache
  const matrix = buildPricingMatrix(STATIC_CHECKLIST_MODELS)
  const unique = new Map<string, PricingRow>()
  for (const row of matrix.rows) {
    const key = `${normalizeLiveCompText(row.playerName)}|${normalizeLiveCompText(row.release)}`
    const existing = unique.get(key)
    unique.set(key, existing ? preferredDuplicate(existing, row) : row)
  }
  baseRowsCache = [...unique.values()].sort(
    (left, right) =>
      normalizeLiveCompText(left.playerName).localeCompare(normalizeLiveCompText(right.playerName)) ||
      right.releaseYear - left.releaseYear ||
      left.release.localeCompare(right.release),
  )
  return baseRowsCache
}

function parsePlayerNames(params: URLSearchParams) {
  return [
    ...params.getAll('player'),
    ...(params.get('players') ?? '').split('|'),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
}

function decodeCursor(cursor: string | null) {
  if (!cursor) return 0
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
    const match = decoded.match(/^v1:(\d+)$/)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

function encodeCursor(offset: number) {
  return Buffer.from(`v1:${offset}`, 'utf8').toString('base64url')
}

function matchesText(value: string | null | undefined, query: string) {
  return normalizeLiveCompText(value).includes(query)
}

function filterRows(rows: PricingRow[], params: URLSearchParams) {
  const names = parsePlayerNames(params)
  const normalizedNames = new Set(names.map(normalizeLiveCompText))
  const q = normalizeLiveCompText((params.get('q') ?? '').slice(0, 100))
  const release = normalizeLiveCompText((params.get('release') ?? '').slice(0, 100))
  const team = normalizeLiveCompText((params.get('team') ?? '').slice(0, 80))
  const year = clampInt(params.get('year'), 0, 1900, 2200)

  return rows.filter((row) => {
    if (normalizedNames.size && !normalizedNames.has(normalizeLiveCompText(row.playerName))) return false
    if (q && !matchesText(`${row.playerName} ${row.release} ${row.currentTeamName ?? ''} ${row.currentTeam ?? ''}`, q)) return false
    if (release && !matchesText(row.release, release)) return false
    if (team && !matchesText(`${row.currentTeamName ?? ''} ${row.currentTeam ?? ''} ${row.checklistTeam ?? ''}`, team)) return false
    if (year && row.releaseYear !== year) return false
    return true
  })
}

function matchesPricedFilter(item: PublicModelItem, priced: string) {
  if (priced === 'all') return true
  const hasPrice = typeof item.valuation.amount === 'number' && item.valuation.amount > 0
  return priced === 'true' ? hasPrice : !hasPrice
}

function baseQuote(row: PricingRow) {
  return row.ladder.find((quote) => variationKey(quote.label || quote.key) === 'base') ?? null
}

function evidenceTier(row: PricingRow) {
  if (row.basePriceSource === 'weighted-sales' && row.baseEffectiveSales >= 3) return 'observed'
  if (row.basePriceSource === 'weighted-sales' || row.basePriceSource === 'blended-sales') return 'comp-backed'
  if (row.basePriceSource === 'variation-implied') return 'inferred'
  if (row.basePriceSource === 'unpriced') return 'unpriced'
  return 'indicative'
}

function evidenceQuality(row: PricingRow) {
  if (row.baseTwmaPrice <= 0) return 'unpriced'
  if (row.baseConfidence >= 0.7 && row.baseEffectiveSales >= 4) return 'strong'
  if (row.baseConfidence >= 0.45 && (row.baseEffectiveSales >= 1 || row.basePriceSource === 'variation-implied')) return 'moderate'
  return 'thin'
}

function publicModelItem(row: PricingRow, input: { hostedModel: SalesCachePlayerModel | null; includeLadder: boolean; now: number }) {
  const adjusted = applySalesCacheModelToPricingRow(row, input.hostedModel, { asOf: input.now }) ?? row
  const quote = baseQuote(adjusted)
  const hostedBucket = canonicalBaseBucketForRow(row, input.hostedModel)
  const modelGeneratedAt = hostedBucket?.generatedAt || input.hostedModel?.generatedAt || STATIC_CHECKLIST_GENERATED_AT
  const compAgeDays = ageDays(adjusted.latestBaseSaleAt, input.now)
  const modelAgeDays = ageDays(modelGeneratedAt, input.now)
  const amount = roundMoney(adjusted.baseTwmaPrice)
  const low = roundMoney(quote?.lowPrice ?? (amount ? amount * 0.72 : null))
  const high = roundMoney(quote?.highPrice ?? (amount ? amount * 1.38 : null))

  return {
    modelId: `${normalizeLiveCompText(adjusted.playerName).replace(/\s+/g, '-')}:${normalizeLiveCompText(adjusted.release).replace(
      /\s+/g,
      '-',
    )}:raw-base-auto`,
    player: {
      name: adjusted.playerName,
      normalizedName: normalizeLiveCompText(adjusted.playerName),
      currentTeamCode: adjusted.currentTeam,
      currentTeamName: adjusted.currentTeamName,
      checklistTeam: adjusted.checklistTeam,
    },
    card: {
      release: adjusted.release,
      releaseYear: adjusted.releaseYear,
      category: adjusted.category,
      productFamily: 'Bowman Chrome',
      cardType: 'Base Auto',
      grade: 'Raw',
    },
    valuation: {
      amount,
      currency: 'USD',
      low,
      high,
      source: adjusted.basePriceSource,
      method: adjusted.baseMethod,
      confidence: Number(adjusted.baseConfidence.toFixed(3)),
      confidenceScore: Math.round(adjusted.baseConfidence * 100),
      evidenceTier: evidenceTier(adjusted),
      evidenceQuality: evidenceQuality(adjusted),
      actionable: Boolean(amount && adjusted.basePriceSource !== 'unpriced'),
    },
    evidence: {
      sales: adjusted.baseSales,
      effectiveSales: Number(adjusted.baseEffectiveSales.toFixed(2)),
      sales30: adjusted.baseSales30,
      sales90: adjusted.baseSales90,
      auctionSales: adjusted.baseAuctionSales,
      binSales: adjusted.baseBinSales,
      volatility: Number(adjusted.baseVolatility.toFixed(4)),
      latestSaleAt: adjusted.latestBaseSaleAt,
    },
    freshness: {
      modelGeneratedAt,
      modelAgeDays,
      latestSaleAgeDays: compAgeDays,
      stale: Boolean((modelAgeDays !== null && modelAgeDays > 7) || (compAgeDays !== null && compAgeDays > 90)),
    },
    rankings: {
      source: adjusted.rankingSource,
      oraclePlayerId: adjusted.oraclePlayerId,
      oracleMlbamId: adjusted.oracleMlbamId,
      prospectRank: adjusted.oracleStageRank ?? adjusted.oracleServedProspectRank ?? adjusted.stsProspectRank,
      overallRank: adjusted.stsRank,
      careerOutlook: adjusted.oracleCareerOutlook,
      movement30d: adjusted.stsChange30d,
      asOf: adjusted.oracleRankAsOf,
    },
    provenance: {
      contractVersion: API_CONTRACT_VERSION,
      modelVersion: FAIR_VALUE_MODEL_VERSION,
      snapshotGeneratedAt: STATIC_CHECKLIST_GENERATED_AT,
      compLayer: hostedBucket ? 'hosted-canonical-comps' : 'checklist-snapshot',
      rawThirdPartyDataIncluded: false,
    },
    ...(input.includeLadder
      ? {
          variationLadder: adjusted.ladder.map((candidate) => ({
            key: candidate.key,
            label: candidate.label,
            multiplier: Number(candidate.multiplier.toFixed(4)),
            amount: roundMoney(candidate.price),
            low: roundMoney(candidate.lowPrice),
            high: roundMoney(candidate.highPrice),
            confidence: candidate.confidence == null ? null : Number(candidate.confidence.toFixed(3)),
            evidenceTier: candidate.evidenceTier ?? null,
            actionable: candidate.actionable !== false,
          })),
        }
      : {}),
  }
}

async function hostedModelsForRows(rows: PricingRow[], env: PublicApiEnv) {
  const sql = publicApiSql(env)
  if (!sql || !rows.length) return { models: new Map<string, SalesCachePlayerModel>(), warning: null }
  const names = [...new Set(rows.map((row) => row.playerName))].slice(0, MAX_BATCH_PLAYERS)
  try {
    const payload = await hostedCompPlayersPayload(sql, names)
    return {
      models: new Map(
        (payload.players ?? []).map((model) => [normalizeLiveCompText(model.playerName), model as SalesCachePlayerModel]),
      ),
      warning: null,
    }
  } catch {
    return {
      models: new Map<string, SalesCachePlayerModel>(),
      warning: 'Hosted comp overlay was temporarily unavailable; values use the latest durable checklist snapshot.',
    }
  }
}

function openApiDocument(request: Request) {
  const origin = new URL(request.url).origin
  return {
    openapi: '3.1.0',
    info: {
      title: 'Backstop Player Models API',
      version: '1.0.0',
      description: 'Canonical modeled raw Bowman base-auto values for use by trusted Backstop applications.',
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Backstop API key' },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/v1/player-models': {
        get: {
          summary: 'List or batch-resolve player base-auto models',
          parameters: [
            { name: 'player', in: 'query', schema: { type: 'string' }, description: 'Repeat for exact-name batch lookup.' },
            { name: 'players', in: 'query', schema: { type: 'string' }, description: 'Pipe-delimited exact player names.' },
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search player, release, or team.' },
            { name: 'release', in: 'query', schema: { type: 'string' } },
            { name: 'year', in: 'query', schema: { type: 'integer' } },
            { name: 'team', in: 'query', schema: { type: 'string' } },
            { name: 'priced', in: 'query', schema: { type: 'string', enum: ['true', 'false', 'all'], default: 'true' } },
            { name: 'include', in: 'query', schema: { type: 'string', enum: ['ladder'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Player models' },
            400: { description: 'Invalid query' },
            401: { description: 'Missing or invalid API key' },
            429: { description: 'Rate limit exceeded' },
          },
        },
      },
      '/api/v1/meta': {
        get: { summary: 'Inspect model coverage and API contract metadata', responses: { 200: { description: 'API metadata' } } },
      },
    },
  }
}

async function modelsResponse(request: Request, env: PublicApiEnv, requestId: string, rate: RateLimitState) {
  const url = new URL(request.url)
  const names = parsePlayerNames(url.searchParams)
  if (names.length > MAX_BATCH_PLAYERS) {
    return errorResponse(
      request,
      env,
      400,
      'too_many_players',
      `A request may include at most ${MAX_BATCH_PLAYERS} player names.`,
      requestId,
      rate,
    )
  }
  const cursor = decodeCursor(url.searchParams.get('cursor'))
  if (cursor === null) return errorResponse(request, env, 400, 'invalid_cursor', 'The pagination cursor is invalid.', requestId, rate)
  const priced = (url.searchParams.get('priced') ?? 'true').toLowerCase()
  if (!['true', 'false', 'all'].includes(priced)) {
    return errorResponse(
      request,
      env,
      400,
      'invalid_priced_filter',
      'The priced filter must be true, false, or all.',
      requestId,
      rate,
    )
  }

  const limit = clampInt(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
  const candidates = filterRows(baseRows(), url.searchParams)
  const now = Math.floor(Date.now() / (API_CACHE_SECONDS * 1_000)) * API_CACHE_SECONDS * 1_000
  const includeLadder = (url.searchParams.get('include') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .includes('ladder')
  const items: PublicModelItem[] = []
  const warnings = new Set<string>()
  let nextOffset = Math.min(cursor, candidates.length)

  while (nextOffset < candidates.length && items.length < limit) {
    const chunkSize = Math.min(MAX_BATCH_PLAYERS, Math.max(25, (limit - items.length) * 2))
    const chunk = candidates.slice(nextOffset, nextOffset + chunkSize)
    const hosted = await hostedModelsForRows(chunk, env)
    if (hosted.warning) warnings.add(hosted.warning)

    for (const row of chunk) {
      const item = publicModelItem(row, {
        hostedModel: hosted.models.get(normalizeLiveCompText(row.playerName)) ?? null,
        includeLadder,
        now,
      })
      nextOffset += 1
      if (matchesPricedFilter(item, priced)) items.push(item)
      if (items.length >= limit) break
    }
  }

  const payload = {
    schemaVersion: API_SCHEMA_VERSION,
    contractVersion: API_CONTRACT_VERSION,
    modelVersion: FAIR_VALUE_MODEL_VERSION,
    generatedAt: new Date(now).toISOString(),
    snapshotGeneratedAt: STATIC_CHECKLIST_GENERATED_AT,
    count: items.length,
    totalCandidates: candidates.length,
    nextCursor: nextOffset < candidates.length ? encodeCursor(nextOffset) : null,
    warnings: [...warnings],
    items,
  }
  return jsonResponse(request, env, 200, payload, { requestId, rate, etagSeed: payload })
}

function metaResponse(request: Request, env: PublicApiEnv, requestId: string, rate: RateLimitState) {
  const rows = baseRows()
  const priced = rows.filter((row) => row.baseTwmaPrice > 0)
  const releases = [...new Set(rows.map((row) => row.release))]
  const payload = {
    schemaVersion: API_SCHEMA_VERSION,
    contractVersion: API_CONTRACT_VERSION,
    modelVersion: FAIR_VALUE_MODEL_VERSION,
    snapshotGeneratedAt: STATIC_CHECKLIST_GENERATED_AT,
    coverage: {
      playerReleaseModels: rows.length,
      pricedModels: priced.length,
      unpricedModels: rows.length - priced.length,
      releases: releases.length,
      pricedRate: rows.length ? Number((priced.length / rows.length).toFixed(4)) : 0,
    },
    capabilities: {
      exactPlayerBatch: true,
      filters: ['q', 'player', 'players', 'release', 'year', 'team', 'priced'],
      optionalIncludes: ['ladder'],
      maxPageSize: MAX_PAGE_SIZE,
      maxBatchPlayers: MAX_BATCH_PLAYERS,
      rawThirdPartySales: false,
    },
  }
  return jsonResponse(request, env, 200, payload, { requestId, rate, etagSeed: payload })
}

export async function handlePlayerModelsApiRoute(route: string, request: Request, env: PublicApiEnv) {
  const requestId = randomUUID()
  const cors = corsHeaders(request, env)
  if (request.headers.has('origin') && !cors) {
    return errorResponse(request, env, 403, 'origin_not_allowed', 'This browser origin is not allowed.', requestId)
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors ?? undefined })
  }
  if (request.method !== 'GET') return errorResponse(request, env, 405, 'method_not_allowed', 'Use GET for this endpoint.', requestId)

  if (route === 'openapi.json') {
    return jsonResponse(request, env, 200, openApiDocument(request), { requestId })
  }
  if (route !== 'player-models' && route !== 'meta') {
    return errorResponse(request, env, 404, 'not_found', 'API route not found.', requestId)
  }

  if (!configuredApiKeys(env).length) {
    return errorResponse(
      request,
      env,
      503,
      'api_not_configured',
      'The Backstop application API is not configured.',
      requestId,
    )
  }
  const authentication = authenticate(request, env)
  if (!authentication) {
    return errorResponse(request, env, 401, 'unauthorized', 'Provide a valid Backstop API key as a Bearer token.', requestId)
  }
  const rate = await rateLimit(authentication.id, env)
  if (!rate.allowed) {
    const response = errorResponse(request, env, 429, 'rate_limited', 'Too many API requests. Retry after the reset time.', requestId, rate)
    response.headers.set('Retry-After', String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1_000))))
    return response
  }

  return route === 'meta'
    ? metaResponse(request, env, requestId, rate)
    : modelsResponse(request, env, requestId, rate)
}

function requestHeaders(request: IncomingMessage) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(key, entry))
    else if (value !== undefined) headers.set(key, String(value))
  }
  return headers
}

export async function handlePlayerModelsNodeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  env: PublicApiEnv,
) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const route = url.pathname.split('/').filter(Boolean).at(-1) ?? ''
  const webResponse = await handlePlayerModelsApiRoute(
    route,
    new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
      method: request.method ?? 'GET',
      headers: requestHeaders(request),
    }),
    env,
  )
  response.statusCode = webResponse.status
  webResponse.headers.forEach((value, key) => response.setHeader(key, value))
  response.end(Buffer.from(await webResponse.arrayBuffer()))
}

export type { PublicModelItem }
