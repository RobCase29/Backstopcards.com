import type {
  ChecklistModel,
  ChecklistPlayer,
  ChecklistVariation,
  FeedScanDepth,
  ListingKind,
  MarketMode,
  MarketplaceListing,
  PulseScanStats,
  PulseSnapshot,
} from '../types'
import { variationKey } from './matrix'

interface ListingFetchOptions {
  kind: Extract<ListingKind, 'live' | 'bin'>
  mode: MarketMode
  search?: string
  pageSize?: number
  maxPages?: number
  rankedOnly?: boolean
  priceMin?: number
  priceMax?: number
}

export type PulseAuthMode = 'server' | 'local' | 'public'

interface PulseStatus {
  connected: boolean
  serverConnected?: boolean
  authMode?: PulseAuthMode
  hasAnonKey: boolean
  message?: string
}

export interface PulseSession {
  access_token: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  token_type?: string
  user?: {
    email?: string
  }
}

interface ListingResponse {
  listings?: MarketplaceListing[]
  nextCursor?: number | string | null
  totalCount?: number | null
}

interface ListingFeedResult {
  listings: MarketplaceListing[]
  totalCount?: number | null
  pagesFetched: number
}

interface BandedBinResult extends ListingFeedResult {
  priceBands: number
}

interface ChecklistCoverageResult extends ListingFeedResult {
  scannedPlayers: number
  requestedPlayers: number
  complete: boolean
}

interface CategoryOverviewResponse {
  category?: ChecklistModel['category']
  label?: string
  years?: Array<{
    year: number
    release: string
    totalPlayers: number
    firstChromeAutos: number
    activeCount: number
  }>
}

interface CategoryYearMultipliersResponse {
  multipliers?: ChecklistVariation[]
}

interface ChecklistPlayersResponse {
  releaseYear?: number
  players?: ChecklistPlayer[]
  aggregatedMultipliers?: ChecklistVariation[]
}

type ChecklistCatalogRelease = {
  id: string
  label: string
  category: ChecklistModel['category']
  categoryLabel?: string
  year: number
  release: string
  releaseKey?: string
  totalPlayers?: number | null
  firstChromeAutos?: number | null
  activeChecklistPlayers?: number | null
}

interface LocalChecklistCatalogResponse {
  available?: boolean
  releases?: ChecklistCatalogRelease[]
}

interface LocalChecklistModelResponse extends ChecklistModel {
  available?: boolean
  releaseKey?: string
}

const SESSION_STORAGE_KEY = 'bowman-trader:pulse-session'
const SCAN_DEPTH: Record<FeedScanDepth, { maxPages: number; pageSize: number }> = {
  fast: { maxPages: 2, pageSize: 100 },
  deep: { maxPages: 4, pageSize: 100 },
}
const CHECKLIST_COVERAGE_CONCURRENCY = 24
const CHECKLIST_COVERAGE_PAGE_SIZE = 50
const DEEP_COVERAGE_BUDGET_MS = 72_000
const CHECKLIST_PROGRESS_EVERY_PLAYERS = 12
const CHECKLIST_PROGRESS_EVERY_MS = 900
const RESPONSE_CACHE_LIMIT = 500
const LISTING_CACHE_TTL_MS = 12_000
const CHECKLIST_CACHE_TTL_MS = 5 * 60_000
let staticChecklistSnapshotPromise: Promise<typeof import('../data/staticChecklistSnapshot')> | null = null

const responseCache = new Map<string, { expiresAt: number; value: unknown }>()
const inFlightCache = new Map<string, { expiresAt: number; promise: Promise<unknown> }>()
const signalIds = new WeakMap<AbortSignal, number>()
let signalCounter = 0
const requestTelemetry = {
  cacheHits: 0,
  dedupeHits: 0,
  networkCalls: 0,
}

function loadStaticChecklistSnapshot() {
  staticChecklistSnapshotPromise ??= import('../data/staticChecklistSnapshot')
  return staticChecklistSnapshotPromise
}

function canUseBrowserStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function getStoredPulseSession() {
  if (!canUseBrowserStorage()) return null
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as PulseSession
    if (!session.access_token) return null
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function savePulseSession(session: PulseSession) {
  if (!canUseBrowserStorage()) return
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearPulseSession() {
  if (!canUseBrowserStorage()) return
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  let payload: { error?: unknown; message?: unknown } | null
  try {
    payload = text ? (JSON.parse(text) as { error?: unknown; message?: unknown }) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.message === 'string'
          ? payload.message
          : text.trim()
            ? text.trim().slice(0, 240)
          : `Request failed with ${response.status}`
    throw new Error(message)
  }
  return payload as T
}

export async function getPulseStatus() {
  const response = await fetch('/api/prospectpulse/status')
  const status = await readJson<PulseStatus>(response)
  const session = getStoredPulseSession()
  const serverConnected = Boolean(status.serverConnected ?? status.authMode === 'server')
  const localConnected = Boolean(session?.access_token)
  const authMode: PulseAuthMode = serverConnected ? 'server' : localConnected ? 'local' : 'public'
  return {
    ...status,
    authMode,
    serverConnected,
    connected: serverConnected || localConnected,
  }
}

export async function loginProspectPulse(email: string, password: string) {
  const response = await fetch('/api/prospectpulse/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return readJson<PulseSession>(response)
}

function getPulseCacheTtlMs(functionName: string) {
  if (functionName === 'api-listings') return LISTING_CACHE_TTL_MS
  if (functionName === 'api-checklists') return CHECKLIST_CACHE_TTL_MS
  return 0
}

function getSignalKey(signal?: AbortSignal) {
  if (!signal) return 'none'
  const existing = signalIds.get(signal)
  if (existing) return String(existing)
  signalCounter += 1
  signalIds.set(signal, signalCounter)
  return String(signalCounter)
}

function pruneResponseCache(now = Date.now()) {
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now) responseCache.delete(key)
  }

  while (responseCache.size > RESPONSE_CACHE_LIMIT) {
    const oldestKey = responseCache.keys().next().value
    if (!oldestKey) break
    responseCache.delete(oldestKey)
  }
}

function getRequestTelemetry() {
  return { ...requestTelemetry }
}

function telemetryDelta(start: ReturnType<typeof getRequestTelemetry>) {
  return {
    cacheHits: requestTelemetry.cacheHits - start.cacheHits,
    dedupeHits: requestTelemetry.dedupeHits - start.dedupeHits,
    networkCalls: requestTelemetry.networkCalls - start.networkCalls,
  }
}

export async function callProspectPulse<T>(functionName: string, body: unknown, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('ProspectPulse request aborted', 'AbortError')

  const session = getStoredPulseSession()
  const bodyText = JSON.stringify(body)
  const cacheTtlMs = getPulseCacheTtlMs(functionName)
  const cacheKey =
    cacheTtlMs > 0 ? `${functionName}:${session?.access_token ?? 'anonymous'}:${bodyText}` : ''
  const now = Date.now()

  if (cacheTtlMs > 0) {
    pruneResponseCache(now)
    const cached = responseCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      requestTelemetry.cacheHits += 1
      return cached.value as T
    }

    const inFlightKey = `${cacheKey}:${getSignalKey(signal)}`
    const inFlight = inFlightCache.get(inFlightKey)
    if (inFlight && inFlight.expiresAt > now) {
      requestTelemetry.dedupeHits += 1
      return inFlight.promise as Promise<T>
    }

    requestTelemetry.networkCalls += 1
    const request = fetch(`/api/prospectpulse/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { 'X-ProspectPulse-Access-Token': session.access_token } : {}),
      },
      body: bodyText,
      signal,
    })
      .then((response) => readJson<T>(response))
      .then((payload) => {
        responseCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, value: payload })
        pruneResponseCache()
        return payload
      })
      .finally(() => {
        inFlightCache.delete(inFlightKey)
      })

    inFlightCache.set(inFlightKey, { expiresAt: now + 30_000, promise: request })
    return request
  }

  requestTelemetry.networkCalls += 1
  const response = await fetch(`/api/prospectpulse/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { 'X-ProspectPulse-Access-Token': session.access_token } : {}),
    },
    body: bodyText,
    signal,
  })
  return readJson<T>(response)
}

export async function fetchListingFeed(options: ListingFetchOptions, signal?: AbortSignal): Promise<ListingFeedResult> {
  const listings: MarketplaceListing[] = []
  let cursor: number | string | null = 0
  let totalCount: number | null | undefined = null
  let pagesFetched = 0
  const maxPages = options.maxPages ?? 3
  const pageSize = options.pageSize ?? 100

  for (let page = 0; page < maxPages && cursor !== null; page += 1) {
    const body: Record<string, unknown> = {
      action: options.kind,
      mode: options.mode,
      pageParam: cursor,
      pageSize,
    }

    if (options.search?.trim()) body.search = options.search.trim()
    if (options.kind === 'bin') {
      body.rankedOnly = options.rankedOnly ?? false
      if (options.priceMin && options.priceMin > 0) body.priceMin = options.priceMin
      if (options.priceMax) body.priceMax = options.priceMax
    }

    try {
      const data = await callProspectPulse<ListingResponse>('api-listings', body, signal)
      pagesFetched += 1
      listings.push(...(data.listings ?? []))
      cursor = data.nextCursor ?? null
      totalCount = data.totalCount ?? totalCount
    } catch (error) {
      if (listings.length > 0 && !isPulseAuthError(error)) {
        break
      }
      throw error
    }
  }

  return { listings, totalCount, pagesFetched }
}

