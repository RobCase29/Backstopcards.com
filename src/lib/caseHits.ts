export type CaseHitVariationKey = 'base' | 'gold' | 'orange' | 'red' | 'superfractor'

export type CaseHitModelSource = 'same-player' | 'player-rarity' | 'variation-ask' | 'global-rarity' | 'thin-ask'

export interface CaseHitChecklistCard {
  cardNo: string
  playerName: string
  team: string
  rookie?: boolean
}

export interface CaseHitVariation {
  key: CaseHitVariationKey
  label: string
  serial: number | null
  minPackOdds: number
  odds: Partial<Record<'hobby' | 'jumbo' | 'delight' | 'value', number>>
}

export interface RawEbayCaseHitItem {
  itemId?: string
  legacyItemId?: string
  title?: string
  itemWebUrl?: string
  itemAffiliateWebUrl?: string
  image?: { imageUrl?: string }
  thumbnailImages?: Array<{ imageUrl?: string }>
  price?: { value?: string | number; currency?: string }
  buyingOptions?: string[]
  seller?: { username?: string; feedbackScore?: number }
  shippingOptions?: Array<{ shippingCost?: { value?: string | number; currency?: string } }>
  itemCreationDate?: string
  itemEndDate?: string
  _bowmanTraderQuery?: {
    q?: string
    playerName?: string
    caseHit?: string
  }
}

export interface CaseHitListing {
  itemId: string
  cardNo: string
  playerName: string
  team: string
  title: string
  variationKey: CaseHitVariationKey
  variationLabel: string
  serial: number | null
  price: number
  shipping: number
  allIn: number
  listingUrl: string
  imageUrl: string
  sellerName: string | null
  sellerFeedbackScore: number | null
  createdAt: string | null
  endTime: string | null
}

export interface CaseHitOpportunity {
  listing: CaseHitListing
  modelPrice: number
  edgeDollars: number
  discountPct: number
  confidence: number
  grade: 'A' | 'B' | 'C' | 'Watch' | 'Thin'
  source: CaseHitModelSource
  compCount: number
  playerBaseAsk: number
  variationAsk: number
  rarityMultiplier: number
}

export interface CaseHitValuationCell {
  key: CaseHitVariationKey
  label: string
  serial: number | null
  price: number
  rarityMultiplier: number
  activeListings: number
}

export interface CaseHitValuationRow {
  cardNo: string
  playerName: string
  team: string
  baseAsk: number
  confidence: number
  source: 'player-ask' | 'global-ask' | 'unpriced'
  activeListings: number
  variations: CaseHitValuationCell[]
}

export interface CaseHitScanResult {
  listings: CaseHitListing[]
  opportunities: CaseHitOpportunity[]
  valuationRows: CaseHitValuationRow[]
  fetchedAt: string
  errors: Array<{ query?: string; error: string }>
  stats: {
    queriesRun: number
    queriesSucceeded: number
    queriesFailed: number
    pagesFetched: number
    upstreamTotal: number
    dedupedItems: number
    mappedListings: number
    rejectedListings: number
  }
}

type EbaySearchResponse = {
  items?: RawEbayCaseHitItem[]
  errors?: Array<{ query?: string; error: string }>
  fetchedAt?: string
  stats?: {
    queriesRun?: number
    queriesSucceeded?: number
    queriesFailed?: number
    pagesFetched?: number
    upstreamTotal?: number
    dedupedItems?: number
  }
  error?: string
}

