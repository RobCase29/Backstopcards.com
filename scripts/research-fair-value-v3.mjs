import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import {
  BOWMAN_2026_CHROME_AUTO_VARIATIONS,
  canonicalizeBowman2026AutoVariation,
} from '../shared/bowman2026Taxonomy.js'
import {
  buildProximityRatioPoints,
  dedupeSales,
  estimateLaneFairValue,
  robustFairValueEstimate,
} from '../shared/fairValueEngine.js'

const DAY_MS = 86_400_000
const dbPath = resolve(process.cwd(), process.env.BACKSTOP_SALES_DB ?? 'local-data/backstop-sales.sqlite')
const db = new DatabaseSync(dbPath, { readOnly: true })

const rows = db.prepare(`
  SELECT
    c.player_name AS playerName,
    m.source,
    m.source_key AS sourceKey,
    json_extract(m.raw_json, '$.normalized.salePrice') AS price,
    json_extract(m.raw_json, '$.normalized.soldAt') AS soldAt,
    json_extract(m.raw_json, '$.normalized.channel') AS channel,
    json_extract(m.raw_json, '$.normalized.itemId') AS itemId,
    json_extract(m.raw_json, '$.normalized.title') AS title,
    json_extract(m.raw_json, '$.normalized.modelEligible') AS modelEligible
  FROM canonical_source_mappings m
  JOIN canonical_cards c USING(canonical_card_key)
  WHERE c.release_year = 2026
    AND c.card_class = 'auto'
    AND c.grade_bucket = 'Raw'
    AND json_extract(m.raw_json, '$.normalized.salePrice') > 0
    AND json_extract(m.raw_json, '$.normalized.soldAt') IS NOT NULL
`).all()

const sales = dedupeSales(rows.flatMap((row) => {
  if (!row.modelEligible) return []
  const resolution = canonicalizeBowman2026AutoVariation(row.title, {
    playerName: row.playerName,
    assumeAuto: true,
  })
  if (!resolution.modelEligible || !resolution.definition) return []
  return [{
    playerName: row.playerName,
    variationId: resolution.definition.id,
    variationLabel: resolution.definition.label,
    price: Number(row.price),
    soldAt: row.soldAt,
    channel: row.channel,
    itemId: row.itemId || row.sourceKey,
    title: row.title,
    source: row.source,
    groupKey: row.playerName,
  }]
}))

const definitionById = new Map(BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((item) => [item.id, item]))
const maxTime = Math.max(...sales.map((sale) => Number(sale.soldAt)))
const foldOffsets = [49, 42, 35, 28, 21, 14, 7]
const folds = foldOffsets.map((daysBeforeMax, index) => ({
  id: index < 4 ? `tune-${index + 1}` : index === 4 ? 'test' : `forward-${index - 4}`,
  cutoff: maxTime - daysBeforeMax * DAY_MS,
  end: maxTime - (daysBeforeMax - 7) * DAY_MS,
  test: index === 4 ? true : index < 4 ? false : null,
}))

function groupBy(items, keyFor) {
  const grouped = new Map()
  for (const item of items) {
    const key = keyFor(item)
    const values = grouped.get(key) ?? []
    values.push(item)
    grouped.set(key, values)
  }
  return grouped
}

function percentile(values, pct) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * pct
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low)
}

function metrics(predictions) {
  const errors = predictions.map((row) => Math.abs(row.predicted / row.actual - 1))
  const logErrors = predictions.map((row) => Math.abs(Math.log(row.predicted / row.actual)))
  const bias = predictions.map((row) => Math.log(row.predicted / row.actual))
  return {
    predictions: predictions.length,
    medianApe: percentile(errors, 0.5),
    p75Ape: percentile(errors, 0.75),
    meanAbsLog: logErrors.reduce((sum, value) => sum + value, 0) / Math.max(1, logErrors.length),
    medianLogBias: percentile(bias, 0.5),
    within20: errors.filter((value) => value <= 0.2).length / Math.max(1, errors.length),
    within35: errors.filter((value) => value <= 0.35).length / Math.max(1, errors.length),
    within50: errors.filter((value) => value <= 0.5).length / Math.max(1, errors.length),
  }
}

