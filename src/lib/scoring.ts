import type {
  ChecklistModel,
  ChecklistPlayer,
  CompSale,
  GradingCompany,
  ListingStatus,
  NormalizedListing,
  Opportunity,
  Prospect,
  ProspectPulseListing,
  ScoreSettings,
  ValuationSource,
} from '../types'
import { estimateBasePrice } from './matrix'
import { salesCacheValuationForListing } from './liveComps'
import { titleLooksHandSignedAuto } from './handSigned'
import type { SalesCachePlayerModel } from './salesCache'

export const DEFAULT_SETTINGS: ScoreSettings = {
  minDiscountPct: 0,
  dollarEdgeWeight: 82,
  targetMarginPct: 22,
  minPrice: 0,
  maxPrice: null,
  mode: 'raw',
  targetUniverse: 'strict',
  targetReleaseYear: 2026,
  targetCategory: 'bowman',
  releaseScope: 'all',
  checklistOnly: true,
  minCompCount: 0,
  activeOnly: true,
}

const SNACK_PACK_PATTERN = /\bsnack\s+pack\b|\bgum\s*ball\b|\bbubble\s+gum\b|\bpeanuts?\b|\bpopcorn\b|\bsunflower(?:\s+seeds?)?\b/i
const BLACK_AND_WHITE_SHIMMER_PATTERN = /\b(?:b\s*&\s*w|b\s*w|black\s+(?:and\s+)?white)\s+shimmer\b/i
const HAND_SIGNED_BASE_MULTIPLE = 0.55
const TEAM_COLOR_WORD_CONTEXT_PATTERN = /\b(?:red\s+sox|white\s+sox|reds?|blue\s+jays)\b/gi