export const CRYSTALLIZED_CHECKLIST: CaseHitChecklistCard[] = [
  { cardNo: 'BWC-1', playerName: 'Aiva Arquette', team: 'Miami Marlins' },
  { cardNo: 'BWC-2', playerName: 'Ronald Acuña Jr.', team: 'Atlanta Braves' },
  { cardNo: 'BWC-3', playerName: 'Marek Houston', team: 'Minnesota Twins' },
  { cardNo: 'BWC-4', playerName: 'Edward Florentino', team: 'Pittsburgh Pirates' },
  { cardNo: 'BWC-5', playerName: 'Jacob Misiorowski', team: 'Milwaukee Brewers', rookie: true },
  { cardNo: 'BWC-6', playerName: 'Bryce Eldridge', team: 'San Francisco Giants', rookie: true },
  { cardNo: 'BWC-7', playerName: 'Bobby Witt Jr.', team: 'Kansas City Royals' },
  { cardNo: 'BWC-8', playerName: 'Aaron Judge', team: 'New York Yankees' },
  { cardNo: 'BWC-9', playerName: 'Samuel Basallo', team: 'Baltimore Orioles', rookie: true },
  { cardNo: 'BWC-10', playerName: 'Daniel Pierce', team: 'Tampa Bay Rays' },
  { cardNo: 'BWC-11', playerName: 'Sal Stewart', team: 'Cincinnati Reds', rookie: true },
  { cardNo: 'BWC-12', playerName: 'Vladimir Guerrero Jr.', team: 'Toronto Blue Jays' },
  { cardNo: 'BWC-13', playerName: 'Jac Caglianone', team: 'Kansas City Royals', rookie: true },
  { cardNo: 'BWC-14', playerName: 'Ethan Holliday', team: 'Colorado Rockies' },
  { cardNo: 'BWC-15', playerName: 'Bubba Chandler', team: 'Pittsburgh Pirates', rookie: true },
  { cardNo: 'BWC-16', playerName: 'Paul Skenes', team: 'Pittsburgh Pirates' },
  { cardNo: 'BWC-17', playerName: 'Colson Montgomery', team: 'Chicago White Sox', rookie: true },
  { cardNo: 'BWC-18', playerName: 'Roman Anthony', team: 'Boston Red Sox', rookie: true },
  { cardNo: 'BWC-19', playerName: 'Shohei Ohtani', team: 'Los Angeles Dodgers' },
  { cardNo: 'BWC-20', playerName: 'Francisco Lindor', team: 'New York Mets' },
]

export const CRYSTALLIZED_VARIATIONS: CaseHitVariation[] = [
  {
    key: 'base',
    label: 'Crystallized',
    serial: null,
    minPackOdds: 1_084,
    odds: { hobby: 6_691, jumbo: 2_234, delight: 1_084, value: 5_224 },
  },
  {
    key: 'gold',
    label: 'Gold Refractor /50',
    serial: 50,
    minPackOdds: 2_244,
    odds: { hobby: 13_381, jumbo: 4_467, delight: 2_244, value: 10_434 },
  },
  {
    key: 'orange',
    label: 'Orange Refractor /25',
    serial: 25,
    minPackOdds: 4_811,
    odds: { hobby: 4_811 },
  },
  {
    key: 'red',
    label: 'Red Refractor /5',
    serial: 5,
    minPackOdds: 31_410,
    odds: { hobby: 136_956, jumbo: 45_780, delight: 31_410, value: 105_864 },
  },
  {
    key: 'superfractor',
    label: 'Superfractor /1',
    serial: 1,
    minPackOdds: 244_160,
    odds: { hobby: 582_060, jumbo: 244_160, value: 482_267 },
  },
]

const BASE_ODDS = CRYSTALLIZED_VARIATIONS[0].minPackOdds

const NON_CRYSTALLIZED_TERMS =
  /\b(power\s*chord|patchwork|electric\s+sluggers|under\s+the\s+radar|bowman\s+sterling|anime|kanji|spotlight|auto|autograph|signed|topps\s+bunt\s+digital|topps\s+bunt|bunt|digital|virtual|redeemed|\d+\s*cc)\b/i

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedWords(value: string) {
  return normalizeText(value).split(' ').filter(Boolean)
}

