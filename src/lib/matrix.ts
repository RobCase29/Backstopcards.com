import type { ChecklistModel, ChecklistPlayer, ChecklistSale, ChecklistVariation } from '../types.js'
import { findStsRanking, scoreStsBinTarget, scoreStsMomentum, scoreStsRanking, scoreStsRiserValue } from './stsRankings.js'
import type { OracleRankingRoute, StsRankingSource } from './stsRankings.js'
import { normalizeTeamCode, teamDisplayName, teamSearchText } from './teams.js'
import {
  FAIR_VALUE_MODEL_VERSION,
  isValidatedHierarchicalModel,
  stabilizeReleaseMultiplier,
  structuralVariationPrior,
} from './variationPriors.js'
import {
  BOWMAN_2026_CHROME_AUTO_VARIATIONS,
  bowman2026AutoDefinition,
  canonicalizeBowman2026AutoLabel,
} from '../../shared/bowman2026Taxonomy.js'
import { canonicalizeHistoricalBowmanAutoLabel } from '../../shared/bowmanAutoTaxonomy.js'
import { estimateBaseFairValue } from '../../shared/fairValueEngine.js'
import { blendLaneEvidence } from './variationFairValue.js'

export type BasePriceSource = 'weighted-sales' | 'blended-sales' | 'variation-implied' | 'twma-fallback' | 'unpriced'
export type SaleChannel = 'auction' | 'bin' | 'unknown'

export interface BaseSalePoint {
  price: number
  soldAt: number
  channel: SaleChannel
}

export interface BasePriceEstimate {
  price: number
  low: number
  high: number
  source: BasePriceSource
  confidence: number
  rawSales: number
  sales30: number
  sales90: number
  auctionSales: number
  binSales: number
  unknownSales: number
  effectiveSales: number
  volatility: number
  latestSaleAt: string | null
  fallbackPrice: number
  methodLabel: string
}

export interface VariationQuote {
  key: string
  label: string
  multiplier: number
  price: number
  sortOrder: number | null
  synthesizedBase: boolean
  confidence?: number
  evidenceTier?: 'observed' | 'modeled' | 'indicative'
  actionable?: boolean
  lowPrice?: number
  highPrice?: number
  empiricalEffectiveSales?: number
}

export interface PricingRow {
  id: string
  rank: number
  playerName: string
  checklistTeam: string | null
  currentTeam: string | null
  currentTeamName: string | null
  stsName: string | null
  stsTeam: string | null
  stsPosition: string | null
  stsAge: number | null
  stsLevel: string | null
  stsRank: number | null
  stsProspectRank: number | null
  stsDynastyScore: number | null
  stsMomentumScore: number | null
  stsRiserValueScore: number | null
  stsBinTargetScore: number | null
  stsWar: number | null
  stsChange3d: number | null
  stsChange7d: number | null
  stsChange14d: number | null
  stsChange30d: number | null
  stsSummary: string | null
  rankingSource: StsRankingSource | null
  oraclePlayerId: string | null
  oracleMlbamId: string | null
  oracleRoute: OracleRankingRoute | null
  oracleRankLabel: string | null
  oracleStageRank: number | null
  oracleServedProspectRank: number | null
  oracleRankUniverse: number | null
  bowmanProspectRank: number | null
  oracleRankAvailability: string | null
  oracleRankTarget: string | null
  oracleRankAsOf: string | null
  oracleRankModelVersion: string | null
  oracleEvidenceTier: string | null
  oracleVolatility: string | null
  oracleCareerOutlook: number | null
  oracleCareerOutlookBand: string | null
  oracleCareerOutlookBasis: string | null
  oracleCareerOutlookAsOf: string | null
  oracleCareerOutlookModelVersion: string | null
  oracleRecordVersion: string | null
  oracleSnapshotId: string | null
  oracleSchemaVersion: string | null
  oracleContractVersion: string | null
  oracleMatchMethod: string | null
  release: string
  releaseYear: number
  category: ChecklistModel['category']
  baseTwmaPrice: number
  pulseBasePrice: number
  baseSales: number
  rawBaseSales: number
  baseSales30: number
  baseSales90: number
  baseAuctionSales: number
  baseBinSales: number
  baseUnknownSales: number
  baseEffectiveSales: number
  baseVolatility: number
  basePriceSource: BasePriceSource
  baseConfidence: number
  latestBaseSaleAt: string | null
  baseMethod: string
  topVariationPrice: number
  variationCount: number
  ladder: VariationQuote[]
  searchText: string
}

export interface ReleaseMathSummary {
  release: string
  releaseYear: number
  category: ChecklistModel['category']
  source: ChecklistModel['source']
  players: number
  pricedPlayers: number
  missingBaseRows: number
  variations: number
  resolvedCells: number
  minMultiplier: number
  maxMultiplier: number
  weightedBaseRows: number
  blendedBaseRows: number
  impliedBaseRows: number
  fallbackBaseRows: number
}

export interface PricingMatrix {
  rows: PricingRow[]
  summaries: ReleaseMathSummary[]
  totalResolvedCells: number
  totalPlayers: number
  totalPricedPlayers: number
  totalVariations: number
  missingBaseRows: number
  unresolvedMultipliers: number
  maxVariationCount: number
  weightedBaseRows: number
  blendedBaseRows: number
  impliedBaseRows: number
  fallbackBaseRows: number
  stsMatchedRows: number
  stsProspectRows: number
}

