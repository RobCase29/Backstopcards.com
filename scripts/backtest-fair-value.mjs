import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import {
  BOWMAN_2026_CHROME_AUTO_VARIATIONS,
  canonicalizeBowman2026AutoVariation,
} from '../shared/bowman2026Taxonomy.js'
import {
  buildProximityRatioPoints,
  dedupeSales,
  estimateBaseFairValue,
  estimateLaneFairValue,
  robustFairValueEstimate,
} from '../shared/fairValueEngine.js'

const DAY_MS = 86_400_000
const dbPath = resolve(process.cwd(), process.env.BACKSTOP_SALES_DB ?? 'local-data/backstop-sales.sqlite')
const jsonOnly = process.argv.includes('--json')
const db = new DatabaseSync(dbPath, { readOnly: true })

const sourceRows = db.prepare(`
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

const sales = dedupeSales(sourceRows.flatMap((row) => {
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

if (!sales.length) throw new Error(`No canonical 2026 Bowman raw-auto sales found in ${dbPath}`)

const definitionById = new Map(BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((item) => [item.id, item]))
const maxTime = Math.max(...sales.map((sale) => Number(sale.soldAt)))
const folds = [49, 42, 35, 28, 21, 14, 7].map((daysBeforeMax) => ({
  cutoff: maxTime - daysBeforeMax * DAY_MS,
  end: maxTime - (daysBeforeMax - 7) * DAY_MS,
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

function weeklyCenters(predictions) {
  return [...groupBy(predictions, (row) => row.groupKey).values()].map((rows) => ({
    ...rows[0],
    actual: percentile(rows.map((row) => row.actual), 0.5),
  }))
}

function metrics(key, rows) {
  const eligible = rows.filter((row) => row[key] > 0 && row.actual > 0)
  const errors = eligible.map((row) => Math.abs(row[key] / row.actual - 1))
  const logErrors = eligible.map((row) => Math.abs(Math.log(row[key] / row.actual)))
  const bias = eligible.map((row) => Math.log(row[key] / row.actual))
  return {
    predictions: eligible.length,
    medianAbsolutePercentError: percentile(errors, 0.5),
    p75AbsolutePercentError: percentile(errors, 0.75),
    meanAbsoluteLogError: logErrors.reduce((sum, value) => sum + value, 0) / Math.max(1, logErrors.length),
    medianLogBias: percentile(bias, 0.5),
    within20Pct: errors.filter((value) => value <= 0.2).length / Math.max(1, errors.length),
    within35Pct: errors.filter((value) => value <= 0.35).length / Math.max(1, errors.length),
    within50Pct: errors.filter((value) => value <= 0.5).length / Math.max(1, errors.length),
  }
}

function intervalMetrics(rows, lowKey = 'low', highKey = 'high') {
  const eligible = rows.filter(
    (row) => row.actual > 0 && row[lowKey] > 0 && row[highKey] >= row[lowKey],
  )
  const covered = eligible.filter((row) => row.actual >= row[lowKey] && row.actual <= row[highKey])
  const logWidths = eligible.map((row) => Math.log(row[highKey] / row[lowKey]))
  return {
    predictions: eligible.length,
    coveragePct: covered.length / Math.max(1, eligible.length),
    medianRangeWidthPct: percentile(
      eligible.map((row) => row[highKey] / Math.sqrt(row[lowKey] * row[highKey]) - row[lowKey] / Math.sqrt(row[lowKey] * row[highKey])),
      0.5,
    ),
    medianLogWidth: percentile(logWidths, 0.5),
  }
}

const basePredictions = []
const variationPredictions = []

for (const fold of folds) {
  const train = sales.filter((sale) => Number(sale.soldAt) < fold.cutoff)
  const holdout = sales.filter(
    (sale) => Number(sale.soldAt) >= fold.cutoff && Number(sale.soldAt) < fold.end,
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
    const playerSales = trainByPlayer.get(actual.playerName) ?? []
    const baseSales = playerSales.filter((sale) => sale.variationId === 'base-auto')
    if (baseSales.length < 2) continue
    const legacyBase = robustFairValueEstimate(baseSales, {
      asOf: fold.cutoff,
      halfLifeDays: 45,
      enableTrend: true,
    })
    const validatedBase = estimateBaseFairValue(baseSales, { asOf: fold.cutoff })
    if (!legacyBase || !validatedBase) continue
    const foldLabel = new Date(fold.cutoff).toISOString().slice(0, 10)

    if (actual.variationId === 'base-auto') {
      basePredictions.push({
        groupKey: `${foldLabel}|${actual.playerName}|base-auto`,
        actual: actual.price,
        legacy: legacyBase.value,
        production: validatedBase.value,
        low: validatedBase.low,
        high: validatedBase.high,
      })
      continue
    }

    const definition = definitionById.get(actual.variationId)
    if (!definition) continue
    const playerVariationSales = trainByPlayerLane.get(`${actual.playerName}|${actual.variationId}`) ?? []
    const estimate = estimateLaneFairValue({
      asOf: fold.cutoff,
      priorMultiplier: definition.priorMultiplier,
      priorReliability: definition.priorReliability,
      baseEstimate: validatedBase,
      playerBaseSales: baseSales,
      playerVariationSales,
      releaseRatioPoints: releaseRatiosByLane.get(actual.variationId) ?? [],
    })
    if (!estimate) continue
    variationPredictions.push({
      groupKey: `${foldLabel}|${actual.playerName}|${actual.variationId}`,
      lane: definition.label,
      actual: actual.price,
      structural: validatedBase.value * definition.priorMultiplier,
      production: estimate.value,
      low: estimate.low,
      high: estimate.high,
      evidenceTier: estimate.evidenceTier,
      actionable: estimate.actionable,
    })
  }
}

const baseCenters = weeklyCenters(basePredictions)
const variationCenters = weeklyCenters(variationPredictions)

function comparison(baselineKey, productionKey, rows) {
  const baseline = metrics(baselineKey, rows)
  const production = metrics(productionKey, rows)
  return {
    baseline,
    production,
    improvement: {
      medianAbsolutePercentError:
        baseline.medianAbsolutePercentError > 0
          ? 1 - production.medianAbsolutePercentError / baseline.medianAbsolutePercentError
          : 0,
      meanAbsoluteLogError:
        baseline.meanAbsoluteLogError > 0
          ? 1 - production.meanAbsoluteLogError / baseline.meanAbsoluteLogError
          : 0,
    },
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  database: dbPath,
  foldCount: folds.length,
  canonicalSales: sales.length,
  players: new Set(sales.map((sale) => sale.playerName)).size,
  lanes: new Set(sales.map((sale) => sale.variationId)).size,
  quarantinedOrDuplicateRows: sourceRows.length - sales.length,
  base: comparison('legacy', 'production', baseCenters),
  variations: {
    ...comparison('structural', 'production', variationCenters),
    byEvidenceTier: ['observed', 'modeled', 'indicative'].map((evidenceTier) => ({
      evidenceTier,
      ...metrics('production', variationCenters.filter((row) => row.evidenceTier === evidenceTier)),
    })),
    actionableCoverage:
      variationCenters.filter((row) => row.actionable).length / Math.max(1, variationCenters.length),
    byLane: [...new Set(variationCenters.map((row) => row.lane))]
      .map((lane) => ({
        lane,
        ...metrics('production', variationCenters.filter((row) => row.lane === lane)),
      }))
      .sort((left, right) => right.predictions - left.predictions),
  },
}

report.base.interval = intervalMetrics(baseCenters)
report.variations.interval = intervalMetrics(variationCenters)
report.variations.intervalByEvidenceTier = ['observed', 'modeled', 'indicative'].map((evidenceTier) => ({
  evidenceTier,
  ...intervalMetrics(variationCenters.filter((row) => row.evidenceTier === evidenceTier)),
}))

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log('Backstop fair-value weekly walk-forward validation')
  console.log(`Canonical sales: ${report.canonicalSales}; players: ${report.players}; lanes: ${report.lanes}; folds: ${report.foldCount}`)
  console.log(`Quarantined or duplicate source rows: ${report.quarantinedOrDuplicateRows}`)
  console.log('\nBase auto: legacy 45-day anchor vs validated production anchor')
  console.table({ legacy: report.base.baseline, production: report.base.production })
  console.table({ productionRange: report.base.interval })
  console.log('\nVariation lanes: structural curve vs production hierarchy')
  console.table({ structural: report.variations.baseline, production: report.variations.production })
  console.table({ productionRange: report.variations.interval })
  console.log('\nProduction variation accuracy by evidence tier')
  console.table(report.variations.byEvidenceTier)
  console.table(report.variations.intervalByEvidenceTier)
  console.log(`Actionable variation coverage: ${(report.variations.actionableCoverage * 100).toFixed(1)}%`)
}
