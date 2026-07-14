export interface FairValueSale {
  price?: number
  salePrice?: number
  soldAt: string | number
  channel?: 'auction' | 'bin' | 'unknown' | string
  itemId?: string | null
  id?: string | null
  title?: string | null
  source?: string | null
  groupKey?: string | null
  playerName?: string | null
}

export const FAIR_VALUE_MODEL_VERSION: 'backstop-fv-v2'

export interface FairValueEstimate {
  value: number
  low: number
  high: number
  confidence: number
  effectiveN: number
  count: number
  auctionCount: number
  binCount: number
  volatility: number
  latestSoldAt: string
  weightedMedian: number
  trendPer30d: number
  trendStrength: number
  method: string
}

export function dedupeSales<T extends FairValueSale>(sales: readonly T[]): Array<T & { price: number; soldAt: number }>
export function robustFairValueEstimate(
  sales: readonly FairValueSale[],
  options?: { asOf?: number; halfLifeDays?: number; enableTrend?: boolean },
): FairValueEstimate | null
export function buildProximityRatioPoints(
  variationSales: readonly FairValueSale[],
  baseSales: readonly FairValueSale[],
  options?: { windowsDays?: number[] },
): FairValueSale[]
export function estimateHierarchicalMultiplier(options: {
  priorMultiplier: number
  priorReliability?: number
  asOf?: number
  releaseRatioPoints?: FairValueSale[]
  playerVariationSales?: FairValueSale[]
  playerBaseSales?: FairValueSale[]
}): {
  multiplier: number
  low: number
  high: number
  confidence: number
  priorMultiplier: number
  releaseMultiplier: number | null
  playerMultiplier: number | null
  effectiveN: number
  sources: string[]
  method: string
}
export function estimateLaneFairValue(options: {
  priorMultiplier: number
  priorReliability?: number
  asOf?: number
  releaseRatioPoints?: FairValueSale[]
  playerVariationSales?: FairValueSale[]
  playerBaseSales?: FairValueSale[]
  baseSales?: FairValueSale[]
  baseEstimate?: FairValueEstimate | null
  multiplierEstimate?: ReturnType<typeof estimateHierarchicalMultiplier>
}): {
  value: number
  low: number
  high: number
  confidence: number
  baseValue: number
  multiplier: number
  directValue: number | null
  directEffectiveN: number
  method: string
} | null