function centerMetrics(predictions) {
  const grouped = groupBy(predictions, (row) => row.groupKey)
  return metrics([...grouped.values()].map((values) => ({
    actual: percentile(values.map((row) => row.actual), 0.5),
    predicted: values[0].predicted,
  })))
}

function score(result) {
  return result.meanAbsLog + result.medianApe * 0.35 + result.p75Ape * 0.1
}

function estimateCenter(inputSales, asOf, policy) {
  const ordered = dedupeSales(inputSales).filter((sale) => Number(sale.soldAt) < asOf)
  const selected = policy.maxSales ? ordered.slice(0, policy.maxSales) : ordered
  const recent30 = selected.filter((sale) => Number(sale.soldAt) >= asOf - 30 * DAY_MS).length
  const halfLifeDays = policy.halfLifeDays === 'adaptive'
    ? recent30 >= 12 ? 14 : recent30 >= 6 ? 21 : recent30 >= 3 ? 30 : 45
    : policy.halfLifeDays
  const estimate = robustFairValueEstimate(selected, {
    asOf,
    halfLifeDays,
    enableTrend: policy.enableTrend,
  })
  if (!estimate) return null
  const medianBlend = policy.medianBlend ?? 0
  const value = Math.exp(
    Math.log(estimate.value) * (1 - medianBlend) +
    Math.log(estimate.weightedMedian) * medianBlend,
  )
  return { ...estimate, value, halfLifeDays }
}

function collapsePlayerRatios(points, asOf, policy) {
  const grouped = groupBy(points, (point) => point.groupKey ?? '')
  return [...grouped.entries()].flatMap(([groupKey, values]) => {
    const estimate = estimateCenter(values, asOf, policy)
    if (!estimate) return []
    return [{
      price: estimate.value,
      soldAt: estimate.latestSoldAt,
      channel: 'unknown',
      itemId: `group:${groupKey}`,
      groupKey,
      evidenceN: estimate.effectiveN,
    }]
  })
}

const foldData = folds.map((fold) => {
  const train = sales.filter((sale) => Number(sale.soldAt) < fold.cutoff)
  const holdout = sales.filter((sale) => Number(sale.soldAt) >= fold.cutoff && Number(sale.soldAt) < fold.end)
  const trainByPlayer = groupBy(train, (sale) => sale.playerName)
  const trainByPlayerLane = groupBy(train, (sale) => `${sale.playerName}|${sale.variationId}`)
  const ratiosByLane = new Map()
  for (const definition of BOWMAN_2026_CHROME_AUTO_VARIATIONS) {
    if (definition.id === 'base-auto') continue
    const points = []
    for (const [playerName, playerSales] of trainByPlayer) {
      const baseSales = playerSales.filter((sale) => sale.variationId === 'base-auto')
      const variationSales = trainByPlayerLane.get(`${playerName}|${definition.id}`) ?? []
      points.push(...buildProximityRatioPoints(variationSales, baseSales))
    }
    ratiosByLane.set(definition.id, points)
  }
  return { ...fold, trainByPlayer, trainByPlayerLane, ratiosByLane, holdout }
})

const basePolicies = []
for (const halfLifeDays of [10, 14, 21, 28, 45, 'adaptive']) {
  for (const medianBlend of [0, 0.2, 0.4]) {
    for (const enableTrend of [false, true]) {
      for (const maxSales of [null, 5, 10, 20]) {
        basePolicies.push({ halfLifeDays, medianBlend, enableTrend, maxSales })
      }
    }
  }
}

function basePredictions(policy, onlyTest) {
  const predictions = []
  for (const fold of foldData) {
    if (fold.test !== onlyTest) continue
    for (const actual of fold.holdout) {
      if (actual.variationId !== 'base-auto') continue
      const history = (fold.trainByPlayer.get(actual.playerName) ?? []).filter((sale) => sale.variationId === 'base-auto')
      if (history.length < 2) continue
      const estimate = estimateCenter(history, fold.cutoff, policy)
      if (estimate) predictions.push({
        actual: actual.price,
        predicted: estimate.value,
        groupKey: `${fold.id}|${actual.playerName}|base-auto`,
      })
    }
  }
  return predictions
}