interface VariationBucket {
  label: string
  multipliers: number[]
  sortOrders: number[]
  playerCounts: number[]
  totalSales: number
  modelMethods: string[]
  modelConfidences: number[]
  proximitySales: number
  modelEvidence: Array<'observed' | 'modeled' | 'indicative'>
  modelActionability: boolean[]
  lowMultipliers: number[]
  highMultipliers: number[]
  empiricalEffectiveSales: number[]
  synthesizedBase: boolean
}

export function modelKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\bsunflower\s+seeds?\b/g, 'sunflower snack pack')
    .replace(/\bsunflower\b(?!\s+snack\s+pack)/g, 'sunflower snack pack')
    .replace(/\bgum\s*ball\b(?!\s+snack\s+pack)|\bbubble\s+gum\b(?!\s+snack\s+pack)/g, 'gumball snack pack')
    .replace(/\bpeanuts?\b(?!\s+snack\s+pack)/g, 'peanuts snack pack')
    .replace(/\bpopcorn\b(?!\s+snack\s+pack)/g, 'popcorn snack pack')
    .replace(/#/g, '/')
    .replace(/\b(1st|first|bowman|chrome|prospect|auto|autograph|autographs|autographed)\b/g, ' ')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function variationKey(value: string) {
  const key = modelKey(value)
    .replace(/\bx\s+fractor\b/g, 'xfractor')
    .replace(/\bblack\s+(?:and|&)\s+white\b/g, 'bw')

  // Sellers frequently omit "Refractor" from a colored, numbered parallel.
  // Keep the /499 refractor distinct from base, but collapse equivalent color
  // labels such as "Orange /25" and "Orange Refractor /25" into one lane.
  const isColoredNumberedParallel =
    /\b(?:aqua|black|blue|gold|green|orange|pink|purple|red|teal|yellow)\b/.test(key) && /\/\s*\d+\b/.test(key)

  return (isColoredNumberedParallel ? key.replace(/\brefractor\b/g, ' ') : key)
    .replace(/\s+/g, ' ')
    .trim() || value.toLowerCase().trim()
}

export function variationMatches(left: string, right: string) {
  const leftKey = variationKey(left)
  const rightKey = variationKey(right)
  return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey)
}

export function formatMultiplier(value: number) {
  const digits = value >= 20 ? 1 : value >= 10 ? 2 : 2
  return `${value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}x`
}

function numberValue(value: number | string | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function searchKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function salePrice(sale: ChecklistSale) {
  return numberValue(sale.salePrice ?? sale.sale_price ?? sale.price ?? sale.amount ?? sale.value)
}

function saleTimestamp(sale: ChecklistSale) {
  const value = sale.saleDate ?? sale.sale_date ?? sale.soldAt ?? sale.sold_at ?? sale.date ?? sale.created_at
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const midpoint = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2 : (sorted[midpoint] ?? 0)
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0
  const mean = average(values)
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1))
}

