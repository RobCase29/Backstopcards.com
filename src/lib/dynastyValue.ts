import type { BasePriceSource } from './matrix'

export interface DynastyValueInput {
  stsRank: number | null
  stsProspectRank: number | null
  stsDynastyScore: number | null
  stsMomentumScore: number | null
  stsRiserValueScore: number | null
  stsAge: number | null
  stsLevel: string | null
  baseTwmaPrice: number
  baseEffectiveSales: number
  baseVolatility: number
  baseConfidence: number
  basePriceSource: BasePriceSource
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function rankScore(rank: number | null, maxRank: number) {
  if (!rank || rank <= 0) return 0
  return clamp(100 * (1 - Math.log(rank) / Math.log(maxRank + 1)))
}

function ageUpside(age: number | null) {
  if (!age) return 0
  if (age <= 18.5) return 8
  if (age <= 20) return 6
  if (age <= 21.5) return 3
  if (age <= 23) return 1
  if (age >= 25) return -4
  return 0
}

function levelUpside(level: string | null) {
  const normalized = level?.toUpperCase() ?? ''
  if (!normalized) return 0
  if (normalized === 'MLB') return -1
  if (normalized === 'AAA') return 1
  if (normalized === 'AA') return 2
  if (normalized === 'A+' || normalized === 'A') return 4
  if (normalized.includes('CPX') || normalized.includes('ROK')) return 5
  return 1
}

function sourceAdjustment(source: BasePriceSource) {
  if (source === 'weighted-sales') return 5
  if (source === 'blended-sales') return 3
  if (source === 'variation-implied') return 0
  return -5
}

export function impliedDynastyBasePrice(row: DynastyValueInput) {
  if (row.stsDynastyScore === null && row.stsRank === null) return 0
  const dynastySignal = row.stsDynastyScore ?? rankScore(row.stsRank, 7_500)
  const prospectSignal = rankScore(row.stsProspectRank, 3_600)
  const positiveMomentum = Math.max(0, (row.stsMomentumScore ?? 50) - 50)
  const signal =
    dynastySignal * 0.66 +
    prospectSignal * 0.18 +
    positiveMomentum * 0.5 +
    ageUpside(row.stsAge) +
    levelUpside(row.stsLevel)

  return Math.round(clamp(10 * Math.exp(signal / 20), 8, 1_500))
}

export function scoreDynastyValueOpportunity(row: DynastyValueInput) {
  if (row.stsDynastyScore === null && row.stsRank === null) return -1

  const basePrice = Math.max(1, row.baseTwmaPrice)
  const impliedBase = impliedDynastyBasePrice(row)
  const dynastySignal = row.stsDynastyScore ?? rankScore(row.stsRank, 7_500)
  const prospectSignal = rankScore(row.stsProspectRank, 3_600)
  const positiveMomentum = Math.max(0, (row.stsMomentumScore ?? 50) - 50)
  const riserSignal = Math.max(0, row.stsRiserValueScore ?? 0)
  const valueGap = clamp(Math.log(Math.max(0.12, impliedBase / basePrice)) / Math.log(4), -1, 1) * 34
  const marketQuality = clamp(row.baseEffectiveSales / 6, 0, 1) * 4 + clamp(row.baseConfidence, 0, 1) * 4
  const volatilityPenalty = clamp(row.baseVolatility * 14, 0, 8)
  const floorPenalty = basePrice < 8 ? ((8 - basePrice) / 8) * 18 : basePrice < 18 ? ((18 - basePrice) / 10) * 4 : 0
  const richPenalty = basePrice > 450 ? clamp(Math.log(basePrice / 450) / Math.log(3), 0, 1) * 10 : 0

  const score =
    dynastySignal * 0.5 +
    prospectSignal * 0.13 +
    positiveMomentum * 0.45 +
    riserSignal * 0.08 +
    ageUpside(row.stsAge) +
    levelUpside(row.stsLevel) +
    valueGap +
    marketQuality +
    sourceAdjustment(row.basePriceSource) -
    volatilityPenalty -
    floorPenalty -
    richPenalty

  return Number(Math.max(0, score).toFixed(1))
}