const rankedBase = basePolicies
  .map((policy) => {
    const tune = centerMetrics(basePredictions(policy, false))
    return { policy, tune, score: score(tune) }
  })
  .sort((left, right) => left.score - right.score)
const bestBasePolicy = rankedBase[0].policy

const ratioPolicy = {
  halfLifeDays: 28,
  medianBlend: 0.2,
  enableTrend: false,
}

function buildVariationFeatures(basePolicy, onlyTest) {
  const features = []
  for (const fold of foldData) {
    if (fold.test !== onlyTest) continue
    const collapsedByLane = new Map(
      [...fold.ratiosByLane.entries()].map(([lane, points]) => [lane, collapsePlayerRatios(points, fold.cutoff, ratioPolicy)]),
    )
    const releaseCache = new Map()
    for (const actual of fold.holdout) {
      if (actual.variationId === 'base-auto') continue
      const definition = definitionById.get(actual.variationId)
      const playerSales = fold.trainByPlayer.get(actual.playerName) ?? []
      const baseSales = playerSales.filter((sale) => sale.variationId === 'base-auto')
      if (!definition || baseSales.length < 2) continue
      const base = estimateCenter(baseSales, fold.cutoff, basePolicy)
      if (!base) continue
      const playerVariationSales = fold.trainByPlayerLane.get(`${actual.playerName}|${actual.variationId}`) ?? []
      const releaseKey = `${actual.variationId}|${actual.playerName}`
      let release = releaseCache.get(releaseKey)
      if (release === undefined) {
        release = estimateCenter(
          (collapsedByLane.get(actual.variationId) ?? []).filter((point) => point.groupKey !== actual.playerName),
          fold.cutoff,
          ratioPolicy,
        )
        releaseCache.set(releaseKey, release)
      }
      const player = estimateCenter(
        buildProximityRatioPoints(playerVariationSales, baseSales),
        fold.cutoff,
        ratioPolicy,
      )
      const direct = estimateCenter(playerVariationSales, fold.cutoff, {
        halfLifeDays: 28,
        medianBlend: 0.2,
        enableTrend: false,
      })
      features.push({
        actual: actual.price,
        groupKey: `${fold.id}|${actual.playerName}|${actual.variationId}`,
        lane: actual.variationId,
        definition,
        base,
        release,
        player,
        direct,
      })
    }
  }
  return features
}

function estimateMultiplier(feature, policy) {
  const { definition, release, player } = feature
  const priorLog = Math.log(definition.priorMultiplier)
  const guardEvidence = (value) => {
    if (!Number.isFinite(policy.maxPriorDeviation)) return value
    return Math.exp(Math.min(
      priorLog + policy.maxPriorDeviation,
      Math.max(priorLog - policy.maxPriorDeviation, Math.log(value)),
    ))
  }
  const evidence = [{
    value: definition.priorMultiplier,
    weight: policy.priorFloor + definition.priorReliability * policy.priorScale,
  }]
  if (release) {
    evidence.push({
      value: guardEvidence(release.value),
      weight: Math.min(policy.releaseCap, release.effectiveN) * policy.releaseScale * (0.45 + release.confidence * 0.55),
    })
  }
  if (player && policy.playerScale > 0) {
    evidence.push({
      value: guardEvidence(player.value),
      weight: Math.min(policy.playerCap, player.effectiveN) * policy.playerScale * (0.45 + player.confidence * 0.55),
    })
  }
  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0)
  return Math.exp(evidence.reduce((sum, item) => sum + Math.log(item.value) * item.weight, 0) / totalWeight)
}

function variationPredictions(features, policy) {
  return features.map((feature) => {
    const multiplier = estimateMultiplier(feature, policy)
    let predicted = feature.base.value * multiplier
    if (policy.directScale > 0 && feature.direct) {
      const curveWeight = policy.curveWeight
      const directWeight = Math.min(policy.directCap, feature.direct.effectiveN) * policy.directScale * (0.45 + feature.direct.confidence * 0.55)
      predicted = Math.exp(
        (Math.log(predicted) * curveWeight + Math.log(feature.direct.value) * directWeight) /
        (curveWeight + directWeight),
      )
    }
    return { actual: feature.actual, predicted, lane: feature.lane, groupKey: feature.groupKey }
  })
}

