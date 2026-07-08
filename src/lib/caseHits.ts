import { BOWMAN_2026_CASE_HIT_CHECKLISTS } from '../data/bowman2026CaseHits'
import { titleMatchesPlayerName } from './cardTitleGuards'
import type { PricingRow, VariationQuote } from './matrix'

export type CaseHitInsertKey = keyof typeof BOWMAN_2026_CASE_HIT_CHECKLISTS
export type CaseHitVariationKey = 'base' | 'gold' | 'orange' | 'red' | 'superfractor'

export type CaseHitModelSource = 'same-player' | 'player-rarity' | 'variation-ask' | 'global-rarity' | 'thin-ask'
export type CaseHitAutoEquivalentSignal = 'value' | 'fair' | 'premium' | 'danger' | 'missing'

export interface CaseHitChecklistCard {
  cardNo: string
  playerName: string
  team: string
  rookie?: boolean
  caseHitKey?: CaseHitInsertKey
  caseHitLabel?: string
}

export interface CaseHitVariation {
  key: CaseHitVariationKey
  label: string
  serial: number | null
  minPackOdds: number
  odds: Partial<Record<'hobby' | 'jumbo' | 'delight' | 'value', number>>
}

export interface CaseHitFamily {
  key: CaseHitInsertKey
  label: string
  shortLabel: string
  cardCount: number
  printRun: number
  checklist: CaseHitChecklistCard[]
  variations: CaseHitVariation[]
  searchTerms: string[]
  patterns: RegExp[]
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
  caseHitKey: CaseHitInsertKey
  caseHitLabel: string
  cardNo: string
  playerName: string
  team: string
  title: string
  variationKey: CaseHitVariationKey
  variationLabel: string
  serial: number | null
  printRun: number
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

export interface CaseHitAutoEquivalent {
  playerName: string
  release: string
  releaseYear: number
  baseAutoPrice: number
  autoMultiple: number
  equivalentLabel: string
  equivalentPrice: number
  equivalentMultiplier: number
  equivalentSerial: number | null
  floorLabel: string | null
  floorPrice: number | null
  floorMultiplier: number | null
  floorSerial: number | null
  ceilingLabel: string | null
  ceilingPrice: number | null
  ceilingMultiplier: number | null
  ceilingSerial: number | null
  priceBandLabel: string
  bracketPosition: number | null
  tierScore: number
  valueScore: number
  signal: CaseHitAutoEquivalentSignal
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
  caseHitKey: CaseHitInsertKey
  caseHitLabel: string
  printRun: number
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
    cacheHits: number
    upstreamPagesFetched: number
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
    cacheHits?: number
    upstreamPagesFetched?: number
  }
  error?: string
}

const CRYSTALLIZED_PRINT_RUN = 100

function familyChecklist(key: CaseHitInsertKey, label: string): CaseHitChecklistCard[] {
  return BOWMAN_2026_CASE_HIT_CHECKLISTS[key].map((card) => ({
    cardNo: card.cardNo,
    playerName: card.playerName,
    team: card.team,
    caseHitKey: key,
    caseHitLabel: label,
  }))
}

function baseVariation(label: string, printRun: number): CaseHitVariation {
  return {
    key: 'base',
    label,
    serial: null,
    minPackOdds: printRun,
    odds: {},
  }
}

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

const BASE_CRYSTALLIZED_ODDS = CRYSTALLIZED_VARIATIONS[0].minPackOdds

