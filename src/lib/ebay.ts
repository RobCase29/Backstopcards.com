import type { ChecklistModel, ProspectPulseListing } from '../types'
import { titleEligibleForBowmanChromeAutoModel } from './cardTitleGuards'
import { findStsRanking } from './stsRankings'

type EbayQueryMeta = {
  q?: string
  playerName?: string
  release?: string
  releaseYear?: number
  category?: ChecklistModel['category']
  variationTerm?: string
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
}

export type EbayBinScanResult = {
  listings: ProspectPulseListing[]
  fetchedAt: string
  errors: Array<{ query?: string; error: string }>
  stats: EbayScanStats
}

export type EbayBinSearchMode = 'checklist' | 'player' | 'variation'

type EbaySearchResponse = {
  items?: EbayItemSummary[]
  errors?: Array<{ query?: string; error: string }>
  fetchedAt?: string
  stats?: Omit<EbayScanStats, 'mappedListings' | 'rejectedPlayerMismatches'>
  error?: string
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

function normalizedWords(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function normalizedKey(value: string) {
  return normalizedWords(value).join(' ')
}

function matchesSearchTerm(value: string, searchTerm: string) {
  const haystack = normalizedKey(value)
  const needle = normalizedKey(searchTerm)
  if (!needle) return true
  if (haystack.includes(needle)) return true
  const words = needle.split(' ').filter(Boolean)
  return words.length > 0 && words.every((word) => haystack.includes(word))
}

function titleMatchesPlayer(title: string, playerName: string) {
  const titleWords = new Set(normalizedWords(title))
  const playerWords = normalizedWords(playerName).filter((word) => word.length > 1)
  if (playerWords.length < 2) return playerWords.every((word) => titleWords.has(word))
  return playerWords.every((word) => titleWords.has(word))
}

function titleMatchesVariationTerm(title: string, variationTerm?: string) {
  if (!variationTerm?.trim()) return true
  return matchesSearchTerm(title, variationTerm)
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

function buildPlayerQuery(model: ChecklistModel, playerName: string, variationTerm = ''): EbayQueryMeta {
  const queryParts = [
    playerName,
    variationTerm,
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
  }
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
  if (searchMode === 'player') return players.filter((player) => matchesSearchTerm(player.playerName, searchTerm))
  if (playerNames.length > 0) {
    const queuedNames = new Set(playerNames.map(normalizedKey))
    return players.filter((player) => queuedNames.has(normalizedKey(player.playerName)))
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

function itemImage(item: EbayItemSummary) {
  return firstString(
    [
      item.image?.imageUrl,
      ...(item.thumbnailImages ?? []).map((image) => image.imageUrl),
    ],
    '',
  )
}

function serialDenominatorFromTitle(title: string) {
  const match = title.match(/(?:\/|#\/|numbered\s+to\s+)(\d{1,3})\b/i)
  return match ? Number(match[1]) : null
}

function mapEbayItemToListing(item: EbayItemSummary, fallbackReleaseLabel: string): ProspectPulseListing | null {
  const meta = item._bowmanTraderQuery
  const playerName = firstString([meta?.playerName], '')
  const title = firstString([item.title], '')
  if (!playerName || !title || !titleMatchesPlayer(title, playerName)) return null
  if (!titleMatchesVariationTerm(title, meta?.variationTerm)) return null
  if (!titleEligibleForBowmanChromeAutoModel(title)) return null

  const buyingOptions = item.buyingOptions ?? []
  const fixedPrice = buyingOptions.includes('FIXED_PRICE') || buyingOptions.length === 0
  const itemId = firstString([item.legacyItemId, item.itemId], title)
  const price = numberValue(item.price?.value, 0)
  const stsRanking = findStsRanking(playerName)

  return {
    item_id: itemId,
    player_name: playerName,
    title,
    current_price: price,
    shipping_cost: minShippingCost(item),
    buying_format: fixedPrice ? 'Buy It Now' : buyingOptions.join(', '),
    listing_status: 'active',
    listing_url: firstString([item.itemAffiliateWebUrl, item.itemWebUrl], ''),
    image_url: itemImage(item),
    seller_username: item.seller?.username ?? null,
    seller_feedback_score: item.seller?.feedbackScore ?? null,
    created_at: item.itemCreationDate ?? null,
    end_time: item.itemEndDate ?? null,
    bid_count: item.bidCount ?? 0,
    release_year: meta?.releaseYear ?? null,
    product_type: fallbackReleaseLabel,
    release: meta?.release ?? fallbackReleaseLabel,
    variation: meta?.variationTerm ?? '',
    serial_denominator: serialDenominatorFromTitle(title),
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

export async function fetchEbayBinListings(options: {
  model: ChecklistModel
  minPrice?: number
  playerLimit?: number | null
  playerNames?: string[]
  limitPerPlayer?: number
  maxPagesPerPlayer?: number
  searchMode?: EbayBinSearchMode
  searchTerm?: string
  signal?: AbortSignal
}): Promise<EbayBinScanResult> {
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

  const queries = players.map((player) =>
    buildPlayerQuery(options.model, player.playerName, searchMode === 'variation' ? searchTerm : ''),
  )
  const response = await fetch('/api/ebay/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      queries,
      minPrice: options.minPrice ?? 0,
      limit: options.limitPerPlayer ?? 100,
      maxPages: options.maxPagesPerPlayer ?? 1,
      sort: 'price',
    }),
  })

  const payload = (await response.json()) as EbaySearchResponse
  if (!response.ok) throw new Error(payload.error ?? 'eBay search failed')

  const fallbackReleaseLabel = releaseProductLabel(options.model)
  let rejectedPlayerMismatches = 0
  const listings = dedupeListings(
    (payload.items ?? []).flatMap((item) => {
      const listing = mapEbayItemToListing(item, fallbackReleaseLabel)
      if (!listing) rejectedPlayerMismatches += 1
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
    },
  }
}