const tuneVariationFeatures = buildVariationFeatures(bestBasePolicy, false)
const testVariationFeatures = buildVariationFeatures(bestBasePolicy, true)

const variationPolicies = []
for (const priorFloor of [2, 4, 6]) {
  for (const priorScale of [4, 7]) {
    for (const releaseScale of [0.6, 1, 1.4]) {
      for (const playerScale of [0, 0.45, 0.9]) {
        for (const directScale of [0, 0.4, 0.8]) {
          for (const maxPriorDeviation of [null, 0.5, 0.75, 1]) {
            variationPolicies.push({
              priorFloor,
              priorScale,
              releaseScale,
              releaseCap: 14,
              playerScale,
              playerCap: 5,
              directScale,
              directCap: 7,
              curveWeight: 6,
              ratioHalfLife: 28,
              ratioMedianBlend: 0.2,
              directHalfLife: 28,
              directMedianBlend: 0.2,
              maxPriorDeviation,
            })
          }
        }
      }
    }
  }
}

const rankedVariation = variationPolicies
  .map((policy) => {
    const tune = centerMetrics(variationPredictions(tuneVariationFeatures, policy))
    return { policy, tune, score: score(tune) }
  })
  .sort((left, right) => left.score - right.score)

function currentHierarchyPredictions(onlyTest, basePolicy) {
  const predictions = []
  for (const fold of foldData) {
    if (fold.test !== onlyTest) continue
    for (const actual of fold.holdout) {
      if (actual.variationId === 'base-auto') continue
      const definition = definitionById.get(actual.variationId)
      const playerSales = fold.trainByPlayer.get(actual.playerName) ?? []
      const baseSales = playerSales.filter((sale) => sale.variationId === 'base-auto')
      if (!definition || baseSales.length < 2) continue
      const baseEstimate = estimateCenter(baseSales, fold.cutoff, basePolicy)
      if (!baseEstimate) continue
      const estimate = estimateLaneFairValue({
        asOf: fold.cutoff,
        priorMultiplier: definition.priorMultiplier,
        priorReliability: definition.priorReliability,
        baseEstimate,
        baseSales,
        playerBaseSales: baseSales,
        playerVariationSales: fold.trainByPlayerLane.get(`${actual.playerName}|${actual.variationId}`) ?? [],
        releaseRatioPoints: fold.ratiosByLane.get(actual.variationId) ?? [],
      })
      if (estimate) predictions.push({
        actual: actual.price,
        predicted: estimate.value,
        lane: actual.variationId,
        groupKey: `${fold.id}|${actual.playerName}|${actual.variationId}`,
      })
    }
  }
  return predictions
}

const bestVariation = rankedVariation[0]
const topVariationCandidates = rankedVariation.slice(0, 8).map((candidate) => ({
  ...candidate,
  test: centerMetrics(variationPredictions(testVariationFeatures, candidate.policy)),
}))
const legacyBasePolicy = {
  halfLifeDays: 45,
  medianBlend: 0,
  enableTrend: true,
  maxSales: null,
}
const baselineTune = centerMetrics(currentHierarchyPredictions(false, legacyBasePolicy))
const baselineTest = centerMetrics(currentHierarchyPredictions(true, legacyBasePolicy))
const fastBaseTune = centerMetrics(currentHierarchyPredictions(false, bestBasePolicy))
const fastBaseTest = centerMetrics(currentHierarchyPredictions(true, bestBasePolicy))
const bestTestPredictions = variationPredictions(testVariationFeatures, bestVariation.policy)

function weightedMean(items, valueFor) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0)
  if (!totalWeight) return 0
  return items.reduce((sum, item) => sum + valueFor(item) * item.weight, 0) / totalWeight
}

function weightedMedian(items, valueFor) {
  const ordered = [...items].sort((left, right) => valueFor(left) - valueFor(right))
  const totalWeight = ordered.reduce((sum, item) => sum + item.weight, 0)
  let running = 0
  for (const item of ordered) {
    running += item.weight
    if (running >= totalWeight / 2) return valueFor(item)
  }
  return ordered.length ? valueFor(ordered.at(-1)) : 0
}

