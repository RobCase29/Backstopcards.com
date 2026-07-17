import { FAIR_VALUE_MODEL_VERSION } from '../../shared/fairValueEngine.js'
import type { PricingRow, VariationQuote } from './matrix.js'
import { variationKey } from './matrix.js'
import { normalizeLiveCompText } from './liveComps.js'
import {
  salesCacheBucketIsFlagshipRawAuto,
  salesCacheBucketIsFlagshipRawBaseAuto,
  type SalesCacheBucket,
  type SalesCachePlayerModel,
} from './salesCache.js'
import { stableSalesCacheBaseValue, stableSalesCacheLaneValue } from './variationFairValue.js'

function positiveNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function quoteIsBaseAnchor(quote: VariationQuote) {
  return variationKey(quote.label || quote.key) === 'base'
}

function bucketVariationKey(bucket: SalesCacheBucket) {
  return variationKey(bucket.variationLabel || 'Base Auto')
}

export function salesCacheBucketMatchesPricingRowRelease(bucket: SalesCacheBucket, row: PricingRow | undefined) {
  return !row || bucket.releaseYear === row.releaseYear
}

function preferredAutoFamilyScore(bucket: SalesCacheBucket) {
  const family = normalizeLiveCompText(bucket.productFamily)
  if (family === 'bowman chrome') return 34
  if (family.includes('chrome')) return 20
  if (family.includes('bowman')) return 10
  return 0
}

function scoreBucketForRow(bucket: SalesCacheBucket, row: PricingRow | undefined) {
  if (row && bucket.releaseYear && bucket.releaseYear !== row.releaseYear) return Number.NEGATIVE_INFINITY
  return (
    (row && bucket.releaseYear === row.releaseYear ? 120 : 0) +
    preferredAutoFamilyScore(bucket) +
    Math.min(32, bucket.saleCount) +
    Math.log(Math.max(1, bucket.modelPrice))
  )
}

export function canonicalBaseBucketForRow(row: PricingRow | undefined, model: SalesCachePlayerModel | null) {
  if (!model?.available) return null
  const preferredBaseBucket = model.baseAutoBucket
  if (
    preferredBaseBucket &&
    salesCacheBucketIsFlagshipRawBaseAuto(preferredBaseBucket) &&
    (positiveNumber(preferredBaseBucket.modelPrice) ||
      (model.sales ?? []).some((sale) => sale.bucketKey === preferredBaseBucket.bucketKey)) &&
    salesCacheBucketMatchesPricingRowRelease(preferredBaseBucket, row)
  ) {
    return preferredBaseBucket
  }

  return (
    (model.buckets ?? [])
      .filter(
        (bucket) =>
          salesCacheBucketIsFlagshipRawBaseAuto(bucket) &&
          (positiveNumber(bucket.modelPrice) || (model.sales ?? []).some((sale) => sale.bucketKey === bucket.bucketKey)) &&
          salesCacheBucketMatchesPricingRowRelease(bucket, row),
      )
      .sort(
        (left, right) =>
          scoreBucketForRow(right, row) - scoreBucketForRow(left, row) ||
          right.saleCount - left.saleCount ||
          right.modelPrice - left.modelPrice,
      )[0] ?? null
  )
}

/**
 * Applies the durable hosted sold-comp layer to a checklist-derived pricing
 * row. The board, calculator, deal scanner, and external API all use this
 * function so a player has one canonical Backstop value everywhere.
 */