export const CASE_HIT_FAMILIES: CaseHitFamily[] = [
  {
    key: 'patchwork',
    label: 'Patchwork',
    shortLabel: 'Patchwork',
    cardCount: 30,
    printRun: 185,
    checklist: familyChecklist('patchwork', 'Patchwork'),
    variations: [baseVariation('Patchwork', 185)],
    searchTerms: ['2026 Bowman Patchwork'],
    patterns: [/\bpatchwork\b/i],
  },
  {
    key: 'anime-kanji',
    label: 'Anime Kanji',
    shortLabel: 'Kanji',
    cardCount: 7,
    printRun: 5,
    checklist: familyChecklist('anime-kanji', 'Anime Kanji'),
    variations: [baseVariation('Anime Kanji', 5)],
    searchTerms: ['2026 Bowman Anime Kanji', '2026 Bowman Kanji'],
    patterns: [/\banime\b(?=.*\bkanji\b)/i, /\bkanji\b/i],
  },
  {
    key: 'anime',
    label: 'Anime',
    shortLabel: 'Anime',
    cardCount: 29,
    printRun: 190,
    checklist: familyChecklist('anime', 'Anime'),
    variations: [baseVariation('Anime', 190)],
    searchTerms: ['2026 Bowman Anime'],
    patterns: [/\banime\b/i],
  },
  {
    key: 'bowman-spotlights',
    label: 'Bowman Spotlights',
    shortLabel: 'Spotlights',
    cardCount: 15,
    printRun: 140,
    checklist: familyChecklist('bowman-spotlights', 'Bowman Spotlights'),
    variations: [baseVariation('Bowman Spotlights', 140)],
    searchTerms: ['2026 Bowman Spotlights', '2026 Bowman Bowman Spotlights'],
    patterns: [/\bbowman\s+spotlights?\b/i, /\bspotlights?\b/i],
  },
  {
    key: 'crystallized',
    label: 'Crystallized',
    shortLabel: 'Crystallized',
    cardCount: 20,
    printRun: CRYSTALLIZED_PRINT_RUN,
    checklist: familyChecklist('crystallized', 'Crystallized'),
    variations: CRYSTALLIZED_VARIATIONS,
    searchTerms: ['2026 Bowman Crystallized', '2026 Bowman BWC'],
    patterns: [/\bcrystall?ized\b/i, /\bBWC[-\s]?\d+\b/i],
  },
  {
    key: 'final-draft',
    label: 'Final Draft',
    shortLabel: 'Final Draft',
    cardCount: 20,
    printRun: 185,
    checklist: familyChecklist('final-draft', 'Final Draft'),
    variations: [baseVariation('Final Draft', 185)],
    searchTerms: ['2026 Bowman Final Draft'],
    patterns: [/\bfinal\s+draft\b/i],
  },
]

export const CASE_HIT_FAMILY_OPTIONS = CASE_HIT_FAMILIES.map((family) => ({
  key: family.key,
  label: family.label,
  cardCount: family.cardCount,
  printRun: family.printRun,
}))

export const CASE_HIT_TOTAL_CARDS = CASE_HIT_FAMILIES.reduce((total, family) => total + family.cardCount, 0)
export const CRYSTALLIZED_CHECKLIST = CASE_HIT_FAMILIES.find((family) => family.key === 'crystallized')?.checklist ?? []

const CASE_HIT_FAMILY_BY_KEY = new Map(CASE_HIT_FAMILIES.map((family) => [family.key, family]))

const PHYSICAL_BLOCKER_TERMS =
  /\b(topps\s+bunt\s+digital|topps\s+bunt|bunt|digital|virtual|redeemed|\d+\s*cc)\b/i
const AUTO_BLOCKER_TERMS =
  /\b(auto(?:graph|graphs|graphed)?|autographs?|signature|signed|hand\s*signed|in\s*person|ip\s+auto|ip\s+signed|redemption)\b/i
const ADJACENT_INSERT_BLOCKER_TERMS =
  /\b(power\s*chords?|electric\s+sluggers?|under\s+the\s+radar|bowman\s+sterling|scouts?\s+top\s*100|draft\s+night|ascensions?)\b/i
