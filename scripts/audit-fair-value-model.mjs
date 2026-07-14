import {
  BOWMAN_2026_CHROME_AUTO_VARIATIONS,
  canonicalizeBowman2026AutoLabel,
} from '../shared/bowman2026Taxonomy.js'
import { FAIR_VALUE_MODEL_VERSION } from '../shared/fairValueEngine.js'
import {
  STATIC_CHECKLIST_GENERATED_AT,
  STATIC_CHECKLIST_MODELS,
} from '../src/data/staticChecklistSnapshot.ts'

const errors = []
const warnings = []

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0
}

function duplicateValues(values) {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

function fail(message) {
  errors.push(message)
}

for (const model of STATIC_CHECKLIST_MODELS) {
  const release = model.release || 'unknown release'
  if (!model.players.length) fail(`${release}: no checklist players`)
  if (!model.multipliers.length) fail(`${release}: no variation curve`)

  const duplicatePlayers = duplicateValues(model.players.map((player) => normalize(player.playerName)))
  for (const player of duplicatePlayers) fail(`${release}: duplicate player ${player}`)

  const duplicateLanes = duplicateValues(model.multipliers.map((lane) => normalize(lane.variation)))
  for (const lane of duplicateLanes) fail(`${release}: duplicate release lane ${lane}`)

  for (const lane of model.multipliers) {
    if (!finitePositive(lane.avgMultiplier)) {
      fail(`${release}: ${lane.variation} has invalid multiplier ${lane.avgMultiplier}`)
    }
  }

  for (const player of model.players) {
    if (!player.playerName.trim()) fail(`${release}: player with an empty name`)
    if (!Number.isFinite(Number(player.baseAvgPrice)) || Number(player.baseAvgPrice) < 0) {
      fail(`${release}: ${player.playerName} has invalid base price ${player.baseAvgPrice}`)
    }

    const playerDuplicateLanes = duplicateValues(
      player.variations.map((variation) => normalize(variation.variation)),
    )
    for (const lane of playerDuplicateLanes) {
      fail(`${release}: ${player.playerName} has duplicate lane ${lane}`)
    }
    for (const variation of player.variations) {
      if (!finitePositive(variation.avgPrice) || !finitePositive(variation.multiplier)) {
        fail(`${release}: ${player.playerName} / ${variation.variation} has invalid price math`)
      }
    }
  }
}

const bowman2026 = STATIC_CHECKLIST_MODELS.find((model) => model.release === '2026-Bowman')
if (!bowman2026) {
  fail('2026-Bowman: canonical model is missing')
} else {
  if (bowman2026.modelVersion !== FAIR_VALUE_MODEL_VERSION) {
    fail(`2026-Bowman: expected model ${FAIR_VALUE_MODEL_VERSION}, found ${bowman2026.modelVersion ?? 'unversioned'}`)
  }

  const officialByLabel = new Map(
    BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((definition) => [definition.label, definition]),
  )
  const actualByLabel = new Map()
  for (const lane of bowman2026.multipliers) {
    const canonical = canonicalizeBowman2026AutoLabel(lane.variation)
    if (!canonical) {
      fail(`2026-Bowman: out-of-taxonomy lane ${lane.variation}`)
      continue
    }
    if (actualByLabel.has(canonical)) fail(`2026-Bowman: duplicate canonical lane ${canonical}`)
    actualByLabel.set(canonical, lane)
  }

  for (const [label, definition] of officialByLabel) {
    const lane = actualByLabel.get(label)
    if (!lane) {
      fail(`2026-Bowman: missing official lane ${label}`)
      continue
    }
    const adjustment = Number(lane.avgMultiplier) / definition.priorMultiplier
    if (adjustment < 0.4 || adjustment > 2.5) {
      fail(`2026-Bowman: ${label} escaped its structural guardrail (${adjustment.toFixed(2)}x prior)`)
    }
    if (lane.modelMethod === 'structural-prior-only') {
      warnings.push(`2026-Bowman: ${label} is still priced from structural prior only`)
    }
  }

  for (const label of actualByLabel.keys()) {
    if (!officialByLabel.has(label)) fail(`2026-Bowman: unexpected official-curve lane ${label}`)
  }

  const base = actualByLabel.get('Base Auto')
  if (Number(base?.avgMultiplier) !== 1) fail('2026-Bowman: Base Auto multiplier must equal 1')
}

const playerCount = STATIC_CHECKLIST_MODELS.reduce((sum, model) => sum + model.players.length, 0)
const laneCount = STATIC_CHECKLIST_MODELS.reduce((sum, model) => sum + model.multipliers.length, 0)
console.log(`Fair-value audit: ${STATIC_CHECKLIST_MODELS.length} releases, ${playerCount} players, ${laneCount} release lanes`)
console.log(`Snapshot generated: ${STATIC_CHECKLIST_GENERATED_AT}`)
for (const warning of warnings) console.warn(`WARN: ${warning}`)

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`)
  process.exitCode = 1
} else {
  console.log(`PASS: ${FAIR_VALUE_MODEL_VERSION} invariants are intact`)
}