const elasticityObservations = new Map()
for (const fold of foldData) {
  const byLane = new Map()
  for (const [playerName, playerSales] of fold.trainByPlayer) {
    const baseSales = playerSales.filter((sale) => sale.variationId === 'base-auto')
    if (baseSales.length < 2) continue
    const base = estimateCenter(baseSales, fold.cutoff, bestBasePolicy)
    if (!base) continue
    for (const definition of BOWMAN_2026_CHROME_AUTO_VARIATIONS) {
      if (definition.id === 'base-auto') continue
      const laneSales = fold.trainByPlayerLane.get(`${playerName}|${definition.id}`) ?? []
      if (!laneSales.length) continue
      const lane = estimateCenter(laneSales, fold.cutoff, {
        halfLifeDays: 28,
        medianBlend: 0.2,
        enableTrend: false,
        maxSales: 10,
      })
      if (!lane) continue
      const rows = byLane.get(definition.id) ?? []
      rows.push({
        playerName,
        base,
        lane,
        x: Math.log(base.value),
        y: Math.log(lane.value / base.value),
        weight: Math.min(3, Math.sqrt(Math.max(0.25, Math.min(base.effectiveN, lane.effectiveN)))),
      })
      byLane.set(definition.id, rows)
    }
  }
  elasticityObservations.set(fold.id, byLane)
}

function elasticityCurveValue(feature, observations, policy) {
  const rows = observations.filter((row) => row.playerName !== feature.playerName)
  const priorLog = Math.log(feature.definition.priorMultiplier)
  if (rows.length < 3) return { value: feature.base.value * feature.definition.priorMultiplier, slope: 1, players: rows.length }

  const pivot = weightedMedian(rows, (row) => row.x)
  const center = weightedMedian(rows, (row) => row.y)
  const mad = weightedMedian(rows.map((row) => ({ ...row, deviation: Math.abs(row.y - center) })), (row) => row.deviation)
  const clipWidth = Math.max(0.2, mad * 1.4826 * 2.25)
  const clean = rows.map((row) => ({ ...row, y: Math.min(center + clipWidth, Math.max(center - clipWidth, row.y)) }))
  const meanX = weightedMean(clean, (row) => row.x)
  const meanY = weightedMean(clean, (row) => row.y)
  const covariance = clean.reduce((sum, row) => sum + row.weight * (row.x - meanX) * (row.y - meanY), 0)
  const variance = clean.reduce((sum, row) => sum + row.weight * (row.x - meanX) ** 2, 0)
  const rawGamma = variance > 0 ? covariance / variance : 0
  const totalWeight = clean.reduce((sum, row) => sum + row.weight, 0)
  const gamma = Math.max(-0.72, Math.min(0.18, rawGamma * totalWeight / (totalWeight + policy.slopeShrink)))
  const empiricalAtPivot = meanY + gamma * (pivot - meanX)
  const empiricalAtTarget = empiricalAtPivot + gamma * (Math.log(feature.base.value) - pivot)
  const priorWeight = policy.priorFloor + feature.definition.priorReliability * policy.priorScale
  const empiricalWeight = Math.min(14, totalWeight) * policy.releaseScale
  const ratioLog = (priorLog * priorWeight + empiricalAtTarget * empiricalWeight) / (priorWeight + empiricalWeight)
  return {
    value: feature.base.value * Math.exp(ratioLog),
    slope: 1 + gamma,
    players: rows.length,
  }
}

function elasticityPredictions(onlyTest, policy) {
  const predictions = []
  for (const fold of foldData) {
    if (fold.test !== onlyTest) continue
    const observationsByLane = elasticityObservations.get(fold.id) ?? new Map()
    for (const actual of fold.holdout) {
      if (actual.variationId === 'base-auto') continue
      const definition = definitionById.get(actual.variationId)
      const playerSales = fold.trainByPlayer.get(actual.playerName) ?? []
      const baseSales = playerSales.filter((sale) => sale.variationId === 'base-auto')
      if (!definition || baseSales.length < 2) continue
      const base = estimateCenter(baseSales, fold.cutoff, bestBasePolicy)
      if (!base) continue
      const feature = { playerName: actual.playerName, definition, base }
      const curve = elasticityCurveValue(feature, observationsByLane.get(actual.variationId) ?? [], policy)
      const direct = estimateCenter(
        fold.trainByPlayerLane.get(`${actual.playerName}|${actual.variationId}`) ?? [],
        fold.cutoff,
        { halfLifeDays: 28, medianBlend: 0.2, enableTrend: false, maxSales: 10 },
      )
      let predicted = curve.value
      if (direct && policy.directScale > 0) {
        const curveWeight = 6
        const directWeight = Math.min(7, direct.effectiveN) * policy.directScale * (0.45 + direct.confidence * 0.55)
        predicted = Math.exp(
          (Math.log(curve.value) * curveWeight + Math.log(direct.value) * directWeight) /
          (curveWeight + directWeight),
        )
      }
      predictions.push({
        actual: actual.price,
        predicted,
        lane: actual.variationId,
        slope: curve.slope,
        releasePlayers: curve.players,
        groupKey: `${fold.id}|${actual.playerName}|${actual.variationId}`,
      })
    }
  }
  return predictions
}

