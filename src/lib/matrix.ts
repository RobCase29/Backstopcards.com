import type { ChecklistModel, ChecklistPlayer, ChecklistSale, ChecklistVariation } from '../types'

export type BasePriceSource = 'weighted-sales' | 'blended-sales' | 'twma-fallback'

export interface BaseSalePoint {
  price: number
  soldAt: number
}

export interface BasePriceEstimate {
  price: number
  source: BasePriceSource
  confidence: number
  rawSales: number
  sales30: number
  sales90: number
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
  release: string
  releaseYear: number
  category: ChecklistModel['category']
  baseTwmaPrice: number
  pulseBasePrice: number
  baseSales: number
  rawBaseSales: number
  baseSales30: number
  baseSales90: number
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
  fallbackBaseRows: number
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

function salePrice(sale: ChecklistSale) {
  return numberValue(sale.salePrice ?? sale.sale_price ?? sale.price ?? sale.amount ?? sale.value)
}

function saleTimestamp(sale: ChecklistSale) {
  const value = sale.saleDate ?? sale.sale_date ?? sale.soldAt ?? sale.sold_at ?? sale.date ?? sale.created_at
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function isFinitePositive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
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
      return { price, soldAt }
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

function robustWeightedAverage(sales: BaseSalePoint[], asOf: number, halfLifeDays: number) {
  if (sales.length === 0) return null
  const sorted = [...sales].sort((left, right) => left.price - right.price)
  const trimCount = sorted.length >= 10 ? Math.floor(sorted.length * 0.1) : 0
  const trimmed = trimCount > 0 ? sorted.slice(trimCount, sorted.length - trimCount) : sorted
  const weighted = trimmed.map((sale) => ({
    value: sale.price,
    weight: Math.pow(0.5, ageDays(sale.soldAt, asOf) / halfLifeDays),
  }))
  const totalWeight = weighted.reduce((total, sale) => total + sale.weight, 0)
  if (totalWeight <= 0) return null
  return weighted.reduce((total, sale) => total + sale.value * sale.weight, 0) / totalWeight
}

function blend(values: Array<{ value: number | null; weight: number }>) {
  const usable = values.filter((item) => isFinitePositive(item.value) && item.weight > 0)
  const totalWeight = usable.reduce((total, item) => total + item.weight, 0)
  if (totalWeight <= 0) return null
  return usable.reduce((total, item) => total + (item.value as number) * item.weight, 0) / totalWeight
}

export function estimateBasePrice(player: ChecklistPlayer, asOf = Date.now()): BasePriceEstimate {
  const fallbackPrice = isFinitePositive(player.baseAvgPrice) ? player.baseAvgPrice : 0
  const sales = extractBaseSales(player, asOf)
  const sales30 = sales.filter((sale) => ageDays(sale.soldAt, asOf) <= 30)
  const sales90 = sales.filter((sale) => ageDays(sale.soldAt, asOf) <= 90)
  const weighted30 = robustWeightedAverage(sales30, asOf, 14)
  const weighted90 = robustWeightedAverage(sales90, asOf, 28)
  const latestSaleAt = sales[0] ? new Date(sales[0].soldAt).toISOString() : null

  if (sales30.length >= 6 && weighted30) {
    return {
      price: Number(weighted30.toFixed(2)),
      source: 'weighted-sales',
      confidence: Math.min(0.94, 0.78 + Math.min(sales30.length, 12) / 75),
      rawSales: sales.length,
      sales30: sales30.length,
      sales90: sales90.length,
      latestSaleAt,
      fallbackPrice,
      methodLabel: '30d weighted',
    }
  }

  if (sales30.length >= 3 && weighted30) {
    const blended = blend([
      { value: weighted30, weight: 0.7 },
      { value: weighted90, weight: 0.2 },
      { value: fallbackPrice, weight: fallbackPrice ? 0.1 : 0 },
    ])

    if (blended) {
      return {
        price: Number(blended.toFixed(2)),
        source: 'blended-sales',
        confidence: Math.min(0.84, 0.64 + sales30.length / 40 + Math.min(sales90.length, 12) / 100),
        rawSales: sales.length,
        sales30: sales30.length,
        sales90: sales90.length,
        latestSaleAt,
        fallbackPrice,
        methodLabel: '30d/90d blend',
      }
    }
  }

  if (sales90.length >= 4 && weighted90) {
    const blended = blend([
      { value: weighted90, weight: 0.7 },
      { value: fallbackPrice, weight: fallbackPrice ? 0.3 : 0 },
    ])

    if (blended) {
      return {
        price: Number(blended.toFixed(2)),
        source: 'blended-sales',
        confidence: Math.min(0.74, 0.54 + Math.min(sales90.length, 12) / 80),
        rawSales: sales.length,
        sales30: sales30.length,
        sales90: sales90.length,
        latestSaleAt,
        fallbackPrice,
        methodLabel: '90d/fallback blend',
      }
    }
  }

  return {
    price: Number(fallbackPrice.toFixed(2)),
    source: 'twma-fallback',
    confidence: Math.min(0.68, 0.42 + Math.min(player.baseSalesCount || 0, 14) / 55),
    rawSales: sales.length,
    sales30: sales30.length,
    sales90: sales90.length,
    latestSaleAt,
    fallbackPrice,
    methodLabel: sales.length > 0 ? 'thin sales fallback' : 'ProspectPulse TWMA',
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

    const pricedEntries = model.players
      .map((player) => ({ player, estimate: estimateBasePrice(player, asOf) }))
      .filter(({ estimate }) => isFinitePositive(estimate.price))
    const pricedPlayers = pricedEntries.map(({ player }) => player)
    const missingBaseRows = Math.max(0, model.players.length - pricedEntries.length)
    const multipliers = variations.map((variation) => variation.avgMultiplier).filter(isFinitePositive)
    const weightedBaseRows = pricedEntries.filter(({ estimate }) => estimate.source === 'weighted-sales').length
    const blendedBaseRows = pricedEntries.filter(({ estimate }) => estimate.source === 'blended-sales').length
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
      fallbackBaseRows,
    })

    for (const { player, estimate: baseEstimate } of pricedEntries) {
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
      const searchText = [player.playerName, model.release, model.releaseYear, model.category, ...ladder.map((quote) => quote.label)]
        .join(' ')
        .toLowerCase()

      rowsWithoutRank.push({
        id: `${model.release}:${player.playerName}`,
        playerName: player.playerName,
        release: model.release,
        releaseYear: model.releaseYear,
        category: model.category,
        baseTwmaPrice: baseEstimate.price,
        pulseBasePrice: player.baseAvgPrice,
        baseSales: player.baseSalesCount,
        rawBaseSales: baseEstimate.rawSales,
        baseSales30: baseEstimate.sales30,
        baseSales90: baseEstimate.sales90,
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
    fallbackBaseRows: summaries.reduce((total, summary) => total + summary.fallbackBaseRows, 0),
  }
}

export function filterPricingRows(rows: PricingRow[], query: string) {
  const tokens = query
    .trim()
    .toLowerCase()
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
