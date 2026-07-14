import type { ChecklistModel, MarketplaceListing } from '../types'
import {
  lowSerialNonAutoVariationLabel,
  normalizedTitleKey,
  superfractorVariationLabel,
  titleEligibleForBowmanChromeAutoModel,
  titleLooksLikeAutograph,
  titleLooksLikeBaseAuto,
  titleLooksLikeLowSerialNonAuto,
  titleLooksLikeSuperfractor,
  titleMatchesPlayerName,
  titleMatchesSearchTerm,
  titleMatchesVariationTerm,
  titleSerialDenominator,
  variationQueryTerm,
} from './cardTitleGuards'
import type { EbayBinScanResult, EbayBinSearchMode } from './ebay'
import { titleLooksHandSignedAuto } from './handSigned'
import { findStsRanking, primaryStsRank } from './stsRankings'

type FanaticsCollectQueryMeta = {
  q?: string
  playerName?: string
  release?: string
  releaseYear?: number
  category?: ChecklistModel['category']
  variationTerm?: string
  baseAutoOnly?: boolean
  lowSerialNonAuto?: boolean
  superfractorOnly?: boolean
  serialDenominator?: number
}

export type FanaticsCollectHit = {
  objectID?: string
  id?: string
  title?: string
  listingUuid?: string
  listingId?: string
  listing_id?: string
  slug?: string
  url?: string
  listingUrl?: string
  listing_url?: string
  marketplace?: string
  marketplaceSource?: string
  saleType?: string
  sale_type?: string
  status?: string
  askingPrice?: number | string | null
  currentPrice?: number | string | null
  buyNowPrice?: number | string | null
  price?: number | string | null
  imageSets?: unknown
  images?: unknown
  allowOffers?: boolean
  quantityAvailable?: number
  year?: number | string | null
  releaseYear?: number | string | null
  release_year?: number | string | null
  release?: string | null
  setName?: string | null
  set_name?: string | null
  product?: string | null
  productName?: string | null
  product_name?: string | null
  productTitle?: string | null
  categoryParent?: string | string[] | null
  subCategory1?: string | string[] | null
  cardNumber?: string | null
  card_number?: string | null
  serial?: string | number | null
  gradingService?: string | null
  grading_service?: string | null
  grader?: string | null
  grade?: number | string | null
  listedAt?: number | string | null
  listed_at?: number | string | null
  updatedAt?: number | string | null
  updated_at?: number | string | null
  sellerName?: string | null
  seller_name?: string | null
  _backstopQuery?: FanaticsCollectQueryMeta
}

type FanaticsCollectSearchResponse = {
  items?: FanaticsCollectHit[]
  errors?: Array<{ query?: string; error: string }>
  fetchedAt?: string
  stats?: Omit<EbayBinScanResult['stats'], 'mappedListings' | 'rejectedPlayerMismatches'>
  cache?: {
    state?: 'live' | 'fresh' | 'stale-fallback'
    ageSeconds?: number
    freshTtlSeconds?: number
    staleTtlSeconds?: number
  }
  error?: string
}

export type FanaticsCollectScopeType = 'player' | 'team' | 'set'

export type FanaticsCollectStatus = {
  provider: 'fanatics-collect'
  label: string
  configured: boolean
  reachable: boolean
  mode: 'disabled' | 'authorized-targeted-search' | 'user-scoped-search'
  marketplaceUrl: string
  termsUrl: string
  authorization?: {
    configured: boolean
    authorizationId?: string | null
  }
  targetedSearch?: {
    configured: boolean
    reachable: boolean
    mode?: 'authorized-targeted-search' | 'user-scoped-search'
  }
  cache?: {
    configured: boolean
    backend: 'redis' | 'none'
    freshTtlSeconds: number
    staleTtlSeconds: number
  }
  wideScan?: {
    configured: boolean
    mode: 'disabled' | 'authorized-feed'
    imageRights: boolean
    maxPages: number
    message: string
  }
  message: string
}

type FanaticsCollectWideSearchResponse = FanaticsCollectSearchResponse & {
  provenance?: {
    mode?: string
    authorizationId?: string
    imageRights?: boolean
  }
  coverage?: {
    complete?: boolean
    stoppedReason?: string
    nextCursor?: string | null
    pageSize?: number
    maxPages?: number
    pagesFetched?: number
    durationMs?: number
  }
}

export type FanaticsCollectWideMatchStats = {
  inputItems: number
  mappedListings: number
  rejectedInactive: number
  rejectedSaleType: number
  rejectedNonBowman: number
  rejectedNonAuto: number
  rejectedPrice: number
  rejectedYear: number
  rejectedPlayer: number
  rejectedAmbiguousPlayer: number
  rejectedModel: number
  rejectedAmbiguousModel: number
  rejectedTitleGuard: number
}

