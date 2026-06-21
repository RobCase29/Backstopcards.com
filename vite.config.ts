import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_SUPABASE_URL = 'https://rhlontbdiezpefgbbkql.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobG9udGJkaWV6cGVmZ2Jia3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzIwNjcsImV4cCI6MjA4MTIwODA2N30.H12G7ZC2yUzpXZ0sCrqvhdlIiniGGP6uUgrmEqdOkpk'
const EBAY_OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope'
const EBAY_SEARCH_CONCURRENCY = 5
const EBAY_SOLD_SEARCH_CONCURRENCY = 2
const MAX_JSON_BODY_BYTES = 1_000_000
const MAX_EBAY_BODY_BYTES = 256_000
const MAX_LOGIN_BODY_BYTES = 16_000
const MAX_EBAY_QUERIES = 140
const MAX_EBAY_QUERY_LENGTH = 140
const PROSPECTPULSE_FUNCTION_ROUTES = new Set(['api-checklists', 'api-listings'])
const EBAY_ROUTES = new Set(['search', 'sold'])

class ProxyRequestError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

async function readRequestBody(request: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES) {
  let body = ''
  let bytes = 0
  for await (const chunk of request) {
    const value = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    bytes += Buffer.byteLength(value)
    if (bytes > maxBytes) throw new ProxyRequestError(413, 'Request body is too large')
    body += value
  }
  return body
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function isJsonPost(request: IncomingMessage) {
  return String(request.headers['content-type'] ?? '').toLowerCase().includes('application/json')
}

function trustedSameOrigin(request: IncomingMessage) {
  const origin = String(request.headers.origin ?? '')
  if (!origin) return true
  const host = String(request.headers.host ?? '')
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function readJsonBody<T>(request: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES) {
  if (!isJsonPost(request)) throw new ProxyRequestError(415, 'Expected application/json')
  const body = await readRequestBody(request, maxBytes)
  try {
    return JSON.parse(body) as T
  } catch {
    throw new ProxyRequestError(400, 'Invalid JSON body')
  }
}

function rejectUnsafePost(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') return false
  if (!trustedSameOrigin(request)) {
    writeJson(response, 403, { error: 'Cross-origin requests are not allowed' })
    return true
  }
  if (!isJsonPost(request)) {
    writeJson(response, 415, { error: 'Expected application/json' })
    return true
  }
  return false
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
  if (route === 'sold' && /403|access denied|insufficient permissions|marketplace.?insights/i.test(message)) {
    return 'Marketplace Insights access denied for eBay sold listings. Enable item-sales search permissions for this keyset, then retry.'
  }
  return message
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
  categoryId?: string
  marketplaceId?: string
}

type EbayTokenCache = {
  cacheKey: string
  accessToken: string
  expiresAt: number
}

let ebayTokenCache: EbayTokenCache | null = null

async function getEbayAccessToken(env: Record<string, string>, sandbox: boolean, scope = EBAY_OAUTH_SCOPE) {
  const clientId = env.EBAY_CLIENT_ID
  const clientSecret = env.EBAY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local')

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

function ebayFilter(payload: EbaySearchPayload) {
  const filters = ['buyingOptions:{FIXED_PRICE}']
  const minPrice = Number(payload.minPrice)
  if (Number.isFinite(minPrice) && minPrice > 0) {
    filters.push(`price:[${minPrice}]`, 'priceCurrency:USD')
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

    const upstream = await fetch(url, { headers })
    const text = await upstream.text()
    if (!upstream.ok) throw new Error(`eBay search failed for "${query}" (${upstream.status})`)

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
    const offset = page * limit
    const url = new URL(`${ebayHost(sandbox)}/buy/marketplace_insights/v1_beta/item_sales/search`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))
    if (payload.sort) url.searchParams.set('sort', String(payload.sort))
    if (categoryId) url.searchParams.set('category_ids', categoryId)

    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
      },
    })
    const text = await upstream.text()
    if (!upstream.ok) throw new Error(`eBay sold search failed for "${query}" (${upstream.status})`)

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

function prospectPulseProxy(): Plugin {
  return {
    name: 'prospect-pulse-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      const supabaseUrl = env.PROSPECTPULSE_SUPABASE_URL || DEFAULT_SUPABASE_URL
      const envAccessToken = env.PROSPECTPULSE_ACCESS_TOKEN
      const anonKey = env.PROSPECTPULSE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

      server.middlewares.use('/api/prospectpulse', async (request, response) => {
        const route = (request.url ?? '').replace(/^\/+/, '').split('?')[0]

        if (request.method === 'GET' && route === 'status') {
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              connected: Boolean(envAccessToken),
              serverConnected: Boolean(envAccessToken),
              authMode: envAccessToken ? 'server' : 'public',
              hasAnonKey: Boolean(anonKey),
              message: envAccessToken ? 'ProspectPulse managed token loaded' : 'No server access token configured',
            }),
          )
          return
        }

        if (rejectUnsafePost(request, response)) return

        if (request.method === 'POST' && route === 'login') {
          try {
            const payload = await readJsonBody<{
              email?: string
              password?: string
            }>(request, MAX_LOGIN_BODY_BYTES)
            if (!payload.email || !payload.password) {
              response.statusCode = 400
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: 'Email and password are required' }))
              return
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
            response.statusCode = upstream.status
            response.setHeader('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
            response.end(text)
          } catch (error) {
            writeJson(response, routeErrorStatus(error), {
              error: routeErrorMessage(error, 'Login request failed'),
            })
          }
          return
        }

        if (!route || request.method !== 'POST') {
          response.statusCode = 404
          response.end()
          return
        }

        if (!PROSPECTPULSE_FUNCTION_ROUTES.has(route)) {
          writeJson(response, 404, { error: 'Unknown ProspectPulse route' })
          return
        }

        let body: string
        try {
          body = await readRequestBody(request, MAX_JSON_BODY_BYTES)
          JSON.parse(body)
        } catch (error) {
          writeJson(response, routeErrorStatus(error), { error: routeErrorMessage(error, 'Invalid ProspectPulse request') })
          return
        }

        const headerToken = request.headers['x-prospectpulse-access-token']
        const accessToken =
          envAccessToken ||
          (Array.isArray(headerToken) ? headerToken[0] : headerToken) ||
          (route === 'api-checklists' && canUsePublicChecklist(body) ? anonKey : undefined)

        if (!accessToken) {
          response.statusCode = 401
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: 'Connect ProspectPulse or set PROSPECTPULSE_ACCESS_TOKEN in .env.local' }))
          return
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
          response.statusCode = upstream.status
          response.setHeader('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
          response.end(text)
        } catch (error) {
          response.statusCode = 502
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'ProspectPulse proxy request failed',
            }),
          )
        }
      })
    },
  }
}

