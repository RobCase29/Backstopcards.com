import type { FairValueSale } from '../../shared/fairValueEngine.js'
import {
  estimateBaseFairValue,
  FAIR_VALUE_MODEL_VERSION,
  VARIATION_FAIR_VALUE_POLICY,
  robustFairValueEstimate,
} from '../../shared/fairValueEngine.js'
import type { SalesCacheBucket, SalesCachePlayerModel, SalesCacheSale } from './salesCache'

type LaneBlendInput = {
  curvePrice: number
  directPrice: number
  saleCount: number
  effectiveSales?: number
  curveConfidence?: number
  directConfidence?: number
  matchScore?: number
  lowSerialNonAuto?: boolean
}

export type StableLaneValue = {
  value: number
  directValue: number | null
  directSales: number
  confidence: number
  method: 'curve-only' | 'hierarchical-direct-blend' | 'direct-only'
}

export type StableBaseValue = {
  value: number
  low: number
  high: number
  confidence: number
  effectiveSales: number
  count: number
  volatility: number
  latestSoldAt: string
  method: string
  modelVersion: string
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function saleToFairValueSale(sale: SalesCacheSale): FairValueSale {
  return {
    price: sale.salePrice,
    soldAt: sale.soldAt,
    channel: /auction/i.test(sale.saleType) ? 'auction' : /bin|fixed|offer/i.test(sale.saleType) ? 'bin' : 'unknown',
    itemId: sale.itemId,
    title: sale.title,
    source: sale.channel,
    playerName: sale.playerName,
  }
}

function cleanBucketSales(model: SalesCachePlayerModel, bucket: SalesCacheBucket) {
  return (model.sales ?? [])
    .filter(
      (sale) =>
        sale.bucketKey === bucket.bucketKey &&
        sale.modelEligible &&
        !sale.erroneous &&
        positive(sale.salePrice) > 0 &&
        Number.isFinite(new Date(sale.soldAt).getTime()),
    )
    .map(saleToFairValueSale)
}

/**
 * Returns a base-auto anchor only when it can be reproduced by the current
 * model. Raw sales are preferred; a persisted point is accepted only when its
 * model version matches. This prevents legacy cache summaries from silently
 * replacing the canonical board and calculator value.
 */
export function stableSalesCacheBaseValue(input: {
  bucket: SalesCacheBucket
  model: SalesCachePlayerModel
  asOf?: number
}): StableBaseValue | null {
  const sales = cleanBucketSales(input.model, input.bucket)
  const estimate = estimateBaseFairValue(sales, { asOf: input.asOf })
  if (estimate) {
    return {
      value: estimate.value,
      low: estimate.low,
      high: estimate.high,
      confidence: estimate.confidence,
      effectiveSales: estimate.effectiveN,
      count: estimate.count,
      volatility: estimate.volatility,
      latestSoldAt: estimate.latestSoldAt,
      method: estimate.method,
      modelVersion: FAIR_VALUE_MODEL_VERSION,
    }
  }

  const storedValue = positive(input.bucket.modelPrice)
  if (!storedValue || input.bucket.modelVersion !== FAIR_VALUE_MODEL_VERSION) return null
  return {
    value: storedValue,
    low: positive(input.bucket.modelLow) || storedValue * 0.75,
    high: positive(input.bucket.modelHigh) || storedValue * 1.35,
    confidence: clamp(input.bucket.modelConfidence ?? 0.45, 0.2, 0.97),
    effectiveSales: Math.max(0, input.bucket.modelEffectiveSales ?? input.bucket.saleCount ?? 0),
    count: Math.max(0, input.bucket.saleCount ?? 0),
    volatility: 0,
    latestSoldAt: input.bucket.latestSoldAt,
    method: input.bucket.modelMethod || 'validated-base-anchor-v3',
    modelVersion: input.bucket.modelVersion,
  }
}

/**
 * Combines a base-times-multiple curve with direct lane evidence in log space.
 * The curve always retains meaningful weight; a single sale cannot become the
 * model, while a deep and coherent lane can move fair value materially.
 */
export function blendLaneEvidence(input: LaneBlendInput): StableLaneValue {
  const curvePrice = positive(input.curvePrice)
  const directPrice = positive(input.directPrice)
  const saleCount = Math.max(0, Math.round(input.saleCount || 0))
  const curveConfidence = clamp(input.curveConfidence ?? 0.62, 0.2, 0.98)
  const directConfidence = clamp(input.directConfidence ?? 0.5, 0.2, 0.98)
  const matchQuality = clamp((input.matchScore ?? 86) / 100, 0.45, 1)

  if (!directPrice) {
    return { value: curvePrice, directValue: null, directSales: 0, confidence: curveConfidence, method: 'curve-only' }
  }
  if (!curvePrice) {
    return {
      value: directPrice,
      directValue: directPrice,
      directSales: saleCount,
      confidence: directConfidence,
      method: 'direct-only',
    }
  }

  const evidenceDepth = clamp(Math.log1p(saleCount) / Math.log(21))
  const maxLogDeviation = (input.lowSerialNonAuto ? 0.48 : 0.38) + evidenceDepth * 0.68
  const curveLog = Math.log(curvePrice)
  const directLog = clamp(Math.log(directPrice), curveLog - maxLogDeviation, curveLog + maxLogDeviation)
  const effectiveSales = Math.max(0, input.effectiveSales ?? saleCount)
  const curveWeight = VARIATION_FAIR_VALUE_POLICY.curveWeight
  const directWeight =
    Math.min(VARIATION_FAIR_VALUE_POLICY.directEvidenceCap, effectiveSales) *
    VARIATION_FAIR_VALUE_POLICY.directEvidenceScale *
    (0.45 + directConfidence * 0.55) *
    matchQuality
  const value = Math.exp((curveLog * curveWeight + directLog * directWeight) / (curveWeight + directWeight))
  const confidence = clamp(
    (curveConfidence * curveWeight + directConfidence * directWeight) / (curveWeight + directWeight) + evidenceDepth * 0.06,
    0.25,
    0.97,
  )

  return {
    value,
    directValue: directPrice,
    directSales: saleCount,
    confidence,
    method: 'hierarchical-direct-blend',
  }
}

export function stableSalesCacheLaneValue(input: {
  curvePrice: number
  curveConfidence?: number
  bucket: SalesCacheBucket
  model: SalesCachePlayerModel
  matchScore?: number
  lowSerialNonAuto?: boolean
  asOf?: number
}) {
  const sales = cleanBucketSales(input.model, input.bucket)
  const directEstimate = robustFairValueEstimate(sales, {
    asOf: input.asOf,
    halfLifeDays: VARIATION_FAIR_VALUE_POLICY.directHalfLifeDays,
    maxSales: VARIATION_FAIR_VALUE_POLICY.directMaxSales,
    enableTrend: false,
  })
  const fallbackPrice = input.bucket.modelVersion === FAIR_VALUE_MODEL_VERSION
    ? positive(input.bucket.modelPrice) || positive(input.bucket.medianPrice) || positive(input.bucket.avgPrice)
    : 0
  const directPrice = directEstimate
    ? Math.exp(
        Math.log(directEstimate.value) * (1 - VARIATION_FAIR_VALUE_POLICY.directMedianBlend) +
          Math.log(directEstimate.weightedMedian) * VARIATION_FAIR_VALUE_POLICY.directMedianBlend,
      )
    : fallbackPrice
  const saleCount = Math.max(input.bucket.saleCount || 0, directEstimate?.count ?? sales.length)
  const directConfidence = directEstimate?.confidence ?? clamp(0.34 + Math.log1p(saleCount) * 0.1, 0.34, 0.7)

  return blendLaneEvidence({
    curvePrice: input.curvePrice,
    directPrice,
    saleCount,
    effectiveSales: directEstimate?.effectiveN,
    curveConfidence: input.curveConfidence,
    directConfidence,
    matchScore: input.matchScore,
    lowSerialNonAuto: input.lowSerialNonAuto,
  })
}