export type FanaticsCollectWideScanResult = EbayBinScanResult & {
  coverage: {
    complete: boolean
    stoppedReason: string
    pagesFetched: number
    durationMs: number
  }
  matchStats: FanaticsCollectWideMatchStats
  provenance: {
    mode: string
    authorizationId: string | null
  }
}

type FetchFanaticsCollectListingsOptions = {
  model: ChecklistModel
  minPrice?: number
  playerLimit?: number | null
  playerNames?: string[]
  limitPerPlayer?: number
  searchMode?: EbayBinSearchMode
  searchTerm?: string
  signal?: AbortSignal
  scope?: {
    type: FanaticsCollectScopeType
    value: string
  }
}

const FANATICS_CLIENT_QUERY_BATCH_SIZE = 120
const FANATICS_CLIENT_BATCH_CONCURRENCY = 3

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(items[index], index)
      }
    }),
  )
  return results
}

function numberValue(value: unknown, fallback = 0) {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value ?? '').replace(/[$,%\s,]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function firstString(values: unknown[], fallback = '') {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return fallback
}

function compactQuery(query: string) {
  const compacted = query.replace(/\s+/g, ' ').trim()
  if (compacted.length <= 100) return compacted
  return compacted.replace(' (auto,autograph)', ' auto').slice(0, 100).trim()
}

function releaseProductLabel(model: ChecklistModel) {
  if (model.category === 'draft') return 'Bowman Draft'
  if (model.category === 'chrome') return 'Bowman Chrome'
  return 'Bowman'
}

function releaseQueryProduct(model: ChecklistModel) {
  const product = releaseProductLabel(model).toLowerCase()
  return product.includes('chrome') ? product : `${product} chrome`
}

function buildPlayerQuery(model: ChecklistModel, playerName: string, variationTerm = '', baseAutoOnly = false): FanaticsCollectQueryMeta {
  const queryParts = [
    playerName,
    variationQueryTerm(variationTerm),
    String(model.releaseYear),
    releaseQueryProduct(model),
    'auto',
  ].filter(Boolean)
  return {
    q: compactQuery(queryParts.join(' ')),
    playerName,
    release: model.release,
    releaseYear: model.releaseYear,
    category: model.category,
    variationTerm: variationTerm || undefined,
    baseAutoOnly: baseAutoOnly || undefined,
  }
}

const LOW_SERIAL_NON_AUTO_DENOMINATORS = [99, 75, 50, 25, 10, 5, 1]

function buildLowSerialNonAutoQueries(model: ChecklistModel, playerName: string): FanaticsCollectQueryMeta[] {
  return LOW_SERIAL_NON_AUTO_DENOMINATORS.map((serialDenominator) => ({
    q: compactQuery(`${playerName} ${model.releaseYear} ${releaseQueryProduct(model)} 1st /${serialDenominator}`),
    playerName,
    release: model.release,
    releaseYear: model.releaseYear,
    category: model.category,
    lowSerialNonAuto: true,
    serialDenominator,
  }))
}

function buildSuperfractorQueries(playerName: string): FanaticsCollectQueryMeta[] {
  return ['Bowman Superfractor', 'Bowman Super Fractor', 'Bowman /1'].map((queryTerm) => ({
    q: compactQuery(`${playerName} ${queryTerm}`),
    playerName,
    release: 'Bowman Superfractor',
    superfractorOnly: true,
    serialDenominator: 1,
  }))
}

function selectedPlayers(options: {
  model: ChecklistModel
  playerLimit?: number | null
  playerNames?: string[]
  searchMode?: EbayBinSearchMode
  searchTerm?: string
}) {
  const { model, playerLimit, playerNames = [], searchMode = 'checklist', searchTerm = '' } = options
  const players = [...model.players].sort(
    (left, right) => right.baseAvgPrice - left.baseAvgPrice || left.playerName.localeCompare(right.playerName),
  )
  if (searchMode === 'player') return players.filter((player) => titleMatchesSearchTerm(player.playerName, searchTerm))
  if (playerNames.length > 0) {
    const queuedNames = new Set(playerNames.map(normalizedTitleKey))
    return players.filter((player) => queuedNames.has(normalizedTitleKey(player.playerName)))
  }
  if (!playerLimit || playerLimit <= 0) return players
  return players.slice(0, playerLimit)
}

function fanaticsCollectPrice(item: FanaticsCollectHit) {
  return firstPositive([item.askingPrice, item.buyNowPrice, item.currentPrice, item.price])
}

function firstPositive(values: unknown[]) {
  for (const value of values) {
    const parsed = numberValue(value, Number.NaN)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 0
}

function slugFromTitle(title: string) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function listingUuid(item: FanaticsCollectHit) {
  const explicit = firstString([item.listingUuid, item.listingId, item.listing_id, item.id])
  if (explicit) return explicit
  const objectId = firstString([item.objectID])
  const match = objectId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match?.[0] ?? ''
}

function fanaticsCollectListingUrl(item: FanaticsCollectHit, title: string) {
  const explicitUrl = firstString([item.listingUrl, item.listing_url, item.url])
  if (/^https:\/\/(?:www\.)?fanaticscollect\.com\//i.test(explicitUrl)) return explicitUrl
  const uuid = listingUuid(item)
  if (!uuid) return 'https://www.fanaticscollect.com/marketplace?type=FIXED'
  const slug = firstString([item.slug], slugFromTitle(title))
  return `https://www.fanaticscollect.com/buy-now/${uuid}/${slug || slugFromTitle(title)}`
}

function fanaticsCollectTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value
    const date = new Date(milliseconds)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (typeof value !== 'string' || !value.trim()) return null
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return fanaticsCollectTimestamp(numeric)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function fanaticsCollectReleaseYear(item: FanaticsCollectHit, title: string) {
  const explicit = numberValue(item.year ?? item.releaseYear ?? item.release_year, 0)
  if (explicit >= 1900 && explicit <= 2100) return explicit
  const titleYear = title.match(/\b(19\d{2}|20\d{2})\b/)
  return titleYear ? Number(titleYear[1]) : null
}

function fanaticsCollectIsActive(item: FanaticsCollectHit) {
  const status = firstString([item.status]).toLowerCase()
  return !status || /^(live|active|available)$/.test(status)
}

function fanaticsCollectIsFixedPrice(item: FanaticsCollectHit) {
  const saleType = firstString([item.saleType, item.sale_type, item.marketplace]).toLowerCase()
  return !saleType || /^(fixed|buy.?now|bin)$/.test(saleType)
}

function fanaticsCollectCategoryMatches(title: string, category?: ChecklistModel['category']) {
  if (!category) return true
  const isDraft = /\bbowman(?:\s+chrome)?\s+draft\b|\bdraft\b/i.test(title)
  if (category === 'draft') return isDraft
  if (isDraft) return false
  if (category === 'chrome') return /\bbowman\s+chrome\b/i.test(title)
  return /\bbowman\b/i.test(title)
}

function imageUrlFrom(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : ''
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = imageUrlFrom(entry)
      if (url) return url
    }
    return ''
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return (
      imageUrlFrom(record.imageUrl) ||
      imageUrlFrom(record.url) ||
      imageUrlFrom(record.thumbnail) ||
      imageUrlFrom(record.thumbnailUrl) ||
      imageUrlFrom(record.small) ||
      imageUrlFrom(record.medium) ||
      imageUrlFrom(record.large) ||
      imageUrlFrom(Object.values(record))
    )
  }
  return ''
}

function mapFanaticsCollectHitToListing(item: FanaticsCollectHit, fallbackReleaseLabel: string): MarketplaceListing | null {
  const meta = item._backstopQuery
  const playerName = firstString([meta?.playerName])
  const title = firstString([item.title])
  if (!playerName || !title || !titleMatchesPlayerName(title, playerName)) return null
  if (!fanaticsCollectIsActive(item) || !fanaticsCollectIsFixedPrice(item)) return null
  const releaseYear = fanaticsCollectReleaseYear(item, title)
  if (meta?.releaseYear && releaseYear !== meta.releaseYear) return null
  if (!fanaticsCollectCategoryMatches(title, meta?.category)) return null
  if (!titleMatchesVariationTerm(title, meta?.variationTerm)) return null
  if (meta?.superfractorOnly) {
    if (!titleLooksLikeSuperfractor(title)) return null
  } else if (meta?.lowSerialNonAuto) {
    if (!titleLooksLikeLowSerialNonAuto(title)) return null
  } else {
    if (meta?.baseAutoOnly && !titleLooksLikeBaseAuto(title)) return null
    if (!titleLooksLikeAutograph(title)) return null
    if (!titleEligibleForBowmanChromeAutoModel(title)) return null
  }

  const price = fanaticsCollectPrice(item)
  if (price <= 0) return null

  const stsRanking = findStsRanking(playerName)
  const isHandSigned = titleLooksHandSignedAuto(title)
  const parsedSerialDenominator = titleSerialDenominator(title)
  const serialDenominator = isHandSigned || meta?.baseAutoOnly ? null : meta?.superfractorOnly ? parsedSerialDenominator ?? 1 : parsedSerialDenominator
  const inferredVariation =
    isHandSigned
      ? 'Hand Signed Auto'
      : meta?.superfractorOnly
        ? superfractorVariationLabel(title)
      : meta?.lowSerialNonAuto
        ? lowSerialNonAutoVariationLabel(title, serialDenominator)
        : meta?.baseAutoOnly || titleLooksLikeBaseAuto(title)
          ? 'Base Auto'
          : meta?.variationTerm ?? ''
  const uuid = listingUuid(item)

  return {
    item_id: `fanatics-collect:${uuid || firstString([item.objectID, item.id], title)}`,
    player_name: playerName,
    title,
    current_price: price,
    shipping_cost: null,
    buying_format: 'Buy It Now',
    listing_status: 'active',
    listing_url: fanaticsCollectListingUrl(item, title),
    marketplace: 'fanatics-collect',
    marketplace_label: 'Fanatics Collect',
    image_url: imageUrlFrom(item.imageSets) || imageUrlFrom(item.images),
    created_at: fanaticsCollectTimestamp(item.listedAt ?? item.listed_at),
    listed_at: fanaticsCollectTimestamp(item.listedAt ?? item.listed_at),
    seller_username: firstString([item.sellerName, item.seller_name]) || null,
    release_year: releaseYear,
    product_type: meta?.superfractorOnly ? 'Bowman Superfractor' : fallbackReleaseLabel,
    release: meta?.release ?? fallbackReleaseLabel,
    variation: inferredVariation,
    serial_denominator: serialDenominator,
    is_hand_signed: isHandSigned,
    checklist_match: true,
    checklist_first_bowman: meta?.superfractorOnly ? /\b(1st|first)\b/i.test(title) : !meta?.lowSerialNonAuto,
    is_graded: Boolean(firstString([item.gradingService, item.grading_service, item.grader]) || item.grade),
    grader: firstString([item.gradingService, item.grading_service, item.grader]) || null,
    grade: item.grade ?? null,
    comps: [],
    prospect: {
      name: playerName,
      team: stsRanking?.team,
      level: stsRanking?.level,
      position: stsRanking?.pos,
      age: stsRanking?.age,
      ranking: stsRanking ? primaryStsRank(stsRanking) : null,
    },
  }
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

type FanaticsWideCandidate = {
  model: ChecklistModel
  playerName: string
  playerKey: string
}

function emptyWideMatchStats(inputItems: number): FanaticsCollectWideMatchStats {
  return {
    inputItems,
    mappedListings: 0,
    rejectedInactive: 0,
    rejectedSaleType: 0,
    rejectedNonBowman: 0,
    rejectedNonAuto: 0,
    rejectedPrice: 0,
    rejectedYear: 0,
    rejectedPlayer: 0,
    rejectedAmbiguousPlayer: 0,
    rejectedModel: 0,
    rejectedAmbiguousModel: 0,
    rejectedTitleGuard: 0,
  }
}

function fanaticsCollectExplicitRelease(item: FanaticsCollectHit) {
  return firstString([
    item.release,
    item.setName,
    item.set_name,
    item.product,
    item.productName,
    item.product_name,
  ])
}

function fanaticsCollectModelReleaseKey(model: ChecklistModel) {
  return normalizedTitleKey(`${model.releaseYear} ${model.release.replace(/[-_]+/g, ' ')}`)
}

function explicitReleaseMatchesModel(explicitRelease: string, model: ChecklistModel) {
  if (!explicitRelease) return false
  const explicit = normalizedTitleKey(explicitRelease)
  const modelKey = fanaticsCollectModelReleaseKey(model)
  if (explicit === modelKey) return true
  const hasYear = explicit.includes(String(model.releaseYear))
  if (!hasYear) return false
  if (model.category === 'draft') return /\bdraft\b/.test(explicit)
  if (model.category === 'chrome') return /\bchrome\b/.test(explicit) && !/\bdraft\b/.test(explicit)
  return /\bbowman\b/.test(explicit) && !/\b(?:chrome|draft)\b/.test(explicit)
}

function fanaticsCollectWideCandidates(models: ChecklistModel[]) {
  const byYear = new Map<number, FanaticsWideCandidate[]>()
  for (const model of models) {
    for (const player of model.players) {
      const playerKey = normalizedTitleKey(player.playerName)
      if (!playerKey) continue
      const candidates = byYear.get(model.releaseYear) ?? []
      candidates.push({ model, playerName: player.playerName, playerKey })
      byYear.set(model.releaseYear, candidates)
    }
  }
  return byYear
}

function uniquePlayerMatches(title: string, candidates: FanaticsWideCandidate[]) {
  const byPlayer = new Map<string, FanaticsWideCandidate[]>()
  for (const candidate of candidates) {
    if (!titleMatchesPlayerName(title, candidate.playerName)) continue
    const current = byPlayer.get(candidate.playerKey) ?? []
    current.push(candidate)
    byPlayer.set(candidate.playerKey, current)
  }
  const matches = [...byPlayer.entries()]
    .map(([playerKey, playerCandidates]) => ({ playerKey, candidates: playerCandidates }))
    .sort(
      (left, right) =>
        right.playerKey.split(' ').length - left.playerKey.split(' ').length ||
        right.playerKey.length - left.playerKey.length,
    )
  const best = matches[0]
  if (!best) return { candidates: [] as FanaticsWideCandidate[], ambiguous: false }
  const bestWords = best.playerKey.split(' ').length
  const bestLength = best.playerKey.length
  const equallySpecific = matches.filter(
    (match) => match.playerKey.split(' ').length === bestWords && match.playerKey.length === bestLength,
  )
  return {
    candidates: best.candidates,
    ambiguous: equallySpecific.length > 1,
  }
}

function categoryNarrowedCandidates(title: string, candidates: FanaticsWideCandidate[]) {
  const isDraft = /\bdraft\b/i.test(title)
  if (isDraft) return candidates.filter((candidate) => candidate.model.category === 'draft')
  return candidates.filter((candidate) => candidate.model.category !== 'draft')
}

function resolveFanaticsCollectWideCandidate(item: FanaticsCollectHit, modelsByYear: Map<number, FanaticsWideCandidate[]>) {
  const title = firstString([item.title, item.productTitle])
  const year = fanaticsCollectReleaseYear(item, title)
  if (!year) return { code: 'year' as const }
  const yearCandidates = modelsByYear.get(year) ?? []
  if (yearCandidates.length === 0) return { code: 'model' as const }

  const playerMatch = uniquePlayerMatches(title, yearCandidates)
  if (playerMatch.ambiguous) return { code: 'ambiguous-player' as const }
  if (playerMatch.candidates.length === 0) return { code: 'player' as const }

  let candidates = categoryNarrowedCandidates(title, playerMatch.candidates)
  const explicitRelease = fanaticsCollectExplicitRelease(item)
  if (explicitRelease) {
    const explicitMatches = candidates.filter((candidate) => explicitReleaseMatchesModel(explicitRelease, candidate.model))
    if (explicitMatches.length > 0) candidates = explicitMatches
  }

  const modelsByKey = new Map<string, FanaticsWideCandidate>()
  for (const candidate of candidates) {
    const key = `${candidate.model.category}:${candidate.model.releaseYear}:${normalizedTitleKey(candidate.model.release)}`
    modelsByKey.set(key, candidate)
  }
  const uniqueCandidates = [...modelsByKey.values()]
  if (uniqueCandidates.length === 0) return { code: 'model' as const }
  if (uniqueCandidates.length > 1) return { code: 'ambiguous-model' as const }
  return { code: 'matched' as const, candidate: uniqueCandidates[0], title, year }
}

export function mapAuthorizedFanaticsCollectInventory(
  items: FanaticsCollectHit[],
  models: ChecklistModel[],
): { listings: MarketplaceListing[]; stats: FanaticsCollectWideMatchStats } {
  const stats = emptyWideMatchStats(items.length)
  const modelsByYear = fanaticsCollectWideCandidates(models)
  const listings: MarketplaceListing[] = []

  for (const item of items) {
    const title = firstString([item.title, item.productTitle])
    if (!fanaticsCollectIsActive(item)) {
      stats.rejectedInactive += 1
      continue
    }
    if (!fanaticsCollectIsFixedPrice(item)) {
      stats.rejectedSaleType += 1
      continue
    }
    if (!/\bbowman\b/i.test(title)) {
      stats.rejectedNonBowman += 1
      continue
    }
    if (!titleLooksLikeAutograph(title)) {
      stats.rejectedNonAuto += 1
      continue
    }
    if (fanaticsCollectPrice(item) <= 0) {
      stats.rejectedPrice += 1
      continue
    }
    if (!titleEligibleForBowmanChromeAutoModel(title)) {
      stats.rejectedTitleGuard += 1
      continue
    }

    const resolved = resolveFanaticsCollectWideCandidate(item, modelsByYear)
    if (resolved.code === 'year') stats.rejectedYear += 1
    else if (resolved.code === 'player') stats.rejectedPlayer += 1
    else if (resolved.code === 'ambiguous-player') stats.rejectedAmbiguousPlayer += 1
    else if (resolved.code === 'model') stats.rejectedModel += 1
    else if (resolved.code === 'ambiguous-model') stats.rejectedAmbiguousModel += 1
    if (resolved.code !== 'matched') continue

    const { candidate } = resolved
    const listing = mapFanaticsCollectHitToListing(
      {
        ...item,
        title,
        _backstopQuery: {
          playerName: candidate.playerName,
          release: candidate.model.release,
          releaseYear: candidate.model.releaseYear,
          category: candidate.model.category,
        },
      },
      releaseProductLabel(candidate.model),
    )
    if (!listing) {
      stats.rejectedTitleGuard += 1
      continue
    }
    listings.push(listing)
  }

  const deduped = dedupeListings(listings)
  stats.mappedListings = deduped.length
  return { listings: deduped, stats }
}

export async function fetchFanaticsCollectStatus(signal?: AbortSignal): Promise<FanaticsCollectStatus> {
  const response = await fetch('/api/fanatics-collect/status', { signal })
  const payload = (await response.json()) as FanaticsCollectStatus & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? 'Could not read Fanatics Collect status')
  return payload
}

export async function fetchFanaticsCollectWideListings(options: {
  models: ChecklistModel[]
  minPrice?: number
  pageSize?: number
  maxPages?: number
  signal?: AbortSignal
}): Promise<FanaticsCollectWideScanResult> {
  if (options.models.length === 0) throw new Error('No checklist models are loaded for the Fanatics wide scan.')
  const response = await fetch('/api/fanatics-collect/wide-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      minPrice: options.minPrice ?? 0,
      pageSize: options.pageSize,
      maxPages: options.maxPages,
    }),
  })
  const payload = (await response.json()) as FanaticsCollectWideSearchResponse
  if (!response.ok) throw new Error(payload.error ?? 'Fanatics Collect wide scan failed')

  const mapped = mapAuthorizedFanaticsCollectInventory(payload.items ?? [], options.models)
  const coverage = {
    complete: Boolean(payload.coverage?.complete),
    stoppedReason: payload.coverage?.stoppedReason ?? 'unknown',
    pagesFetched: payload.coverage?.pagesFetched ?? payload.stats?.pagesFetched ?? 0,
    durationMs: payload.coverage?.durationMs ?? 0,
  }
  const errors = [...(payload.errors ?? [])]
  if (!coverage.complete && errors.length === 0) {
    errors.push({ error: `Fanatics wide scan is partial (${coverage.stoppedReason}).` })
  }

  return {
    listings: mapped.listings,
    fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    errors,
    stats: {
      queriesRun: payload.stats?.queriesRun ?? 1,
      queriesSucceeded: payload.stats?.queriesSucceeded ?? (coverage.complete ? 1 : 0),
      queriesFailed: payload.stats?.queriesFailed ?? (coverage.complete ? 0 : 1),
      pagesFetched: payload.stats?.pagesFetched ?? coverage.pagesFetched,
      upstreamTotal: payload.stats?.upstreamTotal ?? payload.items?.length ?? 0,
      dedupedItems: payload.stats?.dedupedItems ?? payload.items?.length ?? 0,
      mappedListings: mapped.listings.length,
      rejectedPlayerMismatches:
        mapped.stats.inputItems - mapped.stats.mappedListings,
      cacheHits: payload.stats?.cacheHits ?? 0,
      cacheMisses: payload.stats?.cacheMisses ?? 0,
      cacheWrites: payload.stats?.cacheWrites ?? 0,
      cacheSkips: payload.stats?.cacheSkips ?? 0,
      redisCacheHits: payload.stats?.redisCacheHits ?? 0,
      runtimeCacheHits: payload.stats?.runtimeCacheHits ?? 0,
      sqliteCacheHits: payload.stats?.sqliteCacheHits ?? 0,
      upstreamPagesFetched: payload.stats?.upstreamPagesFetched ?? coverage.pagesFetched,
    },
    coverage,
    matchStats: mapped.stats,
    provenance: {
      mode: payload.provenance?.mode ?? 'authorized-feed',
      authorizationId: payload.provenance?.authorizationId ?? null,
    },
  }
}

