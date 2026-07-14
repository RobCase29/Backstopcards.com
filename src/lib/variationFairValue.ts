import type { FairValueSale } from '../../shared/fairValueEngine.js'
import { robustFairValueEstimate } from '../../shared/fairValueEngine.js'
import type { SalesCacheBucket, SalesCachePlayerModel, SalesCacheSale } from './salesCache'

type LaneBlendInput = {
  curvePrice: number
  directPrice: number
  saleCount: number
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
  const curveWeight = 4.5 + curveConfidence * 4.5
  const directWeight =
    Math.min(12, Math.sqrt(Math.max(1, saleCount)) * 2.45) *
    (0.35 + directConfidence * 0.65) *
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
    halfLifeDays: 35,
  })
  const fallbackPrice = positive(input.bucket.modelPrice) || positive(input.bucket.medianPrice) || positive(input.bucket.avgPrice)
  const directPrice = directEstimate?.value ?? fallbackPrice
  const saleCount = Math.max(input.bucket.saleCount || 0, directEstimate?.count ?? sales.length)
  const directConfidence = directEstimate?.confidence ?? clamp(0.34 + Math.log1p(saleCount) * 0.1, 0.34, 0.7)

  return blendLaneEvidence({
    curvePrice: input.curvePrice,
    directPrice,
    saleCount,
    curveConfidence: input.curveConfidence,
    directConfidence,
    matchScore: input.matchScore,
    lowSerialNonAuto: input.lowSerialNonAuto,
  })
}
