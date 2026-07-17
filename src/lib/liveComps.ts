import type { SalesCacheBucket, SalesCachePlayerModel } from './salesCache.js'
import { averageSalePrice, saleTime, weightedSoldModelPrice } from './display.js'
import type { NormalizedListing, Opportunity } from '../types.js'

export function normalizeLiveCompText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function listingGradingLabel(listing: Opportunity['listing']) {
  if (!listing.isEligibleGraded) return null
  const company = listing.gradingCompany ?? String(listing.grader ?? 'Graded').toUpperCase()
  const grade = listing.gradeNumber ?? listing.grade
  return grade ? `${company} ${grade}` : company
}

export function listingCompGradeBucket(listing: NormalizedListing, rawLens = false) {
  if (rawLens || !listing.isEligibleGraded) return 'Raw'
  return listingGradingLabel(listing) ?? 'Graded'
}

export function opportunityCompGradeBucket(opportunity: Opportunity) {
  return listingCompGradeBucket(opportunity.listing)
}

const LIVE_COMP_DISTINCT_MODIFIERS = [
  'mojo',
  'shimmer',
  'lava',
  'wave',
  'raywave',
  'geometric',
  'x fractor',
  'packfractor',
  'logofractor',
  'firefractor',
  'mini diamond',
  'speckle',
  'atomic',
  'grass',
  'image',
  'ink',
]

function modifierSet(value: string) {
  const text = normalizeLiveCompText(value)
    .replace(/\bx\s*fractor\b/g, 'x fractor')
    .replace(/\bmini\s*diamond\b/g, 'mini diamond')
  return new Set(LIVE_COMP_DISTINCT_MODIFIERS.filter((modifier) => text.includes(modifier)))
}

function hasModifierConflict(left: string, right: string) {
  const leftModifiers = modifierSet(left)
  const rightModifiers = modifierSet(right)
  if (leftModifiers.size === 0 && rightModifiers.size === 0) return false
  return [...leftModifiers].some((modifier) => !rightModifiers.has(modifier)) || [...rightModifiers].some((modifier) => !leftModifiers.has(modifier))
}

export function scoreSalesCacheBucketForListing(
  bucket: SalesCacheBucket,
  listing: NormalizedListing,
  targetVariationLabel = listing.variationLabel,
  options: { rawLens?: boolean } = {},
) {
  const targetVariation = normalizeLiveCompText(targetVariationLabel)
  const bucketVariation = normalizeLiveCompText(bucket.variationLabel)
  const listingTitle = normalizeLiveCompText(listing.title)
  const bucketClass = normalizeLiveCompText(bucket.cardClass)
  const bucketFamily = normalizeLiveCompText(bucket.productFamily)
  const targetIsBaseAuto = /^(base|base auto)$/.test(targetVariation)
  const bucketIsAuto = /\bauto\b/.test(bucketClass)
  let score = 0

  if (bucket.releaseYear && listing.releaseYear && bucket.releaseYear !== listing.releaseYear) return -120
  if (bucket.releaseYear && listing.releaseYear && bucket.releaseYear === listing.releaseYear) score += 16
  if (bucket.gradeBucket === listingCompGradeBucket(listing, options.rawLens)) score += 24
  else if (listing.isEligibleGraded || bucket.gradeBucket !== 'Raw') score -= 28

  if (listing.isLowSerialNonAuto && bucketIsAuto) return -120
  if (targetIsBaseAuto && bucketVariation !== 'base auto') return -120
  if (targetIsBaseAuto && !listing.serialDenominator && bucket.serialDenominator) return -120
  if (hasModifierConflict(`${targetVariation} ${listingTitle}`, bucketVariation)) return -120

  if (bucket.serialDenominator && listing.serialDenominator) {
    score += bucket.serialDenominator === listing.serialDenominator ? 30 : -90
  } else if (bucket.serialDenominator && targetVariation.includes(`/${bucket.serialDenominator}`)) {
    score += 18
  } else if (listing.serialDenominator && !bucket.serialDenominator) {
    score -= listing.serialDenominator <= 499 ? 18 : 8
  }

  if (targetVariation && bucketVariation) {
    if (targetVariation === bucketVariation) score += 46
    else if (targetVariation.includes(bucketVariation) || bucketVariation.includes(targetVariation)) score += 26
  }
  if (bucketVariation && listingTitle.includes(bucketVariation)) score += 18

  if (listing.isAutograph) score += bucketIsAuto ? 16 : -70
  else if (bucketIsAuto) score -= 90
  if (listingTitle.includes('chrome')) score += bucketFamily.includes('chrome') ? 12 : -42
  if (listingTitle.includes('paper')) score += bucketFamily.includes('paper') ? 12 : -42
  return score
}

export function scoreLiveCompBucket(bucket: SalesCacheBucket, opportunity: Opportunity) {
  return scoreSalesCacheBucketForListing(bucket, opportunity.listing, opportunity.matchedVariation ?? opportunity.listing.variationLabel)
}

function cleanBucketSales(model: SalesCachePlayerModel, bucket: SalesCacheBucket) {
  return (model.sales ?? [])
    .filter(
      (sale) =>
        sale.bucketKey === bucket.bucketKey &&
        sale.modelEligible &&
        !sale.erroneous &&
        sale.salePrice > 0 &&
        saleTime(sale.soldAt) > 0,
    )
    .sort((left, right) => saleTime(right.soldAt) - saleTime(left.soldAt))
}