export async function fetchFanaticsCollectBinListings(options: FetchFanaticsCollectListingsOptions): Promise<EbayBinScanResult> {
  const searchMode = options.searchMode ?? 'checklist'
  const searchTerm = options.searchTerm?.trim() ?? ''
  if ((searchMode === 'player' || searchMode === 'variation') && !searchTerm) {
    throw new Error(searchMode === 'player' ? 'Enter a player name to scan.' : 'Enter a variation to scan.')
  }

  const players = selectedPlayers({
    model: options.model,
    playerLimit: options.playerLimit,
    playerNames: options.playerNames,
    searchMode,
    searchTerm,
  })
  if (players.length === 0) {
    const releaseLabel = `${options.model.releaseYear} ${releaseProductLabel(options.model)}`
    throw new Error(searchMode === 'player' ? `No ${releaseLabel} checklist player matches "${searchTerm}".` : 'No checklist players are available to scan.')
  }

  const queries = players.flatMap((player) =>
    searchMode === 'low-serial-non-auto'
      ? buildLowSerialNonAutoQueries(options.model, player.playerName)
      : searchMode === 'superfractor'
        ? buildSuperfractorQueries(player.playerName)
      : [
          buildPlayerQuery(
            options.model,
            player.playerName,
            searchMode === 'variation' ? searchTerm : '',
            searchMode === 'base-auto',
          ),
        ],
  )

  // A single server request is deliberately bounded. Split large checklist
  // scopes here so players beyond that ceiling are never silently omitted.
  const queryBatches: FanaticsCollectQueryMeta[][] = []
  for (let index = 0; index < queries.length; index += FANATICS_CLIENT_QUERY_BATCH_SIZE) {
    queryBatches.push(queries.slice(index, index + FANATICS_CLIENT_QUERY_BATCH_SIZE))
  }
  const batchResults = await mapWithConcurrency(
    queryBatches,
    FANATICS_CLIENT_BATCH_CONCURRENCY,
    async (batch) => {
      try {
        const response = await fetch('/api/fanatics-collect/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: options.signal,
          body: JSON.stringify({
            queries: batch,
            scope: options.scope ?? {
              type: 'set',
              value: `${options.model.releaseYear} ${releaseProductLabel(options.model)}`,
            },
            minPrice: options.minPrice ?? 0,
            limit: options.limitPerPlayer ?? 40,
          }),
        })
        const payload = (await response.json()) as FanaticsCollectSearchResponse
        if (!response.ok) throw new Error(payload.error ?? 'Fanatics Collect search failed')
        return { payload, error: null as string | null }
      } catch (error) {
        if (options.signal?.aborted) throw error
        return {
          payload: null,
          error: error instanceof Error ? error.message : 'Fanatics Collect search batch failed',
        }
      }
    },
  )
  const successfulPayloads = batchResults.flatMap((result) => (result.payload ? [result.payload] : []))
  if (successfulPayloads.length === 0) {
    throw new Error(batchResults.find((result) => result.error)?.error ?? 'Fanatics Collect search failed')
  }
  const batchErrors = batchResults.flatMap((result, index) =>
    result.error ? [{ query: `Fanatics batch ${index + 1}`, error: result.error }] : [],
  )
  const payload: FanaticsCollectSearchResponse = {
    items: successfulPayloads.flatMap((result) => result.items ?? []),
    errors: [...successfulPayloads.flatMap((result) => result.errors ?? []), ...batchErrors],
    fetchedAt: successfulPayloads.map((result) => result.fetchedAt ?? '').filter(Boolean).sort().at(-1) ?? new Date().toISOString(),
    stats: {
      queriesRun: successfulPayloads.reduce((total, result) => total + (result.stats?.queriesRun ?? 0), 0),
      queriesSucceeded: successfulPayloads.reduce((total, result) => total + (result.stats?.queriesSucceeded ?? 0), 0),
      queriesFailed: successfulPayloads.reduce((total, result) => total + (result.stats?.queriesFailed ?? 0), 0) + batchErrors.length,
      pagesFetched: successfulPayloads.reduce((total, result) => total + (result.stats?.pagesFetched ?? 0), 0),
      upstreamTotal: successfulPayloads.reduce((total, result) => total + (result.stats?.upstreamTotal ?? 0), 0),
      dedupedItems: successfulPayloads.reduce((total, result) => total + (result.stats?.dedupedItems ?? 0), 0),
      cacheHits: successfulPayloads.reduce((total, result) => total + (result.stats?.cacheHits ?? 0), 0),
      cacheMisses: successfulPayloads.reduce((total, result) => total + (result.stats?.cacheMisses ?? 0), 0),
      cacheWrites: successfulPayloads.reduce((total, result) => total + (result.stats?.cacheWrites ?? 0), 0),
      cacheSkips: successfulPayloads.reduce((total, result) => total + (result.stats?.cacheSkips ?? 0), 0),
      redisCacheHits: successfulPayloads.reduce((total, result) => total + (result.stats?.redisCacheHits ?? 0), 0),
      runtimeCacheHits: successfulPayloads.reduce((total, result) => total + (result.stats?.runtimeCacheHits ?? 0), 0),
      sqliteCacheHits: successfulPayloads.reduce((total, result) => total + (result.stats?.sqliteCacheHits ?? 0), 0),
      upstreamPagesFetched: successfulPayloads.reduce((total, result) => total + (result.stats?.upstreamPagesFetched ?? 0), 0),
    },
  }

  const fallbackReleaseLabel = releaseProductLabel(options.model)
  let rejectedPlayerMismatches = 0
  const listings = dedupeListings(
    (payload.items ?? []).flatMap((item) => {
      const listing = mapFanaticsCollectHitToListing(item, fallbackReleaseLabel)
      if (!listing) {
        rejectedPlayerMismatches += 1
        return []
      }
      return [listing]
    }),
  )

  return {
    listings,
    fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    errors: payload.errors ?? [],
    stats: {
      queriesRun: payload.stats?.queriesRun ?? queries.length,
      queriesSucceeded: payload.stats?.queriesSucceeded ?? 0,
      queriesFailed: payload.stats?.queriesFailed ?? 0,
      pagesFetched: payload.stats?.pagesFetched ?? 0,
      upstreamTotal: payload.stats?.upstreamTotal ?? 0,
      dedupedItems: payload.stats?.dedupedItems ?? payload.items?.length ?? 0,
      mappedListings: listings.length,
      rejectedPlayerMismatches,
      cacheHits: payload.stats?.cacheHits ?? 0,
      cacheMisses: payload.stats?.cacheMisses ?? 0,
      cacheWrites: payload.stats?.cacheWrites ?? 0,
      cacheSkips: payload.stats?.cacheSkips ?? 0,
      redisCacheHits: payload.stats?.redisCacheHits ?? 0,
      runtimeCacheHits: payload.stats?.runtimeCacheHits ?? 0,
      sqliteCacheHits: payload.stats?.sqliteCacheHits ?? 0,
      upstreamPagesFetched: payload.stats?.upstreamPagesFetched ?? payload.stats?.pagesFetched ?? 0,
    },
  }
}

