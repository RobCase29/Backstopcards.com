import type {
  ChecklistModel,
  CompSale,
  ListingStatus,
  NormalizedListing,
  Opportunity,
  Prospect,
  ProspectPulseListing,
  ScoreSettings,
  ValuationSource,
} from '../types'

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
  const product = firstString([listing.product_type, listing.release], 'Bowman Chrome')
  return product.includes(year) ? product : `${year} ${product}`.trim()
}

function inferSerialDenominator(listing: ProspectPulseListing) {
  const explicit = positiveNumberValue(listing.serial_denominator)
  if (explicit) return explicit
  const match = searchText(listing).match(/(?:\/|numbered\s+to\s+|#\/)(\d{2,3})\b/)
  return match ? Number(match[1]) : null
}

function variationLabel(listing: ProspectPulseListing, serialDenominator?: number | null) {
  const variation = firstString([listing.variation, listing.base_color], 'Base')
  const serial = serialDenominator ? `/${serialDenominator}` : ''
  return `${variation} ${serial}`.trim()
}

function imageUrl(listing: ProspectPulseListing) {
  const gallery = Array.isArray(listing.gallery_urls) ? listing.gallery_urls[0] : listing.gallery_urls
  return firstString([listing.image_url, listing.image, listing.gallery_url, gallery], '') || null
}

function inferIsGraded(listing: ProspectPulseListing) {
  const text = searchText(listing)
  const gradeText = String(listing.grade ?? '').trim()
  return Boolean(
    listing.is_graded ||
      listing.grader ||
      gradeText ||
      /\b(psa|bgs|sgc|cgc|csg)\b/.test(text) ||
      /\b(gem\s+mint|mint\s+10|pristine|black\s+label)\b/.test(text) ||
      /\b\d(?:\.\d)?\s*\/\s*10\b/.test(text),
  )
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

function comparableText(value: string) {
  return value
    .toLowerCase()
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

const ADJACENT_PRODUCT_BLOCKERS = [
  /\bsapphire\b/,
  /\bmega\s*box\b|\bmega\b/,
  /\bsterling\b/,
  /\binception\b/,
  /\btranscendent\b/,
  /\bfinest\b/,
  /\bbowman'?s?\s+best\b/,
  /\bpanini\b/,
  /\bleaf\b/,
]

function listingProductBlockedForModel(listing: NormalizedListing, model: ChecklistModel) {
  const listingText = `${listing.title} ${listing.releaseLabel}`.toLowerCase()
  const modelText = model.release.toLowerCase()
  return ADJACENT_PRODUCT_BLOCKERS.some((pattern) => pattern.test(listingText) && !pattern.test(modelText))
}

function detectUniverse(listing: ProspectPulseListing) {
  const text = searchText(listing)
  const isBowman = /\bbowman\b/.test(text)
  const nonAuto = /\b(non[-\s]?auto|no\s+auto|unsigned|facsimile|reprint)\b/.test(text)
  const isAutograph =
    !nonAuto && /\b(auto|autos|autograph|autographed|autographs|signed|signature)\b/.test(text)
  const hasFirstMarker = /\b(1st|first)\b/.test(text)
  const isFirstEditionOnly = /\bfirst\s+edition\b/.test(text) && !/\b(1st|first)\s+bowman\b/.test(text)
  const isFirstBowman = isBowman && hasFirstMarker && !isFirstEditionOnly
  const serialDenominator = positiveNumberValue(listing.serial_denominator)

  let universeScore = 0
  if (isBowman) universeScore += 0.34
  if (isAutograph) universeScore += 0.34
  if (isFirstBowman) universeScore += 0.26
  if (/chrome/.test(text)) universeScore += 0.04
  if (serialDenominator && serialDenominator <= 150) universeScore += 0.02

  const isTargetAuto = isBowman && isAutograph && isFirstBowman

  return {
    isBowman,
    isAutograph,
    isFirstBowman,
    isTargetAuto,
    universeScore: clamp(isTargetAuto ? Math.max(universeScore, 0.96) : universeScore),
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
  const universe = detectUniverse(listing)
  const releaseYear = inferReleaseYear(listing)
  const createdAt = listing.created_at ?? listing.listed_at ?? null
  const endTime = listing.end_time ?? null
  const serialDenominator = inferSerialDenominator(listing)
  const playerName = firstString([listing.player_name, prospect?.name], 'Unknown player')
  const title = firstString([listing.title, playerName], 'Untitled listing')

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
    isGraded: inferIsGraded(listing),
    grader: listing.grader,
    grade: listing.grade,
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

function modelReleaseMatchScore(listing: NormalizedListing, model: ChecklistModel) {
  let score = 0
  if (listing.releaseYear && listing.releaseYear === model.releaseYear) score += 2
  if (releaseCategoryMatches(listing, model.category)) score += 2
  const releaseText = comparableText(`${listing.releaseLabel} ${listing.title}`)
  if (releaseText.includes(comparableText(model.release))) score += 1
  return score
}

function findChecklistModelForListing(
  listing: NormalizedListing,
  models: ChecklistModel[],
  settings: ScoreSettings,
) {
  let best: { model: ChecklistModel; score: number } | null = null

  for (const model of models) {
    if (!model.players.length) continue
    if (settings.releaseScope === 'selected') {
      if (model.releaseYear !== settings.targetReleaseYear) continue
      if (model.category !== settings.targetCategory) continue
    }
    if (listing.releaseYear && listing.releaseYear !== model.releaseYear) continue
    if (!releaseCategoryMatches(listing, model.category)) continue
    if (listingProductBlockedForModel(listing, model)) continue

    const player = findChecklistPlayer(listing, model)
    if (!player) continue

    const score = modelReleaseMatchScore(listing, model)
    if (!best || score > best.score) best = { model, score }
  }

  return best?.model ?? null
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

function findVariation<T extends { variation: string }>(listing: NormalizedListing, variations: T[]) {
  const haystack = comparableText(`${listing.title} ${listing.variationLabel}`)
  let best: { item: T; score: number } | null = null

  for (const variation of variations) {
    const score = variationScore(haystack, variation.variation)
    if (score > (best?.score ?? 0)) best = { item: variation, score }
  }

  return best && best.score >= 0.55 ? best : null
}

function estimateValuation(listing: NormalizedListing, model?: ChecklistModel | null) {
  const player = findChecklistPlayer(listing, model)
  const playerVariation = player ? findVariation(listing, player.variations) : null
  const releaseVariation = model ? findVariation(listing, model.multipliers) : null
  const baseTwmaPrice =
    player?.baseAvgPrice && releaseVariation?.item.avgMultiplier
      ? player.baseAvgPrice * releaseVariation.item.avgMultiplier
      : null
  const variationPrice = playerVariation?.item.avgPrice ?? null
  const compPrice = listing.marketPrice > 0 ? listing.marketPrice : null
  let modelPrice: number | null = null
  let modelConfidence = 0
  let matchedVariation: string | null = null
  let valuationSource: ValuationSource = 'listing-comps'

  if (variationPrice && baseTwmaPrice) {
    const variationSales = playerVariation?.item.salesCount ?? 0
    const baseSales = player?.baseSalesCount ?? 0
    const variationWeight = clamp(0.42 + Math.min(variationSales, 8) / 28, 0.42, 0.68)
    const baseWeight = clamp(0.5 + Math.min(baseSales, 12) / 30, 0.5, 0.82)
    const compWeight = compPrice ? clamp(listing.compCount / 16, 0.08, 0.28) : 0
    modelPrice = weightedAverage([
      { value: variationPrice, weight: variationWeight },
      { value: baseTwmaPrice, weight: baseWeight },
      { value: compPrice ?? 0, weight: compWeight },
    ])
    modelConfidence = clamp(
      0.64 +
        Math.min(variationSales, 8) / 42 +
        Math.min(baseSales, 12) / 55 +
        Math.min(releaseVariation?.item.totalSales ?? 0, 250) / 1_200,
      0,
      0.95,
    )
    matchedVariation = playerVariation?.item.variation ?? releaseVariation?.item.variation ?? null
    valuationSource = 'base-twma-blend'
  } else if (variationPrice && playerVariation) {
    modelPrice = variationPrice
    modelConfidence = clamp(0.78 + Math.min(playerVariation?.item.salesCount ?? 0, 8) / 40)
    matchedVariation = playerVariation.item.variation
    valuationSource = 'player-variation'
  } else if (baseTwmaPrice && player && releaseVariation) {
    modelPrice = weightedAverage([
      { value: baseTwmaPrice, weight: 0.82 },
      { value: compPrice ?? 0, weight: compPrice ? clamp(listing.compCount / 14, 0.08, 0.3) : 0 },
    ])
    modelConfidence = clamp(0.58 + Math.min(player.baseSalesCount, 8) / 32 + Math.min(releaseVariation.item.totalSales ?? 0, 200) / 900)
    matchedVariation = releaseVariation.item.variation
    valuationSource = 'player-base-curve'
  } else if (releaseVariation?.item.avgPrice) {
    modelPrice = releaseVariation.item.avgPrice
    modelConfidence = clamp(0.08 + Math.min(releaseVariation.item.playerCount ?? 0, 75) / 420, 0.08, 0.24)
    matchedVariation = releaseVariation.item.variation
    valuationSource = 'release-curve'
  }

  const compValue = listing.marketPrice

  if (!modelPrice || modelConfidence <= 0) {
    return {
      fairValue: compValue,
      modelPrice: null,
      baseTwmaPrice,
      variationPrice,
      compPrice,
      modelConfidence: 0,
      matchedVariation,
      valuationSource,
    }
  }

  if (compValue <= 0) {
    return {
      fairValue: modelPrice,
      modelPrice,
      baseTwmaPrice,
      variationPrice,
      compPrice,
      modelConfidence,
      matchedVariation,
      valuationSource,
    }
  }

  return {
    fairValue: modelPrice,
    modelPrice,
    baseTwmaPrice,
    variationPrice,
    compPrice,
    modelConfidence,
    matchedVariation,
    valuationSource,
  }
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
    matchedVariation,
    valuationSource,
  } = args
  const reasons: string[] = []
  const warnings: string[] = []
  const tags: string[] = []
  const hoursToClose = listing.hoursToClose ?? null

  if (listing.isTargetAuto) {
    reasons.push('explicit 1st Bowman auto')
    tags.push('1st auto')
  } else if (listing.isBowman && listing.isAutograph) {
    reasons.push('Bowman auto target')
    warnings.push('1st Bowman is not explicit')
    tags.push('verify 1st')
  }

  if (discountPct > 0) reasons.push(`${Math.round(discountPct * 100)}% under model`)
  else if (discountPct < 0) warnings.push(`${Math.abs(Math.round(discountPct * 100))}% over model`)
  if (edgeDollars >= 100) reasons.push(`$${Math.round(edgeDollars)} model spread`)
  else if (edgeDollars >= 25) reasons.push(`$${Math.round(edgeDollars)} spread`)
  if (listing.allInPrice <= maxEntry) reasons.push('inside max entry')
  if (matchedVariation && modelConfidence > 0.2) {
    reasons.push(
      valuationSource === 'base-twma-blend'
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
  if (listing.bidCount >= 20) warnings.push('crowded auction')
  if (levelAgePenalty(listing.prospect) > 0.2) warnings.push('age-to-level drag')
  if (listing.marketPrice < 35) warnings.push('low-dollar noise')
  if (!listing.listingUrl) warnings.push('missing eBay link')

  if (listing.serialDenominator && listing.serialDenominator <= 99) tags.push(`/${listing.serialDenominator}`)
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
  const target = listing.isTargetAuto ? 'confirmed 1st Bowman auto' : 'Bowman auto that needs 1st verification'
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

export function scoreListing(
  listing: NormalizedListing,
  settings: ScoreSettings = DEFAULT_SETTINGS,
  checklistModel?: ChecklistModel | null,
): Opportunity {
  const valuation = estimateValuation(listing, checklistModel)
  const marketPrice = valuation.fairValue
  const discountPct = marketPrice > 0 ? (marketPrice - listing.allInPrice) / marketPrice : 0
  const edgeDollars = marketPrice - listing.allInPrice
  const dollarBias = clamp(settings.dollarEdgeWeight / 100)
  const rawEdge = dollarEdgeScore(edgeDollars)
  const percentEdge = percentEdgeScore(discountPct)
  const compQuality = clamp(compQualityScore(listing) * 0.78 + valuation.modelConfidence * 0.22)
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
      levelAgePenalty(listing.prospect) +
      (listing.bidCount > 18 ? 0.1 : 0) +
      (marketPrice < 35 ? 0.08 : 0),
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
      valuation.modelConfidence * 0.07 +
      prospect * 0.08 -
      riskScore * 0.14,
  )
  const confidence = clamp(
    compQuality * 0.43 +
      targetFit * 0.23 +
      availability * 0.16 +
      valuation.modelConfidence * 0.1 +
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
    modelConfidence: valuation.modelConfidence,
    matchedVariation: valuation.matchedVariation,
    valuationSource: valuation.valuationSource,
  })

  let action: Opportunity['action'] = 'Pass'
  const meetsEntry = listing.allInPrice <= maxEntry
  const isExecutable = availability >= 0.55 && listing.kind === 'bin'
  const hasActionableEvidence =
    valuation.valuationSource === 'base-twma-blend' ||
    valuation.valuationSource === 'player-variation' ||
    valuation.valuationSource === 'player-base-curve' ||
    (listing.compCount >= 4 && compQuality >= 0.58)

  if (isExecutable && meetsEntry && hasActionableEvidence && confidence >= 0.62 && score >= 0.64) action = 'Buy now'
  else if (isExecutable && hasActionableEvidence && confidence >= 0.54 && discountPct >= settings.minDiscountPct / 100 && edgeDollars >= 40) action = 'Make offer'
  else if (listing.kind === 'live' && hasActionableEvidence && discountPct >= 0.18 && confidence >= 0.54 && availability > 0.2) action = 'Bid window'
  else if (discountPct >= settings.minDiscountPct / 100 && availability > 0.2) action = 'Watchlist'

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

  return {
    listing,
    score: Math.round(score * 100),
    grade,
    action,
    lane,
    fairValue: marketPrice,
    modelPrice: valuation.modelPrice,
    baseTwmaPrice: valuation.baseTwmaPrice,
    variationPrice: valuation.variationPrice,
    compPrice: valuation.compPrice,
    modelConfidence: valuation.modelConfidence,
    matchedVariation: valuation.matchedVariation,
    valuationSource: valuation.valuationSource,
    discountPct,
    edgeDollars,
    maxEntry,
    expectedRoiPct,
    confidence,
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
      variationModel: valuation.modelConfidence,
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
) {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...settings }
  const checklistModels = (Array.isArray(checklistModel) ? checklistModel : checklistModel ? [checklistModel] : []).filter(
    (model) => model.players.length > 0,
  )

  return listings
    .map(normalizeListing)
    .filter((listing) => listing.allInPrice > 0)
    .filter((listing) => {
      const modeMatches = mergedSettings.mode === 'raw' ? !listing.isGraded : listing.isGraded
      const releaseMatches =
        mergedSettings.releaseScope === 'all' || listing.releaseYear === mergedSettings.targetReleaseYear
      const categoryMatches =
        mergedSettings.releaseScope === 'all' || releaseCategoryMatches(listing, mergedSettings.targetCategory)
      const activeMatches =
        !mergedSettings.activeOnly || (listing.status !== 'ended' && listing.status !== 'sold')
      const targetMatches =
        mergedSettings.targetUniverse === 'strict'
          ? listing.isTargetAuto
          : listing.isBowman && listing.isAutograph && listing.universeScore >= 0.68
      return modeMatches && releaseMatches && categoryMatches && activeMatches && targetMatches
    })
    .map((listing) => ({
      listing,
      model: findChecklistModelForListing(listing, checklistModels, mergedSettings),
    }))
    .filter(({ model }) => !mergedSettings.checklistOnly || Boolean(model))
    .map(({ listing, model }) => scoreListing(listing, mergedSettings, model))
    .filter((opportunity) => {
      const overFloor = opportunity.listing.allInPrice >= mergedSettings.minPrice
      const underBudget =
        typeof mergedSettings.maxPrice === 'number' && Number.isFinite(mergedSettings.maxPrice)
          ? opportunity.listing.allInPrice <= mergedSettings.maxPrice
          : true
      const hasValuation = opportunity.fairValue > 0
      const hasCompFloor = opportunity.listing.compCount >= mergedSettings.minCompCount
      return overFloor && underBudget && hasValuation && hasCompFloor
    })
    .sort((left, right) => {
      return right.edgeDollars - left.edgeDollars || right.score - left.score
    })
}
