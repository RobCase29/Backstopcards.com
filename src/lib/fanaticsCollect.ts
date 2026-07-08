import type { ChecklistModel, MarketplaceListing } from '../types'
import {
  lowSerialNonAutoVariationLabel,
  normalizedTitleKey,
  superfractorVariationLabel,
  titleEligibleForBowmanChromeAutoModel,
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
import { findStsRanking } from './stsRankings'

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

type FanaticsCollectHit = {
  objectID?: string
  title?: string
  listingUuid?: string
  slug?: string
  marketplace?: string
  marketplaceSource?: string
  status?: string
  askingPrice?: number | string | null
  currentPrice?: number | string | null
  buyNowPrice?: number | string | null
  price?: number | string | null
  imageSets?: unknown
  images?: unknown
  allowOffers?: boolean
  quantityAvailable?: number
  _backstopQuery?: FanaticsCollectQueryMeta
}

type FanaticsCollectSearchResponse = {
  items?: FanaticsCollectHit[]
  errors?: Array<{ query?: string; error: string }>
  fetchedAt?: string
  stats?: Omit<EbayBinScanResult['stats'], 'mappedListings' | 'rejectedPlayerMismatches'>
  error?: string
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
  const explicit = firstString([item.listingUuid])
  if (explicit) return explicit
  const objectId = firstString([item.objectID])
  const match = objectId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match?.[0] ?? ''
}

function fanaticsCollectListingUrl(item: FanaticsCollectHit, title: string) {
  const uuid = listingUuid(item)
  if (!uuid) return 'https://www.fanaticscollect.com/marketplace?type=FIXED'
  const slug = firstString([item.slug], slugFromTitle(title))
  return `https://www.fanaticscollect.com/buy-now/${uuid}/${slug || slugFromTitle(title)}`
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
  if (!titleMatchesVariationTerm(title, meta?.variationTerm)) return null
  if (meta?.superfractorOnly) {
    if (!titleLooksLikeSuperfractor(title)) return null
  } else if (meta?.lowSerialNonAuto) {
    if (!titleLooksLikeLowSerialNonAuto(title)) return null
  } else {
    if (meta?.baseAutoOnly && !titleLooksLikeBaseAuto(title)) return null
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
    item_id: uuid || firstString([item.objectID], title),
    player_name: playerName,
    title,
    current_price: price,
    shipping_cost: 0,
    buying_format: 'Buy It Now',
    listing_status: 'active',
    listing_url: fanaticsCollectListingUrl(item, title),
    marketplace: 'fanatics-collect',
    marketplace_label: 'Fanatics Collect',
    image_url: imageUrlFrom(item.imageSets) || imageUrlFrom(item.images),
    release_year: meta?.releaseYear ?? null,
    product_type: meta?.superfractorOnly ? 'Bowman Superfractor' : fallbackReleaseLabel,
    release: meta?.release ?? fallbackReleaseLabel,
    variation: inferredVariation,
    serial_denominator: serialDenominator,
    is_hand_signed: isHandSigned,
    checklist_match: true,
    checklist_first_bowman: meta?.superfractorOnly ? /\b(1st|first)\b/i.test(title) : !meta?.lowSerialNonAuto,
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

  const response = await fetch('/api/fanatics-collect/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      queries,
      minPrice: options.minPrice ?? 0,
      limit: options.limitPerPlayer ?? 40,
    }),
  })

  const payload = (await response.json()) as FanaticsCollectSearchResponse
  if (!response.ok) throw new Error(payload.error ?? 'Fanatics Collect search failed')

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
