export type WaxMarketplace = 'ebay' | 'fanatics-collect' | 'dave-adams'
export type WaxListingMode = 'bin' | 'auction' | 'retail'
export type WaxProductKind = 'box' | 'case' | 'pack' | 'lot' | 'sealed'

export type WaxListing = {
  id: string
  marketplace: WaxMarketplace
  marketplaceLabel: string
  mode: WaxListingMode
  title: string
  listingUrl: string
  imageUrl: string
  price: number
  shipping: number
  allIn: number
  productKind: WaxProductKind
  confidence: number
  endTime?: string | null
  bidCount?: number
  quantity?: number
}

export type WaxComp = {
  id: string
  title: string
  price: number
  soldAt?: string | null
  source: string
}

export type WaxMarketModel = {
  marketPrice: number
  source: 'manual' | 'comps' | 'empty'
  compCount: number
  median: number
  average: number
  lastFiveAverage: number
  low: number
  high: number
}

export type WaxOpportunity = {
  listing: WaxListing
  marketPrice: number
  spread: number
  discountPct: number
  grade: 'A' | 'B' | 'C' | 'Watch'
  signal: string
}

type EbayMoney = {
  value?: string | number
}

type EbayWaxItem = {
  itemId?: string
  legacyItemId?: string
  title?: string
  itemWebUrl?: string
  itemAffiliateWebUrl?: string
  image?: { imageUrl?: string }
  thumbnailImages?: Array<{ imageUrl?: string }>
  price?: EbayMoney
  currentBidPrice?: EbayMoney
  convertedCurrentBidPrice?: EbayMoney
  shippingOptions?: Array<{ shippingCost?: EbayMoney }>
  buyingOptions?: string[]
  itemEndDate?: string
  bidCount?: number
}

type EbayWaxResponse = {
  items?: EbayWaxItem[]
  errors?: Array<{ query?: string; error: string }>
  fetchedAt?: string
  error?: string
  stats?: {
    queriesRun?: number
    queriesSucceeded?: number
    queriesFailed?: number
    pagesFetched?: number
    upstreamTotal?: number
    dedupedItems?: number
    cacheHits?: number
    upstreamPagesFetched?: number
  }
}

type FanaticsWaxHit = {
  objectID?: string
  title?: string
  listingUuid?: string
  slug?: string
  askingPrice?: number | string | null
  currentPrice?: number | string | null
  buyNowPrice?: number | string | null
  price?: number | string | null
  imageSets?: unknown
  images?: unknown
  quantityAvailable?: number
}

type FanaticsWaxResponse = {
  items?: FanaticsWaxHit[]
  errors?: Array<{ query?: string; error: string }>
  fetchedAt?: string
  error?: string
  stats?: {
    queriesRun?: number
    queriesSucceeded?: number
    queriesFailed?: number
    pagesFetched?: number
    upstreamTotal?: number
    dedupedItems?: number
    cacheHits?: number
    upstreamPagesFetched?: number
  }
}

export type WaxScanResult = {
  listings: WaxListing[]
  fetchedAt: string
  errors: Array<{ source: string; query?: string; error: string }>
  stats: {
    ebayItems: number
    fanaticsItems: number
    manualItems: number
    cacheHits: number
    upstreamPages: number
  }
}

export const SEALED_WAX_STARTER_PRODUCTS = [
  '2026 Bowman Baseball Hobby Box',
  '2026 Bowman Baseball Jumbo Box',
  '2026 Bowman Baseball Hobby Case',
  '2025 Bowman Draft Baseball Hobby Box',
  '2025 Bowman Draft Baseball Jumbo Box',
  '2024 Bowman Chrome Baseball Hobby Box',
  '2024 Bowman Draft Baseball Super Jumbo Box',
] as const

const SEALED_TERMS = /\b(?:sealed|wax|box|boxes|case|cases|hobby|jumbo|super\s+jumbo|blaster|mega|sapphire|delight|breakers?|pack|packs)\b/i
const BREAK_TERMS = /\b(?:break|breaker|spot|random\s+team|pick\s+your\s+team|pyt|casebreak|case\s+break)\b/i
const EMPTY_TERMS = /\b(?:empty|wrapper|wrappers|packaging|box\s+only)\b/i
const SPECIFIC_BOX_FORMATS = [
  { key: 'super-jumbo', pattern: /\bsuper\s+jumbo\b/i },
  { key: 'jumbo', pattern: /\bjumbo\b/i },
  { key: 'mega', pattern: /\bmega\b/i },
  { key: 'blaster', pattern: /\bblaster\b/i },
  { key: 'sapphire', pattern: /\bsapphire\b/i },
  { key: 'delight', pattern: /\bdelight\b/i },
  { key: 'hobby', pattern: /\bhobby\b/i },
] as const

