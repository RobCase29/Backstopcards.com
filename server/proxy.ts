/// <reference types="node" />

import type { IncomingMessage, ServerResponse } from 'node:http'

const DEFAULT_SUPABASE_URL = 'https://rhlontbdiezpefgbbkql.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobG9udGJkaWV6cGVmZ2Jia3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzIwNjcsImV4cCI6MjA4MTIwODA2N30.H12G7ZC2yUzpXZ0sCrqvhdlIiniGGP6uUgrmEqdOkpk'
const EBAY_OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope'
const EBAY_SEARCH_CONCURRENCY = 3
const EBAY_SOLD_SEARCH_CONCURRENCY = 2
const EBAY_RATE_LIMIT_MESSAGE =
  'eBay is rate-limiting Browse API requests right now. Wait a minute, then retry with a smaller player scope or single-player scan.'
const EBAY_RATE_LIMIT_DEFAULT_MS = 60_000
const EBAY_RATE_LIMIT_RETRY_CAP_MS = 4_000
const MAX_JSON_BODY_BYTES = 1_000_000
const MAX_EBAY_BODY_BYTES = 256_000
const MAX_LOGIN_BODY_BYTES = 16_000
const MAX_EBAY_QUERIES = 140
const MAX_EBAY_QUERY_LENGTH = 140
const PROSPECTPULSE_FUNCTION_ROUTES = new Set(['api-checklists', 'api-listings'])
const EBAY_ROUTES = new Set(['search', 'sold'])

type ServerEnv = Record<string, string | undefined>

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

type EbayTokenCache = {
  cacheKey: string
  accessToken: string
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

function ebayFilter(payload: EbaySearchPayload) {
  const buyingOption = safeBuyingOption(payload.buyingOption)
  const filters = [`buyingOptions:{${buyingOption}}`]
  const minPrice = Number(payload.minPrice)
  if (Number.isFinite(minPrice) && minPrice > 0) {
    filters.push(`price:[${minPrice}]`, 'priceCurrency:USD')
  }
  const maxHoursToClose = Number(payload.maxHoursToClose)
  if (buyingOption === 'AUCTION' && Number.isFinite(maxHoursToClose) && maxHoursToClose > 0) {
    const start = new Date()
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
}) {
  const { accessToken, sandbox, job, payload, defaultCategoryId, defaultMarketplaceId, defaultZipCode } = options
  const query = String(job.q ?? '').trim()
  if (!query) return { items: [] as Array<Record<string, unknown>>, pagesFetched: 0, total: 0 }

  const limit = clampInt(payload.limit, 100, 1, 200)
  const maxPages = clampInt(payload.maxPages, 1, 1, 3)
  const marketplaceId = String(defaultMarketplaceId || 'EBAY_US')
  const categoryId = String(defaultCategoryId || '').trim()
  const allItems: Array<Record<string, unknown>> = []
  let total = 0
  let pagesFetched = 0

  for (let page = 0; page < maxPages; page += 1) {
    if (ebayRateLimitedUntil > Date.now()) {
      throw new EbayUpstreamError(EBAY_RATE_LIMIT_MESSAGE, 429, ebayRateLimitedUntil - Date.now())
    }

    const offset = page * limit
    const url = new URL(`${ebayHost(sandbox)}/buy/browse/v1/item_summary/search`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('filter', ebayFilter(payload))
    if (payload.sort) url.searchParams.set('sort', String(payload.sort))
    if (categoryId) url.searchParams.set('category_ids', categoryId)

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
    allItems.push(
      ...items.map((item) => ({
        ...item,
        _bowmanTraderQuery: job,
      })),
    )

    if (items.length < limit || offset + limit >= Math.min(total || 0, 10_000)) break
  }

  return { items: allItems, pagesFetched, total }
}

async function searchEbaySoldJob(options: {
  accessToken: string
  sandbox: boolean
  job: EbaySearchJob
  payload: EbaySearchPayload
  defaultCategoryId?: string
  defaultMarketplaceId: string
}) {
  const { accessToken, sandbox, job, payload, defaultCategoryId, defaultMarketplaceId } = options
  const query = String(job.q ?? '').trim()
  if (!query) return { items: [] as Array<Record<string, unknown>>, pagesFetched: 0, total: 0 }

  const limit = clampInt(payload.limit, 100, 1, 200)
  const maxPages = clampInt(payload.maxPages, 1, 1, 3)
  const marketplaceId = String(defaultMarketplaceId || 'EBAY_US')
  const categoryId = String(defaultCategoryId || '').trim()
  const allItems: Array<Record<string, unknown>> = []
  let total = 0
  let pagesFetched = 0

  for (let page = 0; page < maxPages; page += 1) {
    if (ebayRateLimitedUntil > Date.now()) {
      throw new EbayUpstreamError(EBAY_RATE_LIMIT_MESSAGE, 429, ebayRateLimitedUntil - Date.now())
    }

    const offset = page * limit
    const url = new URL(`${ebayHost(sandbox)}/buy/marketplace_insights/v1_beta/item_sales/search`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))
    if (payload.sort) url.searchParams.set('sort', String(payload.sort))
    if (categoryId) url.searchParams.set('category_ids', categoryId)

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
    allItems.push(
      ...items.map((item) => ({
        ...item,
        _bowmanTraderQuery: job,
      })),
    )

    if (items.length < limit || offset + limit >= Math.min(total || 0, 10_000)) break
  }

  return { items: allItems, pagesFetched, total }
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
    return jsonResponse(200, {
      configured,
      environment: sandbox ? 'sandbox' : 'production',
      marketplaceId: env.EBAY_MARKETPLACE_ID || 'EBAY_US',
      hasCategoryId: Boolean(env.EBAY_CATEGORY_ID),
      message: configured ? 'eBay Browse API configured' : 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in Vercel environment variables',
    })
  }

  if (request.method !== 'POST' || !EBAY_ROUTES.has(route)) return new Response(null, { status: 404 })

  const unsafePost = rejectUnsafePost(request)
  if (unsafePost) return unsafePost

  if (!configured) return jsonResponse(401, { error: 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in Vercel environment variables' })

  try {
    const payload = await readJsonBody<EbaySearchPayload>(request, MAX_EBAY_BODY_BYTES)
    const queries = safeEbayQueries(payload)

    if (queries.length === 0) return jsonResponse(400, { error: 'At least one eBay query is required' })

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
              })
            : await searchEbayJob({
                accessToken,
                sandbox,
                job,
                payload,
                defaultCategoryId: env.EBAY_CATEGORY_ID,
                defaultMarketplaceId: env.EBAY_MARKETPLACE_ID || 'EBAY_US',
                defaultZipCode: env.EBAY_ZIP_CODE,
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
      },
    })
  } catch (error) {
    const message = ebayRouteErrorMessage(route, error instanceof Error ? error.message : 'eBay proxy request failed')
    return jsonResponse(error instanceof EbayUpstreamError && error.upstreamStatus === 429 ? 429 : routeErrorStatus(error), {
      error: message,
    })
  }
}

function nodeRoute(request: IncomingMessage) {
  return (request.url ?? '').replace(/^\/+/, '').split('?')[0]
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
