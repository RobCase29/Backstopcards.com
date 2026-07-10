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
const jsonOnly = process.argv.includes('--json')
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

const canonicalSales = dedupeSales(
  rows.flatMap((row) => {
    if (!row.modelEligible) return []
    const resolution = canonicalizeBowman2026AutoVariation(row.title, { playerName: row.playerName, assumeAuto: true })
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
    }]
  }),
)

const maxTime = Math.max(...canonicalSales.map((sale) => Number(sale.soldAt)))
const cutoffs = [42, 28, 14].map((days) => maxTime - days * DAY_MS)
const definitionById = new Map(BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((item) => [item.id, item]))
const predictions = []

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

for (const cutoff of cutoffs) {
  const holdoutEnd = cutoff + 14 * DAY_MS
  const train = canonicalSales.filter((sale) => Number(sale.soldAt) < cutoff)
  const holdout = canonicalSales.filter(
    (sale) => Number(sale.soldAt) >= cutoff && Number(sale.soldAt) < holdoutEnd && sale.variationId !== 'base-auto',
  )
  const trainByPlayer = groupBy(train, (sale) => sale.playerName)
  const trainByPlayerLane = groupBy(train, (sale) => `${sale.playerName}|${sale.variationId}`)
  const releaseRatiosByLane = new Map()

  for (const definition of BOWMAN_2026_CHROME_AUTO_VARIATIONS) {
    if (definition.id === 'base-auto') continue
    const points = []
    for (const [playerName, playerSales] of trainByPlayer) {
      const baseSales = playerSales.filter((sale) => sale.variationId === 'base-auto')
      const variationSales = trainByPlayerLane.get(`${playerName}|${definition.id}`) ?? []
      points.push(...buildProximityRatioPoints(variationSales, baseSales))
    }
    releaseRatiosByLane.set(definition.id, points)
  }

  for (const actual of holdout) {
    const definition = definitionById.get(actual.variationId)
    const playerSales = trainByPlayer.get(actual.playerName) ?? []
    const baseSales = playerSales.filter((sale) => sale.variationId === 'base-auto')
    if (!definition || baseSales.length < 2) continue
    const baseEstimate = robustFairValueEstimate(baseSales, { asOf: cutoff, halfLifeDays: 45 })
    if (!baseEstimate) continue
    const playerVariationSales = trainByPlayerLane.get(`${actual.playerName}|${actual.variationId}`) ?? []
    const hierarchical = estimateLaneFairValue({
      asOf: cutoff,
      priorMultiplier: definition.priorMultiplier,
      priorReliability: definition.priorReliability,
      baseEstimate,
      playerBaseSales: baseSales,
      playerVariationSales,
      releaseRatioPoints: releaseRatiosByLane.get(actual.variationId) ?? [],
    })
    if (!hierarchical) continue
    predictions.push({
      cutoff: new Date(cutoff).toISOString().slice(0, 10),
      playerName: actual.playerName,
      variation: definition.label,
      actual: actual.price,
      baseline: baseEstimate.value * definition.priorMultiplier,
      hierarchical: hierarchical.value,
      confidence: hierarchical.confidence,
      directSales: playerVariationSales.length,
    })
  }
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

function metrics(key, rows = predictions) {
  const errors = rows.map((row) => Math.abs(row[key] / row.actual - 1))
  const logErrors = rows.map((row) => Math.abs(Math.log(row[key] / row.actual)))
  const bias = rows.map((row) => Math.log(row[key] / row.actual))
  return {
    predictions: rows.length,
    medianAbsolutePercentError: percentile(errors, 0.5),
    p75AbsolutePercentError: percentile(errors, 0.75),
    meanAbsoluteLogError: logErrors.reduce((sum, value) => sum + value, 0) / Math.max(1, logErrors.length),
    medianLogBias: percentile(bias, 0.5),
    within20Pct: errors.filter((value) => value <= 0.2).length / Math.max(1, errors.length),
    within35Pct: errors.filter((value) => value <= 0.35).length / Math.max(1, errors.length),
    within50Pct: errors.filter((value) => value <= 0.5).length / Math.max(1, errors.length),
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  database: dbPath,
  canonicalSales: canonicalSales.length,
  players: new Set(canonicalSales.map((sale) => sale.playerName)).size,
  lanes: new Set(canonicalSales.map((sale) => sale.variationId)).size,
  quarantinedSales: rows.length - canonicalSales.length,
  baseline: metrics('baseline'),
  hierarchical: metrics('hierarchical'),
  byLane: [...new Set(predictions.map((row) => row.variation))]
    .map((variation) => {
      const rows = predictions.filter((row) => row.variation === variation)
      return {
        variation,
        count: rows.length,
        baseline: metrics('baseline', rows),
        hierarchical: metrics('hierarchical', rows),
      }
    })
    .sort((left, right) => right.count - left.count),
}
report.improvement = {
  medianAbsolutePercentError:
    report.baseline.medianAbsolutePercentError > 0
      ? 1 - report.hierarchical.medianAbsolutePercentError / report.baseline.medianAbsolutePercentError
      : 0,
  meanAbsoluteLogError:
    report.baseline.meanAbsoluteLogError > 0
      ? 1 - report.hierarchical.meanAbsoluteLogError / report.baseline.meanAbsoluteLogError
      : 0,
}

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log('Backstop fair-value rolling holdout')
  console.table({ baseline: report.baseline, hierarchical: report.hierarchical })
  console.log(`Canonical sales: ${report.canonicalSales}; players: ${report.players}; official lanes: ${report.lanes}`)
  console.log(`Quarantined or duplicate source rows: ${report.quarantinedSales}`)
  console.log(`Median error improvement: ${(report.improvement.medianAbsolutePercentError * 100).toFixed(1)}%`)
  console.log(`Mean log-error improvement: ${(report.improvement.meanAbsoluteLogError * 100).toFixed(1)}%`)
}