export function numberValue(value: unknown, fallback = 0) {
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

function firstPositive(values: unknown[]) {
  for (const value of values) {
    const parsed = numberValue(value, Number.NaN)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 0
}

function median(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right)
  if (clean.length === 0) return 0
  const middle = Math.floor(clean.length / 2)
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2
}

function average(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0)
  if (clean.length === 0) return 0
  return clean.reduce((total, value) => total + value, 0) / clean.length
}

function priceTokenFromText(text: string) {
  const dollarMatch = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/)
  if (dollarMatch) return { raw: dollarMatch[0], value: numberValue(dollarMatch[1], 0) }

  const candidates = [...text.matchAll(/(?:^|\s)([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?=\s|$)/g)]
    .map((match) => ({ raw: match[0], value: numberValue(match[1], 0) }))
    .filter(({ value }) => value > 0 && (value < 1900 || value > 2099))

  return candidates[0] ?? null
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

function minShippingCost(item: EbayWaxItem) {
  const costs = (item.shippingOptions ?? [])
    .map((option) => numberValue(option.shippingCost?.value, Number.NaN))
    .filter(Number.isFinite)
  return costs.length ? Math.max(0, Math.min(...costs)) : 0
}

function currentEbayPrice(item: EbayWaxItem, mode: WaxListingMode) {
  if (mode === 'auction') return firstPositive([item.currentBidPrice?.value, item.convertedCurrentBidPrice?.value, item.price?.value])
  return firstPositive([item.price?.value, item.currentBidPrice?.value, item.convertedCurrentBidPrice?.value])
}

function fanaticsListingUuid(item: FanaticsWaxHit) {
  const explicit = firstString([item.listingUuid])
  if (explicit) return explicit
  const objectId = firstString([item.objectID])
  return objectId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? objectId
}

function fanaticsListingUrl(item: FanaticsWaxHit, title: string) {
  const uuid = fanaticsListingUuid(item)
  if (!uuid) return 'https://www.fanaticscollect.com/marketplace?type=FIXED'
  const slug = firstString([item.slug], slugFromTitle(title))
  return `https://www.fanaticscollect.com/buy-now/${uuid}/${slug || slugFromTitle(title)}`
}

export function waxProductKind(title: string): WaxProductKind {
  if (/\bcase|cases\b/i.test(title)) return 'case'
  if (/\bpack|packs\b/i.test(title)) return 'pack'
  if (/\bbox|boxes|hobby|jumbo|super\s+jumbo|blaster|mega\b/i.test(title)) return 'box'
  if (/\blot\b/i.test(title)) return 'lot'
  return 'sealed'
}

export function titleLooksLikeSealedWax(title: string) {
  return SEALED_TERMS.test(title) && !BREAK_TERMS.test(title) && !EMPTY_TERMS.test(title)
}

function specificBoxFormat(title: string) {
  return SPECIFIC_BOX_FORMATS.find(({ pattern }) => pattern.test(title))?.key ?? null
}

export function waxProductMatchesQuery(title: string, query: string) {
  if (!titleLooksLikeSealedWax(title)) return false

  const queryKind = waxProductKind(query)
  const titleKind = waxProductKind(title)
  if (queryKind !== 'sealed' && titleKind !== queryKind) return false

  const queryFormat = specificBoxFormat(query)
  const titleFormat = specificBoxFormat(title)
  if (queryFormat) return titleFormat === queryFormat

  return true
}

export function waxTitleConfidence(title: string, query: string) {
  if (!waxProductMatchesQuery(title, query)) return 0

  const normalizedTitle = title.toLowerCase()
  const normalizedQuery = query.toLowerCase()
  const queryWords = normalizedQuery
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !['the', 'and', 'with'].includes(word))
  const wordHits = queryWords.filter((word) => normalizedTitle.includes(word)).length
  const kindBoost = waxProductKind(title) === waxProductKind(query) ? 0.16 : 0
  const formatBoost = specificBoxFormat(query) && specificBoxFormat(title) === specificBoxFormat(query) ? 0.08 : 0
  const sealedBoost = titleLooksLikeSealedWax(title) ? 0.22 : -0.22
  const coverage = queryWords.length ? wordHits / queryWords.length : 0.45
  return Math.max(0, Math.min(1, coverage * 0.62 + kindBoost + formatBoost + sealedBoost))
}

