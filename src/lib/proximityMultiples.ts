import type { SalesCacheSale } from './salesCache'

const DAY_MS = 86_400_000
const DEFAULT_WINDOWS_DAYS = [14, 30, 60]
const ANCHOR_HALF_LIFE_DAYS = 7
const SUMMARY_HALF_LIFE_DAYS = 45

export type ProximityMultiplierPoint = {
  sale: SalesCacheSale
  salePrice: number
  soldAt: string
  baseAnchorPrice: number
  multiplier: number
  anchorSaleCount: number
  windowDays: number
  nearestAnchorDays: number
}

export type ProximityMultiplierSummary = {
  multiplier: number
  medianMultiplier: number
  weightedAverageMultiplier: number
  minMultiplier: number
  maxMultiplier: number
  pointCount: number
  anchorSaleCount: number
  avgWindowDays: number
  nearestAnchorDays: number
  points: ProximityMultiplierPoint[]
}

function saleTime(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase()
}

function baseAutoVariationLabel(label: string) {
  return /^base(?:\s+auto)?$/i.test(label.trim()) || /^base\s+autograph$/i.test(label.trim())
}

export function isRawBaseAutoSale(sale: SalesCacheSale) {
  return (
    sale.modelEligible &&
    !sale.erroneous &&
    sale.salePrice > 0 &&
    saleTime(sale.soldAt) > 0 &&
    sale.isAuto &&
    sale.gradeBucket === 'Raw' &&
    baseAutoVariationLabel(sale.variationLabel)
  )
}

export function isRawAutoVariationSale(sale: SalesCacheSale) {
  return (
    sale.modelEligible &&
    !sale.erroneous &&
    sale.salePrice > 0 &&
    saleTime(sale.soldAt) > 0 &&
    sale.isAuto &&
    sale.gradeBucket === 'Raw' &&
    !baseAutoVariationLabel(sale.variationLabel)
  )
}

function weightedLogPrice(sales: SalesCacheSale[], targetTime: number) {
  const weighted = sales.map((sale) => {
    const distanceDays = Math.abs(saleTime(sale.soldAt) - targetTime) / DAY_MS
    return {
      logPrice: Math.log(sale.salePrice),
      weight: Math.pow(0.5, distanceDays / ANCHOR_HALF_LIFE_DAYS),
    }
  })
  const totalWeight = weighted.reduce((total, item) => total + item.weight, 0)
  if (totalWeight <= 0) return 0
  return Math.exp(weighted.reduce((total, item) => total + item.logPrice * item.weight, 0) / totalWeight)
}

function weightedMedian(values: Array<{ value: number; weight: number }>) {
  const usable = values.filter((item) => Number.isFinite(item.value) && item.value > 0 && item.weight > 0)
  if (usable.length === 0) return 0
  const sorted = [...usable].sort((left, right) => left.value - right.value)
  const totalWeight = sorted.reduce((total, item) => total + item.weight, 0)
  let running = 0
  for (const item of sorted) {
    running += item.weight
    if (running >= totalWeight / 2) return item.value
  }
  return sorted.at(-1)?.value ?? 0
}

function anchorBaseSalesForVariationSale(
  variationSale: SalesCacheSale,
  allSales: SalesCacheSale[],
  windowsDays = DEFAULT_WINDOWS_DAYS,
) {
  const targetTime = saleTime(variationSale.soldAt)
  const releaseBaseSales = allSales.filter(
    (sale) => isRawBaseAutoSale(sale) && sale.releaseYear === variationSale.releaseYear && sale.itemId !== variationSale.itemId,
  )
  const exactFamilyBaseSales = releaseBaseSales.filter((sale) => sameText(sale.productFamily, variationSale.productFamily))
  const basePool = exactFamilyBaseSales.length > 0 ? exactFamilyBaseSales : releaseBaseSales
  if (basePool.length === 0) return null

  for (const windowDays of windowsDays) {
    const windowMs = windowDays * DAY_MS
    const nearby = basePool.filter((sale) => Math.abs(saleTime(sale.soldAt) - targetTime) <= windowMs)
    if (nearby.length === 0) continue
    const nearestAnchorDays = Math.min(...nearby.map((sale) => Math.abs(saleTime(sale.soldAt) - targetTime) / DAY_MS))
    const baseAnchorPrice = weightedLogPrice(nearby, targetTime)
    if (baseAnchorPrice > 0) {
      return {
        baseAnchorPrice,
        anchorSaleCount: nearby.length,
        windowDays,
        nearestAnchorDays,
      }
    }
  }

  return null
}

export function summarizeProximityMultiplier(
  bucketSales: SalesCacheSale[],
  allSales: SalesCacheSale[],
  windowsDays = DEFAULT_WINDOWS_DAYS,
): ProximityMultiplierSummary | null {
  const variationSales = bucketSales.filter(isRawAutoVariationSale)
  if (variationSales.length === 0) return null

  const points = variationSales
    .map((sale) => {
      const anchor = anchorBaseSalesForVariationSale(sale, allSales, windowsDays)
      if (!anchor) return null
      return {
        sale,
        salePrice: sale.salePrice,
        soldAt: sale.soldAt,
        baseAnchorPrice: anchor.baseAnchorPrice,
        multiplier: sale.salePrice / anchor.baseAnchorPrice,
        anchorSaleCount: anchor.anchorSaleCount,
        windowDays: anchor.windowDays,
        nearestAnchorDays: anchor.nearestAnchorDays,
      } satisfies ProximityMultiplierPoint
    })
    .filter((point): point is ProximityMultiplierPoint => Boolean(point))

  if (points.length === 0) return null

  const asOf = Math.max(...points.map((point) => saleTime(point.soldAt)))
  const primaryWindowDays = Math.min(...windowsDays)
  const weightedPoints = points.map((point) => {
    const ageDays = Math.max(0, (asOf - saleTime(point.soldAt)) / DAY_MS)
    const recencyWeight = Math.pow(0.5, ageDays / SUMMARY_HALF_LIFE_DAYS)
    const anchorDepthWeight = Math.min(2, Math.sqrt(point.anchorSaleCount))
    const windowQualityWeight = primaryWindowDays / point.windowDays
    return {
      value: point.multiplier,
      weight: recencyWeight * anchorDepthWeight * windowQualityWeight,
    }
  })
  const totalWeight = weightedPoints.reduce((total, point) => total + point.weight, 0)
  const weightedAverageMultiplier =
    totalWeight > 0 ? weightedPoints.reduce((total, point) => total + point.value * point.weight, 0) / totalWeight : 0
  const medianMultiplier = weightedMedian(weightedPoints)
  const multiplier = medianMultiplier || weightedAverageMultiplier

  return {
    multiplier,
    medianMultiplier,
    weightedAverageMultiplier,
    minMultiplier: Math.min(...points.map((point) => point.multiplier)),
    maxMultiplier: Math.max(...points.map((point) => point.multiplier)),
    pointCount: points.length,
    anchorSaleCount: points.reduce((total, point) => total + point.anchorSaleCount, 0),
    avgWindowDays: points.reduce((total, point) => total + point.windowDays, 0) / points.length,
    nearestAnchorDays: Math.min(...points.map((point) => point.nearestAnchorDays)),
    points,
  }
}