const NON_CRYSTALLIZED_PARALLEL_TERMS =
  /\b(gold|orange|superfractor|refractor)\b|\bred\b(?=\s+(?:refractor|parallel|wave|lava|shimmer|foil|ice|crystal))|(?:^|\s|#)\/\d{1,3}(?:\s|$)/i

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleMatchesCardNo(title: string, cardNo: string) {
  const match = cardNo.match(/^([A-Z]+)-?(\d+)$/i)
  if (!match) return false
  const [, prefix, number] = match
  return new RegExp(`\\b${prefix}[-\\s#]*0*${number}\\b`, 'i').test(title)
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

function playerKey(value: string) {
  return normalizeText(value)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function serialDenominatorFromLabel(label: string) {
  const match = label.match(/\/\s*(\d{1,4})\b/)
  return match ? Number(match[1]) : null
}

function quoteSerial(quote: VariationQuote) {
  return serialDenominatorFromLabel(quote.label)
}

function logDistance(left: number, right: number) {
  if (left <= 0 || right <= 0) return Number.POSITIVE_INFINITY
  return Math.abs(Math.log(left / right))
}

function nearestQuoteByPrice(quotes: VariationQuote[], price: number) {
  return [...quotes]
    .filter((quote) => quote.price > 0)
    .sort((left, right) => logDistance(left.price, price) - logDistance(right.price, price))[0]
}

function sortedQuotesByPrice(quotes: VariationQuote[]) {
  return [...quotes]
    .filter((quote) => quote.price > 0)
    .sort(
      (left, right) =>
        left.price - right.price ||
        (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.label.localeCompare(right.label),
    )
}

function priceBracket(quotes: VariationQuote[], price: number) {
  const sorted = sortedQuotesByPrice(quotes)
  let floor: VariationQuote | null = null
  let ceiling: VariationQuote | null = null

  for (const quote of sorted) {
    if (quote.price <= price) floor = quote
    if (!ceiling && quote.price >= price) ceiling = quote
  }

  if (!floor) ceiling = sorted[0] ?? null
  if (!ceiling) floor = sorted[sorted.length - 1] ?? floor

  const bracketPosition =
    floor && ceiling && ceiling.price !== floor.price
      ? Math.max(0, Math.min(1, (price - floor.price) / (ceiling.price - floor.price)))
      : null
  const priceBandLabel = (() => {
    if (!floor && ceiling) return `Below ${ceiling.label}`
    if (floor && !ceiling) return `Above ${floor.label}`
    if (floor && ceiling && floor.key !== ceiling.key) return `${floor.label} to ${ceiling.label}`
    if (floor) return `At ${floor.label}`
    return 'No auto band'
  })()

  return { floor, ceiling, bracketPosition, priceBandLabel }
}

function autoEquivalentSignal(quote: VariationQuote | undefined, autoMultiple: number): CaseHitAutoEquivalentSignal {
  if (!quote || !Number.isFinite(autoMultiple) || autoMultiple <= 0) return 'missing'
  const serial = quoteSerial(quote)
  if (autoMultiple <= 1.6 || serial === null || serial >= 250) return 'value'
  if (autoMultiple <= 3.25 || serial >= 99) return 'fair'
  if (autoMultiple <= 8.5 || serial >= 25) return 'premium'
  return 'danger'
}

function tierScoreForQuote(quote: VariationQuote, autoMultiple: number) {
  const serial = quoteSerial(quote)
  if (serial === null) return 95
  if (serial >= 250) return 90
  if (serial >= 99) return 74
  if (serial >= 50) return 58
  if (serial >= 25) return 42
  if (serial >= 5) return 24
  return Math.max(6, 18 - autoMultiple)
}

function autoEquivalentValueScore(signal: CaseHitAutoEquivalentSignal, quote: VariationQuote, allIn: number) {
  const signalScore: Record<CaseHitAutoEquivalentSignal, number> = {
    value: 100,
    fair: 76,
    premium: 45,
    danger: 16,
    missing: 0,
  }
  const nearestTierDiscount = quote.price > 0 ? Math.max(-0.35, Math.min(0.35, (quote.price - allIn) / quote.price)) : 0
  return signalScore[signal] + nearestTierDiscount * 18
}

export function buildCaseHitAutoEquivalent(
  listing: CaseHitListing,
  pricingRows: PricingRow[],
): CaseHitAutoEquivalent | null {
  const listingPlayerKey = playerKey(listing.playerName)
  const row =
    pricingRows.find(
      (candidate) =>
        candidate.releaseYear === 2026 &&
        candidate.category === 'bowman' &&
        playerKey(candidate.playerName) === listingPlayerKey,
    ) ?? pricingRows.find((candidate) => playerKey(candidate.playerName) === listingPlayerKey)

  if (!row || row.baseTwmaPrice <= 0 || row.ladder.length === 0) return null

  const quotes = row.ladder.filter((quote) => quote.price > 0)
  const equivalentQuote = nearestQuoteByPrice(quotes, listing.allIn)
  if (!equivalentQuote) return null

  const autoMultiple = listing.allIn / row.baseTwmaPrice
  const { floor, ceiling, bracketPosition, priceBandLabel } = priceBracket(quotes, listing.allIn)
  const signal = autoEquivalentSignal(equivalentQuote, autoMultiple)
  const tierScore = tierScoreForQuote(equivalentQuote, autoMultiple)
  const valueScore = tierScore + autoEquivalentValueScore(signal, equivalentQuote, listing.allIn)

  return {
    playerName: row.playerName,
    release: row.release,
    releaseYear: row.releaseYear,
    baseAutoPrice: Number(row.baseTwmaPrice.toFixed(2)),
    autoMultiple: Number(autoMultiple.toFixed(2)),
    equivalentLabel: equivalentQuote.label,
    equivalentPrice: Number(equivalentQuote.price.toFixed(2)),
    equivalentMultiplier: Number(equivalentQuote.multiplier.toFixed(2)),
    equivalentSerial: quoteSerial(equivalentQuote),
    floorLabel: floor?.label ?? null,
    floorPrice: floor ? Number(floor.price.toFixed(2)) : null,
    floorMultiplier: floor ? Number(floor.multiplier.toFixed(2)) : null,
    floorSerial: floor ? quoteSerial(floor) : null,
    ceilingLabel: ceiling?.label ?? null,
    ceilingPrice: ceiling ? Number(ceiling.price.toFixed(2)) : null,
    ceilingMultiplier: ceiling ? Number(ceiling.multiplier.toFixed(2)) : null,
    ceilingSerial: ceiling ? quoteSerial(ceiling) : null,
    priceBandLabel,
    bracketPosition: bracketPosition === null ? null : Number(bracketPosition.toFixed(2)),
    tierScore: Number(tierScore.toFixed(2)),
    valueScore: Number(valueScore.toFixed(2)),
    signal,
  }
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

function caseHitFamilyForKey(key: string | undefined | null) {
  if (!key) return null
  return CASE_HIT_FAMILY_BY_KEY.get(key as CaseHitInsertKey) ?? null
}

function titleMatchesFamily(title: string, family: CaseHitFamily) {
  return family.patterns.some((pattern) => pattern.test(title))
}

function classifyCaseHitFamily(title: string, preferredKey?: string) {
  const preferred = caseHitFamilyForKey(preferredKey)
  const orderedFamilies = [
    CASE_HIT_FAMILY_BY_KEY.get('anime-kanji'),
    CASE_HIT_FAMILY_BY_KEY.get('crystallized'),
    CASE_HIT_FAMILY_BY_KEY.get('patchwork'),
    CASE_HIT_FAMILY_BY_KEY.get('final-draft'),
    CASE_HIT_FAMILY_BY_KEY.get('bowman-spotlights'),
    CASE_HIT_FAMILY_BY_KEY.get('anime'),
  ].filter((family): family is CaseHitFamily => Boolean(family))

  if (preferred && titleMatchesFamily(title, preferred)) {
    if (preferred.key === 'anime' && titleMatchesFamily(title, CASE_HIT_FAMILY_BY_KEY.get('anime-kanji')!)) {
      return CASE_HIT_FAMILY_BY_KEY.get('anime-kanji') ?? preferred
    }
    return preferred
  }

  return orderedFamilies.find((family) => titleMatchesFamily(title, family)) ?? null
}

function findChecklistCard(family: CaseHitFamily, title: string, playerName?: string) {
  const queryPlayer = firstString([playerName], '')
  if (queryPlayer) {
    const card = family.checklist.find((candidate) => playerKey(candidate.playerName) === playerKey(queryPlayer))
    if (card && titleMatchesPlayerName(title, card.playerName)) return card
  }

  const cardNoMatch = family.checklist.find((candidate) => titleMatchesCardNo(title, candidate.cardNo))
  if (cardNoMatch && (!queryPlayer || titleMatchesPlayerName(title, cardNoMatch.playerName))) return cardNoMatch

  return family.checklist.find((candidate) => titleMatchesPlayerName(title, candidate.playerName)) ?? null
}

function variationForKey(key: CaseHitVariationKey, caseHitKey: CaseHitInsertKey = 'crystallized') {
  const family = caseHitFamilyForKey(caseHitKey) ?? CASE_HIT_FAMILY_BY_KEY.get('crystallized')!
  return family.variations.find((variation) => variation.key === key) ?? family.variations[0]
}

export function rarityMultiplier(key: CaseHitVariationKey, caseHitKey: CaseHitInsertKey = 'crystallized') {
  const family = caseHitFamilyForKey(caseHitKey) ?? CASE_HIT_FAMILY_BY_KEY.get('crystallized')!
  const variation = variationForKey(key, family.key)
  const familyPrintRunMultiplier = Math.pow(CRYSTALLIZED_PRINT_RUN / family.printRun, 0.55)
  const variationMultiplier =
    family.key === 'crystallized' && variation.key !== 'base'
      ? Math.pow(variation.minPackOdds / BASE_CRYSTALLIZED_ODDS, 0.55)
      : 1
  return Number((familyPrintRunMultiplier * variationMultiplier).toFixed(2))
}

function classifyVariation(title: string, family: CaseHitFamily): CaseHitVariationKey {
  if (family.key !== 'crystallized') return 'base'
  const normalized = normalizeText(title)
  if (/\bsuperfractor\b|(?:^|\s|#)\/1(?:\s|$)/i.test(title)) return 'superfractor'
  if (/\bred\s+(?:refractor|crystallized)\b/.test(normalized) || /(?:^|\s|#)\/5(?:\s|$)/i.test(title)) return 'red'
  if (/\borange\b|(?:^|\s|#)\/25(?:\s|$)/i.test(title)) return 'orange'
  if (/\bgold\b|(?:^|\s|#)\/50(?:\s|$)/i.test(title)) return 'gold'
  return 'base'
}

export function mapEbayItemToCaseHitListing(item: RawEbayCaseHitItem): CaseHitListing | null {
  const title = firstString([item.title], '')
  if (!title) return null

  const normalizedTitle = normalizeText(title)
  if (!/\b2026\b/.test(normalizedTitle) || !/\bbowman\b/.test(normalizedTitle)) return null
  if (PHYSICAL_BLOCKER_TERMS.test(title) || AUTO_BLOCKER_TERMS.test(title) || ADJACENT_INSERT_BLOCKER_TERMS.test(title)) return null

  const family = classifyCaseHitFamily(title, item._bowmanTraderQuery?.caseHit)
  if (!family) return null
  if (family.key !== 'crystallized' && NON_CRYSTALLIZED_PARALLEL_TERMS.test(title)) return null

  const checklistCard = findChecklistCard(family, title, item._bowmanTraderQuery?.playerName)
  if (!checklistCard) return null

  const price = numberValue(item.price?.value, 0)
  if (price <= 0) return null

  const variationKey = classifyVariation(title, family)
  const variation = variationForKey(variationKey, family.key)
  const itemId = firstString([item.legacyItemId, item.itemId, item.itemWebUrl], title)
  const shipping = minShippingCost(item)

  return {
    itemId,
    caseHitKey: family.key,
    caseHitLabel: family.label,
    cardNo: checklistCard.cardNo,
    playerName: checklistCard.playerName,
    team: checklistCard.team,
    title,
    variationKey,
    variationLabel: variation.label,
    serial: variation.serial,
    printRun: family.printRun,
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

function modelLaneKey(caseHitKey: CaseHitInsertKey, variationKey: CaseHitVariationKey) {
  return `${caseHitKey}:${variationKey}`
}

function buildBaseAnchors(listings: CaseHitListing[], excludeItemId?: string) {
  const usable = listings.filter((listing) => listing.itemId !== excludeItemId)
  const globalBaseAsks = new Map<CaseHitInsertKey, number>()
  const variationAsks = new Map<string, number>()
  const playerBaseAsks = new Map<string, number>()

  for (const family of CASE_HIT_FAMILIES) {
    globalBaseAsks.set(
      family.key,
      robustAsk(
        usable
          .filter((listing) => listing.caseHitKey === family.key)
          .map((listing) => listing.allIn / rarityMultiplier(listing.variationKey, listing.caseHitKey)),
      ),
    )
    for (const variation of family.variations) {
      variationAsks.set(
        modelLaneKey(family.key, variation.key),
        robustAsk(
          usable
            .filter((listing) => listing.caseHitKey === family.key && listing.variationKey === variation.key)
            .map((listing) => listing.allIn),
        ),
      )
    }
    for (const card of family.checklist) {
      playerBaseAsks.set(
        `${family.key}:${card.playerName}`,
        robustAsk(
          usable
            .filter((listing) => listing.caseHitKey === family.key && listing.playerName === card.playerName)
            .map((listing) => listing.allIn / rarityMultiplier(listing.variationKey, listing.caseHitKey)),
        ),
      )
    }
  }

  return { globalBaseAsks, playerBaseAsks, variationAsks }
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
      const { globalBaseAsks, playerBaseAsks, variationAsks } = buildBaseAnchors(listings, listing.itemId)
      const samePlayerVariation = listings.filter(
        (candidate) =>
          candidate.itemId !== listing.itemId &&
          candidate.caseHitKey === listing.caseHitKey &&
          candidate.playerName === listing.playerName &&
          candidate.variationKey === listing.variationKey,
      )
      const samePlayerAsk = robustAsk(samePlayerVariation.map((candidate) => candidate.allIn))
      const globalBaseAsk = globalBaseAsks.get(listing.caseHitKey) ?? 0
      const playerBaseAsk = playerBaseAsks.get(`${listing.caseHitKey}:${listing.playerName}`) ?? 0
      const variationAsk = variationAsks.get(modelLaneKey(listing.caseHitKey, listing.variationKey)) ?? 0
      const rarity = rarityMultiplier(listing.variationKey, listing.caseHitKey)
      const rarityModel = (playerBaseAsk || globalBaseAsk) * rarity

      let modelPrice = rarityModel
      let source: CaseHitModelSource = playerBaseAsk ? 'player-rarity' : 'global-rarity'
      let confidence = playerBaseAsk ? 0.54 : 0.42
      let compCount = listings.filter((candidate) => candidate.itemId !== listing.itemId && candidate.caseHitKey === listing.caseHitKey).length

      if (samePlayerVariation.length >= 2 && samePlayerAsk > 0) {
        modelPrice = samePlayerAsk * 0.72 + (rarityModel || samePlayerAsk) * 0.28
        source = 'same-player'
        confidence = Math.min(0.86, 0.64 + samePlayerVariation.length / 28)
        compCount = samePlayerVariation.length
      } else if (playerBaseAsk && variationAsk) {
        modelPrice = rarityModel * 0.68 + variationAsk * 0.32
        source = 'player-rarity'
        confidence = 0.58
        compCount = listings.filter(
          (candidate) =>
            candidate.itemId !== listing.itemId &&
            candidate.caseHitKey === listing.caseHitKey &&
            candidate.playerName === listing.playerName,
        ).length
      } else if (variationAsk) {
        modelPrice = variationAsk * 0.62 + (rarityModel || variationAsk) * 0.38
        source = 'variation-ask'
        confidence = 0.46
        compCount = listings.filter(
          (candidate) =>
            candidate.itemId !== listing.itemId &&
            candidate.caseHitKey === listing.caseHitKey &&
            candidate.variationKey === listing.variationKey,
        ).length
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
  const { globalBaseAsks, playerBaseAsks } = buildBaseAnchors(listings)

  return CASE_HIT_FAMILIES.flatMap((family) =>
    family.checklist.map((card) => {
      const playerListings = listings.filter(
        (listing) => listing.caseHitKey === family.key && listing.playerName === card.playerName,
      )
      const playerBaseAsk = playerBaseAsks.get(`${family.key}:${card.playerName}`) ?? 0
      const globalBaseAsk = globalBaseAsks.get(family.key) ?? 0
      const baseAsk = playerBaseAsk || globalBaseAsk || 0
      const source: CaseHitValuationRow['source'] = playerBaseAsk ? 'player-ask' : globalBaseAsk ? 'global-ask' : 'unpriced'
      const confidence =
        source === 'player-ask'
          ? Math.min(0.72, 0.46 + playerListings.length / 26)
          : source === 'global-ask'
            ? Math.min(0.44, 0.28 + listings.filter((listing) => listing.caseHitKey === family.key).length / 80)
            : 0

      return {
        caseHitKey: family.key,
        caseHitLabel: family.label,
        printRun: family.printRun,
        cardNo: card.cardNo,
        playerName: card.playerName,
        team: card.team,
        baseAsk: Number(baseAsk.toFixed(2)),
        confidence,
        source,
        activeListings: playerListings.length,
        variations: family.variations.map((variation) => {
          const multiplier = rarityMultiplier(variation.key, family.key)
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
    }),
  ).sort(
    (left, right) =>
      right.baseAsk - left.baseAsk ||
      right.activeListings - left.activeListings ||
      left.caseHitLabel.localeCompare(right.caseHitLabel) ||
      left.playerName.localeCompare(right.playerName),
  )
}

function selectedCaseHitFamilies(keys?: CaseHitInsertKey[]) {
  if (!keys || keys.length === 0) return CASE_HIT_FAMILIES
  const selected = new Set(keys)
  return CASE_HIT_FAMILIES.filter((family) => selected.has(family.key))
}

export async function fetchCaseHits(options: {
  caseHitKeys?: CaseHitInsertKey[]
  minPrice?: number
  limitPerQuery?: number
  maxPagesPerQuery?: number
  signal?: AbortSignal
} = {}): Promise<CaseHitScanResult> {
  const families = selectedCaseHitFamilies(options.caseHitKeys)
  const queries = families.flatMap((family) =>
    family.searchTerms.map((q) => ({
      q,
      caseHit: family.key,
    })),
  )

  const response = await fetch('/api/ebay/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      queries,
      minPrice: options.minPrice ?? 0,
      limit: options.limitPerQuery ?? 100,
      maxPages: options.maxPagesPerQuery ?? 1,
      sort: 'price',
    }),
  })

  const payload = (await response.json()) as EbaySearchResponse
  if (!response.ok) throw new Error(payload.error ?? 'Case hit eBay search failed')

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
    valuationRows: buildCaseHitValuationRows(listings).filter((row) => families.some((family) => family.key === row.caseHitKey)),
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
      cacheHits: payload.stats?.cacheHits ?? 0,
      upstreamPagesFetched: payload.stats?.upstreamPagesFetched ?? payload.stats?.pagesFetched ?? 0,
    },
  }
}

export async function fetchCrystallizedCaseHits(options: {
  minPrice?: number
  limitPerQuery?: number
  maxPagesPerQuery?: number
  signal?: AbortSignal
} = {}) {
  return fetchCaseHits({ ...options, caseHitKeys: ['crystallized'] })
}
