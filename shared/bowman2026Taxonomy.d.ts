export interface Bowman2026AutoVariationDefinition {
  readonly id: string
  readonly label: string
  readonly productFamily: 'Bowman Chrome'
  readonly cardClass: 'auto'
  readonly serialDenominator: number | null
  readonly printRun: number | null
  readonly priorMultiplier: number
  readonly priorReliability: number
  readonly scarcityOrder: number
  readonly aliases: readonly string[]
}

export type Bowman2026AutoResolutionStatus = 'matched' | 'ambiguous' | 'conflict' | 'out-of-scope' | 'unknown'

export interface Bowman2026AutoResolution {
  readonly definition: Bowman2026AutoVariationDefinition | null
  readonly status: Bowman2026AutoResolutionStatus
  readonly confidence: number
  readonly serialDenominator: number | null
  readonly reasons: readonly string[]
  readonly modelEligible: boolean
}

export const BOWMAN_2026_CHROME_AUTO_VARIATIONS: readonly Bowman2026AutoVariationDefinition[]
export function extractSerialDenominator(title: string): number | null
export function bowman2026AutoDefinition(value: string | { id: string } | null | undefined): Bowman2026AutoVariationDefinition | null
export function canonicalizeBowman2026AutoVariation(
  title: string,
  options?: { playerName?: string; assumeAuto?: boolean },
): Bowman2026AutoResolution
export function canonicalizeBowman2026AutoLabel(value: string, options?: { playerName?: string; assumeAuto?: boolean }): string | null
export function isOfficialBowman2026ChromeAutoLabel(value: string): boolean
export function sortBowman2026AutoLabels(left: string, right: string): number

