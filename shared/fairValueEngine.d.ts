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

export const FAIR_VALUE_MODEL_VERSION: 'backstop-fv-v3'
export const BASE_FAIR_VALUE_POLICY: Readonly<{
  halfLifeDays: 10
  maxSales: 10
  enableTrend: true
  intervalProcessNoise: 0.15
}>
export const VARIATION_FAIR_VALUE_POLICY: Readonly<{
  ratioHalfLifeDays: 28
  ratioMedianBlend: 0.2
  directHalfLifeDays: 28
  directMedianBlend: 0.2
  directMaxSales: 10
  priorFloor: 2
  priorReliabilityScale: 4
  releaseEvidenceCap: 14
  releaseEvidenceScale: 1
  playerEvidenceCap: 5
  playerEvidenceScale: 0.9
  curveWeight: 6
  directEvidenceCap: 7
  directEvidenceScale: 0.8
}>

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
  options?: { asOf?: number; halfLifeDays?: number; maxSales?: number | null; enableTrend?: boolean; intervalProcessNoise?: number },
): FairValueEstimate | null
export function estimateBaseFairValue(
  sales: readonly FairValueSale[],
  options?: { asOf?: number; halfLifeDays?: number; maxSales?: number | null; enableTrend?: boolean; intervalProcessNoise?: number },
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
  empiricalWeight: number
  releasePlayers: number
  evidenceTier: 'observed' | 'modeled' | 'indicative'
  actionable: boolean
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
  empiricalEffectiveN: number
  evidenceTier: 'observed' | 'modeled' | 'indicative'
  actionable: boolean
  method: string
} | null