function listingIdentity(listing: MarketplaceListing) {
  return String(listing.item_id ?? listing.id ?? listing.listing_url ?? listing.url ?? listing.title ?? '')
}

function dedupeListings(listings: MarketplaceListing[]) {
  const seen = new Set<string>()
  const deduped: MarketplaceListing[] = []

  for (const listing of listings) {
    const identity = listingIdentity(listing)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    deduped.push(listing)
  }

  return deduped
}

function uniquePlayerNames(players?: string[]) {
  const seen = new Set<string>()
  const names: string[] = []

  for (const player of players ?? []) {
    const name = player.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }

  return names
}

function playerMergeKey(playerName: string) {
  return playerName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function evidenceScore(salesCount?: number, price?: number) {
  return Math.max(0, salesCount ?? 0) * 10 + (price && price > 0 ? 1 : 0)
}

function mergePlayerVariations(
  primary: ChecklistPlayer['variations'] = [],
  secondary: ChecklistPlayer['variations'] = [],
) {
  const byVariation = new Map<string, ChecklistPlayer['variations'][number]>()

  for (const variation of [...primary, ...secondary]) {
    const key = variationKey(variation.variation)
    if (!key) continue
    const existing = byVariation.get(key)
    if (!existing) {
      byVariation.set(key, variation)
      continue
    }

    const preferred =
      evidenceScore(variation.salesCount, variation.avgPrice) > evidenceScore(existing.salesCount, existing.avgPrice)
        ? variation
        : existing
    const alternate = preferred === variation ? existing : variation
    byVariation.set(key, {
      ...preferred,
      salesCount: Math.max(preferred.salesCount ?? 0, alternate.salesCount ?? 0) || undefined,
      multiplier: preferred.multiplier > 0 ? preferred.multiplier : alternate.multiplier,
      avgPrice: preferred.avgPrice > 0 ? preferred.avgPrice : alternate.avgPrice,
    })
  }

  return [...byVariation.values()]
}

function mergeChecklistMultipliers(primary: ChecklistVariation[], secondary: ChecklistVariation[]) {
  const byVariation = new Map<string, ChecklistVariation>()

  for (const variation of [...primary, ...secondary]) {
    const key = variationKey(variation.variation)
    if (!key) continue
    const existing = byVariation.get(key)
    if (!existing) {
      byVariation.set(key, variation)
      continue
    }

    const preferred =
      evidenceScore(variation.totalSales ?? variation.playerCount, variation.avgPrice) >
      evidenceScore(existing.totalSales ?? existing.playerCount, existing.avgPrice)
        ? variation
        : existing
    const alternate = preferred === variation ? existing : variation
    byVariation.set(key, {
      ...preferred,
      playerCount: Math.max(preferred.playerCount ?? 0, alternate.playerCount ?? 0) || undefined,
      totalSales: Math.max(preferred.totalSales ?? 0, alternate.totalSales ?? 0) || undefined,
      sortOrder: Math.min(preferred.sortOrder ?? Number.MAX_SAFE_INTEGER, alternate.sortOrder ?? Number.MAX_SAFE_INTEGER),
    })
  }

  return [...byVariation.values()].sort((left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER))
}

export function mergeChecklistPlayers(primary: ChecklistPlayer[], localPlayers: ChecklistPlayer[]) {
  const byPlayer = new Map<string, ChecklistPlayer>()

  for (const player of [...primary, ...localPlayers]) {
    const key = playerMergeKey(player.playerName)
    if (!key) continue
    const existing = byPlayer.get(key)
    if (!existing) {
      byPlayer.set(key, player)
      continue
    }

    const playerHasBase = (player.baseSalesCount ?? 0) > 0 && (player.baseAvgPrice ?? 0) > 0
    const existingHasBase = (existing.baseSalesCount ?? 0) > 0 && (existing.baseAvgPrice ?? 0) > 0
    const usePlayerBase = playerHasBase && (!existingHasBase || (player.baseSalesCount ?? 0) >= (existing.baseSalesCount ?? 0))
    byPlayer.set(key, {
      ...existing,
      team: existing.team || player.team || null,
      status: existing.status || player.status || null,
      prospectId: existing.prospectId || player.prospectId || null,
      baseAvgPrice: usePlayerBase ? player.baseAvgPrice : existing.baseAvgPrice,
      baseSalesCount: usePlayerBase ? player.baseSalesCount : existing.baseSalesCount,
      baseSales: usePlayerBase ? player.baseSales ?? existing.baseSales : existing.baseSales,
      variations: mergePlayerVariations(existing.variations, player.variations),
    })
  }

  return [...byPlayer.values()]
}

export function mergeChecklistModels(remoteModel: ChecklistModel | null, localModel: ChecklistModel | null): ChecklistModel | null {
  if (!remoteModel) return localModel
  if (!localModel) return remoteModel

  return {
    ...remoteModel,
    totalPlayers:
      Math.max(remoteModel.totalPlayers ?? 0, localModel.totalPlayers ?? 0) ||
      remoteModel.totalPlayers ||
      localModel.totalPlayers,
    firstChromeAutos:
      Math.max(remoteModel.firstChromeAutos ?? 0, localModel.firstChromeAutos ?? 0) ||
      remoteModel.firstChromeAutos ||
      localModel.firstChromeAutos,
    activeChecklistPlayers:
      Math.max(remoteModel.activeChecklistPlayers ?? 0, localModel.activeChecklistPlayers ?? 0) ||
      remoteModel.activeChecklistPlayers ||
      localModel.activeChecklistPlayers,
    multipliers: mergeChecklistMultipliers(remoteModel.multipliers, localModel.multipliers),
    players: mergeChecklistPlayers(remoteModel.players, localModel.players),
    fetchedAt: new Date().toISOString(),
    source: remoteModel.players.length ? remoteModel.source : localModel.source,
  }
}

async function fetchLocalChecklistModel(release: string, signal?: AbortSignal) {
  if (typeof window === 'undefined') return null
  const url = new URL('/api/checklist/model', window.location.origin)
  url.searchParams.set('release', release)
  url.searchParams.set('source', 'waxpackhero')
  const response = await fetch(url, { signal })
  const payload = await readJson<LocalChecklistModelResponse>(response)
  if (!payload.available || !payload.players?.length) return null
  return payload as ChecklistModel
}

async function fetchLocalChecklistCatalog(minYear: number, signal?: AbortSignal) {
  if (typeof window === 'undefined') return []
  const url = new URL('/api/checklist/catalog', window.location.origin)
  url.searchParams.set('minYear', String(minYear))
  url.searchParams.set('source', 'waxpackhero')
  const response = await fetch(url, { signal })
  const payload = await readJson<LocalChecklistCatalogResponse>(response)
  return payload.available ? payload.releases ?? [] : []
}

function normalizeChecklistRelease(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function staticChecklistCatalog(minYear: number, categories: ChecklistModel['category'][]): Promise<ChecklistCatalogRelease[]> {
  const { STATIC_CHECKLIST_MODELS } = await loadStaticChecklistSnapshot()
  const categorySet = new Set(categories)
  return STATIC_CHECKLIST_MODELS.filter((model) => model.releaseYear >= minYear && categorySet.has(model.category))
    .map((model) => ({
      id: normalizeChecklistRelease(model.release),
      label: model.release.replaceAll('-', ' '),
      category: model.category,
      categoryLabel: model.category === 'draft' ? 'Bowman Draft' : model.category === 'chrome' ? 'Bowman Chrome' : 'Bowman',
      year: model.releaseYear,
      release: model.release,
      releaseKey: normalizeChecklistRelease(model.release),
      totalPlayers: model.totalPlayers ?? model.players.length,
      firstChromeAutos: model.firstChromeAutos ?? model.players.length,
      activeChecklistPlayers: model.activeChecklistPlayers ?? model.players.filter((player) => player.baseAvgPrice > 0).length,
    }))
    .sort((left, right) => right.year - left.year || left.category.localeCompare(right.category) || left.release.localeCompare(right.release))
}

async function findStaticChecklistModel(options: {
  category?: ChecklistModel['category']
  year?: number
  release?: string
}) {
  const { STATIC_CHECKLIST_GENERATED_AT, STATIC_CHECKLIST_MODELS } = await loadStaticChecklistSnapshot()
  const requestedRelease = normalizeChecklistRelease(options.release)
  const category = options.category
  const year = options.year
  const model =
    STATIC_CHECKLIST_MODELS.find((candidate) => {
      const candidateRelease = normalizeChecklistRelease(candidate.release)
      return requestedRelease && candidateRelease === requestedRelease
    }) ??
    STATIC_CHECKLIST_MODELS.find((candidate) => {
      if (year && candidate.releaseYear !== year) return false
      if (category && candidate.category !== category) return false
      return true
    }) ??
    null

  if (!model) return null
  return {
    ...model,
    fetchedAt: STATIC_CHECKLIST_GENERATED_AT,
  }
}

export async function fetchStaticChecklistModels(options: {
  minYear: number
  categories: ChecklistModel['category'][]
}) {
  const { STATIC_CHECKLIST_MODELS } = await loadStaticChecklistSnapshot()
  const categorySet = new Set(options.categories)
  return STATIC_CHECKLIST_MODELS.filter(
    (model) => model.releaseYear >= options.minYear && categorySet.has(model.category),
  )
}

function binPriceBands(options: { minPrice?: number; maxPrice?: number | null; scanDepth?: FeedScanDepth }) {
  const floor = Math.max(0, options.minPrice ?? 0)
  const cap =
    typeof options.maxPrice === 'number' && Number.isFinite(options.maxPrice)
      ? Math.max(floor, options.maxPrice)
      : null
  const depth = SCAN_DEPTH[options.scanDepth ?? 'fast']
  const ranges = [
    { priceMin: 0, priceMax: 25 },
    { priceMin: 25, priceMax: 100 },
    { priceMin: 100, priceMax: 250 },
    { priceMin: 250, priceMax: 500 },
    { priceMin: 500, priceMax: 1_000 },
    { priceMin: 1_000, priceMax: null },
  ]

  return ranges
    .map((range) => {
      const priceMin = Math.max(floor, range.priceMin)
      const priceMax =
        range.priceMax === null
          ? cap
          : cap === null
            ? range.priceMax
            : Math.min(range.priceMax, cap)
      return { priceMin, priceMax, maxPages: depth.maxPages, pageSize: depth.pageSize }
    })
    .filter((band) => band.priceMax === null || band.priceMax > band.priceMin)
}

export function isPulseAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /connect prospectpulse|unauthorized|401|403|jwt|token/i.test(message)
}

async function fetchBandedBinListings(options: {
  mode: MarketMode
  search?: string
  minPrice?: number
  maxPrice?: number | null
  scanDepth?: FeedScanDepth
  signal?: AbortSignal
}) {
  const results: ListingFeedResult[] = []
  let firstError: unknown = null
  const bands = binPriceBands({
    minPrice: options.minPrice,
    maxPrice: options.maxPrice,
    scanDepth: options.scanDepth,
  })

  const bandResults = await Promise.allSettled(
    bands.map((band) =>
      fetchListingFeed(
        {
          kind: 'bin',
          mode: options.mode,
          search: options.search,
          rankedOnly: false,
          priceMin: band.priceMin,
          priceMax: band.priceMax ?? undefined,
          maxPages: band.maxPages,
          pageSize: band.pageSize,
        },
        options.signal,
      ),
    ),
  )

  for (const result of bandResults) {
    if (result.status === 'fulfilled') {
      results.push(result.value)
    } else {
      if (isPulseAuthError(result.reason)) throw result.reason
      firstError ??= result.reason
    }
  }

  const listings = dedupeListings(results.flatMap((result) => result.listings))

  if (listings.length === 0 && firstError) {
    const fallback = await fetchListingFeed(
      {
        kind: 'bin',
        mode: options.mode,
        search: options.search,
        rankedOnly: false,
        priceMin: options.minPrice,
        priceMax: options.maxPrice ?? undefined,
        maxPages: 1,
        pageSize: 50,
      },
      options.signal,
    )
    return {
      listings: dedupeListings(fallback.listings),
      totalCount: fallback.totalCount ?? 0,
      pagesFetched: fallback.pagesFetched,
      priceBands: bands.length,
    }
  }

  return {
    listings,
    totalCount: results.reduce((total, result) => total + (result.totalCount ?? 0), 0),
    pagesFetched: results.reduce((total, result) => total + result.pagesFetched, 0),
    priceBands: bands.length,
  }
}

async function fetchChecklistCoverageListings(options: {
  mode: MarketMode
  players?: string[]
  minPrice?: number
  maxPrice?: number | null
  deadlineAt?: number
  signal?: AbortSignal
  onProgress?: (coverage: ChecklistCoverageResult) => void
}) {
  const playerNames = uniquePlayerNames(options.players)
  const results: ListingFeedResult[] = []
  let firstError: unknown = null
  let nextPlayerIndex = 0
  let scannedPlayers = 0
  let complete = true
  let lastProgressAt = 0

  const buildCoverage = (isComplete: boolean): ChecklistCoverageResult => ({
    listings: dedupeListings(results.flatMap((result) => result.listings)),
    totalCount: results.reduce((total, result) => total + (result.totalCount ?? 0), 0),
    pagesFetched: results.reduce((total, result) => total + result.pagesFetched, 0),
    scannedPlayers,
    requestedPlayers: playerNames.length,
    complete: isComplete && scannedPlayers >= playerNames.length,
  })

  const emitProgress = (force = false) => {
    if (!options.onProgress) return
    const now = Date.now()
    if (
      !force &&
      scannedPlayers % CHECKLIST_PROGRESS_EVERY_PLAYERS !== 0 &&
      now - lastProgressAt < CHECKLIST_PROGRESS_EVERY_MS
    ) {
      return
    }
    lastProgressAt = now
    options.onProgress(buildCoverage(false))
  }

  async function runWorker() {
    while (nextPlayerIndex < playerNames.length) {
      if (options.signal?.aborted) throw new DOMException('Checklist coverage scan aborted', 'AbortError')
      if (options.deadlineAt && Date.now() >= options.deadlineAt) {
        complete = false
        return
      }

      const playerName = playerNames[nextPlayerIndex]
      nextPlayerIndex += 1

      try {
        const result = await fetchListingFeed(
          {
            kind: 'bin',
            mode: options.mode,
            search: playerName,
            rankedOnly: false,
            priceMin: options.minPrice,
            priceMax: options.maxPrice ?? undefined,
            maxPages: 1,
            pageSize: CHECKLIST_COVERAGE_PAGE_SIZE,
          },
          options.signal,
        )
        results.push(result)
      } catch (error) {
        if (isPulseAuthError(error)) throw error
        firstError ??= error
      } finally {
        scannedPlayers += 1
        emitProgress()
      }
    }
  }

  const workerCount = Math.min(CHECKLIST_COVERAGE_CONCURRENCY, playerNames.length)
  const settledWorkers = await Promise.allSettled(Array.from({ length: workerCount }, () => runWorker()))

  for (const worker of settledWorkers) {
    if (worker.status === 'rejected') {
      if (isPulseAuthError(worker.reason)) throw worker.reason
      firstError ??= worker.reason
    }
  }

  emitProgress(true)

  const listings = dedupeListings(results.flatMap((result) => result.listings))
  if (listings.length === 0 && firstError) {
    return {
      listings: [],
      totalCount: 0,
      pagesFetched: 0,
      scannedPlayers,
      requestedPlayers: playerNames.length,
      complete: false,
    }
  }

  return {
    listings,
    totalCount: results.reduce((total, result) => total + (result.totalCount ?? 0), 0),
    pagesFetched: results.reduce((total, result) => total + result.pagesFetched, 0),
    scannedPlayers,
    requestedPlayers: playerNames.length,
    complete: complete && scannedPlayers >= playerNames.length,
  }
}

export async function fetchPulseSnapshot(options: {
  mode: MarketMode
  search?: string
  minPrice?: number
  maxPrice?: number | null
  scope?: 'bin' | 'all'
  scanDepth?: FeedScanDepth
  checklistPlayers?: string[]
  signal?: AbortSignal
  onPartialSnapshot?: (snapshot: PulseSnapshot) => void
}): Promise<PulseSnapshot> {
  const startedAt = Date.now()
  const telemetryStart = getRequestTelemetry()
  const depth = options.scanDepth ?? 'fast'
  const scope = options.scope ?? 'bin'
  const checklistPlayerNames = uniquePlayerNames(options.checklistPlayers)
  const shouldRunChecklistCoverage =
    depth === 'deep' && !options.search?.trim() && checklistPlayerNames.length > 0
  const emptyCoverage: ChecklistCoverageResult = {
    listings: [],
    totalCount: 0,
    pagesFetched: 0,
    scannedPlayers: 0,
    requestedPlayers: checklistPlayerNames.length,
    complete: !shouldRunChecklistCoverage,
  }
  const emptyBin: BandedBinResult = { listings: [], totalCount: 0, pagesFetched: 0, priceBands: 0 }
  const emptyLive: ListingFeedResult = { listings: [], totalCount: 0, pagesFetched: 0 }
  const buildSnapshot = (
    phase: PulseScanStats['phase'],
    bin: BandedBinResult,
    checklistCoverage: ChecklistCoverageResult,
    live: ListingFeedResult,
  ): PulseSnapshot => {
    const listings = dedupeListings([...bin.listings, ...checklistCoverage.listings, ...live.listings])
    const telemetry = telemetryDelta(telemetryStart)

    return {
      listings,
      source: 'live',
      fetchedAt: new Date().toISOString(),
      totalCount: (live.totalCount ?? 0) + (bin.totalCount ?? 0) + (checklistCoverage.totalCount ?? 0),
      scanStats: {
        depth,
        phase,
        durationMs: Date.now() - startedAt,
        networkCalls: telemetry.networkCalls,
        cacheHits: telemetry.cacheHits,
        dedupeHits: telemetry.dedupeHits,
        priceBands: bin.priceBands,
        pagesFetched: bin.pagesFetched + checklistCoverage.pagesFetched + live.pagesFetched,
        checklistPlayers: checklistCoverage.scannedPlayers,
        checklistPlayerUniverse: checklistCoverage.requestedPlayers,
        checklistCoverageComplete: checklistCoverage.complete,
        checklistCoverageRan: checklistCoverage.scannedPlayers > 0,
        binListings: bin.listings.length,
        checklistListings: checklistCoverage.listings.length,
        liveListings: live.listings.length,
        dedupedListings: listings.length,
        totalCount: (live.totalCount ?? 0) + (bin.totalCount ?? 0) + (checklistCoverage.totalCount ?? 0),
      },
    }
  }

  let latestBin: BandedBinResult | null = null
  const binPromise = fetchBandedBinListings({
    mode: options.mode,
    search: options.search,
    minPrice: options.minPrice,
    maxPrice: options.maxPrice,
    scanDepth: depth,
    signal: options.signal,
  }).then((bin) => {
    latestBin = bin
    return bin
  })
  const checklistCoveragePromise = shouldRunChecklistCoverage
    ? fetchChecklistCoverageListings({
        mode: options.mode,
        players: checklistPlayerNames,
        minPrice: options.minPrice,
        maxPrice: options.maxPrice,
        deadlineAt: Date.now() + DEEP_COVERAGE_BUDGET_MS,
        signal: options.signal,
        onProgress: options.onPartialSnapshot
          ? (coverage) => {
              if (!options.signal?.aborted) {
                options.onPartialSnapshot?.(buildSnapshot('coverage', latestBin ?? emptyBin, coverage, emptyLive))
              }
            }
          : undefined,
      })
    : Promise.resolve(emptyCoverage)
  const livePromise =
    scope === 'all'
      ? fetchListingFeed({ kind: 'live', mode: options.mode, search: options.search }, options.signal)
      : Promise.resolve(emptyLive)

  if (options.onPartialSnapshot) {
    binPromise
      .then((bin) => {
        if (!options.signal?.aborted) options.onPartialSnapshot?.(buildSnapshot('bands', bin, emptyCoverage, emptyLive))
      })
      .catch(() => {
        // The full refresh path handles auth, timeout, and fallback errors.
      })
  }

  const [bin, checklistCoverage, live] = await Promise.all([binPromise, checklistCoveragePromise, livePromise])

  return buildSnapshot('complete', bin, checklistCoverage, live)
}

export async function fetchChecklistModel(options: {
  category?: ChecklistModel['category']
  year?: number
  release?: string
  totalPlayers?: number | null
  firstChromeAutos?: number | null
  activeChecklistPlayers?: number | null
  signal?: AbortSignal
} = {}): Promise<ChecklistModel> {
  const category = options.category ?? 'bowman'
  const requestedReleaseYear = options.year ?? 2026
  const requestedRelease =
    options.release ??
    `${requestedReleaseYear}-${category === 'draft' ? 'Bowman-Draft' : category === 'chrome' ? 'Bowman-Chrome' : 'Bowman'}`
  const staticFirstModel = await findStaticChecklistModel({
    category,
    year: requestedReleaseYear,
    release: requestedRelease,
  })
  const localFirstModel = await fetchLocalChecklistModel(requestedRelease, options.signal).catch(() => null)
  if (localFirstModel?.players?.length) {
    return mergeChecklistModels(staticFirstModel, localFirstModel) ?? localFirstModel
  }

  let remoteModel: ChecklistModel | null = null
  let remoteError: unknown = null
  let release = requestedRelease
  let releaseYear = requestedReleaseYear

  try {
    const needsOverview =
      !options.release ||
      !options.year ||
      typeof options.totalPlayers === 'undefined' ||
      typeof options.firstChromeAutos === 'undefined' ||
      typeof options.activeChecklistPlayers === 'undefined'
    const overview = needsOverview
      ? await callProspectPulse<CategoryOverviewResponse>(
          'api-checklists',
          { action: 'getCategoryOverview', category },
          options.signal,
        ).catch(() => ({ years: [] }))
      : { years: [] }
    const latestYear = overview.years?.[0]
    releaseYear = options.year ?? latestYear?.year ?? 2026
    const releaseOverview = overview.years?.find((year) => year.year === releaseYear)
    release = options.release ?? releaseOverview?.release ?? `${releaseYear}-Bowman`
    const multiplierData = await callProspectPulse<CategoryYearMultipliersResponse>(
      'api-checklists',
      { action: 'getCategoryYearMultipliers', category, year: releaseYear },
      options.signal,
    )

    const playerData = await callProspectPulse<ChecklistPlayersResponse>(
      'api-checklists',
      { action: 'getChecklistPlayers', release },
      options.signal,
    ).catch(() => null)

    remoteModel = {
      category,
      release,
      releaseYear: playerData?.releaseYear ?? releaseYear,
      totalPlayers: options.totalPlayers ?? releaseOverview?.totalPlayers ?? null,
      firstChromeAutos: options.firstChromeAutos ?? releaseOverview?.firstChromeAutos ?? null,
      activeChecklistPlayers: options.activeChecklistPlayers ?? releaseOverview?.activeCount ?? null,
      multipliers: multiplierData.multipliers ?? playerData?.aggregatedMultipliers ?? [],
      players: playerData?.players ?? [],
      fetchedAt: new Date().toISOString(),
      source: playerData?.players?.length ? 'authenticated-player-model' : 'public-multipliers',
    }
  } catch (error) {
    remoteError = error
  }

  const localModel = localFirstModel ?? (await fetchLocalChecklistModel(release || requestedRelease, options.signal).catch(() => null))
  const staticModel =
    staticFirstModel ??
    (await findStaticChecklistModel({
      category,
      year: releaseYear,
      release: release || requestedRelease,
    }))
  const baselineModel = mergeChecklistModels(staticModel, localModel)
  const merged = mergeChecklistModels(remoteModel, baselineModel)
  if (merged) return merged
  if (remoteError) throw remoteError
  throw new Error('Checklist model load failed')
}

export async function fetchChecklistCatalog(options: {
  categories?: ChecklistModel['category'][]
  minYear?: number
  signal?: AbortSignal
} = {}) {
  const categories = options.categories ?? ['bowman', 'chrome', 'draft']
  const minYear = options.minYear ?? 2018
  const localCatalog = await fetchLocalChecklistCatalog(minYear, options.signal).catch(() => [])
  if (localCatalog.length > 0) {
    return localCatalog.sort(
      (left, right) => right.year - left.year || left.category.localeCompare(right.category) || left.release.localeCompare(right.release),
    )
  }

  const remoteOverviews = await Promise.allSettled(
    categories.map(async (category) => {
      const overview = await callProspectPulse<CategoryOverviewResponse>(
        'api-checklists',
        { action: 'getCategoryOverview', category },
        options.signal,
      )
      return { category, label: overview.label ?? category, years: overview.years ?? [] }
    }),
  )

  const remoteCatalog: ChecklistCatalogRelease[] = remoteOverviews
    .flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    .flatMap((overview) =>
      overview.years
        .filter((year) => year.year >= minYear)
        .map((year) => ({
          id: `${overview.category}-${year.year}`,
          label: year.release.replaceAll('-', ' '),
          category: overview.category,
          categoryLabel: overview.label,
          year: year.year,
          release: year.release,
          totalPlayers: year.totalPlayers ?? null,
          firstChromeAutos: year.firstChromeAutos ?? null,
          activeChecklistPlayers: year.activeCount ?? null,
        })),
    )

  const merged = new Map<string, (typeof remoteCatalog)[number]>()
  const staticCatalog = await staticChecklistCatalog(minYear, categories)

  for (const release of [...remoteCatalog, ...staticCatalog, ...localCatalog]) {
    const key = `${release.category}:${release.year}:${release.release}`.toLowerCase()
    const current = merged.get(key)
    if (!current) {
      merged.set(key, release)
      continue
    }
    merged.set(key, {
      ...current,
      totalPlayers:
        Math.max(current.totalPlayers ?? 0, release.totalPlayers ?? 0) ||
        current.totalPlayers ||
        release.totalPlayers,
      firstChromeAutos:
        Math.max(current.firstChromeAutos ?? 0, release.firstChromeAutos ?? 0) ||
        current.firstChromeAutos ||
        release.firstChromeAutos,
      activeChecklistPlayers:
        Math.max(current.activeChecklistPlayers ?? 0, release.activeChecklistPlayers ?? 0) ||
        current.activeChecklistPlayers ||
        release.activeChecklistPlayers,
    })
  }

  return [...merged.values()]
    .sort((left, right) => right.year - left.year || left.category.localeCompare(right.category) || left.release.localeCompare(right.release))
}
