import type { ChecklistModel, ChecklistPlayer, ChecklistSale, ChecklistVariation } from '../types'
import { findStsRanking, scoreStsBinTarget, scoreStsMomentum, scoreStsRanking, scoreStsRiserValue } from './stsRankings'
import { normalizeTeamCode, teamDisplayName, teamSearchText } from './teams'

export type BasePriceSource = 'weighted-sales' | 'blended-sales' | 'variation-implied' | 'twma-fallback' | 'unpriced'
export type SaleChannel = 'auction' | 'bin' | 'unknown'

interface RobustEstimate {
  value: number
  effectiveN: number
  count: number
  volatility: number
}

export interface BaseSalePoint {
  price: number
  soldAt: number
  channel: SaleChannel
}

export interface BasePriceEstimate {
  price: number
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
  return modelKey(value) || value.toLowerCase().trim()
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

function logVolatility(sales: BaseSalePoint[]) {
  if (sales.length <= 1) return 0
  const logs = sales.map((sale) => Math.log(sale.price))
  const center = median(logs)
  const absoluteDeviations = logs.map((value) => Math.abs(value - center))
  const mad = median(absoluteDeviations)
  return mad > 0 ? Math.min(1, mad * 1.4826) : Math.min(1, standardDeviation(logs))
}

function robustTimeWeightedEstimate(sales: BaseSalePoint[], asOf: number, halfLifeDays: number): RobustEstimate | null {
  if (sales.length === 0) return null
  const logs = sales.map((sale) => Math.log(sale.price))
  const center = median(logs)
  const volatility = logVolatility(sales)
  const fallbackSigma = standardDeviation(logs)
  const sigma = volatility > 0 ? volatility : fallbackSigma
  const clipWidth = sales.length >= 5 && sigma > 0 ? Math.max(0.2, sigma * 2.35) : Number.POSITIVE_INFINITY
  const weighted = sales.map((sale) => {
    const logPrice = Math.log(sale.price)
    const clippedLogPrice = Math.min(center + clipWidth, Math.max(center - clipWidth, logPrice))
    const weight = Math.pow(0.5, ageDays(sale.soldAt, asOf) / halfLifeDays)
    return { logPrice: clippedLogPrice, weight }
  })
  const totalWeight = weighted.reduce((total, sale) => total + sale.weight, 0)
  const squaredWeight = weighted.reduce((total, sale) => total + sale.weight ** 2, 0)
  if (totalWeight <= 0 || squaredWeight <= 0) return null
  const weightedLogPrice = weighted.reduce((total, sale) => total + sale.logPrice * sale.weight, 0) / totalWeight
  return {
    value: Math.exp(weightedLogPrice),
    effectiveN: totalWeight ** 2 / squaredWeight,
    count: sales.length,
    volatility,
  }
}

function blendLog(values: Array<{ value: number | null | undefined; weight: number }>) {
  const usable = values.filter((item) => isFinitePositive(item.value) && item.weight > 0)
  const totalWeight = usable.reduce((total, item) => total + item.weight, 0)
  if (totalWeight <= 0) return null
  const blendedLog = usable.reduce((total, item) => total + Math.log(item.value as number) * item.weight, 0) / totalWeight
  return Math.exp(blendedLog)
}

function channelEstimate(sales: BaseSalePoint[], asOf: number): RobustEstimate | null {
  const auctionSales = sales.filter((sale) => sale.channel === 'auction')
  const binSales = sales.filter((sale) => sale.channel === 'bin')
  if (auctionSales.length < 2 || binSales.length < 2) return null

  const auction = robustTimeWeightedEstimate(auctionSales, asOf, 35)
  const bin = robustTimeWeightedEstimate(binSales, asOf, 35)
  if (!auction || !bin) return null

  const auctionWeight = 0.58 + clamp((auction.effectiveN - bin.effectiveN) / 24, -0.08, 0.08)
  const binWeight = 1 - auctionWeight
  const blended = blendLog([
    { value: auction.value, weight: auctionWeight },
    { value: bin.value, weight: binWeight },
  ])
  if (!blended) return null

  return {
    value: blended,
    effectiveN: auction.effectiveN + bin.effectiveN,
    count: auction.count + bin.count,
    volatility: Math.max(auction.volatility, bin.volatility, Math.abs(Math.log(bin.value / auction.value)) / 2),
  }
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
  const sales180 = sales.filter((sale) => ageDays(sale.soldAt, asOf) <= 180)
  const auctionSales = sales.filter((sale) => sale.channel === 'auction').length
  const binSales = sales.filter((sale) => sale.channel === 'bin').length
  const unknownSales = Math.max(0, sales.length - auctionSales - binSales)
  const weighted30 = robustTimeWeightedEstimate(sales30, asOf, 12)
  const weighted90 = robustTimeWeightedEstimate(sales90, asOf, 30)
  const weighted180 = robustTimeWeightedEstimate(sales180.length ? sales180 : sales, asOf, 60)
  const channel = channelEstimate(sales90.length ? sales90 : sales, asOf)
  const latestSaleAt = sales[0] ? new Date(sales[0].soldAt).toISOString() : null
  const latestAge = sales[0] ? ageDays(sales[0].soldAt, asOf) : Number.POSITIVE_INFINITY
  const effectiveSales = Math.max(weighted30?.effectiveN ?? 0, weighted90?.effectiveN ?? 0, weighted180?.effectiveN ?? 0)
  const volatility = Math.max(weighted90?.volatility ?? 0, channel?.volatility ?? 0, weighted180?.volatility ?? 0)

  const evidence = Math.min(18, (weighted90?.effectiveN ?? 0) + Math.min(sales30.length, 8) * 0.35)
  const fallbackWeight = fallbackPrice ? Math.max(0.06, 0.52 * Math.exp(-evidence / 4.5)) : 0
  const blended = blendLog([
    { value: weighted30?.value, weight: weighted30 ? clamp(weighted30.effectiveN / 9, 0.12, 0.42) : 0 },
    { value: weighted90?.value, weight: weighted90 ? clamp(weighted90.effectiveN / 14, 0.1, 0.32) : 0 },
    { value: weighted180?.value, weight: weighted180 ? clamp(weighted180.effectiveN / 28, 0.04, 0.16) : 0 },
    { value: channel?.value, weight: channel ? clamp(channel.effectiveN / 18, 0.08, 0.28) : 0 },
    { value: fallbackPrice, weight: fallbackWeight },
  ])

  const recencyScore = latestAge <= 14 ? 0.08 : latestAge <= 45 ? 0.04 : latestAge <= 90 ? 0 : -0.08
  const channelScore = auctionSales > 0 && binSales > 0 ? 0.06 : auctionSales + binSales > 0 ? 0.025 : 0
  const sampleScore = Math.min(effectiveSales, 14) / 24 + Math.min(sales30.length, 10) / 55
  const volatilityPenalty = Math.min(0.22, volatility * 0.28)
  const confidenceCeiling = sales30.length >= 6 ? 0.94 : sales90.length >= 4 ? 0.84 : 0.74
  const confidence = clamp(0.4 + sampleScore + channelScore + recencyScore - volatilityPenalty, 0.34, confidenceCeiling)

  if (blended && sales.length > 0) {
    const methodParts = [
      channel ? 'auction/BIN channel blend' : sales30.length >= 3 ? 'robust recency ensemble' : 'thin sales shrinkage',
      `${Number(effectiveSales.toFixed(1))} eff`,
    ]
    return {
      price: Number(blended.toFixed(2)),
      source: sales30.length >= 6 ? 'weighted-sales' : 'blended-sales',
      confidence,
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
      methodLabel: methodParts.join(' / '),
    }
  }

  return {
    price: Number(fallbackPrice.toFixed(2)),
    source: 'twma-fallback',
    confidence: Math.min(0.72, 0.42 + Math.min(summarySales, 18) / 55),
    rawSales: summarySales,
    sales30: sales30.length,
    sales90: sales90.length,
    auctionSales,
    binSales,
    unknownSales,
    effectiveSales: Number(Math.max(effectiveSales, Math.min(summarySales, 18) * 0.42).toFixed(2)),
    volatility: Number(volatility.toFixed(3)),
    latestSaleAt,
    fallbackPrice,
    methodLabel: sales.length > 0 ? 'thin sales fallback' : summarySales > 0 ? 'cached comp summary' : 'baseline average',
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
      const releaseMultiplier = releaseVariation && !isBaseVariation(releaseVariation.variation) ? releaseVariation.avgMultiplier : null
      const playerMultiplier = !isBaseVariation(variation.variation) ? variation.multiplier : null
      const multiplier = isFinitePositive(releaseMultiplier) ? releaseMultiplier : isFinitePositive(playerMultiplier) ? playerMultiplier : null
      if (!isFinitePositive(multiplier) || multiplier <= 1) return null
      const numericAvgPrice = avgPrice
      const numericMultiplier = multiplier

      const salesCount = Math.max(1, Math.min(12, variation.salesCount ?? releaseVariation?.totalSales ?? 1))
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
      }
    })
    .filter((point): point is { value: number; label: string; weight: number; salesCount: number } => Boolean(point))

  if (points.length === 0) return null

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
  const totalSales = points.reduce((total, point) => total + point.salesCount, 0)
  const confidence = clamp(0.28 + Math.min(totalWeight, 7) / 22 + Math.min(points.length, 4) * 0.035, 0.3, 0.58)
  const labels = [...new Set(points.map((point) => point.label))].slice(0, 3).join(', ')

  return {
    price: Number(price.toFixed(2)),
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

  for (const variation of model.multipliers) {
    if (!isFinitePositive(variation.avgMultiplier)) {
      unresolvedMultipliers += 1
      continue
    }

    const key = variationKey(variation.variation)
    const current =
      buckets.get(key) ??
      {
        label: variation.variation,
        multipliers: [],
        sortOrders: [],
        playerCounts: [],
        totalSales: 0,
        synthesizedBase: false,
      }

    current.label = current.label.length <= variation.variation.length ? current.label : variation.variation
    current.multipliers.push(variation.avgMultiplier)
    if (finiteSortOrder(variation.sortOrder) !== null) current.sortOrders.push(variation.sortOrder as number)
    if (isFinitePositive(variation.playerCount)) current.playerCounts.push(variation.playerCount as number)
    if (isFinitePositive(variation.totalSales)) current.totalSales += variation.totalSales as number
    buckets.set(key, current)
  }

  if (![...buckets.keys()].some((key) => key === 'base')) {
    buckets.set('base', {
      label: 'Base Auto',
      multipliers: [1],
      sortOrders: [-1],
      playerCounts: [model.players.length],
      totalSales: model.players.reduce((total, player) => total + Math.max(0, player.baseSalesCount || 0), 0),
      synthesizedBase: true,
    })
  }

  const variations = [...buckets.values()]
    .map<ChecklistVariation & { synthesizedBase?: boolean }>((bucket) => ({
      variation: bucket.label,
      avgMultiplier: average(bucket.multipliers),
      playerCount: bucket.playerCounts.length ? Math.max(...bucket.playerCounts) : undefined,
      totalSales: bucket.totalSales || undefined,
      sortOrder: bucket.sortOrders.length ? Math.min(...bucket.sortOrders) : null,
      synthesizedBase: bucket.synthesizedBase,
    }))
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
      const stsRanking = findStsRanking(player.playerName)
      const checklistTeam = normalizeTeamCode(player.team) || null
      const currentTeam = normalizeTeamCode(stsRanking?.team) || checklistTeam || null
      const currentTeamName = currentTeam ? teamDisplayName(currentTeam) : null
      const ladder = variations.map<VariationQuote>((variation) => {
        const price = Number((baseEstimate.price * variation.avgMultiplier).toFixed(2))
        return {
          key: variationKey(variation.variation),
          label: variation.variation,
          multiplier: variation.avgMultiplier,
          price,
          sortOrder: variation.sortOrder ?? null,
          synthesizedBase: Boolean('synthesizedBase' in variation && variation.synthesizedBase),
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

  const rows = rowsWithoutRank
    .sort((left, right) => right.baseTwmaPrice - left.baseTwmaPrice || right.topVariationPrice - left.topVariationPrice)
    .map((row, index) => ({ ...row, rank: index + 1 }))
  const stsMatchedRows = rows.filter((row) => row.stsName).length
  const stsProspectRows = rows.filter((row) => row.stsProspectRank).length

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