export function applySalesCacheModelToPricingRow(
  row: PricingRow | undefined,
  model: SalesCachePlayerModel | null,
  options: { asOf?: number } = {},
) {
  const baseAutoBucket = canonicalBaseBucketForRow(row, model)
  if (!row || !model?.available || !baseAutoBucket) return row
  if (normalizeLiveCompText(row.playerName) !== normalizeLiveCompText(model.playerName)) return row

  const stableBase = stableSalesCacheBaseValue({ bucket: baseAutoBucket, model, asOf: options.asOf })
  if (!stableBase) return row
  const soldBase = Number(stableBase.value.toFixed(2))
  const baseScale = row.baseTwmaPrice > 0 ? soldBase / row.baseTwmaPrice : 1
  const rawAutoBuckets = new Map<string, SalesCacheBucket>()

  for (const bucket of model.buckets ?? []) {
    if (!salesCacheBucketIsFlagshipRawAuto(bucket) || !positiveNumber(bucket.modelPrice)) continue
    if (!salesCacheBucketMatchesPricingRowRelease(bucket, row)) continue
    const key = bucketVariationKey(bucket)
    const existing = rawAutoBuckets.get(key)
    if (
      !existing ||
      scoreBucketForRow(bucket, row) > scoreBucketForRow(existing, row) ||
      (scoreBucketForRow(bucket, row) === scoreBucketForRow(existing, row) && bucket.modelPrice > existing.modelPrice)
    ) {
      rawAutoBuckets.set(key, bucket)
    }
  }

  const ladder = row.ladder.map((quote) => {
    if (quoteIsBaseAnchor(quote)) {
      const evidenceTier =
        stableBase.count >= 3 ? ('observed' as const) : stableBase.count >= 2 ? ('modeled' as const) : ('indicative' as const)
      return {
        ...quote,
        price: soldBase,
        multiplier: 1,
        confidence: stableBase.confidence,
        evidenceTier,
        actionable: stableBase.count >= 2,
        lowPrice: Number(stableBase.low.toFixed(2)),
        highPrice: Number(stableBase.high.toFixed(2)),
        empiricalEffectiveSales: stableBase.effectiveSales,
      }
    }

    const bucket = rawAutoBuckets.get(variationKey(quote.label || quote.key))
    const curvePrice = soldBase * quote.multiplier
    const stableLane = bucket
      ? stableSalesCacheLaneValue({
          curvePrice,
          curveConfidence: row.baseConfidence,
          bucket,
          model,
          asOf: options.asOf,
        })
      : null
    const price = stableLane?.value ?? curvePrice
    const laneScale = curvePrice > 0 ? price / curvePrice : 1
    return {
      ...quote,
      price: Number(price.toFixed(2)),
      multiplier: Number((price / soldBase).toFixed(4)),
      confidence: stableLane?.confidence ?? quote.confidence,
      lowPrice: Number(((quote.lowPrice ?? row.baseTwmaPrice * quote.multiplier * 0.72) * baseScale * laneScale).toFixed(2)),
      highPrice: Number(((quote.highPrice ?? row.baseTwmaPrice * quote.multiplier * 1.38) * baseScale * laneScale).toFixed(2)),
    }
  })

  return {
    ...row,
    baseTwmaPrice: soldBase,
    basePriceSource: 'weighted-sales' as const,
    baseConfidence: stableBase.confidence,
    baseSales: stableBase.count || baseAutoBucket.saleCount || row.baseSales,
    rawBaseSales: stableBase.count || baseAutoBucket.saleCount || row.rawBaseSales,
    baseSales30: baseAutoBucket.sales30 ?? row.baseSales30,
    baseSales90: baseAutoBucket.sales90 ?? row.baseSales90,
    baseAuctionSales: baseAutoBucket.auctionCount ?? row.baseAuctionSales,
    baseBinSales: baseAutoBucket.binCount ?? row.baseBinSales,
    baseEffectiveSales: stableBase.effectiveSales,
    baseVolatility: stableBase.volatility,
    latestBaseSaleAt: stableBase.latestSoldAt || baseAutoBucket.latestSoldAt || row.latestBaseSaleAt,
    baseMethod: `Sold comp base / ${FAIR_VALUE_MODEL_VERSION.replace('backstop-fv-', 'Backstop FV ')}`,
    topVariationPrice: ladder.reduce((best, quote) => Math.max(best, quote.price), soldBase),
    ladder,
  }
}
