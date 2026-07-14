import type { BasePriceSource } from './matrix'
import type { OracleRankingRoute, StsRankingSource } from './stsRankings'

export interface DynastyValueInput {
  stsRank: number | null
  stsProspectRank: number | null
  stsDynastyScore: number | null
  stsMomentumScore: number | null
  stsRiserValueScore: number | null
  stsAge: number | null
  stsLevel: string | null
  rankingSource?: StsRankingSource | null
  oracleRoute?: OracleRankingRoute | null
  oracleStageRank?: number | null
  oracleRankUniverse?: number | null
  oracleRankAvailability?: string | null
  oracleEvidenceTier?: string | null
  oracleVolatility?: string | null
  oracleCareerOutlook?: number | null
  baseTwmaPrice: number
  baseEffectiveSales: number
  baseVolatility: number
  baseConfidence: number
  basePriceSource: BasePriceSource
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function rankPercentile(rank: number | null, maxRank: number) {
  if (!rank || rank <= 0) return 0
  return clamp(1 - Math.log(rank) / Math.log(maxRank + 1), 0, 1)
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
  if (source === 'unpriced') return -12
  return -5
}

function rankingCoverage(row: DynastyValueInput) {
  return (
    row.stsRank !== null ||
    row.stsProspectRank !== null ||
    row.stsDynastyScore !== null ||
    typeof row.oracleStageRank === 'number' ||
    typeof row.oracleCareerOutlook === 'number'
  )
}

function oracleEvidenceReliability(row: DynastyValueInput) {
  const evidence =
    row.oracleEvidenceTier === 'completed_season_full_model'
      ? 1
      : row.oracleEvidenceTier === 'completed_season_prior'
        ? 0.94
        : row.oracleEvidenceTier === 'live_in_season_prior'
          ? 0.84
          : 0.9
  const volatility = row.oracleVolatility === 'very_high' ? 0.9 : row.oracleVolatility === 'high' ? 0.95 : 1
  const availability = row.oracleRankAvailability === 'insufficient_sample' ? 0.94 : 1
  return evidence * volatility * availability
}

function formulatedRankQuality(row: DynastyValueInput) {
  const hasOracleStageRank =
    (row.oracleRoute === 'milb' || row.oracleRoute === 'rookie') &&
    row.oracleStageRank !== null &&
    row.oracleStageRank !== undefined
  if (row.rankingSource === 'baseball-oracle' && hasOracleStageRank) {
    const rankQuality = rankPercentile(row.oracleStageRank ?? null, Math.max(2, row.oracleRankUniverse ?? 6_500))
    const careerQuality =
      row.oracleCareerOutlook !== null && row.oracleCareerOutlook !== undefined
        ? clamp(row.oracleCareerOutlook / 100, 0, 1)
        : row.stsDynastyScore !== null
          ? clamp(row.stsDynastyScore / 100, 0, 1)
          : rankQuality
    return clamp((rankQuality * 0.72 + careerQuality * 0.28) * oracleEvidenceReliability(row), 0, 1)
  }

  const dynastyQuality = row.stsDynastyScore !== null ? clamp(row.stsDynastyScore / 100, 0, 1) : rankPercentile(row.stsRank, 7_500)
  const overallQuality = rankPercentile(row.stsRank, 7_500)
  const prospectQuality = rankPercentile(row.stsProspectRank, 3_600)
  const hasProspectRank = row.stsProspectRank !== null
  const hasOverallRank = row.stsRank !== null

  if (hasProspectRank && hasOverallRank) {
    return clamp(dynastyQuality * 0.45 + prospectQuality * 0.35 + overallQuality * 0.2, 0, 1)
  }
  if (hasProspectRank) return clamp(dynastyQuality * 0.18 + prospectQuality * 0.82, 0, 1)
  return clamp(dynastyQuality * 0.72 + overallQuality * 0.28, 0, 1)
}

function momentumMultiplier(row: DynastyValueInput) {
  const momentum = row.stsMomentumScore ?? 50
  const riser = row.stsRiserValueScore ?? 0
  const momentumBoost = clamp((momentum - 50) / 50, -0.3, 0.65)
  const riserBoost = clamp(riser / 100, 0, 0.35)
  return clamp(1 + momentumBoost * 0.28 + riserBoost * 0.22, 0.82, 1.32)
}

function ageMultiplier(age: number | null) {
  if (!age) return 1
  if (age <= 18.5) return 1.16
  if (age <= 20) return 1.1
  if (age <= 21.5) return 1.04
  if (age <= 23) return 1
  if (age >= 25) return 0.9
  return 0.96
}

function levelMultiplier(level: string | null) {
  const normalized = level?.toUpperCase() ?? ''
  if (!normalized) return 1
  if (normalized === 'MLB') return 0.96
  if (normalized === 'AAA') return 1
  if (normalized === 'AA') return 1.03
  if (normalized === 'A+' || normalized === 'A') return 1.08
  if (normalized.includes('CPX') || normalized.includes('ROK')) return 1.1
  return 1
}

function liquidityScore(row: DynastyValueInput) {
  const salesScore = clamp(row.baseEffectiveSales / 8, 0, 1) * 7
  const confidenceScore = clamp(row.baseConfidence, 0, 1) * 7
  const volatilityPenalty = clamp(row.baseVolatility * 12, 0, 9)
  return salesScore + confidenceScore - volatilityPenalty + sourceAdjustment(row.basePriceSource)
}

function eliteAffordabilityBoost(row: DynastyValueInput, basePrice: number) {
  const isElite =
    ((row.oracleRoute === 'milb' || row.oracleRoute === 'rookie') &&
      row.oracleStageRank !== null &&
      row.oracleStageRank !== undefined &&
      row.oracleStageRank <= 10) ||
    (row.stsProspectRank !== null && row.stsProspectRank <= 10) ||
    (row.stsRank !== null && row.stsRank <= 12) ||
    (row.oracleCareerOutlook !== null && row.oracleCareerOutlook !== undefined && row.oracleCareerOutlook >= 88) ||
    (row.stsDynastyScore !== null && row.stsDynastyScore >= 88)

  const referencePrice = isElite ? 220 : 115
  const maxBoost = isElite ? 22 : 10
  const normalizedPrice = Math.max(10, basePrice)
  return clamp(Math.log(referencePrice / normalizedPrice) / Math.log(isElite ? 22 : 11.5), 0, 1) * maxBoost
}

function absoluteUpsideBoost(impliedBase: number, basePrice: number) {
  const dollarUpside = Math.max(0, impliedBase - basePrice)
  return clamp(dollarUpside / 900, 0, 1) * 16
}

export function impliedDynastyBasePrice(row: DynastyValueInput) {
  if (!rankingCoverage(row)) return 0
  const quality = formulatedRankQuality(row)
  const rawExpectedBase = 5.5 * Math.exp(quality * 5.28)
  const adjustedExpectedBase = rawExpectedBase * momentumMultiplier(row) * ageMultiplier(row.stsAge) * levelMultiplier(row.stsLevel)

  return Math.round(clamp(adjustedExpectedBase, 6, 1_800))
}

export function scoreDynastyValueOpportunity(row: DynastyValueInput) {
  if (!rankingCoverage(row)) return -1
  if (row.baseTwmaPrice <= 0 || row.basePriceSource === 'unpriced') return -1

  const basePrice = Math.max(1, row.baseTwmaPrice)
  const impliedBase = impliedDynastyBasePrice(row)
  const rankQuality = formulatedRankQuality(row)
  const positiveMomentum = Math.max(0, (row.stsMomentumScore ?? 50) - 50)
  const riserSignal = Math.max(0, row.stsRiserValueScore ?? 0)
  const valueRatio = impliedBase / basePrice
  const upsideGap = clamp(Math.log(Math.max(1, valueRatio)) / Math.log(30), 0, 1) * 54
  const qualityAdjustedValueGap = upsideGap * clamp(0.68 + rankQuality * 0.32, 0.62, 1)
  const downsidePenalty = valueRatio < 1 ? clamp(Math.log(1 / Math.max(0.08, valueRatio)) / Math.log(8), 0, 1) * 18 : 0
  const affordabilityBoost = eliteAffordabilityBoost(row, basePrice)
  const dollarUpsideBoost = absoluteUpsideBoost(impliedBase, basePrice)
  const thinMarketPenalty =
    basePrice < 12 && (row.baseEffectiveSales < 1 || row.baseConfidence < 0.35 || row.basePriceSource === 'twma-fallback')
      ? 18
      : basePrice < 18 && row.baseConfidence < 0.4
        ? 8
        : 0
  const priceRealityPenalty =
    basePrice < 8
      ? ((8 - basePrice) / 8) * 22
      : basePrice < 18
        ? ((18 - basePrice) / 10) * 6
        : basePrice > 350
          ? clamp(Math.log(basePrice / 350) / Math.log(4), 0, 1) * 10
          : 0

  const score =
    rankQuality * 30 +
    qualityAdjustedValueGap +
    affordabilityBoost +
    dollarUpsideBoost +
    positiveMomentum * 0.18 +
    riserSignal * 0.05 +
    ageUpside(row.stsAge) +
    levelUpside(row.stsLevel) +
    liquidityScore(row) * 0.36 -
    downsidePenalty -
    priceRealityPenalty -
    thinMarketPenalty

  return Number(clamp(score, 0, 100).toFixed(1))
}