const elasticityPolicies = []
for (const priorFloor of [2, 4, 6]) {
  for (const priorScale of [4, 8]) {
    for (const releaseScale of [0.5, 0.8, 1.1]) {
      for (const slopeShrink of [4, 8, 16]) {
        for (const directScale of [0, 0.4, 0.8]) {
          elasticityPolicies.push({ priorFloor, priorScale, releaseScale, slopeShrink, directScale })
        }
      }
    }
  }
}

const rankedElasticity = elasticityPolicies
  .map((policy) => {
    const tune = centerMetrics(elasticityPredictions(false, policy))
    return { policy, tune, score: score(tune) }
  })
  .sort((left, right) => left.score - right.score)
const bestElasticity = rankedElasticity[0]
const hierarchyTunePredictions = variationPredictions(tuneVariationFeatures, bestVariation.policy)
const hierarchyTestPredictions = variationPredictions(testVariationFeatures, bestVariation.policy)
const elasticityTunePredictions = elasticityPredictions(false, bestElasticity.policy)
const elasticityTestPredictions = elasticityPredictions(true, bestElasticity.policy)

function predictionMap(rows) {
  return new Map(rows.map((row) => [row.groupKey, row]))
}

function ensemblePredictions(sources, weights) {
  const maps = sources.map(predictionMap)
  const keys = [...maps[0].keys()].filter((key) => maps.every((map) => map.has(key)))
  return keys.map((key) => {
    const rows = maps.map((map) => map.get(key))
    return {
      actual: rows[0].actual,
      predicted: Math.exp(rows.reduce((sum, row, index) => sum + Math.log(row.predicted) * weights[index], 0)),
      lane: rows[0].lane,
      groupKey: key,
    }
  })
}

function gatedElasticityPredictions(hierarchyRows, elasticityRows, policy) {
  const elasticityByKey = predictionMap(elasticityRows)
  return hierarchyRows.map((hierarchy) => {
    const elasticity = elasticityByKey.get(hierarchy.groupKey)
    const eligible =
      elasticity &&
      elasticity.releasePlayers >= policy.minPlayers &&
      elasticity.slope <= policy.maxSlope &&
      elasticity.slope >= policy.minSlope
    if (!eligible) return hierarchy
    return {
      ...hierarchy,
      predicted: Math.exp(
        Math.log(hierarchy.predicted) * (1 - policy.elasticityWeight) +
        Math.log(elasticity.predicted) * policy.elasticityWeight,
      ),
    }
  })
}

const gatedElasticityCandidates = []
for (const minPlayers of [12, 20, 30, 40]) {
  for (const maxSlope of [0.98, 0.92, 0.86]) {
    for (const minSlope of [0.55, 0.7]) {
      for (const elasticityWeight of [0.2, 0.35, 0.5]) {
        const policy = { minPlayers, maxSlope, minSlope, elasticityWeight }
        const tune = centerMetrics(gatedElasticityPredictions(
          hierarchyTunePredictions,
          elasticityTunePredictions,
          policy,
        ))
        gatedElasticityCandidates.push({ policy, tune, score: score(tune) })
      }
    }
  }
}
gatedElasticityCandidates.sort((left, right) => left.score - right.score)
const bestGatedElasticity = gatedElasticityCandidates[0]
const gatedElasticityTestPredictions = gatedElasticityPredictions(
  hierarchyTestPredictions,
  elasticityTestPredictions,
  bestGatedElasticity.policy,
)