export async function fetchFanaticsCollectChecklistListings(options: {
  models: ChecklistModel[]
  minPrice?: number
  limitPerPlayer?: number
  signal?: AbortSignal
}): Promise<EbayBinScanResult> {
  const models = options.models.filter((model) => model.players.length > 0)
  if (models.length === 0) throw new Error('No checklist models are loaded for the Fanatics scan.')

  const results = await mapWithConcurrency(models, 3, async (model) => {
    try {
      return {
        scan: await fetchFanaticsCollectBinListings({
          model,
          minPrice: options.minPrice,
          playerLimit: null,
          limitPerPlayer: options.limitPerPlayer ?? 16,
          searchMode: 'checklist',
          signal: options.signal,
        }),
        error: null as string | null,
      }
    } catch (error) {
      if (options.signal?.aborted) throw error
      return {
        scan: null,
        error: error instanceof Error ? error.message : `${model.release} Fanatics scan failed`,
      }
    }
  })
  const scans = results.flatMap((result) => (result.scan ? [result.scan] : []))
  if (scans.length === 0) {
    throw new Error(results.find((result) => result.error)?.error ?? 'Fanatics checklist scan failed')
  }

  const listings = dedupeListings(scans.flatMap((scan) => scan.listings))
  const errors = [
    ...scans.flatMap((scan) => scan.errors),
    ...results.flatMap((result, index) => result.error ? [{ query: models[index]?.release, error: result.error }] : []),
  ]
  return {
    listings,
    fetchedAt: scans.map((scan) => scan.fetchedAt).sort().at(-1) ?? new Date().toISOString(),
    errors,
    stats: {
      queriesRun: scans.reduce((total, scan) => total + scan.stats.queriesRun, 0),
      queriesSucceeded: scans.reduce((total, scan) => total + scan.stats.queriesSucceeded, 0),
      queriesFailed: scans.reduce((total, scan) => total + scan.stats.queriesFailed, 0) + results.length - scans.length,
      pagesFetched: scans.reduce((total, scan) => total + scan.stats.pagesFetched, 0),
      upstreamTotal: scans.reduce((total, scan) => total + scan.stats.upstreamTotal, 0),
      dedupedItems: listings.length,
      mappedListings: listings.length,
      rejectedPlayerMismatches: scans.reduce((total, scan) => total + scan.stats.rejectedPlayerMismatches, 0),
      cacheHits: scans.reduce((total, scan) => total + scan.stats.cacheHits, 0),
      cacheMisses: scans.reduce((total, scan) => total + scan.stats.cacheMisses, 0),
      cacheWrites: scans.reduce((total, scan) => total + scan.stats.cacheWrites, 0),
      cacheSkips: scans.reduce((total, scan) => total + scan.stats.cacheSkips, 0),
      redisCacheHits: scans.reduce((total, scan) => total + scan.stats.redisCacheHits, 0),
      runtimeCacheHits: scans.reduce((total, scan) => total + scan.stats.runtimeCacheHits, 0),
      sqliteCacheHits: scans.reduce((total, scan) => total + scan.stats.sqliteCacheHits, 0),
      upstreamPagesFetched: scans.reduce((total, scan) => total + scan.stats.upstreamPagesFetched, 0),
    },
  }
}
