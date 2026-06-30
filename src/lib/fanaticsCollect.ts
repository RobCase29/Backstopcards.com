import type { ChecklistModel, ProspectPulseListing } from '../types'
import { titleEligibleForBowmanChromeAutoModel } from './cardTitleGuards'
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

function variationSearchAliases(variationTerm: string) {
  const term = variationTerm.trim()
  const normalized = normalizedKey(term)
  const aliases = new Set<string>([term])
  if (/\bimage\b/.test(normalized) && /\bgold\b/.test(normalized)) aliases.add('gold ink')
  if (/\bimage\b/.test(normalized) && /\bblack\b/.test(normalized)) aliases.add('black ink')
  if (/\bimage\b/.test(normalized) && /\bred\b/.test(normalized)) aliases.add('red ink')
  if (/\bmini\s+diamond\b/.test(normalized)) aliases.add('mini diamond')
  if (/\bb\s+w\b|\bblack\s+white\b/.test(normalized)) aliases.add('black white shimmer')
  if (/\bpackfractor\b/.test(normalized)) aliases.add('packfractor')
  return [...aliases]
}

function titleMatchesVariationTerm(title: string, variationTerm?: string) {
  if (!variationTerm?.trim()) return true
  return variationSearchAliases(variationTerm).some((alias) => matchesSearchTerm(title, alias))
}

function variationQueryTerm(variationTerm = '') {
  const normalized = normalizedKey(variationTerm)
  if (/\bimage\b/.test(normalized) && /\bgold\b/.test(normalized)) return 'gold ink'
  if (/\bimage\b/.test(normalized) && /\bblack\b/.test(normalized)) return 'black ink'
  if (/\bimage\b/.test(normalized) && /\bred\b/.test(normalized)) return 'red ink'
  return variationTerm
}

const BASE_AUTO_EXCLUSION_PATTERN =
  /\b(?:superfractor|super\s+fractor|refractor|xfractor|x-fractor|logofractor|firefractor|packfractor|speckle|atomic|mini\s*diamond|shimmer|lava|wave|raywave|mojo|sapphire|image\s+variation|peanuts?|popcorn|sunflower|gum\s*ball|gumball|snack\s+pack)\b/i
const BASE_AUTO_COLOR_PARALLEL_PATTERN =
  /\b(?:blue|green|aqua|purple|yellow|gold|orange|red|black|rose|fuchsia|teal|pink|silver|pearl)\s+(?:refractor|auto|parallel|lava|wave|shimmer)\b|\b(?:refractor|auto|parallel|lava|wave|shimmer)\s+(?:blue|green|aqua|purple|yellow|gold|orange|red|black|rose|fuchsia|teal|pink|silver|pearl)\b/i

function serialDenominatorFromTitle(title: string) {
  const match = title.match(/(?:\/|#\/|numbered\s+to\s+)(\d{1,3})\b/i)
  return match ? Number(match[1]) : null
}

function titleLooksLikeBaseAuto(title: string) {
  if (serialDenominatorFromTitle(title)) return false
  return !BASE_AUTO_EXCLUSION_PATTERN.test(title) && !BASE_AUTO_COLOR_PARALLEL_PATTERN.test(title)
}

function titleLooksLikePackIssuedAuto(title: string) {
  return /\b(auto|autos|autograph|autographed|autographs|signed|signature|redemption)\b/i.test(title)
}

function titleLooksLikeLowSerialNonAuto(title: string) {
  const serialDenominator = serialDenominatorFromTitle(title)
  return Boolean(
    serialDenominator &&
      serialDenominator <= 99 &&
      /\bbowman\b/i.test(title) &&
      /\b(1st|first)\b/i.test(title) &&
      !titleLooksLikePackIssuedAuto(title) &&
      !titleLooksHandSignedAuto(title),
  )
}

function parallelText(title: string) {
  return title.replace(/\b(?:red\s+sox|white\s+sox|reds?|blue\s+jays)\b/gi, ' ')
}

function lowSerialNonAutoVariationLabel(title: string, serialDenominator: number | null) {
  const normalized = parallelText(title).toLowerCase()
  const parallel =
    /\bsuperfractor\b|\bsuper\s+fractor\b/.test(normalized)
      ? 'Superfractor'
      : /\bred\b/.test(normalized)
        ? 'Red'
        : /\borange\b/.test(normalized)
          ? 'Orange'
          : /\bgold\b/.test(normalized)
            ? 'Gold'
            : /\bblack\b/.test(normalized)
              ? 'Black'
              : /\bgreen\b/.test(normalized)
                ? 'Green'
                : /\byellow\b/.test(normalized)
                  ? 'Yellow'
                  : /\bmini\s*diamond\b/.test(normalized)
                    ? 'Mini Diamond'
                    : 'Numbered'
  return serialDenominator ? `${parallel} /${serialDenominator}` : parallel
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

function mapFanaticsCollectHitToListing(item: FanaticsCollectHit, fallbackReleaseLabel: string): ProspectPulseListing | null {
  const meta = item._backstopQuery
  const playerName = firstString([meta?.playerName])
  const title = firstString([item.title])
  if (!playerName || !title || !titleMatchesPlayer(title, playerName)) return null
  if (!titleMatchesVariationTerm(title, meta?.variationTerm)) return null
  if (meta?.lowSerialNonAuto) {
    if (!titleLooksLikeLowSerialNonAuto(title)) return null
  } else {
    if (meta?.baseAutoOnly && !titleLooksLikeBaseAuto(title)) return null
    if (!titleEligibleForBowmanChromeAutoModel(title)) return null
  }

  const price = fanaticsCollectPrice(item)
  if (price <= 0) return null

  const stsRanking = findStsRanking(playerName)
  const isHandSigned = titleLooksHandSignedAuto(title)
  const serialDenominator = isHandSigned || meta?.baseAutoOnly ? null : serialDenominatorFromTitle(title)
  const inferredVariation =
    isHandSigned
      ? 'Hand Signed Auto'
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
    product_type: fallbackReleaseLabel,
    release: meta?.release ?? fallbackReleaseLabel,
    variation: inferredVariation,
    serial_denominator: serialDenominator,
    is_hand_signed: isHandSigned,
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
      runtimeCacheHits: payload.stats?.runtimeCacheHits ?? 0,
      sqliteCacheHits: payload.stats?.sqliteCacheHits ?? 0,
      upstreamPagesFetched: payload.stats?.upstreamPagesFetched ?? payload.stats?.pagesFetched ?? 0,
    },
  }
}
