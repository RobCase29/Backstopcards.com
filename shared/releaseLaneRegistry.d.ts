export interface ReleaseLaneCandidate {
  label: string
  playerKey?: string | null
  confidence?: number | null
  registryClass?: 'base' | 'official' | 'standard' | 'release-confirmed' | string | null
  explicitDenominator?: boolean
}

export interface ReleaseLaneRegistryEntry {
  label: string
  key: string
  registryClass: 'base' | 'official' | 'standard' | 'release-confirmed'
  accepted: boolean
  reason: string
  saleCount: number
  playerCount: number
  explicitDenominatorSales: number
  avgConfidence: number
}

export interface ReleaseLaneRegistry {
  lanes: readonly ReleaseLaneRegistryEntry[]
  acceptedLabels: ReadonlySet<string>
  acceptedCount: number
  quarantinedCount: number
  candidateCount: number
}

export const RELEASE_LANE_REGISTRY_POLICY: Readonly<Record<string, number>>

export function buildReleaseLaneRegistry(
  candidates: ReleaseLaneCandidate[],
  options?: {
    officialLabels?: string[]
    policy?: Partial<Record<string, number>>
  },
): ReleaseLaneRegistry
