import type { ChecklistModel, ChecklistVariation } from '../types'
import { bowman2026AutoDefinition, canonicalizeBowman2026AutoVariation } from '../../shared/bowman2026Taxonomy.js'
import { FAIR_VALUE_MODEL_VERSION } from '../../shared/fairValueEngine.js'

export { FAIR_VALUE_MODEL_VERSION }

type StabilizeReleaseMultiplierInput = {
  variation: string
  empiricalMultiplier: number
  releaseYear: number
  category: ChecklistModel['category']
  playerCount?: number | null
  totalSales?: number | null
  modelMethod?: string | null
}

export type StructuralVariationPrior = {
  multiplier: number
  reliability: number
  source: 'bowman-2026-structure'
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function isBaseLabel(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return normalized === 'base' || normalized === 'base auto' || normalized === 'base autograph'
}

export function structuralVariationPrior(
  variation: string,
  releaseYear: number,
  category: ChecklistModel['category'],
): StructuralVariationPrior | null {
  if (isBaseLabel(variation)) {
    return { multiplier: 1, reliability: 1, source: 'bowman-2026-structure' }
  }
  if (releaseYear !== 2026 || category !== 'bowman') return null
  const definition =
    bowman2026AutoDefinition(variation) ??
    canonicalizeBowman2026AutoVariation(variation, { assumeAuto: true }).definition
  if (!definition) return null
  return {
    multiplier: definition.priorMultiplier,
    reliability: definition.priorReliability,
    source: 'bowman-2026-structure',
  }
}

/**
 * Stabilizes legacy release-level ratios against the official release curve.
 * Proximity-calibrated v2 rows have already passed through the full hierarchy
 * during snapshot generation and are returned unchanged.
 */
export function stabilizeReleaseMultiplier(input: StabilizeReleaseMultiplierInput) {
  if (isBaseLabel(input.variation)) return 1
  const empirical = positive(input.empiricalMultiplier)
  const prior = structuralVariationPrior(input.variation, input.releaseYear, input.category)
  if (!prior) return empirical
  if (!empirical) return prior.multiplier
  if (input.modelMethod === 'hierarchical-proximity-v2') return empirical

  const playerCount = positive(input.playerCount)
  const totalSales = positive(input.totalSales)
  const breadth = clamp(playerCount / 18)
  const depth = clamp(Math.log1p(totalSales) / Math.log(181))
  const evidenceStrength = breadth * 0.42 + depth * 0.58

  // Guard the evidence before blending. Sparse or misclassified summaries can
  // still inform the curve, but cannot move it several octaves in one refresh.
  const maxLogDeviation = 0.32 + evidenceStrength * 0.58
  const empiricalLog = Math.log(empirical)
  const priorLog = Math.log(prior.multiplier)
  const guardedEmpiricalLog = clamp(empiricalLog, priorLog - maxLogDeviation, priorLog + maxLogDeviation)
  const priorWeight = 5 + prior.reliability * 8
  const empiricalWeight = evidenceStrength * (4 + (1 - prior.reliability) * 7)
  const totalWeight = priorWeight + empiricalWeight
  return Math.exp((priorLog * priorWeight + guardedEmpiricalLog * empiricalWeight) / totalWeight)
}

export function releaseVariationModelMethod(variation: ChecklistVariation) {
  return variation.modelMethod === 'hierarchical-proximity-v2'
    ? FAIR_VALUE_MODEL_VERSION
    : variation.modelMethod || 'stabilized-release-prior'
}
