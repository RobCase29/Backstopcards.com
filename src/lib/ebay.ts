import type { ChecklistModel, ProspectPulseListing } from '../types'
import {
  goldInkVariationLabel,
  lowSerialNonAutoVariationLabel,
  normalizedTitleKey,
  superfractorVariationLabel,
  titleEligibleForBowmanChromeAutoModel,
  titleLooksLikeGoldInkAuto,
  titleLooksLikeBaseAuto,
  titleLooksLikeLowSerialNonAuto,
  titleLooksLikeSuperfractor,
  titleMatchesPlayerName,
  titleMatchesSearchTerm,
  titleMatchesVariationTerm,
  titleSerialDenominator,
  variationQueryTerm,
} from './cardTitleGuards'
import { titleLooksHandSignedAuto } from './handSigned'
import { findStsRanking } from './stsRankings'

type EbayQueryMeta = {
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

type EbayMoney = {
  value?: string | number
  currency?: string
}

type EbayImage = {
  imageUrl?: string
}

type EbaySeller = {
  username?: string
  feedbackScore?: number
}

type EbayShippingOption = {
  shippingCost?: EbayMoney
}

type EbayItemSummary = {
  itemId?: string
  legacyItemId?: string
  title?: string
  itemWebUrl?: string
  itemAffiliateWebUrl?: string
  image?: EbayImage
  thumbnailImages?: EbayImage[]
  price?: EbayMoney
  currentBidPrice?: EbayMoney
  convertedCurrentBidPrice?: EbayMoney
  buyingOptions?: string[]
  seller?: EbaySeller
  shippingOptions?: EbayShippingOption[]
  itemCreationDate?: string
  itemEndDate?: string
  bidCount?: number
  _bowmanTraderQuery?: EbayQueryMeta
}

export type EbayStatus = {
  configured: boolean
  environment: 'sandbox' | 'production'
  marketplaceId: string
  hasCategoryId: boolean
  cache?: {
    enabled: boolean
    fixedPriceTtlSeconds: number
    auctionTtlSeconds: number
    soldTtlSeconds: number
    redisCache: boolean
    runtimeCache: boolean
    localCache: boolean
  }
  message: string
}

export type EbayScanStats = {
  queriesRun: number
  queriesSucceeded: number
  queriesFailed: number
  pagesFetched: number
  upstreamTotal: number
  dedupedItems: number
  mappedListings: number
  rejectedPlayerMismatches: number
  cacheHits: number
  cacheMisses: number
  cacheWrites: number
  cacheSkips: number
  redisCacheHits: number
  runtimeCacheHits: number
  sqliteCacheHits: number
  upstreamPagesFetched: number
}

export type EbayBinScanResult = {
  listings: ProspectPulseListing[]
  fetchedAt: string
  errors: Array<{ query?: string; error: string }>
  stats: EbayScanStats
}

export type EbayBinSearchMode = 'checklist' | 'player' | 'variation' | 'base-auto' | 'low-serial-non-auto' | 'superfractor'
export type EbayListingMode = 'bin' | 'auction'

export class EbayRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EbayRateLimitError'
  }
}

type EbaySearchResponse = {
  items?: EbayItemSummary[]
  errors?: Array<{ query?: string; error: string }>
  fetchedAt?: string
  stats?: Omit<EbayScanStats, 'mappedListings' | 'rejectedPlayerMismatches'>
  error?: string
}

function isEbayRateLimitMessage(message: string) {
  return /(?:^|\D)429(?:\D|$)|rate.?limit|too many requests/i.test(message)
}