function titleMatchesPlayer(title: string, playerName: string) {
  const titleWords = new Set(normalizedWords(title))
  const playerWords = normalizedWords(playerName).filter((word) => word.length > 1 && word !== 'jr')
  return playerWords.every((word) => titleWords.has(word))
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

function minShippingCost(item: RawEbayCaseHitItem) {
  const costs = (item.shippingOptions ?? [])
    .map((option) => numberValue(option.shippingCost?.value, Number.NaN))
    .filter(Number.isFinite)
  if (costs.length === 0) return 0
  return Math.max(0, Math.min(...costs))
}

function itemImage(item: RawEbayCaseHitItem) {
  return firstString(
    [
      item.image?.imageUrl,
      ...(item.thumbnailImages ?? []).map((image) => image.imageUrl),
    ],
    '',
  )
}

function listingIdentity(listing: CaseHitListing) {
  return listing.itemId || listing.listingUrl || listing.title
}

function dedupeListings(listings: CaseHitListing[]) {
  const seen = new Set<string>()
  const deduped: CaseHitListing[] = []
  for (const listing of listings) {
    const key = listingIdentity(listing)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(listing)
  }
  return deduped
}

function variationForKey(key: CaseHitVariationKey) {
  return CRYSTALLIZED_VARIATIONS.find((variation) => variation.key === key) ?? CRYSTALLIZED_VARIATIONS[0]
}

export function rarityMultiplier(key: CaseHitVariationKey) {
  const variation = variationForKey(key)
  return Number(Math.pow(variation.minPackOdds / BASE_ODDS, 0.55).toFixed(2))
}

function classifyVariation(title: string): CaseHitVariationKey {
  const normalized = normalizeText(title)
  if (/\bsuperfractor\b|(?:^|\s|#)\/1(?:\s|$)/i.test(title)) return 'superfractor'
  if (/\bred\s+(?:refractor|crystallized)\b/.test(normalized) || /(?:^|\s|#)\/5(?:\s|$)/i.test(title)) return 'red'
  if (/\borange\b|(?:^|\s|#)\/25(?:\s|$)/i.test(title)) return 'orange'
  if (/\bgold\b|(?:^|\s|#)\/50(?:\s|$)/i.test(title)) return 'gold'
  if (normalized.includes('refractor')) return 'base'
  return 'base'
}

export function mapEbayItemToCaseHitListing(item: RawEbayCaseHitItem): CaseHitListing | null {
  const title = firstString([item.title], '')
  const playerName = firstString([item._bowmanTraderQuery?.playerName], '')
  const checklistCard = CRYSTALLIZED_CHECKLIST.find((card) => card.playerName === playerName)
  if (!title || !checklistCard || !titleMatchesPlayer(title, checklistCard.playerName)) return null

  const normalizedTitle = normalizeText(title)
  const isCrystallized = /\bcrystall?ized\b/.test(normalizedTitle)
  if (!/\b2026\b/.test(normalizedTitle) || !/\bbowman\b/.test(normalizedTitle) || !isCrystallized) return null
  if (NON_CRYSTALLIZED_TERMS.test(title)) return null

  const price = numberValue(item.price?.value, 0)
  if (price <= 0) return null

  const variationKey = classifyVariation(title)
  const variation = variationForKey(variationKey)
  const itemId = firstString([item.legacyItemId, item.itemId, item.itemWebUrl], title)
  const shipping = minShippingCost(item)

  return {
    itemId,
    cardNo: checklistCard.cardNo,
    playerName: checklistCard.playerName,
    team: checklistCard.team,
    title,
    variationKey,
    variationLabel: variation.label,
    serial: variation.serial,
    price,
    shipping,
    allIn: price + shipping,
    listingUrl: firstString([item.itemAffiliateWebUrl, item.itemWebUrl], ''),
    imageUrl: itemImage(item),
    sellerName: item.seller?.username ?? null,
    sellerFeedbackScore: item.seller?.feedbackScore ?? null,
    createdAt: item.itemCreationDate ?? null,
    endTime: item.itemEndDate ?? null,
  }
}

function robustAsk(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right)
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const trim = sorted.length >= 8 ? Math.floor(sorted.length * 0.12) : 0
  const trimmed = trim > 0 ? sorted.slice(trim, sorted.length - trim) : sorted
  const middle = Math.floor(trimmed.length / 2)
  const median = trimmed.length % 2 ? trimmed[middle] : (trimmed[middle - 1] + trimmed[middle]) / 2
  const lowAsk = trimmed[0]
  return Number((median * 0.72 + lowAsk * 0.28).toFixed(2))
}

function buildBaseAnchors(listings: CaseHitListing[], excludeItemId?: string) {
  const usable = listings.filter((listing) => listing.itemId !== excludeItemId)
  const globalBaseAsk = robustAsk(usable.map((listing) => listing.allIn / rarityMultiplier(listing.variationKey)))
  const variationAsks = new Map<CaseHitVariationKey, number>()
  const playerBaseAsks = new Map<string, number>()

  for (const variation of CRYSTALLIZED_VARIATIONS) {
    variationAsks.set(
      variation.key,
      robustAsk(usable.filter((listing) => listing.variationKey === variation.key).map((listing) => listing.allIn)),
    )
  }

  for (const card of CRYSTALLIZED_CHECKLIST) {
    playerBaseAsks.set(
      card.playerName,
      robustAsk(
        usable
          .filter((listing) => listing.playerName === card.playerName)
          .map((listing) => listing.allIn / rarityMultiplier(listing.variationKey)),
      ),
    )
  }

  return { globalBaseAsk, playerBaseAsks, variationAsks }
}

function opportunityGrade(edgeDollars: number, discountPct: number, confidence: number): CaseHitOpportunity['grade'] {
  if (confidence < 0.38) return 'Thin'
  if (edgeDollars >= 100 && discountPct >= 0.28 && confidence >= 0.58) return 'A'
  if (edgeDollars >= 50 && discountPct >= 0.18) return 'B'
  if (edgeDollars > 0 && discountPct >= 0.08) return 'C'
  return 'Watch'
}

export function rankCaseHitListings(listings: CaseHitListing[]): CaseHitOpportunity[] {
  return listings
    .map((listing) => {
      const { globalBaseAsk, playerBaseAsks, variationAsks } = buildBaseAnchors(listings, listing.itemId)
      const samePlayerVariation = listings.filter(
        (candidate) =>
          candidate.itemId !== listing.itemId &&
          candidate.playerName === listing.playerName &&
          candidate.variationKey === listing.variationKey,
      )
      const samePlayerAsk = robustAsk(samePlayerVariation.map((candidate) => candidate.allIn))
      const playerBaseAsk = playerBaseAsks.get(listing.playerName) ?? 0
      const variationAsk = variationAsks.get(listing.variationKey) ?? 0
      const rarity = rarityMultiplier(listing.variationKey)
      const rarityModel = (playerBaseAsk || globalBaseAsk) * rarity

      let modelPrice = rarityModel
      let source: CaseHitModelSource = playerBaseAsk ? 'player-rarity' : 'global-rarity'
      let confidence = playerBaseAsk ? 0.54 : 0.42
      let compCount = listings.filter((candidate) => candidate.itemId !== listing.itemId).length

      if (samePlayerVariation.length >= 2 && samePlayerAsk > 0) {
        modelPrice = samePlayerAsk * 0.72 + (rarityModel || samePlayerAsk) * 0.28
        source = 'same-player'
        confidence = Math.min(0.86, 0.64 + samePlayerVariation.length / 28)
        compCount = samePlayerVariation.length
      } else if (playerBaseAsk && variationAsk) {
        modelPrice = rarityModel * 0.68 + variationAsk * 0.32
        source = 'player-rarity'
        confidence = 0.58
        compCount = listings.filter((candidate) => candidate.itemId !== listing.itemId && candidate.playerName === listing.playerName).length
      } else if (variationAsk) {
        modelPrice = variationAsk * 0.62 + (rarityModel || variationAsk) * 0.38
        source = 'variation-ask'
        confidence = 0.46
        compCount = listings.filter((candidate) => candidate.itemId !== listing.itemId && candidate.variationKey === listing.variationKey).length
      } else if (!modelPrice) {
        modelPrice = listing.allIn
        source = 'thin-ask'
        confidence = 0.24
        compCount = 0
      }

      modelPrice = Number(modelPrice.toFixed(2))
      const edgeDollars = Number((modelPrice - listing.allIn).toFixed(2))
      const discountPct = modelPrice > 0 ? edgeDollars / modelPrice : 0

      return {
        listing,
        modelPrice,
        edgeDollars,
        discountPct,
        confidence,
        grade: opportunityGrade(edgeDollars, discountPct, confidence),
        source,
        compCount,
        playerBaseAsk: Number((playerBaseAsk || globalBaseAsk || 0).toFixed(2)),
        variationAsk: Number((variationAsk || 0).toFixed(2)),
        rarityMultiplier: rarity,
      }
    })
    .sort(
      (left, right) =>
        right.edgeDollars - left.edgeDollars ||
        right.discountPct - left.discountPct ||
        right.confidence - left.confidence,
    )
}

export function buildCaseHitValuationRows(listings: CaseHitListing[]): CaseHitValuationRow[] {
  const { globalBaseAsk, playerBaseAsks } = buildBaseAnchors(listings)

  return CRYSTALLIZED_CHECKLIST.map((card) => {
    const playerListings = listings.filter((listing) => listing.playerName === card.playerName)
    const playerBaseAsk = playerBaseAsks.get(card.playerName) ?? 0
    const baseAsk = playerBaseAsk || globalBaseAsk || 0
    const source: CaseHitValuationRow['source'] = playerBaseAsk ? 'player-ask' : globalBaseAsk ? 'global-ask' : 'unpriced'
    const confidence =
      source === 'player-ask'
        ? Math.min(0.72, 0.46 + playerListings.length / 26)
        : source === 'global-ask'
          ? Math.min(0.44, 0.28 + listings.length / 80)
          : 0

    return {
      cardNo: card.cardNo,
      playerName: card.playerName,
      team: card.team,
      baseAsk: Number(baseAsk.toFixed(2)),
      confidence,
      source,
      activeListings: playerListings.length,
      variations: CRYSTALLIZED_VARIATIONS.map((variation) => {
        const multiplier = rarityMultiplier(variation.key)
        return {
          key: variation.key,
          label: variation.label,
          serial: variation.serial,
          price: Number((baseAsk * multiplier).toFixed(2)),
          rarityMultiplier: multiplier,
          activeListings: playerListings.filter((listing) => listing.variationKey === variation.key).length,
        }
      }),
    }
  }).sort(
    (left, right) =>
      right.baseAsk - left.baseAsk ||
      right.activeListings - left.activeListings ||
      left.playerName.localeCompare(right.playerName),
  )
}

function querySafePlayerName(playerName: string) {
  return playerName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export async function fetchCrystallizedCaseHits(options: {
  minPrice?: number
  limitPerQuery?: number
  maxPagesPerQuery?: number
  signal?: AbortSignal
} = {}): Promise<CaseHitScanResult> {
  const queries = CRYSTALLIZED_CHECKLIST.flatMap((card) => {
    const player = querySafePlayerName(card.playerName)
    return [
      { q: `${player} 2026 Bowman Crystallized`, playerName: card.playerName, caseHit: 'crystallized' },
      { q: `${player} 2026 Bowman BWC`, playerName: card.playerName, caseHit: 'crystallized' },
    ]
  })

  const response = await fetch('/api/ebay/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      queries,
      minPrice: options.minPrice ?? 0,
      limit: options.limitPerQuery ?? 80,
      maxPages: options.maxPagesPerQuery ?? 1,
      sort: 'price',
    }),
  })

  const payload = (await response.json()) as EbaySearchResponse
  if (!response.ok) throw new Error(payload.error ?? 'Crystallized eBay search failed')

  let rejectedListings = 0
  const listings = dedupeListings(
    (payload.items ?? []).flatMap((item) => {
      const listing = mapEbayItemToCaseHitListing(item)
      if (!listing) rejectedListings += 1
      return listing ? [listing] : []
    }),
  )

  return {
    listings,
    opportunities: rankCaseHitListings(listings),
    valuationRows: buildCaseHitValuationRows(listings),
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
      rejectedListings,
    },
  }
}