function bucketValue(bucket: SalesCacheBucket) {
  return bucket.modelPrice || bucket.medianPrice || bucket.avgPrice || bucket.q3Price || bucket.q1Price || 0
}

export function salesCacheValuationForListing(
  listing: NormalizedListing,
  model: SalesCachePlayerModel | null | undefined,
  targetVariationLabel = listing.variationLabel,
) {
  if (!model?.available) return null
  if (listing.isHandSigned) return null

  const buckets = model.buckets ?? []
  const best = buckets
    .map((bucket) => ({
      bucket,
      score: scoreSalesCacheBucketForListing(bucket, listing, targetVariationLabel, { rawLens: true }),
    }))
    .filter(({ bucket, score }) => bucketValue(bucket) > 0 && bucket.gradeBucket === 'Raw' && score >= 58)
    .sort((left, right) => right.score - left.score || right.bucket.saleCount - left.bucket.saleCount || bucketValue(right.bucket) - bucketValue(left.bucket))[0]

  if (!best) return null

  const sales = cleanBucketSales(model, best.bucket)
  const last3 = sales.slice(0, 3)
  const last5 = sales.slice(0, 5)
  const last3Avg = last3.length ? averageSalePrice(last3) : null
  const last5Avg = last5.length ? averageSalePrice(last5) : null
  const trailingModel = last5.length ? weightedSoldModelPrice(last5) : bucketValue(best.bucket)
  const soldModelPrice = trailingModel || last5Avg || bucketValue(best.bucket)
  const saleCount = Math.max(best.bucket.saleCount, sales.length)
  const depthScore = Math.min(1, saleCount / 8)
  const recentScore = Math.min(1, best.bucket.sales30 / 5)
  const matchScore = Math.min(1, Math.max(0, (best.score - 58) / 54))

  const exactSource =
    best.score >= 72 &&
    (saleCount >= 5 || (listing.isLowSerialNonAuto && saleCount >= 2 && best.score >= 88))

  return {
    bucket: best.bucket,
    matchScore: best.score,
    saleCount,
    soldModelPrice,
    last3Avg,
    last5Avg,
    trailingModel,
    bucketLabel: `${best.bucket.productFamily} / ${best.bucket.variationLabel} / ${best.bucket.gradeBucket}`,
    confidence: Math.min(0.96, Math.max(0.46, 0.5 + depthScore * 0.2 + recentScore * 0.08 + matchScore * 0.18)),
    source: exactSource ? 'sales-cache-exact' : 'sales-cache-blend',
  } as const
}

export function liveCompCheckForOpportunity(opportunity: Opportunity | null, model: SalesCachePlayerModel | null) {
  if (!opportunity || !model?.available || normalizeLiveCompText(model.playerName) !== normalizeLiveCompText(opportunity.listing.playerName)) return null
  const buckets = model.buckets ?? []
  const bestBucket = buckets
    .map((bucket) => ({ bucket, score: scoreLiveCompBucket(bucket, opportunity) }))
    .filter(({ score }) => score >= 34)
    .sort((left, right) => right.score - left.score || right.bucket.saleCount - left.bucket.saleCount)[0]?.bucket
  if (!bestBucket) return null

  const sales = (model.sales ?? [])
    .filter(
      (sale) =>
        sale.bucketKey === bestBucket.bucketKey &&
        sale.modelEligible &&
        !sale.erroneous &&
        sale.salePrice > 0 &&
        saleTime(sale.soldAt) > 0,
    )
    .sort((left, right) => saleTime(right.soldAt) - saleTime(left.soldAt))
  if (sales.length === 0) return null

  const last3 = sales.slice(0, 3)
  const last5 = sales.slice(0, 5)
  const last3Avg = averageSalePrice(last3)
  const last5Avg = averageSalePrice(last5)
  const trailingModel = weightedSoldModelPrice(last5.length ? last5 : sales)
  return {
    bucket: bestBucket,
    sales,
    last3,
    last5,
    last3Avg,
    last5Avg,
    trailingModel,
    askVsLast5Pct: last5Avg > 0 ? opportunity.listing.allInPrice / last5Avg - 1 : null,
    modelVsLast5Pct: last5Avg > 0 ? opportunity.fairValue / last5Avg - 1 : null,
  }
}

export function liveCompVerdict(opportunity: Opportunity | null, compCheck: ReturnType<typeof liveCompCheckForOpportunity>) {
  if (!opportunity) return { label: 'No live dot', tone: 'neutral' as const }
  if (!compCheck?.last5Avg) return { label: 'No comp lane', tone: 'neutral' as const }
  if (opportunity.listing.allInPrice <= compCheck.last5Avg * 0.9) return { label: 'Comp-backed value', tone: 'good' as const }
  if (opportunity.listing.allInPrice <= compCheck.last5Avg * 1.05) return { label: 'Near recent comps', tone: 'watch' as const }
  if (opportunity.fairValue > compCheck.last5Avg * 1.2) return { label: 'Model is hotter', tone: 'risk' as const }
  return { label: 'Comp pushback', tone: 'risk' as const }
}
