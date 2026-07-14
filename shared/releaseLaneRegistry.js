const DEFAULT_POLICY = Object.freeze({
  standardMinExplicitSales: 1,
  standardMinPlayers: 2,
  standardMinSales: 3,
  releaseConfirmedMinPlayers: 2,
  releaseConfirmedMinExplicitSales: 2,
  releaseConfirmedMinSales: 4,
  releaseConfirmedMinConfidence: 0.85,
})

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBaseLabel(value) {
  const key = normalize(value)
  return key === 'base' || key === 'base auto'
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Builds the set of physical variation lanes a release is allowed to price.
 * Classification is intentionally upstream of this function: the registry
 * answers whether independently parsed identities have enough release-level
 * evidence to become model inputs.
 */
export function buildReleaseLaneRegistry(candidates, options = {}) {
  const policy = Object.freeze({ ...DEFAULT_POLICY, ...(options.policy ?? {}) })
  const official = new Set((options.officialLabels ?? []).map(normalize))
  const buckets = new Map()

  for (const candidate of candidates) {
    const label = String(candidate?.label ?? '').trim()
    if (!label) continue
    const key = normalize(label)
    const bucket = buckets.get(key) ?? {
      key,
      label,
      saleCount: 0,
      explicitDenominatorSales: 0,
      confidenceTotal: 0,
      players: new Set(),
      registryClasses: new Set(),
    }
    bucket.saleCount += 1
    if (candidate.explicitDenominator) bucket.explicitDenominatorSales += 1
    bucket.confidenceTotal += clamp(Number(candidate.confidence) || 0)
    if (candidate.playerKey) bucket.players.add(String(candidate.playerKey))
    if (candidate.registryClass) bucket.registryClasses.add(String(candidate.registryClass))
    buckets.set(key, bucket)
  }

  const lanes = [...buckets.values()].map((bucket) => {
    const playerCount = bucket.players.size
    const avgConfidence = bucket.saleCount ? bucket.confidenceTotal / bucket.saleCount : 0
    const registryClass = official.has(bucket.key)
      ? 'official'
      : bucket.registryClasses.has('base') || isBaseLabel(bucket.label)
        ? 'base'
        : bucket.registryClasses.has('standard')
          ? 'standard'
          : 'release-confirmed'

    let accepted = false
    let reason = 'insufficient independent release evidence'
    if (registryClass === 'official' || registryClass === 'base') {
      accepted = true
      reason = registryClass === 'official' ? 'official release lane' : 'base anchor'
    } else if (registryClass === 'standard') {
      accepted =
        bucket.explicitDenominatorSales >= policy.standardMinExplicitSales ||
        playerCount >= policy.standardMinPlayers ||
        bucket.saleCount >= policy.standardMinSales
      reason = accepted ? 'standard lane confirmed in release' : 'inferred standard lane lacks release confirmation'
    } else {
      accepted =
        playerCount >= policy.releaseConfirmedMinPlayers ||
        bucket.explicitDenominatorSales >= policy.releaseConfirmedMinExplicitSales ||
        (bucket.saleCount >= policy.releaseConfirmedMinSales && avgConfidence >= policy.releaseConfirmedMinConfidence)
      reason = accepted ? 'release-specific lane independently confirmed' : reason
    }

    return Object.freeze({
      label: bucket.label,
      key: bucket.key,
      registryClass,
      accepted,
      reason,
      saleCount: bucket.saleCount,
      playerCount,
      explicitDenominatorSales: bucket.explicitDenominatorSales,
      avgConfidence: Number(avgConfidence.toFixed(3)),
    })
  })

  const acceptedLabels = new Set(lanes.filter((lane) => lane.accepted).map((lane) => lane.label))
  return Object.freeze({
    lanes: Object.freeze(lanes),
    acceptedLabels,
    acceptedCount: acceptedLabels.size,
    quarantinedCount: lanes.length - acceptedLabels.size,
    candidateCount: candidates.length,
  })
}

export { DEFAULT_POLICY as RELEASE_LANE_REGISTRY_POLICY }