export function isEbayRateLimitError(error: unknown) {
  return error instanceof EbayRateLimitError || (error instanceof Error && isEbayRateLimitMessage(error.message))
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

function buildPlayerQuery(model: ChecklistModel, playerName: string, variationTerm = '', baseAutoOnly = false): EbayQueryMeta {
  const queryParts = [
    playerName,
    variationQueryTerm(variationTerm),
    String(model.releaseYear),
    releaseQueryProduct(model),
    '1st auto',
  ].filter(Boolean)
  const queryCore = queryParts.join(' ')
  return {
    q: compactQuery(queryCore),
    playerName,
    release: model.release,
    releaseYear: model.releaseYear,
    category: model.category,
    variationTerm: variationTerm || undefined,
    baseAutoOnly: baseAutoOnly || undefined,
  }
}

const LOW_SERIAL_NON_AUTO_DENOMINATORS = [99, 75, 50, 25, 10, 5, 1]

function buildLowSerialNonAutoQueries(model: ChecklistModel, playerName: string): EbayQueryMeta[] {
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

function buildSuperfractorQueries(playerName: string): EbayQueryMeta[] {
  return ['Bowman Superfractor', 'Bowman Super Fractor', 'Bowman /1'].map((queryTerm) => ({
    q: compactQuery(`${playerName} ${queryTerm}`),
    playerName,
    release: 'Bowman Superfractor',
    superfractorOnly: true,
    serialDenominator: 1,
  }))
}

function priorityAuctionVariationTerms(model: ChecklistModel) {
  return [
    ...new Set(
      model.multipliers
        .map((variation) => variation.variation)
        .filter((variation) => /\bgold\b/i.test(variation) && /\bimage\b|\bink\b/i.test(variation) && /\/\s*15\b/.test(variation)),
    ),
  ]
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

function minShippingCost(item: EbayItemSummary) {
  const costs = (item.shippingOptions ?? [])
    .map((option) => numberValue(option.shippingCost?.value, Number.NaN))
    .filter(Number.isFinite)
  if (costs.length === 0) return 0
  return Math.max(0, Math.min(...costs))
}

function firstPositiveMoney(values: Array<EbayMoney | undefined>) {
  for (const value of values) {
    const parsed = numberValue(value?.value, Number.NaN)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 0
}

function currentListingPrice(item: EbayItemSummary, listingMode: EbayListingMode) {
  if (listingMode === 'auction') {
    return firstPositiveMoney([item.currentBidPrice, item.convertedCurrentBidPrice, item.price])
  }
  return firstPositiveMoney([item.price, item.currentBidPrice, item.convertedCurrentBidPrice])
}

function itemImage(item: EbayItemSummary) {
  return firstString(
    [
      item.image?.imageUrl,
      ...(item.thumbnailImages ?? []).map((image) => image.imageUrl),
    ],
    '',
  )
}

function mapEbayItemToListing(item: EbayItemSummary, fallbackReleaseLabel: string, listingMode: EbayListingMode): ProspectPulseListing | null {
  const meta = item._bowmanTraderQuery
  const playerName = firstString([meta?.playerName], '')
  const title = firstString([item.title], '')
  if (!playerName || !title || !titleMatchesPlayerName(title, playerName)) return null
  if (!titleMatchesVariationTerm(title, meta?.variationTerm)) return null
  if (meta?.superfractorOnly) {
    if (!titleLooksLikeSuperfractor(title)) return null
  } else if (meta?.lowSerialNonAuto) {
    if (!titleLooksLikeLowSerialNonAuto(title)) return null
  } else {
    if (meta?.baseAutoOnly && !titleLooksLikeBaseAuto(title)) return null
    if (!titleEligibleForBowmanChromeAutoModel(title)) return null
  }

  const buyingOptions = item.buyingOptions ?? []
  const fixedPrice = listingMode === 'bin' || buyingOptions.includes('FIXED_PRICE')
  const auction = listingMode === 'auction' || buyingOptions.includes('AUCTION')
  const itemId = firstString([item.legacyItemId, item.itemId], title)
  const price = currentListingPrice(item, listingMode)
  const stsRanking = findStsRanking(playerName)
  const isHandSigned = titleLooksHandSignedAuto(title)
  const isGoldInk = titleLooksLikeGoldInkAuto(title)
  const parsedSerialDenominator = titleSerialDenominator(title) ?? (isGoldInk ? 15 : null)
  const serialDenominator = isHandSigned || meta?.baseAutoOnly ? null : meta?.superfractorOnly ? parsedSerialDenominator ?? 1 : parsedSerialDenominator
  const inferredVariation =
    isHandSigned
      ? 'Hand Signed Auto'
      : isGoldInk
        ? goldInkVariationLabel(title)
      : meta?.superfractorOnly
        ? superfractorVariationLabel(title)
      : meta?.lowSerialNonAuto
        ? lowSerialNonAutoVariationLabel(title, serialDenominator)
        : meta?.baseAutoOnly || titleLooksLikeBaseAuto(title)
          ? 'Base Auto'
          : meta?.variationTerm ?? ''

  return {
    item_id: itemId,
    player_name: playerName,
    title,
    current_price: price,
    shipping_cost: minShippingCost(item),
    buying_format: auction && !fixedPrice ? 'Auction' : fixedPrice ? 'Buy It Now' : buyingOptions.join(', '),
    listing_status: 'active',
    listing_url: firstString([item.itemAffiliateWebUrl, item.itemWebUrl], ''),
    marketplace: 'ebay',
    marketplace_label: 'eBay',
    image_url: itemImage(item),
    seller_username: item.seller?.username ?? null,
    seller_feedback_score: item.seller?.feedbackScore ?? null,
    created_at: item.itemCreationDate ?? null,
    end_time: item.itemEndDate ?? null,
    bid_count: item.bidCount ?? 0,
    release_year: meta?.releaseYear ?? null,
    product_type: meta?.superfractorOnly ? 'Bowman Superfractor' : fallbackReleaseLabel,
    release: meta?.release ?? fallbackReleaseLabel,
    variation: inferredVariation,
    serial_denominator: serialDenominator,
    is_hand_signed: isHandSigned,
    checklist_match: true,
    checklist_first_bowman: meta?.superfractorOnly ? /\b(1st|first)\b/i.test(title) : undefined,
    comps: [],
    prospect: {
      name: playerName,
      team: stsRanking?.team,
      level: stsRanking?.level,
      position: stsRanking?.pos,
      age: stsRanking?.age,
      ranking: stsRanking?.prospectRank ?? stsRanking?.rank,
    },
  }
}

function listingIdentity(listing: ProspectPulseListing) {
  return String(listing.item_id ?? listing.id ?? listing.listing_url ?? listing.url ?? listing.title ?? '')
}

function dedupeListings(listings: ProspectPulseListing[]) {
  const seen = new Set<string>()
  const deduped: ProspectPulseListing[] = []
  for (const listing of listings) {
    const identity = listingIdentity(listing)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    deduped.push(listing)
  }
  return deduped
}

export async function fetchEbayStatus(signal?: AbortSignal): Promise<EbayStatus> {
  const response = await fetch('/api/ebay/status', { signal })
  if (!response.ok) throw new Error('Could not read eBay status')
  return response.json() as Promise<EbayStatus>
}

type FetchEbayListingsOptions = {
  model: ChecklistModel
  minPrice?: number
  playerLimit?: number | null
  playerNames?: string[]
  limitPerPlayer?: number
  maxPagesPerPlayer?: number
  maxHoursToClose?: number
  searchMode?: EbayBinSearchMode
  searchTerm?: string
  signal?: AbortSignal
}

async function fetchEbayListings(options: FetchEbayListingsOptions & { listingMode: EbayListingMode }): Promise<EbayBinScanResult> {
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

  const goldInkAuctionTerms =
    options.listingMode === 'auction' && (searchMode === 'checklist' || searchMode === 'player')
      ? priorityAuctionVariationTerms(options.model)
      : []
  const queries = players.flatMap((player) => {
    if (searchMode === 'low-serial-non-auto') return buildLowSerialNonAutoQueries(options.model, player.playerName)
    if (searchMode === 'superfractor') return buildSuperfractorQueries(player.playerName)

    const baseQuery = buildPlayerQuery(
      options.model,
      player.playerName,
      searchMode === 'variation' ? searchTerm : '',
      searchMode === 'base-auto',
    )
    if (searchMode === 'variation' || searchMode === 'base-auto' || goldInkAuctionTerms.length === 0) return [baseQuery]

    return [
      baseQuery,
      ...goldInkAuctionTerms.map((variationTerm) => buildPlayerQuery(options.model, player.playerName, variationTerm)),
    ]
  })
  const response = await fetch('/api/ebay/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      queries,
      minPrice: options.minPrice ?? 0,
      limit: options.limitPerPlayer ?? 100,
      maxPages: options.maxPagesPerPlayer ?? 1,
      sort: options.listingMode === 'auction' ? 'endingSoonest' : 'price',
      buyingOption: options.listingMode === 'auction' ? 'AUCTION' : 'FIXED_PRICE',
      maxHoursToClose: options.listingMode === 'auction' ? options.maxHoursToClose ?? 24 : undefined,
    }),
  })

  const payload = (await response.json()) as EbaySearchResponse
  if (!response.ok) {
    const message = payload.error ?? 'eBay search failed'
    if (response.status === 429 || isEbayRateLimitMessage(message)) throw new EbayRateLimitError(message)
    throw new Error(message)
  }

  const fallbackReleaseLabel = releaseProductLabel(options.model)
  let rejectedPlayerMismatches = 0
  const maxHoursToClose = options.listingMode === 'auction' ? options.maxHoursToClose ?? 24 : null
  const listings = dedupeListings(
    (payload.items ?? []).flatMap((item) => {
      const listing = mapEbayItemToListing(item, fallbackReleaseLabel, options.listingMode)
      if (!listing) {
        rejectedPlayerMismatches += 1
        return []
      }
      if (maxHoursToClose !== null) {
        const endTime = listing.end_time ? new Date(listing.end_time).getTime() : Number.NaN
        const hoursToClose = (endTime - Date.now()) / (1000 * 60 * 60)
        if (!Number.isFinite(hoursToClose) || hoursToClose <= 0 || hoursToClose > maxHoursToClose) {
          rejectedPlayerMismatches += 1
          return []
        }
      }
      return listing ? [listing] : []
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

export async function fetchEbayBinListings(options: FetchEbayListingsOptions): Promise<EbayBinScanResult> {
  return fetchEbayListings({ ...options, listingMode: 'bin' })
}

export async function fetchEbayAuctionListings(options: FetchEbayListingsOptions): Promise<EbayBinScanResult> {
  return fetchEbayListings({ ...options, listingMode: 'auction', maxHoursToClose: options.maxHoursToClose ?? 24 })
}
