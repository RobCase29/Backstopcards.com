export interface HistoricalBowmanAutoProfile {
  id: string
  label: string
  factor: number
  defaultDenominator: number | null
}

export interface HistoricalBowmanAutoDefinition {
  identity: string
  label: string
  profile: HistoricalBowmanAutoProfile
  serialDenominator: number | null
  inferredDenominator: boolean
  registryClass: 'base' | 'standard' | 'release-confirmed'
  modelEligible: boolean
}

export interface HistoricalBowmanAutoResolution {
  definition: HistoricalBowmanAutoDefinition | null
  status: 'matched' | 'out-of-scope' | 'ambiguous' | 'unknown'
  confidence: number
  reasons: readonly string[]
  modelEligible: boolean
}

export function standardBowmanAutoMultiplier(serialDenominator: number): number | null
export function historicalBowmanAutoPrior(
  value: string | HistoricalBowmanAutoDefinition | HistoricalBowmanAutoResolution,
): { multiplier: number; reliability: number; source: 'cross-release-structure'; identity: string } | null
export function canonicalizeHistoricalBowmanAutoVariation(
  title: string,
  options?: { playerName?: string; assumeAuto?: boolean },
): HistoricalBowmanAutoResolution
export function canonicalizeHistoricalBowmanAutoLabel(
  value: string,
  options?: { playerName?: string; assumeAuto?: boolean },
): string | null