const tuneSources = [
  currentHierarchyPredictions(false, bestBasePolicy),
  hierarchyTunePredictions,
  elasticityTunePredictions,
]
const testSources = [
  currentHierarchyPredictions(true, bestBasePolicy),
  hierarchyTestPredictions,
  elasticityTestPredictions,
]
const ensembleCandidates = []
for (let first = 0; first <= 10; first += 1) {
  for (let second = 0; second <= 10 - first; second += 1) {
    const weights = [first / 10, second / 10, (10 - first - second) / 10]
    const tune = centerMetrics(ensemblePredictions(tuneSources, weights))
    ensembleCandidates.push({ weights, tune, score: score(tune) })
  }
}
ensembleCandidates.sort((left, right) => left.score - right.score)
const bestEnsemble = ensembleCandidates[0]
const ensembleTestPredictions = ensemblePredictions(testSources, bestEnsemble.weights)

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  database: dbPath,
  sales: sales.length,
  folds: folds.map((fold) => ({
    id: fold.id,
    cutoff: new Date(fold.cutoff).toISOString().slice(0, 10),
    end: new Date(fold.end).toISOString().slice(0, 10),
  })),
  base: {
    winner: bestBasePolicy,
    tune: rankedBase[0].tune,
    test: centerMetrics(basePredictions(bestBasePolicy, true)),
    transactionTest: metrics(basePredictions(bestBasePolicy, true)),
    current45DayTest: centerMetrics(basePredictions({
      halfLifeDays: 45,
      medianBlend: 0,
      enableTrend: true,
      maxSales: null,
    }, true)),
    topCandidates: rankedBase.slice(0, 8),
  },
  variation: {
    v2: { tune: baselineTune, test: baselineTest },
    v2FastBase: { tune: fastBaseTune, test: fastBaseTest },
    winner: bestVariation.policy,
    tune: bestVariation.tune,
    test: centerMetrics(bestTestPredictions),
    transactionTest: metrics(bestTestPredictions),
    topCandidates: topVariationCandidates,
    testByLane: [...new Set(bestTestPredictions.map((row) => row.lane))]
      .map((lane) => ({ lane, ...centerMetrics(bestTestPredictions.filter((row) => row.lane === lane)) }))
      .sort((left, right) => right.predictions - left.predictions),
    elasticity: {
      winner: bestElasticity.policy,
      tune: bestElasticity.tune,
      test: centerMetrics(elasticityTestPredictions),
      transactionTest: metrics(elasticityTestPredictions),
      topCandidates: rankedElasticity.slice(0, 8).map((candidate) => ({
        ...candidate,
        test: centerMetrics(elasticityPredictions(true, candidate.policy)),
      })),
      slopes: [...new Set(elasticityTestPredictions.map((row) => row.lane))]
        .map((lane) => ({
          lane,
          medianSlope: percentile(elasticityTestPredictions.filter((row) => row.lane === lane).map((row) => row.slope), 0.5),
          medianReleasePlayers: percentile(elasticityTestPredictions.filter((row) => row.lane === lane).map((row) => row.releasePlayers), 0.5),
        })),
    },
    gatedElasticity: {
      winner: bestGatedElasticity.policy,
      tune: bestGatedElasticity.tune,
      test: centerMetrics(gatedElasticityTestPredictions),
      transactionTest: metrics(gatedElasticityTestPredictions),
      topCandidates: gatedElasticityCandidates.slice(0, 8).map((candidate) => ({
        ...candidate,
        test: centerMetrics(gatedElasticityPredictions(
          hierarchyTestPredictions,
          elasticityTestPredictions,
          candidate.policy,
        )),
      })),
    },
    ensemble: {
      sources: ['v2-fast-base', 'tuned-hierarchy', 'elasticity'],
      weights: bestEnsemble.weights,
      tune: bestEnsemble.tune,
      test: centerMetrics(ensembleTestPredictions),
      transactionTest: metrics(ensembleTestPredictions),
      topCandidates: ensembleCandidates.slice(0, 8).map((candidate) => ({
        ...candidate,
        test: centerMetrics(ensemblePredictions(testSources, candidate.weights)),
      })),
    },
  },
}, null, 2))