function ebayProxy(): Plugin {
  return {
    name: 'ebay-browse-local-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      const sandbox = env.EBAY_ENV === 'sandbox'

      server.middlewares.use('/api/ebay', async (request, response) => {
        const route = (request.url ?? '').replace(/^\/+/, '').split('?')[0]
        const configured = Boolean(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET)

        if (request.method === 'GET' && route === 'status') {
          writeJson(response, 200, {
            configured,
            environment: sandbox ? 'sandbox' : 'production',
            marketplaceId: env.EBAY_MARKETPLACE_ID || 'EBAY_US',
            hasCategoryId: Boolean(env.EBAY_CATEGORY_ID),
            message: configured ? 'eBay Browse API configured' : 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local',
          })
          return
        }

        if (request.method !== 'POST' || !EBAY_ROUTES.has(route)) {
          response.statusCode = 404
          response.end()
          return
        }

        if (rejectUnsafePost(request, response)) return

        if (!configured) {
          writeJson(response, 401, { error: 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local' })
          return
        }

        try {
          const payload = await readJsonBody<EbaySearchPayload>(request, MAX_EBAY_BODY_BYTES)
          const queries = safeEbayQueries(payload)

          if (queries.length === 0) {
            writeJson(response, 400, { error: 'At least one eBay query is required' })
            return
          }

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
            writeJson(response, 502, { error: errors[0]?.error ?? 'eBay search failed', errors })
            return
          }

          writeJson(response, 200, {
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
          writeJson(response, routeErrorStatus(error), {
            error: ebayRouteErrorMessage(route, error instanceof Error ? error.message : 'eBay proxy request failed'),
          })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), prospectPulseProxy(), ebayProxy()],
})
