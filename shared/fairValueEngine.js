const DAY_MS = 86_400_000

export const FAIR_VALUE_MODEL_VERSION = 'backstop-fv-v3'

export const BASE_FAIR_VALUE_POLICY = Object.freeze({
  halfLifeDays: 10,
  maxSales: 10,
  enableTrend: true,
  // A card's next market-clearing center remains noisy even when the estimate
  // itself has deep evidence. This process-noise floor is walk-forward
  // calibrated; without it, intervals collapse as sample size grows and
  // materially understate real market risk.
  intervalProcessNoise: 0.15,
})

export const VARIATION_FAIR_VALUE_POLICY = Object.freeze({
  ratioHalfLifeDays: 28,
  ratioMedianBlend: 0.2,
  directHalfLifeDays: 28,
  directMedianBlend: 0.2,
  directMaxSales: 10,
  priorFloor: 2,
  priorReliabilityScale: 4,
  releaseEvidenceCap: 14,
  releaseEvidenceScale: 1,
  playerEvidenceCap: 5,
  playerEvidenceScale: 0.9,
  curveWeight: 6,
  directEvidenceCap: 7,
  directEvidenceScale: 0.8,
})

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function normalizeTitle(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function saleTime(sale) {
  const value = typeof sale.soldAt === 'number' ? sale.soldAt : Date.parse(String(sale.soldAt ?? ''))
  return Number.isFinite(value) ? value : 0
}

function salePrice(sale) {
  const value = Number(sale.price ?? sale.salePrice)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function channelWeight(channel) {
  if (channel === 'auction') return 1
  if (channel === 'bin') return 0.86
  return 0.9
}

export function dedupeSales(sales) {
  const byKey = new Map()
  for (const sale of sales ?? []) {
    const price = salePrice(sale)
    const soldAt = saleTime(sale)
    if (!price || !soldAt) continue
    const itemId = String(sale.itemId ?? sale.id ?? '').trim()
    const day = new Date(soldAt).toISOString().slice(0, 10)
    const title = normalizeTitle(sale.title)
    const key = itemId ? `item:${itemId}` : `sale:${day}:${price.toFixed(2)}:${title}`
    const existing = byKey.get(key)
    if (!existing || String(sale.source ?? '').includes('card_hedge')) byKey.set(key, { ...sale, price, soldAt })
  }
  return [...byKey.values()].sort((left, right) => saleTime(right) - saleTime(left))
}

function weightedQuantile(items, percentile) {
  const sorted = items.filter((item) => item.weight > 0).sort((left, right) => left.value - right.value)
  const total = sorted.reduce((sum, item) => sum + item.weight, 0)
  if (!total) return 0
  const target = total * percentile
  let running = 0
  for (const item of sorted) {
    running += item.weight
    if (running >= target) return item.value
  }
  return sorted.at(-1)?.value ?? 0
}

/** Robust, channel-aware, time-decayed estimate in log-price space. */
export function robustFairValueEstimate(sales, options = {}) {
  const normalized = dedupeSales(sales)
  if (!normalized.length) return null
  const asOf = Number(options.asOf) || Math.max(...normalized.map(saleTime))
  const eligible = normalized.filter((sale) => saleTime(sale) <= asOf)
  const maxSales = Number(options.maxSales)
  const clean = Number.isFinite(maxSales) && maxSales > 0
    ? eligible.slice(0, Math.floor(maxSales))
    : eligible
  if (!clean.length) return null
  const halfLifeDays = Number(options.halfLifeDays) || 45
  const logs = clean.map((sale) => Math.log(salePrice(sale)))
  const center = median(logs)
  const mad = median(logs.map((value) => Math.abs(value - center)))
  const sigma = Math.max(0.05, mad * 1.4826)
  const weighted = clean.map((sale) => {
    const logPrice = Math.log(salePrice(sale))
    const robustZ = Math.abs(logPrice - center) / sigma
    const robustWeight = robustZ <= 1.5 ? 1 : 1.5 / robustZ
    const ageDays = Math.max(0, (asOf - saleTime(sale)) / DAY_MS)
    const recencyWeight = Math.pow(0.5, ageDays / halfLifeDays)
    const weight = recencyWeight * robustWeight * channelWeight(sale.channel)
    return { sale, value: logPrice, weight }
  })
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
  const squaredWeight = weighted.reduce((sum, item) => sum + item.weight ** 2, 0)
  if (!totalWeight || !squaredWeight) return null
  const logValue = weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
  const effectiveN = totalWeight ** 2 / squaredWeight
  const residualVariance = weighted.reduce((sum, item) => sum + item.weight * (item.value - logValue) ** 2, 0) / totalWeight
  const volatility = Math.sqrt(Math.max(0, residualVariance))
  const latestAt = Math.max(...clean.map(saleTime))
  const latestAgeDays = Math.max(0, (asOf - latestAt) / DAY_MS)
  const trend = trendAdjustment(weighted, asOf, effectiveN, options.enableTrend !== false)
  const adjustedLogValue = logValue + trend.adjustment
  const adjustedValue = Math.exp(adjustedLogValue)
  const processNoise = Number(options.intervalProcessNoise) || 0.055
  const uncertainty = Math.sqrt((Math.max(volatility, 0.08) ** 2) / Math.max(1, effectiveN) + processNoise ** 2)
  const intervalWidth = 1.64 * uncertainty
  const auctionCount = clean.filter((sale) => sale.channel === 'auction').length
  const binCount = clean.filter((sale) => sale.channel === 'bin').length
  const depth = 1 - Math.exp(-effectiveN / 5)
  const freshness = Math.pow(0.5, latestAgeDays / 90)
  const stability = 1 - clamp(volatility / 0.75)
  const confidence = clamp(0.12 + depth * 0.48 + freshness * 0.2 + stability * 0.2, 0.15, 0.97)

  return {
    value: adjustedValue,
    low: Math.exp(adjustedLogValue - intervalWidth),
    high: Math.exp(adjustedLogValue + intervalWidth),
    confidence,
    effectiveN,
    count: clean.length,
    auctionCount,
    binCount,
    volatility,
    latestSoldAt: new Date(latestAt).toISOString(),
    weightedMedian: Math.exp(weightedQuantile(weighted, 0.5)),
    trendPer30d: trend.slopePerDay * 30,
    trendStrength: trend.strength,
    method: 'robust-recency-log',
  }
}

/**
 * Production base-auto anchor. The policy is selected by weekly walk-forward
 * validation, not by an in-sample fit: ten recent sales, ten-day half-life,
 * robust log weighting, and a guarded trend adjustment.
 */
export function estimateBaseFairValue(sales, options = {}) {
  const estimate = robustFairValueEstimate(sales, {
    asOf: options.asOf,
    halfLifeDays: options.halfLifeDays ?? BASE_FAIR_VALUE_POLICY.halfLifeDays,
    maxSales: options.maxSales ?? BASE_FAIR_VALUE_POLICY.maxSales,
    enableTrend: options.enableTrend ?? BASE_FAIR_VALUE_POLICY.enableTrend,
    intervalProcessNoise: options.intervalProcessNoise ?? BASE_FAIR_VALUE_POLICY.intervalProcessNoise,
  })
  return estimate ? { ...estimate, method: 'validated-base-anchor-v3' } : null
}

function stabilizeEstimateCenter(estimate, medianBlend) {
  if (!estimate || !medianBlend || !estimate.weightedMedian) return estimate
  const value = Math.exp(
    Math.log(estimate.value) * (1 - medianBlend) + Math.log(estimate.weightedMedian) * medianBlend,
  )
  const scale = value / estimate.value
  return {
    ...estimate,
    value,
    low: estimate.low * scale,
    high: estimate.high * scale,
  }
}

function trendAdjustment(weighted, asOf, effectiveN, enabled) {
  if (!enabled || weighted.length < 6 || effectiveN < 3.5) {
    return { adjustment: 0, slopePerDay: 0, strength: 0 }
  }
  const rows = weighted.map((item) => ({
    ...item,
    day: (saleTime(item.sale) - asOf) / DAY_MS,
  }))
  const totalWeight = rows.reduce((sum, item) => sum + item.weight, 0)
  const meanDay = rows.reduce((sum, item) => sum + item.day * item.weight, 0) / totalWeight
  const meanLog = rows.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
  const varianceDay = rows.reduce((sum, item) => sum + item.weight * (item.day - meanDay) ** 2, 0) / totalWeight
  if (varianceDay <= 0) return { adjustment: 0, slopePerDay: 0, strength: 0 }
  const covariance = rows.reduce((sum, item) => sum + item.weight * (item.day - meanDay) * (item.value - meanLog), 0) / totalWeight
  const rawSlope = covariance / varianceDay
  const slopePerDay = clamp(rawSlope, -0.012, 0.012)
  const fittedVariance = slopePerDay ** 2 * varianceDay
  const totalVariance = rows.reduce((sum, item) => sum + item.weight * (item.value - meanLog) ** 2, 0) / totalWeight
  const rSquared = totalVariance > 0 ? clamp(fittedVariance / totalVariance) : 0
  const spanDays = Math.max(...rows.map((item) => item.day)) - Math.min(...rows.map((item) => item.day))
  const strength =
    clamp((effectiveN - 3) / 10) *
    clamp(spanDays / 45) *
    clamp(rSquared / 0.3) *
    0.7
  return {
    adjustment: slopePerDay * Math.max(0, -meanDay) * strength,
    slopePerDay,
    strength,
  }
}

function proximityAnchor(baseSales, targetTime, windowsDays) {
  for (const windowDays of windowsDays) {
    const nearby = baseSales.filter((sale) => Math.abs(saleTime(sale) - targetTime) <= windowDays * DAY_MS)
    if (!nearby.length) continue
    const estimate = robustFairValueEstimate(nearby, { asOf: targetTime, halfLifeDays: 7 })
    if (estimate) return { ...estimate, windowDays }
  }
  return null
}

/** Builds leakage-safe variation/base ratios around the date of each variation sale. */
export function buildProximityRatioPoints(variationSales, baseSales, options = {}) {
  const windowsDays = options.windowsDays ?? [14, 30, 60]
  const bases = dedupeSales(baseSales)
  return dedupeSales(variationSales)
    .map((sale) => {
      const targetTime = saleTime(sale)
      const anchor = proximityAnchor(bases, targetTime, windowsDays)
      if (!anchor?.value) return null
      return {
        price: salePrice(sale) / anchor.value,
        soldAt: targetTime,
        channel: sale.channel,
        itemId: sale.itemId,
        title: sale.title,
        groupKey: sale.groupKey ?? sale.playerName ?? null,
        baseAnchor: anchor.value,
        anchorEffectiveN: anchor.effectiveN,
        windowDays: anchor.windowDays,
      }
    })
    .filter(Boolean)
}

export function estimateHierarchicalMultiplier(options) {
  const priorMultiplier = Math.max(0.01, Number(options.priorMultiplier) || 1)
  const priorReliability = clamp(Number(options.priorReliability) || 0.5, 0.05, 1)
  const asOf = Number(options.asOf) || Date.now()
  const groupedReleasePoints = collapseGroupedRatioEvidence(options.releaseRatioPoints ?? [], asOf)
  const releaseEstimate = stabilizeEstimateCenter(
    robustFairValueEstimate(groupedReleasePoints, {
      asOf,
      halfLifeDays: VARIATION_FAIR_VALUE_POLICY.ratioHalfLifeDays,
      enableTrend: false,
    }),
    VARIATION_FAIR_VALUE_POLICY.ratioMedianBlend,
  )
  const playerRatioPoints = buildProximityRatioPoints(options.playerVariationSales ?? [], options.playerBaseSales ?? [])
  const playerRatioEstimate = stabilizeEstimateCenter(
    robustFairValueEstimate(playerRatioPoints, {
      asOf,
      halfLifeDays: VARIATION_FAIR_VALUE_POLICY.ratioHalfLifeDays,
      enableTrend: false,
    }),
    VARIATION_FAIR_VALUE_POLICY.ratioMedianBlend,
  )
  // These weights are selected on weekly walk-forward folds. The structural
  // curve remains the anchor, while coherent release and player evidence can
  // move it enough to follow the market without letting one sale become truth.
  const evidence = [{
    value: priorMultiplier,
    weight:
      VARIATION_FAIR_VALUE_POLICY.priorFloor +
      priorReliability * VARIATION_FAIR_VALUE_POLICY.priorReliabilityScale,
    source: 'structural-prior',
  }]
  if (releaseEstimate) {
    evidence.push({
      value: releaseEstimate.value,
      weight:
        Math.min(VARIATION_FAIR_VALUE_POLICY.releaseEvidenceCap, releaseEstimate.effectiveN) *
        VARIATION_FAIR_VALUE_POLICY.releaseEvidenceScale *
        (0.45 + releaseEstimate.confidence * 0.55),
      source: 'release-proximity',
    })
  }
  if (playerRatioEstimate) {
    evidence.push({
      value: playerRatioEstimate.value,
      weight:
        Math.min(VARIATION_FAIR_VALUE_POLICY.playerEvidenceCap, playerRatioEstimate.effectiveN) *
        VARIATION_FAIR_VALUE_POLICY.playerEvidenceScale *
        (0.45 + playerRatioEstimate.confidence * 0.55),
      source: 'player-proximity',
    })
  }
  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0)
  const logValue = evidence.reduce((sum, item) => sum + Math.log(item.value) * item.weight, 0) / totalWeight
  const multiplier = Math.exp(logValue)
  const empiricalWeight = evidence.filter((item) => item.source !== 'structural-prior').reduce((sum, item) => sum + item.weight, 0)
  const releasePlayers = releaseEstimate?.count ?? 0
  const playerEffectiveN = playerRatioEstimate?.effectiveN ?? 0
  const evidenceTier =
    releasePlayers >= 8 && empiricalWeight >= 4
      ? 'observed'
      : releasePlayers >= 3 || playerEffectiveN >= 1.8
        ? 'modeled'
        : 'indicative'
  const actionable = evidenceTier !== 'indicative'
  const confidenceCeiling = evidenceTier === 'observed' ? 0.94 : evidenceTier === 'modeled' ? 0.74 : 0.42
  const confidence = clamp(
    0.2 + (1 - Math.exp(-empiricalWeight / 7)) * 0.68 + priorReliability * 0.1,
    0.22,
    confidenceCeiling,
  )
  const spread = releaseEstimate?.volatility ?? playerRatioEstimate?.volatility ?? (evidenceTier === 'indicative' ? 0.62 : 0.42)
  // Even deep release evidence contains cross-player and parallel-specific
  // dispersion that does not vanish with sample size. These floors are
  // calibrated against future weekly market centers, not in-sample fit.
  const modelRisk = evidenceTier === 'observed' ? 0.14 : evidenceTier === 'modeled' ? 0.16 : 0.42
  const intervalWidth = 1.28 * Math.sqrt(spread ** 2 / Math.max(1, empiricalWeight) + modelRisk ** 2)
  return {
    multiplier,
    low: Math.exp(logValue - intervalWidth),
    high: Math.exp(logValue + intervalWidth),
    confidence,
    priorMultiplier,
    releaseMultiplier: releaseEstimate?.value ?? null,
    playerMultiplier: playerRatioEstimate?.value ?? null,
    effectiveN: (releaseEstimate?.effectiveN ?? 0) + (playerRatioEstimate?.effectiveN ?? 0),
    empiricalWeight,
    releasePlayers,
    evidenceTier,
    actionable,
    sources: evidence.map((item) => item.source),
    method: 'hierarchical-proximity-multiplier-v3',
  }
}

export function estimateLaneFairValue(options) {
  const baseEstimate = options.baseEstimate ?? estimateBaseFairValue(options.baseSales ?? [], { asOf: options.asOf })
  if (!baseEstimate?.value) return null
  const multiplierEstimate = options.multiplierEstimate ?? estimateHierarchicalMultiplier(options)
  const curveValue = baseEstimate.value * multiplierEstimate.multiplier
  const directEstimate = stabilizeEstimateCenter(
    robustFairValueEstimate(options.playerVariationSales ?? [], {
      asOf: options.asOf,
      halfLifeDays: VARIATION_FAIR_VALUE_POLICY.directHalfLifeDays,
      maxSales: VARIATION_FAIR_VALUE_POLICY.directMaxSales,
      enableTrend: false,
    }),
    VARIATION_FAIR_VALUE_POLICY.directMedianBlend,
  )
  const curveWeight = VARIATION_FAIR_VALUE_POLICY.curveWeight
  const directWeight = directEstimate
    ? Math.min(VARIATION_FAIR_VALUE_POLICY.directEvidenceCap, directEstimate.effectiveN) *
      VARIATION_FAIR_VALUE_POLICY.directEvidenceScale *
      (0.45 + directEstimate.confidence * 0.55)
    : 0
  const totalWeight = curveWeight + directWeight
  const logValue = directEstimate
    ? (Math.log(curveValue) * curveWeight + Math.log(directEstimate.value) * directWeight) / totalWeight
    : Math.log(curveValue)
  const value = Math.exp(logValue)
  const low = Math.exp(
    (Math.log(baseEstimate.low * multiplierEstimate.low) * curveWeight + Math.log(directEstimate?.low ?? curveValue) * directWeight) /
      totalWeight,
  )
  const high = Math.exp(
    (Math.log(baseEstimate.high * multiplierEstimate.high) * curveWeight + Math.log(directEstimate?.high ?? curveValue) * directWeight) /
      totalWeight,
  )
  const rawConfidence = clamp(
    (baseEstimate.confidence * curveWeight + multiplierEstimate.confidence * curveWeight + (directEstimate?.confidence ?? 0) * directWeight) /
      (curveWeight * 2 + directWeight),
    0.2,
    0.97,
  )
  const directSupportsLane = (directEstimate?.effectiveN ?? 0) >= 2.5
  const evidenceTier = directSupportsLane ? 'observed' : multiplierEstimate.evidenceTier
  const actionable = directSupportsLane || multiplierEstimate.actionable
  const confidence = Math.min(rawConfidence, evidenceTier === 'observed' ? 0.94 : evidenceTier === 'modeled' ? 0.74 : 0.42)
  return {
    value,
    low,
    high,
    confidence,
    baseValue: baseEstimate.value,
    multiplier: multiplierEstimate.multiplier,
    directValue: directEstimate?.value ?? null,
    directEffectiveN: directEstimate?.effectiveN ?? 0,
    empiricalEffectiveN: multiplierEstimate.effectiveN + (directEstimate?.effectiveN ?? 0),
    evidenceTier,
    actionable,
    method: directEstimate ? 'hierarchical-direct-blend-v3' : 'hierarchical-curve-v3',
  }
}

function collapseGroupedRatioEvidence(points, asOf) {
  const grouped = new Map()
  const ungrouped = []
  for (const point of points) {
    const key = String(point.groupKey ?? '').trim()
    if (!key) {
      ungrouped.push(point)
      continue
    }
    const rows = grouped.get(key) ?? []
    rows.push(point)
    grouped.set(key, rows)
  }
  if (!grouped.size) return points
  const collapsed = [...grouped.entries()].flatMap(([groupKey, rows]) => {
    const estimate = stabilizeEstimateCenter(
      robustFairValueEstimate(rows, {
        asOf,
        halfLifeDays: VARIATION_FAIR_VALUE_POLICY.ratioHalfLifeDays,
        enableTrend: false,
      }),
      VARIATION_FAIR_VALUE_POLICY.ratioMedianBlend,
    )
    if (!estimate) return []
    return [{
      price: estimate.value,
      soldAt: estimate.latestSoldAt,
      channel: 'unknown',
      itemId: `group:${groupKey}`,
      groupKey,
    }]
  })
  return [...collapsed, ...ungrouped]
}