export function parseWaxComps(text: string): WaxComp[] {
  const comps: WaxComp[] = []

  text.split(/\n+/).forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const priceToken = priceTokenFromText(trimmed)
    const price = priceToken?.value ?? 0
    if (price <= 0) return
    const dateMatch = trimmed.match(/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\/\d{1,2}\/20\d{2})\b/)
    comps.push({
      id: `comp-${index}-${price}`,
      title: trimmed.replace(priceToken?.raw ?? '', '').trim() || trimmed,
      price,
      soldAt: dateMatch?.[0] ?? null,
      source: /fanatics/i.test(trimmed) ? 'Fanatics' : /ebay/i.test(trimmed) ? 'eBay' : 'Comps',
    })
  })

  return comps
}

export function buildWaxMarketModel(comps: WaxComp[], manualMarketPrice = 0): WaxMarketModel {
  const prices = comps.map((comp) => comp.price).filter((price) => Number.isFinite(price) && price > 0)
  const medianPrice = median(prices)
  const averagePrice = average(prices)
  const lastFiveAverage = average(prices.slice(0, 5))
  const compModel = lastFiveAverage || medianPrice || averagePrice
  const marketPrice = manualMarketPrice > 0 ? manualMarketPrice : compModel
  return {
    marketPrice,
    source: manualMarketPrice > 0 ? 'manual' : compModel > 0 ? 'comps' : 'empty',
    compCount: prices.length,
    median: medianPrice,
    average: averagePrice,
    lastFiveAverage,
    low: prices.length ? Math.min(...prices) : 0,
    high: prices.length ? Math.max(...prices) : 0,
  }
}

export function parseDaveAdamsQuotes(text: string, query: string): WaxListing[] {
  const listings: WaxListing[] = []

  text.split(/\n+/).forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const url = trimmed.match(/https?:\/\/\S+/)?.[0] ?? `https://www.dacardworld.com/search?Search=${encodeURIComponent(query)}`
    const priceToken = priceTokenFromText(trimmed)
    const price = priceToken?.value ?? 0
    if (price <= 0) return
    const title = trimmed.replace(url, '').replace(priceToken?.raw ?? '', '').replace(/\s+/g, ' ').trim() || query
    const confidence = Math.max(0.42, waxTitleConfidence(title, query))
    listings.push({
      id: `dave-adams-${index}-${price}-${slugFromTitle(title)}`,
      marketplace: 'dave-adams',
      marketplaceLabel: 'Dave & Adams',
      mode: 'retail',
      title,
      listingUrl: url,
      imageUrl: '',
      price,
      shipping: 0,
      allIn: price,
      productKind: waxProductKind(title),
      confidence,
    })
  })

  return listings
}

function mapEbayWaxItem(item: EbayWaxItem, query: string, mode: WaxListingMode): WaxListing | null {
  const title = firstString([item.title])
  if (!title || !waxProductMatchesQuery(title, query)) return null
  const confidence = waxTitleConfidence(title, query)
  if (confidence < 0.55) return null
  const price = currentEbayPrice(item, mode)
  if (price <= 0) return null
  const shipping = minShippingCost(item)
  return {
    id: firstString([item.legacyItemId, item.itemId, item.itemWebUrl], title),
    marketplace: 'ebay',
    marketplaceLabel: 'eBay',
    mode,
    title,
    listingUrl: firstString([item.itemAffiliateWebUrl, item.itemWebUrl]),
    imageUrl: firstString([item.image?.imageUrl, ...(item.thumbnailImages ?? []).map((image) => image.imageUrl)]),
    price,
    shipping,
    allIn: price + shipping,
    productKind: waxProductKind(title),
    confidence,
    endTime: item.itemEndDate ?? null,
    bidCount: item.bidCount ?? 0,
  }
}

function mapFanaticsWaxHit(item: FanaticsWaxHit, query: string): WaxListing | null {
  const title = firstString([item.title])
  if (!title || !waxProductMatchesQuery(title, query)) return null
  const confidence = waxTitleConfidence(title, query)
  if (confidence < 0.55) return null
  const price = firstPositive([item.askingPrice, item.buyNowPrice, item.currentPrice, item.price])
  if (price <= 0) return null
  return {
    id: fanaticsListingUuid(item) || firstString([item.objectID], title),
    marketplace: 'fanatics-collect',
    marketplaceLabel: 'Fanatics Collect',
    mode: 'bin',
    title,
    listingUrl: fanaticsListingUrl(item, title),
    imageUrl: imageUrlFrom(item.imageSets) || imageUrlFrom(item.images),
    price,
    shipping: 0,
    allIn: price,
    productKind: waxProductKind(title),
    confidence,
    quantity: item.quantityAvailable,
  }
}