const TITLE_PARALLEL_CUES: Array<{ label: string; denominator: number; pattern: RegExp }> = [
  { label: 'Superfractor', denominator: 1, pattern: /\bsuperfractor\b|\bsuper\s*(?:auto|refractor)\b/i },
  { label: 'Red', denominator: 5, pattern: /\bred\s+(?:refractor|auto|parallel|shimmer|lava|wave)\b|\b(?:refractor|auto|parallel|shimmer|lava|wave)\s+red\b/i },
  { label: 'Orange', denominator: 25, pattern: /\borange\s+(?:refractor|auto|parallel|shimmer|lava|wave)\b|\b(?:refractor|auto|parallel|shimmer|lava|wave)\s+orange\b/i },
  { label: 'Gold', denominator: 50, pattern: /\bgold\s+(?:refractor|auto|parallel|shimmer|lava|wave)\b|\b(?:refractor|auto|parallel|shimmer|lava|wave)\s+gold\b/i },
  { label: 'Yellow', denominator: 75, pattern: /\byellow\s+(?:refractor|auto|parallel|shimmer|lava|wave)\b|\b(?:refractor|auto|parallel|shimmer|lava|wave)\s+yellow\b/i },
  { label: 'Green', denominator: 99, pattern: /\bgreen\s+(?:refractor|auto|parallel|shimmer|lava|wave)\b|\b(?:refractor|auto|parallel|shimmer|lava|wave)\s+green\b/i },
  { label: 'Aqua', denominator: 125, pattern: /\baqua\s+(?:refractor|auto|parallel|shimmer|lava|wave)\b|\b(?:refractor|auto|parallel|shimmer|lava|wave)\s+aqua\b/i },
  { label: 'Blue', denominator: 150, pattern: /\bblue\s+(?:refractor|auto|parallel|shimmer|lava|wave)\b|\b(?:refractor|auto|parallel|shimmer|lava|wave)\s+blue\b/i },
  { label: 'Purple', denominator: 250, pattern: /\bpurple\s+(?:refractor|auto|parallel|shimmer|lava|wave)\b|\b(?:refractor|auto|parallel|shimmer|lava|wave)\s+purple\b/i },
  { label: 'Speckle', denominator: 299, pattern: /\bspeckle\b/i },
  { label: 'Refractor', denominator: 499, pattern: /\brefractor\b/i },
]

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function numberValue(value: unknown, fallback = 0) {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value ?? '').replace(/[$,%\s,]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function positiveNumberValue(value: unknown) {
  const parsed = numberValue(value, 0)
  return parsed > 0 ? parsed : null
}

function firstPositiveNumber(values: unknown[], fallback = 0) {
  for (const value of values) {
    const parsed = positiveNumberValue(value)
    if (parsed !== null) return parsed
  }
  return fallback
}

function firstString(values: unknown[], fallback = '') {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return fallback
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const usable = values.filter(({ value, weight }) => value > 0 && weight > 0)
  const totalWeight = usable.reduce((total, item) => total + item.weight, 0)
  if (totalWeight <= 0) return 0
  return usable.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight
}

function normalizeComps(comps?: CompSale[]) {
  return (comps ?? [])
    .map((comp) => ({
      ...comp,
      sale_price: numberValue(comp.sale_price ?? comp.price, 0),
    }))
    .filter((comp) => (comp.sale_price ?? 0) > 0)
}

function inferKind(listing: ProspectPulseListing): NormalizedListing['kind'] {
  const format = String(listing.buying_format ?? '').toLowerCase()
  const status = String(listing.status ?? listing.listing_status ?? '').toLowerCase()
  if (listing.is_sold || listing.sold_price || status.includes('sold')) return 'sold'
  if (format.includes('bin') || format.includes('buy')) return 'bin'
  return 'live'
}

function inferStatus(listing: ProspectPulseListing, kind: NormalizedListing['kind']): ListingStatus {
  const statusText = String(listing.status ?? listing.listing_status ?? '').toLowerCase()
  const endTime = listing.end_time ? new Date(listing.end_time).getTime() : null

  if (listing.is_sold || listing.sold_price || statusText.includes('sold')) return 'sold'
  if (statusText.includes('ended') || statusText.includes('closed') || statusText.includes('complete')) return 'ended'
  if (endTime && Number.isFinite(endTime) && endTime < Date.now()) return 'ended'
  if (statusText.includes('active') || statusText.includes('live')) return 'active'
  if (kind === 'bin' || kind === 'live') return 'unknown'
  return 'unknown'
}

function inferReleaseYear(listing: ProspectPulseListing) {
  const explicitYear = positiveNumberValue(listing.release_year)
  if (explicitYear) return explicitYear
  const match = searchText(listing).match(/\b(20\d{2})\b/)
  return match ? Number(match[1]) : null
}

function releaseLabel(listing: ProspectPulseListing, releaseYear?: number | null) {
  const year = releaseYear ? String(releaseYear) : ''
  const explicitRelease = firstString([listing.release], '')
  if (explicitRelease && /\b20\d{2}\b/.test(explicitRelease)) {
    return explicitRelease.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const product = firstString([listing.product_type, listing.release], 'Bowman Chrome')
  return product.includes(year) ? product : `${year} ${product}`.trim()
}

function inferSerialDenominator(listing: ProspectPulseListing) {
  const explicit = positiveNumberValue(listing.serial_denominator)
  if (explicit) return explicit
  const text = variationSearchText(listing)
  const match = text.match(/(?:\/|numbered\s+to\s+|#\/)(\d{1,3})\b/)
  if (match) return Number(match[1])
  if (BLACK_AND_WHITE_SHIMMER_PATTERN.test(text)) return 11
  const cue = TITLE_PARALLEL_CUES.find((parallel) => parallel.pattern.test(text))
  if (cue) return cue.denominator
  return isSnackPackAutoListing(listing) ? 5 : null
}

function variationLabel(listing: ProspectPulseListing, serialDenominator?: number | null) {
  if (isHandSignedAutoListing(listing)) return 'Hand Signed Auto'
  if (isSnackPackAutoListing(listing)) return `${snackPackVariant(listing)} Snack Pack /${serialDenominator ?? 5}`
  const explicitVariation = firstString([listing.variation, listing.base_color], '')
  const text = variationSearchText(listing)
  const inferredVariation =
    BLACK_AND_WHITE_SHIMMER_PATTERN.test(text)
      ? 'B&W Shimmer'
      : TITLE_PARALLEL_CUES.find((parallel) => parallel.denominator === serialDenominator && parallel.pattern.test(text))?.label
  const variation =
    explicitVariation && !/^base$/i.test(explicitVariation)
      ? explicitVariation
      : inferredVariation ?? (explicitVariation || 'Base')
  const serial = serialDenominator ? `/${serialDenominator}` : ''
  return `${variation} ${serial}`.trim()
}

function isHandSignedAutoListing(listing: ProspectPulseListing) {
  return Boolean(listing.is_hand_signed) || titleLooksHandSignedAuto(searchText(listing))
}

function isSnackPackAutoListing(listing: ProspectPulseListing) {
  const text = searchText(listing)
  return SNACK_PACK_PATTERN.test(text) && /\b(auto|autos|autograph|autographed|autographs|signed|signature|redemption)\b/.test(text)
}

function snackPackVariant(listing: ProspectPulseListing) {
  const text = searchText(listing)
  if (/\bsunflower(?:\s+seeds?)?\b/i.test(text)) return 'Sunflower'
  if (/\bgum\s*ball\b|\bbubble\s+gum\b/i.test(text)) return 'Gumball'
  if (/\bpeanuts?\b/i.test(text)) return 'Peanuts'
  if (/\bpopcorn\b/i.test(text)) return 'Popcorn'
  return 'Snack Pack'
}

function imageUrl(listing: ProspectPulseListing) {
  const gallery = Array.isArray(listing.gallery_urls) ? listing.gallery_urls[0] : listing.gallery_urls
  return firstString([listing.image_url, listing.image, listing.gallery_url, gallery], '') || null
}

function inferIsGraded(listing: ProspectPulseListing) {
  const text = gradingText(listing)
  const gradeText = String(listing.grade ?? '').trim()
  return Boolean(
    listing.is_graded ||
      listing.grader ||
      gradeText ||
      /\b(psa|bgs|sgc|cgc|csg)\s*\d{1,2}(?:\.\d)?\b/.test(text) ||
      /\b(psa|bgs|sgc|cgc|csg)\b/.test(text) ||
      /\b(gem\s+(?:mt|mint)|mint\s+10|gem\s+10|pristine|black\s+label|slabbed|graded)\b/.test(text) ||
      /\b(?:9|9\.5|10)\s*\/\s*10\b/.test(text),
  )
}

function gradingText(listing: ProspectPulseListing) {
  return [
    listing.title,
    listing.grader,
    listing.grade,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function normalizeGradingCompany(value: unknown): GradingCompany | null {
  const text = String(value ?? '').toUpperCase()
  if (/\bPSA\b/.test(text)) return 'PSA'
  if (/\bBGS\b|BECKETT/.test(text)) return 'BGS'
  if (/\bSGC\b/.test(text)) return 'SGC'
  if (/\bCGC\b/.test(text)) return 'CGC'
  return null
}

function parseGradeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value ?? '').trim()
  const direct = text.match(/\b(10|[1-9](?:\.\d)?)\b/)
  return direct ? Number(direct[1]) : null
}

function inferGradeDetails(listing: ProspectPulseListing) {
  const text = gradingText(listing)
  const graderPattern = /\b(psa|bgs|sgc|cgc|beckett)\b/i
  const company = normalizeGradingCompany(listing.grader) ?? normalizeGradingCompany(text.match(graderPattern)?.[1])
  const compactMatch =
    text.match(/\b(psa|bgs|sgc|cgc)\s*(?:gem\s*(?:mt|mint)?|mint|pristine|black\s*label)?\s*(10|[1-9](?:\.\d)?)\b/i) ??
    text.match(/\b(psa|bgs|sgc|cgc)(10|[1-9](?:\.\d)?)\b/i)
  const reverseMatch = text.match(/\b(10|[1-9](?:\.\d)?)\s*(?:\/\s*10)?\s*(psa|bgs|sgc|cgc)\b/i)
  const gradeNumber =
    parseGradeNumber(listing.grade) ??
    (compactMatch ? Number(compactMatch[2]) : null) ??
    (reverseMatch ? Number(reverseMatch[1]) : null)
  const gradingCompany =
    company ?? normalizeGradingCompany(compactMatch?.[1]) ?? normalizeGradingCompany(reverseMatch?.[2])
  const isGraded = inferIsGraded(listing)

  return {
    isGraded,
    gradingCompany,
    gradeNumber,
    isEligibleGraded: Boolean(isGraded && gradingCompany && gradeNumber !== null && gradeNumber >= 9),
  }
}

function hoursBetween(date?: string | null, endDate = Date.now()) {
  if (!date) return null
  const parsed = new Date(date).getTime()
  if (!Number.isFinite(parsed)) return null
  return (endDate - parsed) / (1000 * 60 * 60)
}

function hoursUntil(endTime?: string | null) {
  if (!endTime) return null
  const diffMs = new Date(endTime).getTime() - Date.now()
  if (!Number.isFinite(diffMs)) return null
  return diffMs / (1000 * 60 * 60)
}

function searchText(listing: ProspectPulseListing) {
  return [
    listing.title,
    listing.player_name,
    listing.product_type,
    listing.release,
    listing.variation,
    listing.base_color,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function variationSearchText(listing: ProspectPulseListing) {
  return searchText(listing).replace(TEAM_COLOR_WORD_CONTEXT_PATTERN, ' ')
}

function comparableText(value: string) {
  return value
    .toLowerCase()
    .replace(TEAM_COLOR_WORD_CONTEXT_PATTERN, ' ')
    .replace(/\bsunflower\s+seeds?\b/g, 'sunflower snack pack')
    .replace(/\bsunflower\b(?!\s+snack\s+pack)/g, 'sunflower snack pack')
    .replace(/\bgum\s*ball\b(?!\s+snack\s+pack)|\bbubble\s+gum\b(?!\s+snack\s+pack)/g, 'gumball snack pack')
    .replace(/\bpeanuts?\b(?!\s+snack\s+pack)/g, 'peanuts snack pack')
    .replace(/\bpopcorn\b(?!\s+snack\s+pack)/g, 'popcorn snack pack')
    .replace(/\b(1st|first|bowman|chrome|prospect|auto|autograph|autographed)\b/g, ' ')
    .replace(/#/g, '/')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function comparableTokens(value: string) {
  return comparableText(value).split(' ').filter(Boolean)
}

function tokenMatchesVariationPart(part: string, tokens: string[]) {
  const tokenSet = new Set(tokens)
  if (part.startsWith('/')) return tokenSet.has(part)
  if (part === 'x') return tokenSet.has('x') || tokenSet.has('xfractor')
  if (part === 'fractor') return tokenSet.has('fractor') || tokenSet.has('xfractor')
  return tokenSet.has(part)
}

const DISTINCT_PARALLEL_MODIFIERS = [
  { key: 'mojo', pattern: /\bmojo\b/ },
  { key: 'shimmer', pattern: /\bshimmer\b/ },
  { key: 'lava', pattern: /\blava\b/ },
  { key: 'wave', pattern: /\b(?:ray\s*)?wave\b/ },
  { key: 'geometric', pattern: /\bgeometric\b/ },
  { key: 'x-fractor', pattern: /\bx\s*(?:re)?fractor\b|\bxfractor\b/ },
  { key: 'packfractor', pattern: /\bpackfractor\b/ },
  { key: 'logofractor', pattern: /\blogofractor\b/ },
  { key: 'firefractor', pattern: /\bfirefractor\b/ },
  { key: 'mini-diamond', pattern: /\bmini\s*diamond\b/ },
  { key: 'speckle', pattern: /\bspeckle\b/ },
  { key: 'atomic', pattern: /\batomic\b/ },
]

function distinctParallelModifiers(value: string) {
  const text = comparableText(value)
  return new Set(DISTINCT_PARALLEL_MODIFIERS.filter((modifier) => modifier.pattern.test(text)).map((modifier) => modifier.key))
}

function hasUnmatchedDistinctModifier(haystack: string, variation: string) {
  const haystackModifiers = distinctParallelModifiers(haystack)
  if (haystackModifiers.size === 0) return false
  const variationModifiers = distinctParallelModifiers(variation)
  return [...haystackModifiers].some((modifier) => !variationModifiers.has(modifier))
}

const ADJACENT_PRODUCT_BLOCKERS = [
  /\bsapphire\b/,
  /\bmega\s*box\b|\bmega\b/,
  /\bsterling\b/,
  /\binception\b/,
  /\btranscendent\b/,
  /\bfinest\b/,
  /\bbowman'?s?\s+best\b/,
  /\bascensions?\b/,
  /\bdraft\s+night\b/,
  /\bpower\s*chords?\b/,
  /\bpanini\b/,
  /\bleaf\b/,
]

function listingProductBlockedForModel(listing: NormalizedListing, model: ChecklistModel) {
  const listingText = `${listing.title} ${listing.releaseLabel}`.toLowerCase()
  const modelText = model.release.toLowerCase()
  return ADJACENT_PRODUCT_BLOCKERS.some((pattern) => pattern.test(listingText) && !pattern.test(modelText))
}

function detectUniverse(listing: ProspectPulseListing, serialDenominator?: number | null) {
  const text = searchText(listing)
  const isBowman = /\bbowman\b/.test(text)
  const isHandSigned = isHandSignedAutoListing(listing)
  const nonAuto = /\b(non[-\s]?auto|no\s+auto|unsigned|facsimile|reprint)\b/.test(text)
  const isAutograph =
    !nonAuto && /\b(auto|autos|autograph|autographed|autographs|signed|signature)\b/.test(text)
  const hasFirstMarker = /\b(1st|first)\b/.test(text)
  const isFirstEditionOnly = /\bfirst\s+edition\b/.test(text) && !/\b(1st|first)\s+bowman\b/.test(text)
  const isFirstBowman = isBowman && hasFirstMarker && !isFirstEditionOnly
  const serial = serialDenominator ?? positiveNumberValue(listing.serial_denominator)
  const isLowSerialNonAuto = Boolean(isBowman && isFirstBowman && !isAutograph && !isHandSigned && serial && serial <= 99)

  let universeScore = 0
  if (isBowman) universeScore += 0.34
  if (isAutograph) universeScore += 0.34
  if (isFirstBowman) universeScore += 0.26
  if (/chrome/.test(text)) universeScore += 0.04
  if (serial && serial <= 150) universeScore += 0.02
  if (isLowSerialNonAuto) universeScore += 0.2

  const isTargetAuto = isBowman && isAutograph && isFirstBowman

  return {
    isBowman,
    isAutograph,
    isFirstBowman,
    isTargetAuto,
    isLowSerialNonAuto,
    isHandSigned,
    universeScore: clamp(
      isHandSigned
        ? Math.min(isTargetAuto ? Math.max(universeScore, 0.74) : universeScore, 0.78)
        : isTargetAuto
          ? Math.max(universeScore, 0.96)
          : isLowSerialNonAuto
            ? Math.max(universeScore, 0.84)
            : universeScore,
    ),
  }
}

function normalizeProspect(prospect?: Prospect | null): Prospect | undefined {
  if (!prospect) return undefined
  return {
    ...prospect,
    ranking: positiveNumberValue(prospect.ranking),
    age: positiveNumberValue(prospect.age),
    current_avg: positiveNumberValue(prospect.current_avg),
    iso: positiveNumberValue(prospect.iso),
    k_pct: positiveNumberValue(prospect.k_pct),
    bb_pct: positiveNumberValue(prospect.bb_pct),
    era: positiveNumberValue(prospect.era),
    fip: positiveNumberValue(prospect.fip),
    k_per_9: positiveNumberValue(prospect.k_per_9),
    bb_per_9: positiveNumberValue(prospect.bb_per_9),
  }
}

export function normalizeListing(listing: ProspectPulseListing): NormalizedListing {
  const comps = normalizeComps(listing.comps)
  const compAverage = average(comps.map((comp) => numberValue(comp.sale_price, 0)))
  const currentPrice = firstPositiveNumber([listing.current_price, listing.price, listing.sold_price])
  const shippingCost = Math.max(0, numberValue(listing.shipping_cost, 0))
  const marketPrice = firstPositiveNumber(
    [listing.avgCompPrice, listing.avg_comp_price, listing.inferredCompPrice, listing.inferred_comp_price],
    compAverage,
  )
  const prospect = normalizeProspect(listing.prospect)
  const kind = inferKind(listing)
  const status = inferStatus(listing, kind)
  const releaseYear = inferReleaseYear(listing)
  const createdAt = listing.created_at ?? listing.listed_at ?? null
  const endTime = listing.end_time ?? null
  const serialDenominator = inferSerialDenominator(listing)
  const universe = detectUniverse(listing, serialDenominator)
  const playerName = firstString([listing.player_name, prospect?.name], 'Unknown player')
  const title = firstString([listing.title, playerName], 'Untitled listing')
  const gradeDetails = inferGradeDetails(listing)

  return {
    id: String(listing.item_id ?? listing.id ?? `${listing.player_name ?? 'card'}-${listing.title ?? ''}`),
    kind,
    title,
    playerName,
    prospect,
    currentPrice,
    shippingCost,
    allInPrice: currentPrice + shippingCost,
    marketPrice,
    compCount: comps.length,
    comps,
    status,
    isSold: status === 'sold',
    listingUrl: listing.listing_url ?? listing.url,
    imageUrl: imageUrl(listing),
    sellerName: listing.seller_username ?? null,
    sellerFeedbackScore: positiveNumberValue(listing.seller_feedback_score),
    watchCount: numberValue(listing.watch_count, 0),
    createdAt,
    endTime,
    bidCount: numberValue(listing.bid_count, 0),
    releaseYear,
    releaseLabel: releaseLabel(listing, releaseYear),
    variationLabel: variationLabel(listing, serialDenominator),
    serialDenominator,
    isGraded: gradeDetails.isGraded,
    grader: listing.grader,
    grade: listing.grade,
    gradingCompany: gradeDetails.gradingCompany,
    gradeNumber: gradeDetails.gradeNumber,
    isEligibleGraded: gradeDetails.isEligibleGraded,
    ...universe,
    listingAgeHours: hoursBetween(createdAt),
    hoursToClose: hoursUntil(endTime),
  }
}

function rankingBoost(prospect?: Prospect | null) {
  const rank = positiveNumberValue(prospect?.ranking)
  if (!rank) return 0.42
  if (rank <= 10) return 1
  if (rank <= 25) return 0.88
  if (rank <= 50) return 0.74
  if (rank <= 100) return 0.6
  return 0.44
}

function formBoost(prospect?: Prospect | null) {
  if (!prospect) return 0.46
  const hitter =
    numberValue(prospect.iso, 0) * 2.25 +
    numberValue(prospect.bb_pct, 0) / 34 -
    Math.max(0, numberValue(prospect.k_pct, 0) - 22) / 62
  const pitcher =
    numberValue(prospect.k_per_9, 0) / 16 +
    Math.max(0, 5 - numberValue(prospect.bb_per_9, 5)) / 10 +
    Math.max(0, 4.2 - numberValue(prospect.fip, 4.2)) / 4
  return clamp(Math.max(hitter, pitcher, 0.46), 0.2, 1)
}

function levelAgePenalty(prospect?: Prospect | null) {
  const age = positiveNumberValue(prospect?.age)
  if (!age || !prospect?.level) return 0
  const ceilings: Record<string, number> = {
    Rookie: 22,
    A: 23,
    'A+': 24,
    AA: 25,
    AAA: 26,
    MLB: 27,
  }
  const ceiling = ceilings[prospect.level]
  if (!ceiling) return 0
  return clamp((age - ceiling) / 4, 0, 0.35)
}

function dollarEdgeScore(edgeDollars: number) {
  if (edgeDollars <= 0) return 0
  return clamp(Math.log1p(edgeDollars) / Math.log1p(750))
}

function percentEdgeScore(discountPct: number) {
  if (discountPct <= 0) return 0
  return clamp(discountPct / 0.42)
}

function compSpreadPenalty(listing: NormalizedListing) {
  if (listing.comps.length < 3) return 0.34
  return clamp(
    average(listing.comps.map((comp) => Math.abs(numberValue(comp.sale_price, 0) - listing.marketPrice))) /
      Math.max(listing.marketPrice, 1),
  )
}

function compQualityScore(listing: NormalizedListing) {
  if (listing.compCount === 0) return 0
  const countScore = clamp(listing.compCount / 6)
  const spreadScore = 1 - compSpreadPenalty(listing)
  const priceSignal = listing.marketPrice >= 40 ? 1 : 0.72
  return clamp(countScore * 0.58 + spreadScore * 0.32 + priceSignal * 0.1)
}

function playerKey(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type SalesCacheModelsInput =
  | SalesCachePlayerModel
  | SalesCachePlayerModel[]
  | Record<string, SalesCachePlayerModel>
  | Map<string, SalesCachePlayerModel>
  | null
  | undefined

type ChecklistModelIndex = {
  model: ChecklistModel
  playersByKey: Map<string, ChecklistPlayer>
  searchablePlayers: Array<{ key: string; player: ChecklistPlayer }>
}

type ChecklistMatch = {
  model: ChecklistModel
  player: ChecklistPlayer
}

type SalesCacheModelIndex = {
  modelsByKey: Map<string, SalesCachePlayerModel>
  searchableModels: Array<{ key: string; model: SalesCachePlayerModel }>
}

function isSalesCachePlayerModel(value: unknown): value is SalesCachePlayerModel {
  return Boolean(value && typeof value === 'object' && 'available' in value && 'playerName' in value)
}

function salesCacheModelsArray(input: SalesCacheModelsInput) {
  if (!input) return []
  if (Array.isArray(input)) return input
  if (input instanceof Map) return [...input.values()]
  if (isSalesCachePlayerModel(input)) return [input]
  return Object.values(input)
}

function buildSalesCacheModelIndex(models: SalesCachePlayerModel[]): SalesCacheModelIndex {
  const modelsByKey = new Map<string, SalesCachePlayerModel>()
  const searchableModels: SalesCacheModelIndex['searchableModels'] = []

  for (const model of models) {
    if (!model.available) continue
    const key = playerKey(model.playerName)
    if (!key) continue
    modelsByKey.set(key, model)
    if (key.split(' ').length >= 2) searchableModels.push({ key, model })
  }

  return { modelsByKey, searchableModels }
}

function findSalesCacheModelForListingIndexed(listing: NormalizedListing, index: SalesCacheModelIndex) {
  if (index.modelsByKey.size === 0) return null
  const listingName = playerKey(listing.playerName)
  const exact = index.modelsByKey.get(listingName)
  if (exact) return exact

  const listingText = playerKey(`${listing.playerName} ${listing.title}`)
  return (
    index.searchableModels.find(({ key }) => listingText.includes(key))?.model ?? null
  )
}

function findChecklistPlayer(listing: NormalizedListing, model?: ChecklistModel | null) {
  if (!model?.players.length) return null
  const listingName = playerKey(listing.playerName)
  const exact = model.players.find((player) => playerKey(player.playerName) === listingName)
  if (exact) return exact

  const listingText = playerKey(`${listing.playerName} ${listing.title}`)
  return (
    model.players.find((player) => {
      const key = playerKey(player.playerName)
      return key.split(' ').length >= 2 && listingText.includes(key)
    }) ?? null
  )
}

function buildChecklistModelIndexes(models: ChecklistModel[]) {
  return models.map<ChecklistModelIndex>((model) => {
    const playersByKey = new Map<string, ChecklistPlayer>()
    const searchablePlayers: ChecklistModelIndex['searchablePlayers'] = []

    for (const player of model.players) {
      const key = playerKey(player.playerName)
      if (!key) continue
      playersByKey.set(key, player)
      if (key.split(' ').length >= 2) searchablePlayers.push({ key, player })
    }

    return { model, playersByKey, searchablePlayers }
  })
}

function findChecklistPlayerInIndex(listing: NormalizedListing, index: ChecklistModelIndex) {
  const listingName = playerKey(listing.playerName)
  const exact = index.playersByKey.get(listingName)
  if (exact) return exact

  const listingText = playerKey(`${listing.playerName} ${listing.title}`)
  return index.searchablePlayers.find(({ key }) => listingText.includes(key))?.player ?? null
}

function modelReleaseMatchScore(listing: NormalizedListing, model: ChecklistModel) {
  let score = 0
  if (listing.releaseYear && listing.releaseYear === model.releaseYear) score += 2
  if (releaseCategoryMatches(listing, model.category)) score += 2
  const releaseText = comparableText(`${listing.releaseLabel} ${listing.title}`)
  if (releaseText.includes(comparableText(model.release))) score += 1
  return score
}

function findChecklistMatchForListing(
  listing: NormalizedListing,
  indexes: ChecklistModelIndex[],
  settings: ScoreSettings,
) {
  let best: { match: ChecklistMatch; score: number } | null = null

  for (const index of indexes) {
    const { model } = index
    if (!model.players.length) continue
    if (settings.releaseScope === 'selected') {
      if (model.releaseYear !== settings.targetReleaseYear) continue
      if (model.category !== settings.targetCategory) continue
    }
    if (listing.releaseYear && listing.releaseYear !== model.releaseYear) continue
    if (!releaseCategoryMatches(listing, model.category)) continue
    if (listingProductBlockedForModel(listing, model)) continue

    const player = findChecklistPlayerInIndex(listing, index)
    if (!player) continue

    const score = modelReleaseMatchScore(listing, model)
    if (!best || score > best.score) best = { match: { model, player }, score }
  }

  return best?.match ?? null
}

function variationScore(haystack: string, variation: string) {
  const target = comparableText(variation)
  if (!target) return 0
  const targetIsSapphire = /\bsapphire\b/.test(target)
  const haystackIsSapphire = /\bsapphire\b/.test(haystack)
  const targetIsSuperfractor = /\b(super|superfractor)\b/.test(target)
  const haystackIsSuperfractor = /\b(super|superfractor)\b/.test(haystack)
  if (targetIsSapphire !== haystackIsSapphire) return 0
  if (targetIsSuperfractor && !haystackIsSuperfractor) return 0
  if (hasUnmatchedDistinctModifier(haystack, variation)) return 0

  const targetTokens = comparableTokens(variation)
  const haystackTokens = comparableTokens(haystack)
  const serialTokens = targetTokens.filter((part) => /^\/\d+$/.test(part))
  const specificTokens = targetTokens.filter((part) => !/^\/\d+$/.test(part) && !/^(variation|parallel)$/.test(part))
  const specificHits = specificTokens.filter((part) => tokenMatchesVariationPart(part, haystackTokens)).length
  const serialHits = serialTokens.filter((part) => tokenMatchesVariationPart(part, haystackTokens)).length
  const specificScore = specificTokens.length > 0 ? specificHits / specificTokens.length : 0
  const serialScore = serialTokens.length > 0 ? serialHits / serialTokens.length : 0
  const exactBoost = haystack.includes(target) ? 0.18 : 0
  const score = clamp(specificScore * 0.72 + serialScore * 0.28 + exactBoost)

  if (serialTokens.length > 0 && serialHits === 0) return Math.min(score, 0.52)
  return score
}

function variationSpecificity(variation: string) {
  return comparableTokens(variation)
    .filter((part) => !/^(variation|parallel)$/.test(part))
    .reduce((total, part) => total + (/^\/\d+$/.test(part) ? 1 : 2), 0)
}

function findVariation<T extends { variation: string }>(listing: NormalizedListing, variations: T[]) {
  const haystack = comparableText(`${listing.title} ${listing.variationLabel}`)
  let best: { item: T; score: number; specificity: number } | null = null

  for (const variation of variations) {
    const score = variationScore(haystack, variation.variation)
    const specificity = variationSpecificity(variation.variation)
    const bestScore = best?.score ?? 0
    if (score > bestScore + 0.001 || (Math.abs(score - bestScore) <= 0.001 && specificity > (best?.specificity ?? 0))) {
      best = { item: variation, score, specificity }
    }
  }

  return best && best.score >= 0.55 ? best : null
}

function isBaseAutoListing(listing: NormalizedListing) {
  const variation = comparableText(listing.variationLabel)
  return (
    listing.isAutograph &&
    !listing.isHandSigned &&
    !listing.serialDenominator &&
    (/^base(?: auto)?$/.test(variation) || variation === 'base auto')
  )
}

function estimateValuation(
  listing: NormalizedListing,
  model?: ChecklistModel | null,
  salesCacheModel?: SalesCachePlayerModel | null,
  matchedPlayer?: ChecklistPlayer | null,
) {
  const player = matchedPlayer ?? findChecklistPlayer(listing, model)
  const baseEstimate = player ? estimateBasePrice(player) : null
  const modeledBasePrice = baseEstimate?.price ?? player?.baseAvgPrice ?? 0
  const playerVariation = player ? findVariation(listing, player.variations) : null
  const releaseVariation =
    model && playerVariation
      ? findVariation(listing, model.multipliers) ??
        findVariation(
          {
            ...listing,
            title: `${listing.title} ${playerVariation.item.variation}`,
            variationLabel: playerVariation.item.variation,
          },
          model.multipliers,
        )
      : model
        ? findVariation(listing, model.multipliers)
        : null
  const baseTwmaPrice =
    modeledBasePrice && releaseVariation?.item.avgMultiplier
      ? modeledBasePrice * releaseVariation.item.avgMultiplier
      : null
  const variationPrice = playerVariation?.item.avgPrice ?? null
  const playerVariationSales = playerVariation?.item.salesCount ?? 0
  const reliablePlayerVariation = variationPrice && playerVariationSales >= 3
  const compPrice = listing.marketPrice > 0 && listing.compCount > 0 ? listing.marketPrice : null
  let modelPrice: number | null = null
  let modelConfidence = 0
  let matchedVariation: string | null = null
  let valuationSource: ValuationSource = 'listing-comps'

  if (player && modeledBasePrice > 0 && listing.isHandSigned) {
    const baseConfidence = baseEstimate?.confidence ?? 0.5
    const baseSales = baseEstimate?.effectiveSales ?? player.baseSalesCount
    modelPrice = modeledBasePrice * HAND_SIGNED_BASE_MULTIPLE
    modelConfidence = clamp(0.34 + baseConfidence * 0.24 + Math.min(baseSales, 12) / 95, 0.38, 0.66)
    matchedVariation = 'Hand Signed Auto'
    valuationSource = 'hand-signed-base'
  } else if (player && modeledBasePrice > 0 && isBaseAutoListing(listing)) {
    const baseConfidence = baseEstimate?.confidence ?? 0.58
    const baseSales = baseEstimate?.effectiveSales ?? player.baseSalesCount
    modelPrice = modeledBasePrice
    modelConfidence = clamp(0.48 + baseConfidence * 0.38 + Math.min(baseSales, 16) / 70, 0.52, 0.96)
    matchedVariation = 'Base Auto'
    valuationSource = 'base-auto'
  } else if (variationPrice && baseTwmaPrice && reliablePlayerVariation) {
    const variationSales = playerVariationSales
    const baseSales = baseEstimate?.effectiveSales ?? player?.baseSalesCount ?? 0
    const baseConfidence = baseEstimate?.confidence ?? 0.5
    const variationWeight = clamp(0.42 + Math.min(variationSales, 8) / 28, 0.42, 0.68)
    const baseWeight = clamp(0.42 + baseConfidence * 0.5 + Math.min(baseSales, 12) / 80, 0.5, 0.86)
    const compWeight = compPrice ? clamp(listing.compCount / 16, 0.08, 0.28) : 0
    modelPrice = weightedAverage([
      { value: variationPrice, weight: variationWeight },
      { value: baseTwmaPrice, weight: baseWeight },
      { value: compPrice ?? 0, weight: compWeight },
    ])
    modelConfidence = clamp(
      0.64 +
        Math.min(variationSales, 8) / 42 +
        baseConfidence * 0.18 +
        Math.min(baseSales, 12) / 80 +
        Math.min(releaseVariation?.item.totalSales ?? 0, 250) / 1_200,
      0,
      0.95,
    )
    matchedVariation = playerVariation?.item.variation ?? releaseVariation?.item.variation ?? null
    valuationSource = 'base-twma-blend'
  } else if (baseTwmaPrice && player && releaseVariation) {
    const baseConfidence = baseEstimate?.confidence ?? 0.5
    const baseSales = baseEstimate?.effectiveSales ?? player.baseSalesCount
    modelPrice = weightedAverage([
      { value: baseTwmaPrice, weight: 0.82 },
      { value: compPrice ?? 0, weight: compPrice ? clamp(listing.compCount / 14, 0.08, 0.3) : 0 },
    ])
    modelConfidence = clamp(0.42 + baseConfidence * 0.34 + Math.min(baseSales, 8) / 44 + Math.min(releaseVariation.item.totalSales ?? 0, 200) / 900)
    matchedVariation = releaseVariation.item.variation
    valuationSource = 'player-base-curve'
  } else if (variationPrice && playerVariation && reliablePlayerVariation) {
    modelPrice = variationPrice
    modelConfidence = clamp(0.78 + Math.min(playerVariationSales, 8) / 40)
    matchedVariation = playerVariation.item.variation
    valuationSource = 'player-variation'
  } else if (releaseVariation?.item.avgPrice) {
    modelPrice = releaseVariation.item.avgPrice
    modelConfidence = clamp(0.08 + Math.min(releaseVariation.item.playerCount ?? 0, 75) / 420, 0.08, 0.24)
    matchedVariation = releaseVariation.item.variation
    valuationSource = 'release-curve'
  }

  const compValue = listing.marketPrice
  const withSalesCacheValuation = (valuation: {
    fairValue: number
    modelPrice: number | null
    baseTwmaPrice: number | null
    variationPrice: number | null
    compPrice: number | null
    modelConfidence: number
    matchedVariation: string | null
    valuationSource: ValuationSource
  }) => {
    const soldComp = salesCacheValuationForListing(listing, salesCacheModel, valuation.matchedVariation ?? listing.variationLabel)
    if (!soldComp) {
      return {
        ...valuation,
        compBucketLabel: null,
        compSaleCount: null,
        compLast3Avg: null,
        compLast5Avg: null,
        compTrailingModel: null,
        compAskVsLast5Pct: null,
      }
    }

    const soldWeight = listing.isLowSerialNonAuto
      ? 1
      : soldComp.saleCount >= 5 && soldComp.matchScore >= 72
        ? 0.82
        : soldComp.saleCount >= 3
          ? 0.68
          : 0.54
    const curveWeight = valuation.modelPrice && valuation.modelPrice > 0 ? 1 - soldWeight : 0
    const soldModelPrice = weightedAverage([
      { value: soldComp.soldModelPrice, weight: soldWeight },
      { value: valuation.modelPrice ?? 0, weight: curveWeight },
    ])
    const blendedConfidence = clamp(
      soldComp.confidence * (curveWeight > 0 ? soldWeight : 1) + valuation.modelConfidence * curveWeight,
      0,
      0.97,
    )

    return {
      ...valuation,
      fairValue: soldModelPrice,
      modelPrice: soldModelPrice,
      compPrice: soldComp.soldModelPrice,
      modelConfidence: Math.max(valuation.modelConfidence, blendedConfidence),
      matchedVariation: soldComp.bucket.variationLabel || valuation.matchedVariation,
      valuationSource: soldComp.source,
      compBucketLabel: soldComp.bucketLabel,
      compSaleCount: soldComp.saleCount,
      compLast3Avg: soldComp.last3Avg,
      compLast5Avg: soldComp.last5Avg,
      compTrailingModel: soldComp.trailingModel,
      compAskVsLast5Pct: soldComp.last5Avg && soldComp.last5Avg > 0 ? listing.allInPrice / soldComp.last5Avg - 1 : null,
    }
  }

  if (!modelPrice || modelConfidence <= 0) {
    return withSalesCacheValuation({
      fairValue: compValue,
      modelPrice: null,
      baseTwmaPrice,
      variationPrice,
      compPrice,
      modelConfidence: 0,
      matchedVariation,
      valuationSource,
    })
  }

  if (compValue <= 0) {
    return withSalesCacheValuation({
      fairValue: modelPrice,
      modelPrice,
      baseTwmaPrice,
      variationPrice,
      compPrice,
      modelConfidence,
      matchedVariation,
      valuationSource,
    })
  }

  return withSalesCacheValuation({
    fairValue: modelPrice,
    modelPrice,
    baseTwmaPrice,
    variationPrice,
    compPrice,
    modelConfidence,
    matchedVariation,
    valuationSource,
  })
}

function availabilityScore(listing: NormalizedListing) {
  const hoursToClose = listing.hoursToClose ?? null
  if (listing.status === 'sold' || listing.status === 'ended') return 0.04
  if (listing.kind === 'bin') return listing.status === 'unknown' ? 0.78 : 0.94
  if (hoursToClose === null) return 0.32
  if (hoursToClose <= 0) return 0.04
  return clamp(1 - hoursToClose / 48, 0.18, 0.88)
}

function liquidityScore(listing: NormalizedListing) {
  const compLiquidity = clamp(listing.compCount / 8)
  const watcherLiquidity = clamp((listing.watchCount + Math.min(listing.bidCount, 14)) / 28)
  return clamp(compLiquidity * 0.72 + watcherLiquidity * 0.28)
}

function prospectScore(prospect?: Prospect | null) {
  return clamp(rankingBoost(prospect) * 0.66 + formBoost(prospect) * 0.34)
}

function buildReasons(args: {
  listing: NormalizedListing
  discountPct: number
  edgeDollars: number
  compQuality: number
  availability: number
  confidence: number
  maxEntry: number
  modelConfidence: number
  gradingMultiplier?: number | null
  gradingNote?: string | null
  matchedVariation?: string | null
  valuationSource: ValuationSource
}) {
  const {
    listing,
    discountPct,
    edgeDollars,
    compQuality,
    availability,
    confidence,
    maxEntry,
    modelConfidence,
    gradingMultiplier,
    gradingNote,
    matchedVariation,
    valuationSource,
  } = args
  const reasons: string[] = []
  const warnings: string[] = []
  const tags: string[] = []
  const hoursToClose = listing.hoursToClose ?? null

  if (listing.isHandSigned) {
    reasons.push('hand-signed/IP auto bucket')
    warnings.push('not pack-issued certified auto')
    tags.push('hand signed')
  } else if (listing.isTargetAuto) {
    reasons.push('explicit 1st Bowman auto')
    tags.push('1st auto')
  } else if (listing.isLowSerialNonAuto) {
    reasons.push('low-serial 1st Bowman non-auto')
    tags.push('low serial')
  } else if (listing.isBowman && listing.isAutograph) {
    reasons.push('Bowman auto target')
    warnings.push('1st Bowman is not explicit')
    tags.push('verify 1st')
  }

  if (discountPct > 0) reasons.push(`${Math.round(discountPct * 100)}% under model`)
  else if (discountPct < 0) warnings.push(`${Math.abs(Math.round(discountPct * 100))}% over model`)
  if (edgeDollars >= 100) reasons.push(`$${Math.round(edgeDollars)} model spread`)
  else if (edgeDollars >= 25) reasons.push(`$${Math.round(edgeDollars)} spread`)
  if (listing.isEligibleGraded) {
    const gradeLabel =
      listing.gradingCompany && listing.gradeNumber !== null
        ? `${listing.gradingCompany} ${listing.gradeNumber}`
        : '9+ slab'
    reasons.push(`${gradeLabel} ${(gradingMultiplier ?? 1).toFixed(2)}x ${gradingNote ?? 'graded model'}`)
  }
  if (listing.allInPrice <= maxEntry) reasons.push('inside max entry')
  if (matchedVariation && modelConfidence > 0.2) {
    reasons.push(
      valuationSource === 'sales-cache-exact'
        ? `${matchedVariation} recent sold lane`
        : valuationSource === 'sales-cache-blend'
          ? `${matchedVariation} sold lane blend`
          : valuationSource === 'base-auto'
            ? `${matchedVariation} base anchor`
          : valuationSource === 'hand-signed-base'
            ? `${matchedVariation} hand-signed floor`
          : valuationSource === 'base-twma-blend'
        ? `${matchedVariation} base TWMA blend`
        : valuationSource === 'player-variation'
        ? `${matchedVariation} player model`
        : valuationSource === 'player-base-curve'
          ? `${matchedVariation} curve model`
          : `${matchedVariation} release curve`,
    )
  }
  if (listing.compCount > 0) reasons.push(`${listing.compCount} comp${listing.compCount === 1 ? '' : 's'}`)
  if (listing.prospect?.ranking) reasons.push(`#${listing.prospect.ranking} prospect`)
  if (listing.kind === 'bin' && availability > 0.7) reasons.push('executable BIN')
  if (listing.kind === 'live' && hoursToClose !== null && hoursToClose > 0) {
    reasons.push(
      hoursToClose < 1
        ? 'closing inside 1 hour'
        : `${hoursToClose.toFixed(hoursToClose < 10 ? 1 : 0)}h to close`,
    )
  }

  if (listing.status === 'sold' || listing.status === 'ended') warnings.push('listing appears ended')
  if (listing.kind === 'live' && hoursToClose !== null && hoursToClose <= 0) {
    warnings.push('auction end time has passed')
  }
  if (confidence < 0.52 || compQuality < 0.42) warnings.push('thin or noisy comp base')
  if (valuationSource === 'release-curve') warnings.push('release curve estimate')
  if (valuationSource === 'sales-cache-blend' && modelConfidence < 0.68) warnings.push('thin sold lane blend')
  if (listing.bidCount >= 20) warnings.push('crowded auction')
  if (levelAgePenalty(listing.prospect) > 0.2) warnings.push('age-to-level drag')
  if (listing.marketPrice < 35) warnings.push('low-dollar noise')
  if (!listing.listingUrl) warnings.push('missing eBay link')

  if (listing.serialDenominator && listing.serialDenominator <= 99) tags.push(`/${listing.serialDenominator}`)
  if (listing.isEligibleGraded && listing.gradingCompany && listing.gradeNumber !== null) tags.push(`${listing.gradingCompany} ${listing.gradeNumber}`)
  if (listing.prospect?.level) tags.push(listing.prospect.level)
  if (listing.kind === 'bin') tags.push('BIN')
  else if (listing.kind === 'live') tags.push('auction')

  return { reasons, warnings, tags }
}

function buildThesis(
  listing: NormalizedListing,
  edgeDollars: number,
  discountPct: number,
  compQuality: number,
  valuationSource: ValuationSource,
) {
  const target = listing.isHandSigned
    ? 'hand-signed/IP auto, not pack-issued'
    : listing.isTargetAuto
      ? 'confirmed 1st Bowman auto'
      : listing.isLowSerialNonAuto
        ? 'low-serial 1st Bowman non-auto'
        : 'Bowman auto that needs 1st verification'
  const compText = compQuality >= 0.7 ? 'solid comps' : compQuality >= 0.45 ? 'usable comps' : 'thin comps'
  const modelText = valuationSource === 'listing-comps' ? 'comp-led model' : valuationSource.replaceAll('-', ' ')
  const direction = edgeDollars >= 0 ? 'under model' : 'over model'
  return `$${Math.abs(Math.round(edgeDollars))} ${direction}; ${Math.abs(Math.round(discountPct * 100))}% spread; ${target}; ${compText}; ${modelText}.`
}

function releaseCategoryMatches(listing: NormalizedListing, category: ScoreSettings['targetCategory']) {
  const text = `${listing.title} ${listing.releaseLabel}`.toLowerCase()
  if (category === 'draft') return /\bdraft\b/.test(text)
  if (category === 'chrome') return /\bchrome\b/.test(text) && !/\bdraft\b/.test(text)
  return /\bbowman\b/.test(text) && !/\bdraft\b/.test(text)
}

function marketModeMatches(listing: NormalizedListing, mode: ScoreSettings['mode']) {
  if (mode === 'raw') return !listing.isGraded
  if (mode === 'raw-plus-graded') return !listing.isGraded || listing.isEligibleGraded
  return listing.isGraded
}

function priceCompression(rawPrice: number, highMultiple: number, lowMultiple: number) {
  const minPrice = Math.log10(25)
  const maxPrice = Math.log10(1_000)
  const position = clamp((Math.log10(Math.max(10, rawPrice)) - minPrice) / (maxPrice - minPrice), 0, 1)
  return highMultiple - (highMultiple - lowMultiple) * position
}

function scarcityDrag(serialDenominator: number | null | undefined) {
  if (!serialDenominator) return 0
  if (serialDenominator <= 5) return 0.32
  if (serialDenominator <= 25) return 0.23
  if (serialDenominator <= 50) return 0.14
  if (serialDenominator <= 99) return 0.08
  if (serialDenominator <= 150) return 0.04
  return 0
}

function gradeCompanyAdjustment(company: GradingCompany | null | undefined, gradeNumber: number | null | undefined) {
  if (!company || !gradeNumber) return 1
  if (company === 'PSA') return 1
  if (company === 'BGS') return gradeNumber >= 10 ? 1 : gradeNumber >= 9.5 ? 0.96 : 0.92
  if (company === 'CGC') return gradeNumber >= 10 ? 0.88 : 0.9
  if (company === 'SGC') return gradeNumber >= 10 ? 0.84 : 0.88
  return 1
}

export function estimateGradedPremium({
  rawPrice,
  serialDenominator,
  gradingCompany,
  gradeNumber,
}: {
  rawPrice: number
  serialDenominator?: number | null
  gradingCompany?: GradingCompany | null
  gradeNumber?: number | null
}) {
  if (!gradeNumber || !gradingCompany) {
    return {
      multiplier: 1,
      confidence: 0.96,
      note: 'Raw model',
    }
  }

  const drag = scarcityDrag(serialDenominator)
  let baseMultiple: number
  if (gradeNumber < 9) {
    baseMultiple = rawPrice < 25 ? 1.02 : 0.88 - drag * 0.45
  } else if (gradeNumber < 10) {
    baseMultiple = priceCompression(rawPrice, 1.3, 1.05) - drag * 0.42
  } else {
    baseMultiple = priceCompression(rawPrice, 2.75, 1.62) - drag * 0.88
  }

  const adjusted = baseMultiple * gradeCompanyAdjustment(gradingCompany, gradeNumber)
  const minMultiple = gradeNumber < 9 ? 0.68 : gradeNumber < 10 ? 1 : 1.18
  const maxMultiple = gradeNumber < 9 ? 1.08 : gradeNumber < 10 ? 1.35 : 3.05
  const multiplier = Number(clamp(adjusted, minMultiple, maxMultiple).toFixed(2))
  const confidence = clamp(0.86 - drag * 0.48 - (gradingCompany === 'PSA' ? 0 : 0.08), 0.55, 0.9)

  return {
    multiplier,
    confidence,
    note:
      gradeNumber < 9
        ? 'Condition discount'
        : gradeNumber < 10
          ? 'Compressed slab premium'
          : 'Gem premium curve',
  }
}

export function scoreListing(
  listing: NormalizedListing,
  settings: ScoreSettings = DEFAULT_SETTINGS,
  checklistModel?: ChecklistModel | null,
  salesCacheModel?: SalesCachePlayerModel | null,
  checklistPlayer?: ChecklistPlayer | null,
): Opportunity {
  const valuation = estimateValuation(listing, checklistModel, salesCacheModel, checklistPlayer)
  const rawMarketPrice = valuation.fairValue
  const gradePremium = listing.isEligibleGraded && !listing.isHandSigned
    ? estimateGradedPremium({
        rawPrice: rawMarketPrice,
        serialDenominator: listing.serialDenominator,
        gradingCompany: listing.gradingCompany,
        gradeNumber: listing.gradeNumber,
      })
    : { multiplier: 1, confidence: 1, note: null }
  const marketPrice = rawMarketPrice * gradePremium.multiplier
  const modelConfidence = clamp(valuation.modelConfidence * gradePremium.confidence)
  const discountPct = marketPrice > 0 ? (marketPrice - listing.allInPrice) / marketPrice : 0
  const edgeDollars = marketPrice - listing.allInPrice
  const rawEdgeDollars = rawMarketPrice - listing.allInPrice
  const dollarBias = clamp(settings.dollarEdgeWeight / 100)
  const rawEdge = dollarEdgeScore(edgeDollars)
  const percentEdge = percentEdgeScore(discountPct)
  const compQuality = clamp(compQualityScore(listing) * 0.78 + modelConfidence * 0.22)
  const availability = availabilityScore(listing)
  const liquidity = liquidityScore(listing)
  const hoursToClose = listing.hoursToClose ?? null
  const urgency =
    listing.kind === 'bin'
      ? availability
      : hoursToClose === null
        ? 0.24
        : clamp(1 - Math.max(hoursToClose, 0) / 36, 0.08, 1)
  const prospect = prospectScore(listing.prospect)
  const targetFit = listing.universeScore
  const weakCurveOnly = valuation.valuationSource === 'release-curve' && listing.compCount < 4
  const stalePenalty = availability < 0.25 ? 0.28 : 0
  const riskScore = clamp(
    (1 - compQuality) * 0.3 +
      (1 - targetFit) * 0.24 +
      stalePenalty +
      (weakCurveOnly ? 0.16 : 0) +
      (listing.isHandSigned ? 0.14 : 0) +
      levelAgePenalty(listing.prospect) +
      (listing.bidCount > 18 ? 0.1 : 0) +
      (rawMarketPrice < 35 ? 0.08 : 0),
  )
  const rawWeight = 0.34 + dollarBias * 0.25
  const percentWeight = 0.34 - dollarBias * 0.16
  const executionScore = clamp(availability * 0.62 + urgency * 0.24 + liquidity * 0.14)
  const score = clamp(
    rawEdge * rawWeight +
      percentEdge * percentWeight +
      compQuality * 0.15 +
      targetFit * 0.12 +
      executionScore * 0.1 +
      modelConfidence * 0.07 +
      prospect * 0.08 -
      riskScore * 0.14,
  )
  const confidence = clamp(
    compQuality * 0.43 +
      targetFit * 0.23 +
      availability * 0.16 +
      modelConfidence * 0.1 +
      prospect * 0.08 -
      riskScore * 0.12,
  )
  const maxEntry = marketPrice * (1 - settings.targetMarginPct / 100)
  const expectedRoiPct = listing.allInPrice > 0 ? edgeDollars / listing.allInPrice : 0
  const { reasons, warnings, tags } = buildReasons({
    listing,
    discountPct,
    edgeDollars,
    compQuality,
    availability,
    confidence,
    maxEntry,
    modelConfidence,
    gradingMultiplier: listing.isEligibleGraded ? gradePremium.multiplier : null,
    gradingNote: listing.isEligibleGraded ? gradePremium.note : null,
    matchedVariation: valuation.matchedVariation,
    valuationSource: valuation.valuationSource,
  })

  let action: Opportunity['action'] = 'Pass'
  const meetsEntry = listing.allInPrice <= maxEntry
  const isExecutable = availability >= 0.55 && listing.kind === 'bin'
  const hasActionableEvidence =
    valuation.valuationSource === 'sales-cache-exact' ||
    valuation.valuationSource === 'sales-cache-blend' ||
    valuation.valuationSource === 'base-auto' ||
    valuation.valuationSource === 'hand-signed-base' ||
    valuation.valuationSource === 'base-twma-blend' ||
    valuation.valuationSource === 'player-variation' ||
    valuation.valuationSource === 'player-base-curve' ||
    (listing.compCount >= 4 && compQuality >= 0.58)

  if (isExecutable && meetsEntry && hasActionableEvidence && confidence >= 0.62 && score >= 0.64) action = 'Buy now'
  else if (isExecutable && hasActionableEvidence && confidence >= 0.54 && discountPct >= settings.minDiscountPct / 100 && edgeDollars >= 40) action = 'Make offer'
  else if (listing.kind === 'live' && hasActionableEvidence && discountPct >= 0.18 && confidence >= 0.54 && availability > 0.2) action = 'Bid window'
  else if (discountPct >= settings.minDiscountPct / 100 && availability > 0.2) action = 'Watchlist'
  if (listing.isHandSigned && action === 'Buy now') action = 'Make offer'

  const lane: Opportunity['lane'] =
    action === 'Buy now' || action === 'Make offer'
      ? 'buy'
      : action === 'Pass' || riskScore > 0.58 || availability < 0.25
        ? 'risk'
        : 'watch'

  let grade: Opportunity['grade'] = 'Watch'
  if (score >= 0.82) grade = 'A+'
  else if (score >= 0.7) grade = 'A'
  else if (score >= 0.56) grade = 'B'
  else if (score >= 0.42) grade = 'C'
  const trustScore = Math.round(
    clamp(
      confidence * 0.46 +
        targetFit * 0.21 +
        modelConfidence * 0.17 +
        compQuality * 0.13 +
        availability * 0.03 -
        Math.min(warnings.length, 4) * 0.035,
    ) * 100,
  )

  return {
    listing,
    score: Math.round(score * 100),
    grade,
    action,
    lane,
    fairValue: marketPrice,
    rawFairValue: rawMarketPrice,
    modelPrice: valuation.modelPrice ? valuation.modelPrice * gradePremium.multiplier : valuation.modelPrice,
    baseTwmaPrice: valuation.baseTwmaPrice,
    variationPrice: valuation.variationPrice ? valuation.variationPrice * gradePremium.multiplier : valuation.variationPrice,
    compPrice: valuation.compPrice,
    compBucketLabel: valuation.compBucketLabel,
    compSaleCount: valuation.compSaleCount,
    compLast3Avg: valuation.compLast3Avg,
    compLast5Avg: valuation.compLast5Avg,
    compTrailingModel: valuation.compTrailingModel,
    compAskVsLast5Pct: valuation.compAskVsLast5Pct,
    modelConfidence,
    gradingMultiplier: listing.isEligibleGraded ? gradePremium.multiplier : null,
    gradingConfidence: listing.isEligibleGraded ? gradePremium.confidence : null,
    gradingNote: listing.isEligibleGraded ? gradePremium.note : null,
    matchedVariation: valuation.matchedVariation,
    valuationSource: valuation.valuationSource,
    discountPct,
    edgeDollars,
    rawEdgeDollars,
    maxEntry,
    expectedRoiPct,
    confidence,
    trustScore,
    compQualityScore: compQuality,
    availabilityScore: availability,
    universeScore: targetFit,
    executionScore,
    liquidityScore: liquidity,
    urgencyScore: urgency,
    riskScore,
    scoreComponents: {
      rawEdge,
      percentEdge,
      compQuality,
      targetFit,
      availability,
      variationModel: modelConfidence,
      prospect,
      riskPenalty: riskScore,
    },
    thesis: buildThesis(listing, edgeDollars, discountPct, compQuality, valuation.valuationSource),
    tags,
    reasons,
    warnings,
  }
}

export function rankOpportunities(
  listings: ProspectPulseListing[],
  settings: Partial<ScoreSettings> = {},
  checklistModel?: ChecklistModel | ChecklistModel[] | null,
  salesCacheModels?: SalesCacheModelsInput,
) {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...settings }
  const checklistModels = (Array.isArray(checklistModel) ? checklistModel : checklistModel ? [checklistModel] : []).filter(
    (model) => model.players.length > 0,
  )
  const salesModels = salesCacheModelsArray(salesCacheModels)
  const checklistIndexes = buildChecklistModelIndexes(checklistModels)
  const salesCacheIndex = buildSalesCacheModelIndex(salesModels)
  const opportunities: Opportunity[] = []

  for (const rawListing of listings) {
    const listing = normalizeListing(rawListing)
    if (listing.allInPrice <= 0) continue

    const modeMatches = marketModeMatches(listing, mergedSettings.mode)
    const releaseMatches = mergedSettings.releaseScope === 'all' || listing.releaseYear === mergedSettings.targetReleaseYear
    const categoryMatches = mergedSettings.releaseScope === 'all' || releaseCategoryMatches(listing, mergedSettings.targetCategory)
    const activeMatches = !mergedSettings.activeOnly || (listing.status !== 'ended' && listing.status !== 'sold')
    const targetMatches =
      mergedSettings.targetUniverse === 'strict'
        ? listing.isTargetAuto
        : mergedSettings.targetUniverse === 'low-serial-non-auto'
          ? listing.isLowSerialNonAuto
          : listing.isBowman && listing.isAutograph && listing.universeScore >= 0.68

    if (!modeMatches || !releaseMatches || !categoryMatches || !activeMatches || !targetMatches) continue

    const checklistMatch = findChecklistMatchForListing(listing, checklistIndexes, mergedSettings)
    if (mergedSettings.checklistOnly && !checklistMatch?.model) continue

    const opportunity = scoreListing(
      listing,
      mergedSettings,
      checklistMatch?.model ?? null,
      findSalesCacheModelForListingIndexed(listing, salesCacheIndex),
      checklistMatch?.player ?? null,
    )

    const overFloor = opportunity.listing.allInPrice >= mergedSettings.minPrice
    const underBudget =
      typeof mergedSettings.maxPrice === 'number' && Number.isFinite(mergedSettings.maxPrice)
        ? opportunity.listing.allInPrice <= mergedSettings.maxPrice
        : true
    const hasValuation = opportunity.fairValue > 0
    const hasCompFloor = opportunity.listing.compCount >= mergedSettings.minCompCount
    const lowSerialHasExactComps =
      mergedSettings.targetUniverse !== 'low-serial-non-auto' ||
      (opportunity.valuationSource === 'sales-cache-exact' &&
        (opportunity.compSaleCount ?? 0) >= 2 &&
        opportunity.modelConfidence >= 0.62)

    if (overFloor && underBudget && hasValuation && hasCompFloor && lowSerialHasExactComps) {
      opportunities.push(opportunity)
    }
  }

  return opportunities.sort((left, right) => right.edgeDollars - left.edgeDollars || right.score - left.score)
}