function finiteSortOrder(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isBaseVariation(label: string) {
  const key = variationKey(label)
  return key === 'base' || key === 'base refractor'
}

function isBaseSale(sale: ChecklistSale) {
  if (sale.variation) return isBaseVariation(sale.variation)
  const title = sale.title?.toLowerCase() ?? ''
  if (!title) return true
  if (/\b(refractor|speckle|purple|blue|aqua|green|gold|orange|red|superfractor|sapphire|lava|shimmer|wave|raywave|mini[-\s]?diamond|rose|yellow|black|pearl|atomic|mojo|x-fractor|image variation)\b/.test(title)) {
    return false
  }
  return true
}

function saleChannel(sale: ChecklistSale): SaleChannel {
  const text = [
    sale.saleType,
    sale.sale_type,
    sale.sellingFormat,
    sale.selling_format,
    sale.buyingFormat,
    sale.buying_format,
    sale.listingType,
    sale.listing_type,
    sale.format,
    sale.source,
    sale.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/\b(auction|bid|bids)\b/.test(text)) return 'auction'
  if (/\b(bin|buy it now|fixed price|fixed-price|fixedprice|buy-now|offer accepted|best offer)\b/.test(text)) return 'bin'
  return 'unknown'
}

function extractBaseSales(player: ChecklistPlayer, asOf: number): BaseSalePoint[] {
  const rawSales = [
    ...(player.baseSales ?? []),
    ...(player.base_sales ?? []),
    ...(player.saleHistory ?? []),
    ...(player.sale_history ?? []),
    ...(player.sales ?? []),
  ]

  const points = rawSales
    .filter(isBaseSale)
    .map((sale) => {
      const price = salePrice(sale)
      const soldAt = saleTimestamp(sale)
      if (!isFinitePositive(price) || !soldAt || soldAt > asOf) return null
      return { price, soldAt, channel: saleChannel(sale) }
    })
    .filter((point): point is BaseSalePoint => Boolean(point))

  const seen = new Set<string>()
  return points
    .filter((point) => {
      const key = `${point.price}:${point.soldAt}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => right.soldAt - left.soldAt)
}

function ageDays(soldAt: number, asOf: number) {
  return Math.max(0, (asOf - soldAt) / 86_400_000)
}

export function estimateBasePrice(player: ChecklistPlayer, asOf = Date.now()): BasePriceEstimate {
  const fallbackPrice = isFinitePositive(player.baseAvgPrice) ? player.baseAvgPrice : 0
  const sales = extractBaseSales(player, asOf)
  // Static snapshots intentionally keep only a small sample of full sale rows, but
  // retain the canonical aggregate count. Preserve that evidence so a well-covered
  // cached comp lane is not presented as if it had zero sales.
  const summarySales = Math.max(sales.length, Math.max(0, player.baseSalesCount || 0))
  const sales30 = sales.filter((sale) => ageDays(sale.soldAt, asOf) <= 30)
  const sales90 = sales.filter((sale) => ageDays(sale.soldAt, asOf) <= 90)
  const auctionSales = sales.filter((sale) => sale.channel === 'auction').length
  const binSales = sales.filter((sale) => sale.channel === 'bin').length
  const unknownSales = Math.max(0, sales.length - auctionSales - binSales)
  const estimate = estimateBaseFairValue(sales, { asOf })
  const latestSaleAt = sales[0] ? new Date(sales[0].soldAt).toISOString() : null
  const latestAgeDays = sales[0] ? ageDays(sales[0].soldAt, asOf) : Number.POSITIVE_INFINITY
  const effectiveSales = estimate?.effectiveN ?? 0
  const volatility = estimate?.volatility ?? 0

  if (estimate && sales.length >= 2) {
    const staleShrink = fallbackPrice > 0 && latestAgeDays > 45
      ? clamp((latestAgeDays - 30) / 120, 0, 0.72) * clamp(4 / Math.max(1, effectiveSales), 0.5, 1)
      : 0
    const shrinkToFallback = (value: number) => staleShrink > 0
      ? Math.exp(Math.log(value) * (1 - staleShrink) + Math.log(fallbackPrice) * staleShrink)
      : value
    const price = shrinkToFallback(estimate.value)
    const low = Math.min(price, shrinkToFallback(estimate.low))
    const high = Math.max(price, shrinkToFallback(estimate.high))
    const evidenceLabel = effectiveSales >= 4 ? 'deep' : 'developing'
    const channelLabel = auctionSales > 0 && binSales > 0 ? 'mixed auction + BIN' : auctionSales > 0 ? 'auction' : binSales > 0 ? 'BIN' : 'market'
    const freshnessCeiling = latestAgeDays <= 45 ? 0.97 : latestAgeDays <= 90 ? 0.72 : 0.58
    return {
      price: Number(price.toFixed(2)),
      low: Number(low.toFixed(2)),
      high: Number(high.toFixed(2)),
      source: effectiveSales >= 4 && staleShrink === 0 ? 'weighted-sales' : 'blended-sales',
      confidence: Math.min(estimate.confidence * (1 - staleShrink * 0.28), freshnessCeiling),
      rawSales: sales.length,
      sales30: sales30.length,
      sales90: sales90.length,
      auctionSales,
      binSales,
      unknownSales,
      effectiveSales: Number(effectiveSales.toFixed(2)),
      volatility: Number(volatility.toFixed(3)),
      latestSaleAt,
      fallbackPrice,
      methodLabel: `validated recent market / ${channelLabel} / ${evidenceLabel} / last ${Math.min(10, sales.length)} sales${staleShrink > 0 ? ' / stale-anchor shrinkage' : ''}`,
    }
  }

  if (estimate && sales.length === 1) {
    const price = fallbackPrice > 0
      ? Math.exp(Math.log(estimate.value) * 0.42 + Math.log(fallbackPrice) * 0.58)
      : estimate.value
    return {
      price: Number(price.toFixed(2)),
      low: Number(Math.min(price, estimate.low).toFixed(2)),
      high: Number(Math.max(price, estimate.high).toFixed(2)),
      source: 'blended-sales',
      confidence: Math.min(0.48, estimate.confidence),
      rawSales: 1,
      sales30: sales30.length,
      sales90: sales90.length,
      auctionSales,
      binSales,
      unknownSales,
      effectiveSales: Number(effectiveSales.toFixed(2)),
      volatility: Number(volatility.toFixed(3)),
      latestSaleAt,
      fallbackPrice,
      methodLabel: fallbackPrice > 0 ? 'single recent sale / baseline shrinkage' : 'single recent sale / indicative',
    }
  }

  const hasExplicitSnapshotProvenance = Boolean(player.baseModelMethod)
  const snapshotConfidence = isFinitePositive(player.baseModelConfidence)
    ? clamp(player.baseModelConfidence, 0, 1)
    : null
  const snapshotEffectiveSales = isFinitePositive(player.baseEffectiveSales) ? player.baseEffectiveSales : 0
  const snapshotLow = isFinitePositive(player.baseModelLow) ? player.baseModelLow : fallbackPrice * 0.68
  const snapshotHigh = isFinitePositive(player.baseModelHigh) ? player.baseModelHigh : fallbackPrice * 1.47
  const snapshotLatestAt = player.baseLatestSaleAt && Number.isFinite(new Date(player.baseLatestSaleAt).getTime())
    ? player.baseLatestSaleAt
    : latestSaleAt
  const legacySummary = player.baseModelMethod === 'legacy-cached-summary'
  const fallbackConfidence = snapshotConfidence ?? Math.min(0.58, 0.32 + Math.min(summarySales, 18) / 70)
  return {
    price: Number(fallbackPrice.toFixed(2)),
    low: Number(snapshotLow.toFixed(2)),
    high: Number(snapshotHigh.toFixed(2)),
    source: 'twma-fallback',
    confidence: legacySummary ? Math.min(0.48, fallbackConfidence) : fallbackConfidence,
    rawSales: summarySales,
    sales30: sales30.length,
    sales90: sales90.length,
    auctionSales,
    binSales,
    unknownSales,
    effectiveSales: Number(Math.max(effectiveSales, snapshotEffectiveSales).toFixed(2)),
    volatility: Number(volatility.toFixed(3)),
    latestSaleAt: snapshotLatestAt,
    fallbackPrice,
    methodLabel: sales.length > 0
      ? 'thin sales fallback'
      : hasExplicitSnapshotProvenance
        ? legacySummary
          ? 'legacy cached summary / awaiting title-verified sales'
          : player.baseModelMethod || 'snapshot model'
        : summarySales > 0
          ? 'cached comp summary / unversioned'
          : 'baseline average',
  }
}

function estimateVariationImpliedBasePrice(player: ChecklistPlayer, variations: ChecklistVariation[]): BasePriceEstimate | null {
  const variationByKey = new Map(variations.map((variation) => [variationKey(variation.variation), variation]))
  const points = player.variations
    .map((variation) => {
      if (isBaseVariation(variation.variation)) return null
      const avgPrice = numberValue(variation.avgPrice)
      if (!isFinitePositive(avgPrice)) return null

      const key = variationKey(variation.variation)
      const releaseVariation = variationByKey.get(key)
      const releaseActionable = Boolean(releaseVariation?.modelActionable) && releaseVariation?.modelEvidence !== 'indicative'
      const directSales = Math.max(0, variation.salesCount ?? 0)
      // A variation-only base estimate is a rescue path, not permission to
      // price from a one-off rare card. Require either a validated release
      // curve or enough direct lane depth to withstand one bad classification.
      if (!releaseActionable && directSales < 3) return null
      const releaseMultiplier = releaseVariation && !isBaseVariation(releaseVariation.variation) ? releaseVariation.avgMultiplier : null
      const playerMultiplier = !isBaseVariation(variation.variation) ? variation.multiplier : null
      const multiplier = isFinitePositive(releaseMultiplier) ? releaseMultiplier : isFinitePositive(playerMultiplier) ? playerMultiplier : null
      if (!isFinitePositive(multiplier) || multiplier <= 1) return null
      const numericAvgPrice = avgPrice
      const numericMultiplier = multiplier

      const salesCount = Math.max(1, Math.min(12, directSales || releaseVariation?.totalSales || 1))
      const highMultiplierPenalty = clamp(2.4 / Math.sqrt(numericMultiplier), 0.35, 1.15)
      const releaseCurveWeight = releaseVariation ? 1 : 0.62
      const weight = Math.sqrt(salesCount) * highMultiplierPenalty * releaseCurveWeight
      const impliedBase = numericAvgPrice / numericMultiplier
      if (!isFinitePositive(impliedBase)) return null

      return {
        value: impliedBase,
        label: releaseVariation?.variation ?? variation.variation,
        weight,
        salesCount,
        multiplier: numericMultiplier,
        releaseActionable,
      }
    })
    .filter((point): point is {
      value: number
      label: string
      weight: number
      salesCount: number
      multiplier: number
      releaseActionable: boolean
    } => Boolean(point))

  if (points.length === 0) return null
  const totalSales = points.reduce((total, point) => total + point.salesCount, 0)
  const singleDeepAnchor =
    points.length === 1 &&
    points[0].salesCount >= 4 &&
    points[0].multiplier <= 10 &&
    points[0].releaseActionable
  if (points.length < 2 && !singleDeepAnchor) return null
  if (totalSales < 3) return null

  const logs = points.map((point) => Math.log(point.value))
  const center = median(logs)
  const deviations = logs.map((value) => Math.abs(value - center))
  const mad = median(deviations)
  const sigma = mad > 0 ? mad * 1.4826 : standardDeviation(logs)
  const clipWidth = sigma > 0 ? Math.max(0.22, sigma * 2.15) : Number.POSITIVE_INFINITY
  const totalWeight = points.reduce((total, point) => total + point.weight, 0)
  if (totalWeight <= 0) return null

  const blendedLog =
    points.reduce((total, point) => {
      const logValue = Math.log(point.value)
      const clipped = Math.min(center + clipWidth, Math.max(center - clipWidth, logValue))
      return total + clipped * point.weight
    }, 0) / totalWeight
  const price = Math.exp(blendedLog)
  const confidence = clamp(0.28 + Math.min(totalWeight, 7) / 22 + Math.min(points.length, 4) * 0.035, 0.3, 0.58)
  const labels = [...new Set(points.map((point) => point.label))].slice(0, 3).join(', ')

  return {
    price: Number(price.toFixed(2)),
    low: Number((price * Math.exp(-Math.max(0.18, sigma || 0.32))).toFixed(2)),
    high: Number((price * Math.exp(Math.max(0.18, sigma || 0.32))).toFixed(2)),
    source: 'variation-implied',
    confidence,
    rawSales: 0,
    sales30: 0,
    sales90: 0,
    auctionSales: 0,
    binSales: 0,
    unknownSales: 0,
    effectiveSales: Number(totalWeight.toFixed(2)),
    volatility: Number((sigma || 0).toFixed(3)),
    latestSaleAt: null,
    fallbackPrice: 0,
    methodLabel: `implied from ${points.length} variation ${points.length === 1 ? 'anchor' : 'anchors'}${totalSales ? ` / ${totalSales} sales` : ''}: ${labels}`,
  }
}

function unpricedBaseEstimate(): BasePriceEstimate {
  return {
    price: 0,
    low: 0,
    high: 0,
    source: 'unpriced',
    confidence: 0,
    rawSales: 0,
    sales30: 0,
    sales90: 0,
    auctionSales: 0,
    binSales: 0,
    unknownSales: 0,
    effectiveSales: 0,
    volatility: 0,
    latestSaleAt: null,
    fallbackPrice: 0,
    methodLabel: 'needs base comps',
  }
}

function compareVariations(left: ChecklistVariation, right: ChecklistVariation) {
  const leftBase = isBaseVariation(left.variation)
  const rightBase = isBaseVariation(right.variation)
  if (leftBase !== rightBase) return leftBase ? -1 : 1

  const leftOrder = finiteSortOrder(left.sortOrder) ?? Number.POSITIVE_INFINITY
  const rightOrder = finiteSortOrder(right.sortOrder) ?? Number.POSITIVE_INFINITY
  return leftOrder - rightOrder || left.avgMultiplier - right.avgMultiplier || left.variation.localeCompare(right.variation)
}

export function releaseVariationCurve(model: ChecklistModel) {
  const buckets = new Map<string, VariationBucket>()
  let unresolvedMultipliers = 0
  const hasValidatedCurve =
    model.modelVersion === FAIR_VALUE_MODEL_VERSION ||
    model.modelVersion === 'backstop-fv-v2' ||
    model.multipliers.some((variation) => isValidatedHierarchicalModel(variation.modelMethod))
  const isOfficial2026Bowman = model.releaseYear === 2026 && model.category === 'bowman' && hasValidatedCurve

  for (const variation of model.multipliers) {
    if (!isFinitePositive(variation.avgMultiplier)) {
      unresolvedMultipliers += 1
      continue
    }

    const canonicalLabel = isOfficial2026Bowman
      ? canonicalizeBowman2026AutoLabel(variation.variation, { assumeAuto: true })
      : hasValidatedCurve
        ? canonicalizeHistoricalBowmanAutoLabel(variation.variation, { assumeAuto: true })
        : variation.variation
    if (!canonicalLabel) {
      unresolvedMultipliers += 1
      continue
    }
    const key = variationKey(canonicalLabel)
    const current =
      buckets.get(key) ??
      {
        label: canonicalLabel,
        multipliers: [],
        sortOrders: [],
        playerCounts: [],
        totalSales: 0,
        modelMethods: [],
        modelConfidences: [],
        proximitySales: 0,
        modelEvidence: [],
        modelActionability: [],
        lowMultipliers: [],
        highMultipliers: [],
        empiricalEffectiveSales: [],
        synthesizedBase: false,
      }

    current.label = isOfficial2026Bowman || hasValidatedCurve
      ? canonicalLabel
      : current.label.length <= variation.variation.length
        ? current.label
        : variation.variation
    current.multipliers.push(variation.avgMultiplier)
    const officialSortOrder = isOfficial2026Bowman
      ? bowman2026AutoDefinition(canonicalLabel)?.scarcityOrder
      : null
    if (finiteSortOrder(officialSortOrder) !== null) current.sortOrders.push(officialSortOrder as number)
    else if (finiteSortOrder(variation.sortOrder) !== null) current.sortOrders.push(variation.sortOrder as number)
    if (isFinitePositive(variation.playerCount)) current.playerCounts.push(variation.playerCount as number)
    if (isFinitePositive(variation.totalSales)) current.totalSales += variation.totalSales as number
    if (variation.modelMethod) current.modelMethods.push(variation.modelMethod)
    if (isFinitePositive(variation.modelConfidence)) current.modelConfidences.push(variation.modelConfidence as number)
    if (isFinitePositive(variation.proximitySales)) current.proximitySales += variation.proximitySales as number
    if (variation.modelEvidence) current.modelEvidence.push(variation.modelEvidence)
    if (typeof variation.modelActionable === 'boolean') current.modelActionability.push(variation.modelActionable)
    if (isFinitePositive(variation.modelLowMultiplier)) current.lowMultipliers.push(variation.modelLowMultiplier as number)
    if (isFinitePositive(variation.modelHighMultiplier)) current.highMultipliers.push(variation.modelHighMultiplier as number)
    if (isFinitePositive(variation.empiricalEffectiveSales)) {
      current.empiricalEffectiveSales.push(variation.empiricalEffectiveSales as number)
    }
    buckets.set(key, current)
  }

  if (isOfficial2026Bowman) {
    for (const definition of BOWMAN_2026_CHROME_AUTO_VARIATIONS) {
      const key = variationKey(definition.label)
      if (buckets.has(key)) continue
      buckets.set(key, {
        label: definition.label,
        multipliers: [definition.priorMultiplier],
        sortOrders: [definition.scarcityOrder],
        playerCounts: [],
        totalSales: 0,
        modelMethods: ['structural-prior-only'],
        modelConfidences: [definition.priorReliability],
        proximitySales: 0,
        modelEvidence: ['indicative'],
        modelActionability: [false],
        lowMultipliers: [],
        highMultipliers: [],
        empiricalEffectiveSales: [],
        synthesizedBase: definition.id === 'base-auto',
      })
    }
  }

  if (![...buckets.keys()].some((key) => key === 'base')) {
    buckets.set('base', {
      label: 'Base Auto',
      multipliers: [1],
      sortOrders: [-1],
      playerCounts: [model.players.length],
      totalSales: model.players.reduce((total, player) => total + Math.max(0, player.baseSalesCount || 0), 0),
      modelMethods: ['structural-base-anchor'],
      modelConfidences: [1],
      proximitySales: 0,
      modelEvidence: ['observed'],
      modelActionability: [true],
      lowMultipliers: [1],
      highMultipliers: [1],
      empiricalEffectiveSales: [],
      synthesizedBase: true,
    })
  }

  const variations = [...buckets.values()]
    .map<ChecklistVariation & { synthesizedBase?: boolean }>((bucket) => {
      const empiricalMultiplier = median(bucket.multipliers)
      const playerCount = bucket.playerCounts.length ? Math.max(...bucket.playerCounts) : undefined
      const totalSales = bucket.totalSales || undefined
      const modelMethod = bucket.modelMethods.includes('hierarchical-proximity-v3')
        ? 'hierarchical-proximity-v3'
        : bucket.modelMethods.includes('hierarchical-proximity-v2')
          ? 'hierarchical-proximity-v2'
        : bucket.modelMethods.includes('structural-prior-only')
          ? 'structural-prior-only'
          : bucket.modelMethods.includes('structural-base-anchor')
            ? 'structural-base-anchor'
            : 'stabilized-release-prior'
      const prior = structuralVariationPrior(bucket.label, model.releaseYear, model.category)
      return {
        variation: bucket.label,
        avgMultiplier: stabilizeReleaseMultiplier({
          variation: bucket.label,
          empiricalMultiplier,
          releaseYear: model.releaseYear,
          category: model.category,
          playerCount,
          totalSales,
          modelMethod,
        }),
        playerCount,
        totalSales,
        sortOrder: bucket.sortOrders.length ? Math.min(...bucket.sortOrders) : null,
        modelMethod,
        modelConfidence: bucket.modelConfidences.length ? median(bucket.modelConfidences) : undefined,
        structuralPrior: prior?.multiplier,
        proximitySales: bucket.proximitySales || undefined,
        modelEvidence: bucket.modelEvidence.includes('observed')
          ? 'observed'
          : bucket.modelEvidence.includes('modeled')
            ? 'modeled'
            : bucket.modelEvidence.length
              ? 'indicative'
              : undefined,
        modelActionable: bucket.modelActionability.length ? bucket.modelActionability.some(Boolean) : undefined,
        modelLowMultiplier: bucket.lowMultipliers.length ? median(bucket.lowMultipliers) : undefined,
        modelHighMultiplier: bucket.highMultipliers.length ? median(bucket.highMultipliers) : undefined,
        empiricalEffectiveSales: bucket.empiricalEffectiveSales.length
          ? Math.max(...bucket.empiricalEffectiveSales)
          : undefined,
        synthesizedBase: bucket.synthesizedBase,
      }
    })
    .sort(compareVariations)

  return { variations, unresolvedMultipliers }
}

export function buildPricingMatrix(models: ChecklistModel[], options: { asOf?: number } = {}): PricingMatrix {
  const asOf = options.asOf ?? Date.now()
  const rowsWithoutRank: Omit<PricingRow, 'rank'>[] = []
  const summaries: ReleaseMathSummary[] = []
  let unresolvedMultipliers = 0

  for (const model of models) {
    const { variations, unresolvedMultipliers: modelUnresolvedMultipliers } = releaseVariationCurve(model)
    unresolvedMultipliers += modelUnresolvedMultipliers

    const playerEntries = model.players
      .map((player) => {
        const baseEstimate = estimateBasePrice(player, asOf)
        const estimate = isFinitePositive(baseEstimate.price) ? baseEstimate : estimateVariationImpliedBasePrice(player, variations) ?? baseEstimate
        return { player, estimate }
      })
    const pricedEntries = playerEntries.filter(({ estimate }) => isFinitePositive(estimate.price))
    const pricedPlayers = pricedEntries.map(({ player }) => player)
    const missingBaseRows = Math.max(0, model.players.length - pricedEntries.length)
    const multipliers = variations.map((variation) => variation.avgMultiplier).filter(isFinitePositive)
    const weightedBaseRows = pricedEntries.filter(({ estimate }) => estimate.source === 'weighted-sales').length
    const blendedBaseRows = pricedEntries.filter(({ estimate }) => estimate.source === 'blended-sales').length
    const impliedBaseRows = pricedEntries.filter(({ estimate }) => estimate.source === 'variation-implied').length
    const fallbackBaseRows = pricedEntries.filter(({ estimate }) => estimate.source === 'twma-fallback').length

    summaries.push({
      release: model.release,
      releaseYear: model.releaseYear,
      category: model.category,
      source: model.source,
      players: model.players.length,
      pricedPlayers: pricedPlayers.length,
      missingBaseRows,
      variations: variations.length,
      resolvedCells: pricedPlayers.length * variations.length,
      minMultiplier: multipliers.length ? Math.min(...multipliers) : 0,
      maxMultiplier: multipliers.length ? Math.max(...multipliers) : 0,
      weightedBaseRows,
      blendedBaseRows,
      impliedBaseRows,
      fallbackBaseRows,
    })

    for (const { player, estimate } of playerEntries) {
      const hasModelPrice = isFinitePositive(estimate.price)
      const baseEstimate = hasModelPrice ? estimate : unpricedBaseEstimate()
      const stsRanking = findStsRanking(player.playerName, { team: player.team })
      const checklistTeam = normalizeTeamCode(player.team) || null
      const currentTeam = normalizeTeamCode(stsRanking?.team) || checklistTeam || null
      const currentTeamName = currentTeam ? teamDisplayName(currentTeam) : null
      const baseSupportsCurve =
        baseEstimate.source === 'weighted-sales' ||
        baseEstimate.source === 'blended-sales' ||
        baseEstimate.source === 'variation-implied' ||
        (baseEstimate.confidence >= 0.52 && baseEstimate.effectiveSales >= 1.5)
      const ladder = variations.map<VariationQuote>((variation) => {
        const curvePrice = baseEstimate.price * variation.avgMultiplier
        const playerLane = isBaseVariation(variation.variation)
          ? null
          : player.variations.find((candidate) => variationKey(candidate.variation) === variationKey(variation.variation)) ?? null
        const directSales = Math.max(0, playerLane?.salesCount ?? 0)
        const directEffectiveSales = Math.max(0, playerLane?.effectiveSales ?? directSales)
        const directSupportsLane = directSales >= 3 && directEffectiveSales >= 2
        const releaseConfidence = variation.modelConfidence ?? 0.42
        const laneEstimate = playerLane && isFinitePositive(playerLane.avgPrice) && directSupportsLane
          ? blendLaneEvidence({
              curvePrice,
              directPrice: playerLane.avgPrice,
              saleCount: directSales,
              effectiveSales: directEffectiveSales,
              curveConfidence: Math.sqrt(baseEstimate.confidence * Math.max(0.2, releaseConfidence)),
              directConfidence: playerLane.modelConfidence ?? clamp(0.42 + Math.log1p(directSales) * 0.12, 0.42, 0.82),
            })
          : null
        const lanePrice = laneEstimate?.value ?? curvePrice
        const price = Number(lanePrice.toFixed(2))
        const lowMultiplier = variation.modelLowMultiplier ?? variation.avgMultiplier * 0.72
        const highMultiplier = variation.modelHighMultiplier ?? variation.avgMultiplier * 1.38
        const releaseEvidenceTier = variation.modelEvidence ?? (isBaseVariation(variation.variation) ? 'observed' : 'indicative')
        const evidenceTier = directSupportsLane
          ? 'observed'
          : baseSupportsCurve
            ? releaseEvidenceTier
            : 'indicative'
        const intervalScale = curvePrice > 0 ? lanePrice / curvePrice : 1
        const effectiveMultiplier = baseEstimate.price > 0 ? price / baseEstimate.price : variation.avgMultiplier
        return {
          key: variationKey(variation.variation),
          label: variation.variation,
          multiplier: Number(effectiveMultiplier.toFixed(4)),
          price,
          sortOrder: variation.sortOrder ?? null,
          synthesizedBase: Boolean('synthesizedBase' in variation && variation.synthesizedBase),
          confidence: Math.min(
            laneEstimate?.confidence ?? variation.modelConfidence ?? (evidenceTier === 'observed' ? 0.82 : evidenceTier === 'modeled' ? 0.62 : 0.36),
            baseSupportsCurve || directSupportsLane ? 1 : 0.42,
          ),
          evidenceTier,
          actionable: directSupportsLane || (baseSupportsCurve && (variation.modelActionable ?? releaseEvidenceTier !== 'indicative')),
          lowPrice: Number((baseEstimate.low * lowMultiplier * intervalScale).toFixed(2)),
          highPrice: Number((baseEstimate.high * highMultiplier * intervalScale).toFixed(2)),
          empiricalEffectiveSales: (variation.empiricalEffectiveSales ?? 0) + directEffectiveSales,
        }
      })
      const topVariationPrice = ladder.reduce((max, quote) => Math.max(max, quote.price), baseEstimate.price)
      const searchText = searchKey([
        player.playerName,
        model.release,
        model.releaseYear,
        model.category,
        checklistTeam,
        currentTeam,
        currentTeamName,
        teamSearchText(currentTeam),
        player.team,
        stsRanking?.team,
        stsRanking?.pos,
        stsRanking?.level,
        ...ladder.map((quote) => quote.label),
      ]
        .join(' '))

      rowsWithoutRank.push({
        id: `${model.release}:${player.playerName}`,
        playerName: player.playerName,
        checklistTeam,
        currentTeam,
        currentTeamName,
        stsName: stsRanking?.name ?? null,
        stsTeam: stsRanking?.team ?? null,
        stsPosition: stsRanking?.pos ?? null,
        stsAge: stsRanking?.age ?? null,
        stsLevel: stsRanking?.level ?? null,
        stsRank: stsRanking?.rank ?? null,
        stsProspectRank: stsRanking?.prospectRank ?? null,
        stsDynastyScore: stsRanking ? scoreStsRanking(stsRanking) : null,
        stsMomentumScore: stsRanking ? scoreStsMomentum(stsRanking) : null,
        stsRiserValueScore: stsRanking && hasModelPrice ? scoreStsRiserValue(stsRanking, baseEstimate.price) : null,
        stsBinTargetScore: stsRanking && hasModelPrice ? scoreStsBinTarget(stsRanking, baseEstimate.price) : null,
        stsWar: stsRanking?.war ?? null,
        stsChange3d: stsRanking?.change3d ?? null,
        stsChange7d: stsRanking?.change7d ?? null,
        stsChange14d: stsRanking?.change14d ?? null,
        stsChange30d: stsRanking?.change30d ?? null,
        stsSummary: stsRanking?.summary ?? null,
        rankingSource: stsRanking?.source ?? null,
        oraclePlayerId: stsRanking?.oraclePlayerId ?? null,
        oracleMlbamId: stsRanking?.oracleMlbamId ?? null,
        oracleRoute: stsRanking?.oracleRoute ?? null,
        oracleRankLabel: stsRanking?.oracleRankLabel ?? null,
        oracleStageRank: stsRanking?.oracleStageRank ?? null,
        oracleServedProspectRank: stsRanking?.oracleRoute === 'milb' ? stsRanking.oracleStageRank : null,
        oracleRankUniverse: stsRanking?.oracleRankUniverse ?? null,
        bowmanProspectRank: null,
        oracleRankAvailability: stsRanking?.oracleRankAvailability ?? null,
        oracleRankTarget: stsRanking?.oracleRankTarget ?? null,
        oracleRankAsOf: stsRanking?.oracleRankAsOf ?? null,
        oracleRankModelVersion: stsRanking?.oracleRankModelVersion ?? null,
        oracleEvidenceTier: stsRanking?.oracleEvidenceTier ?? null,
        oracleVolatility: stsRanking?.oracleVolatility ?? null,
        oracleCareerOutlook: stsRanking?.oracleCareerOutlook ?? null,
        oracleCareerOutlookBand: stsRanking?.oracleCareerOutlookBand ?? null,
        oracleCareerOutlookBasis: stsRanking?.oracleCareerOutlookBasis ?? null,
        oracleCareerOutlookAsOf: stsRanking?.oracleCareerOutlookAsOf ?? null,
        oracleCareerOutlookModelVersion: stsRanking?.oracleCareerOutlookModelVersion ?? null,
        oracleRecordVersion: stsRanking?.oracleRecordVersion ?? null,
        oracleSnapshotId: stsRanking?.oracleSnapshotId ?? null,
        oracleSchemaVersion: stsRanking?.oracleSchemaVersion ?? null,
        oracleContractVersion: stsRanking?.oracleContractVersion ?? null,
        oracleMatchMethod: stsRanking?.oracleMatchMethod ?? null,
        release: model.release,
        releaseYear: model.releaseYear,
        category: model.category,
        baseTwmaPrice: baseEstimate.price,
        pulseBasePrice: player.baseAvgPrice,
        baseSales: hasModelPrice ? player.baseSalesCount : 0,
        rawBaseSales: baseEstimate.rawSales,
        baseSales30: baseEstimate.sales30,
        baseSales90: baseEstimate.sales90,
        baseAuctionSales: baseEstimate.auctionSales,
        baseBinSales: baseEstimate.binSales,
        baseUnknownSales: baseEstimate.unknownSales,
        baseEffectiveSales: baseEstimate.effectiveSales,
        baseVolatility: baseEstimate.volatility,
        basePriceSource: baseEstimate.source,
        baseConfidence: baseEstimate.confidence,
        latestBaseSaleAt: baseEstimate.latestSaleAt,
        baseMethod: baseEstimate.methodLabel,
        topVariationPrice,
        variationCount: ladder.length,
        ladder,
        searchText,
      })
    }
  }

  const oracleProspectsByIdentity = new Map<string, (typeof rowsWithoutRank)[number]>()
  for (const row of rowsWithoutRank) {
    if (row.oracleRoute !== 'milb' || row.oracleServedProspectRank === null) continue
    const identity = row.oracleMlbamId || row.oraclePlayerId
    if (!identity) continue
    const current = oracleProspectsByIdentity.get(identity)
    if (
      !current ||
      row.oracleServedProspectRank < (current.oracleServedProspectRank ?? Number.POSITIVE_INFINITY) ||
      (row.oracleServedProspectRank === current.oracleServedProspectRank &&
        (row.oracleCareerOutlook ?? -1) > (current.oracleCareerOutlook ?? -1))
    ) {
      oracleProspectsByIdentity.set(identity, row)
    }
  }
  const bowmanProspectRankByIdentity = new Map(
    [...oracleProspectsByIdentity.entries()]
      .sort(([, left], [, right]) =>
        (left.oracleServedProspectRank ?? Number.POSITIVE_INFINITY) -
          (right.oracleServedProspectRank ?? Number.POSITIVE_INFINITY) ||
        (right.oracleCareerOutlook ?? -1) - (left.oracleCareerOutlook ?? -1) ||
        left.playerName.localeCompare(right.playerName),
      )
      .map(([identity], index) => [identity, index + 1]),
  )

  const rows = rowsWithoutRank
    .map((row) => ({
      ...row,
      bowmanProspectRank: bowmanProspectRankByIdentity.get(row.oracleMlbamId || row.oraclePlayerId || '') ?? null,
    }))
    .sort((left, right) => right.baseTwmaPrice - left.baseTwmaPrice || right.topVariationPrice - left.topVariationPrice)
    .map((row, index) => ({ ...row, rank: index + 1 }))
  const stsMatchedRows = rows.filter((row) => row.stsName).length
  const stsProspectRows = rows.filter((row) => row.oracleServedProspectRank ?? row.stsProspectRank).length

  return {
    rows,
    summaries: summaries.sort((left, right) => right.releaseYear - left.releaseYear || left.release.localeCompare(right.release)),
    totalResolvedCells: summaries.reduce((total, summary) => total + summary.resolvedCells, 0),
    totalPlayers: summaries.reduce((total, summary) => total + summary.players, 0),
    totalPricedPlayers: summaries.reduce((total, summary) => total + summary.pricedPlayers, 0),
    totalVariations: summaries.reduce((total, summary) => total + summary.variations, 0),
    missingBaseRows: summaries.reduce((total, summary) => total + summary.missingBaseRows, 0),
    unresolvedMultipliers,
    maxVariationCount: summaries.reduce((max, summary) => Math.max(max, summary.variations), 0),
    weightedBaseRows: summaries.reduce((total, summary) => total + summary.weightedBaseRows, 0),
    blendedBaseRows: summaries.reduce((total, summary) => total + summary.blendedBaseRows, 0),
    impliedBaseRows: summaries.reduce((total, summary) => total + summary.impliedBaseRows, 0),
    fallbackBaseRows: summaries.reduce((total, summary) => total + summary.fallbackBaseRows, 0),
    stsMatchedRows,
    stsProspectRows,
  }
}

export function filterPricingRows(rows: PricingRow[], query: string) {
  const tokens = searchKey(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (tokens.length === 0) return rows
  return rows.filter((row) => tokens.every((token) => row.searchText.includes(token)))
}

export function pickPreviewQuotes(ladder: VariationQuote[], count = 6) {
  if (ladder.length <= count) return ladder
  const lastIndex = ladder.length - 1
  const indexes = [0, 0.2, 0.4, 0.6, 0.8, 1].map((position) => Math.round(position * lastIndex))
  return [...new Set(indexes)].map((index) => ladder[index]).filter(Boolean)
}