function dedupeWaxListings(listings: WaxListing[]) {
  const seen = new Set<string>()
  const deduped: WaxListing[] = []
  for (const listing of listings) {
    const key = `${listing.marketplace}:${listing.id || listing.listingUrl || listing.title}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(listing)
  }
  return deduped
}

export function rankWaxOpportunities(listings: WaxListing[], model: WaxMarketModel, maxAbovePct = 0.15): WaxOpportunity[] {
  if (model.marketPrice <= 0) return []
  return listings
    .map((listing) => {
      const spread = model.marketPrice - listing.allIn
      const discountPct = model.marketPrice > 0 ? spread / model.marketPrice : 0
      const grade: WaxOpportunity['grade'] =
        discountPct >= 0.15 && listing.confidence >= 0.66
          ? 'A'
          : discountPct >= 0.05
            ? 'B'
            : listing.allIn <= model.marketPrice * (1 + maxAbovePct)
              ? 'C'
              : 'Watch'
      const signal =
        grade === 'A'
          ? 'Strong buy zone'
          : grade === 'B'
            ? 'Below market'
            : grade === 'C'
              ? 'Near market'
              : 'Track only'
      return { listing, marketPrice: model.marketPrice, spread, discountPct, grade, signal }
    })
    .filter((opportunity) => opportunity.listing.allIn <= model.marketPrice * (1 + maxAbovePct))
    .sort(
      (left, right) =>
        right.spread - left.spread ||
        right.listing.confidence - left.listing.confidence ||
        left.listing.allIn - right.listing.allIn,
    )
}

export async function fetchSealedWaxListings(options: {
  query: string
  minPrice: number
  includeEbay: boolean
  includeFanatics: boolean
  manualListings?: WaxListing[]
  signal?: AbortSignal
}): Promise<WaxScanResult> {
  const query = options.query.trim()
  const errors: WaxScanResult['errors'] = []
  const listings: WaxListing[] = [...(options.manualListings ?? [])]
  let ebayItems = 0
  let fanaticsItems = 0
  let cacheHits = 0
  let upstreamPages = 0

  if (options.includeEbay) {
    const ebayPayload = {
      queries: [{ q: query }],
      sealedWax: true,
      minPrice: options.minPrice,
      limit: 80,
      maxPages: 1,
      sort: 'price',
      buyingOption: 'FIXED_PRICE',
    }
    const response = await fetch('/api/ebay/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify(ebayPayload),
    })
    const payload = (await response.json()) as EbayWaxResponse
    if (!response.ok) {
      errors.push({ source: 'eBay', query, error: payload.error ?? 'eBay wax scan failed' })
    } else {
      const mapped = (payload.items ?? []).flatMap((item) => {
        const listing = mapEbayWaxItem(item, query, 'bin')
        return listing ? [listing] : []
      })
      ebayItems = mapped.length
      cacheHits += payload.stats?.cacheHits ?? 0
      upstreamPages += payload.stats?.upstreamPagesFetched ?? payload.stats?.pagesFetched ?? 0
      listings.push(...mapped)
      for (const error of payload.errors ?? []) errors.push({ source: 'eBay', ...error })
    }
  }

  if (options.includeFanatics) {
    const response = await fetch('/api/fanatics-collect/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        queries: [query],
        minPrice: options.minPrice,
        limit: 80,
      }),
    })
    const payload = (await response.json()) as FanaticsWaxResponse
    if (!response.ok) {
      errors.push({ source: 'Fanatics Collect', query, error: payload.error ?? 'Fanatics Collect wax scan failed' })
    } else {
      const mapped = (payload.items ?? []).flatMap((item) => {
        const listing = mapFanaticsWaxHit(item, query)
        return listing ? [listing] : []
      })
      fanaticsItems = mapped.length
      cacheHits += payload.stats?.cacheHits ?? 0
      upstreamPages += payload.stats?.upstreamPagesFetched ?? payload.stats?.pagesFetched ?? 0
      listings.push(...mapped)
      for (const error of payload.errors ?? []) errors.push({ source: 'Fanatics Collect', ...error })
    }
  }

  const deduped = dedupeWaxListings(listings)
  return {
    listings: deduped,
    fetchedAt: new Date().toISOString(),
    errors,
    stats: {
      ebayItems,
      fanaticsItems,
      manualItems: options.manualListings?.length ?? 0,
      cacheHits,
      upstreamPages,
    },
  }
}
