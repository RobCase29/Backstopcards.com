import {
  BOWMAN_2026_CHROME_AUTO_VARIATIONS,
  canonicalizeBowman2026AutoLabel,
} from '../shared/bowman2026Taxonomy.js'
import {
  canonicalizeHistoricalBowmanAutoLabel,
  historicalBowmanAutoPrior,
} from '../shared/bowmanAutoTaxonomy.js'
import { FAIR_VALUE_MODEL_VERSION } from '../shared/fairValueEngine.js'
import {
  STATIC_CHECKLIST_GENERATED_AT,
  STATIC_CHECKLIST_MODELS,
} from '../src/data/staticChecklistSnapshot.ts'

const errors = []
const warnings = []
const evidenceCounts = { observed: 0, modeled: 0, indicative: 0 }
const registryCounts = { candidates: 0, accepted: 0, quarantined: 0 }

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

  if (model.modelVersion === FAIR_VALUE_MODEL_VERSION) {
    const diagnostics = model.modelDiagnostics
    if (!diagnostics) {
      fail(`${release}: missing release-lane diagnostics`)
    } else {
      const candidateSales = Number(diagnostics.candidateSales)
      const accepted = Number(diagnostics.acceptedLaneCount)
      const quarantined = Number(diagnostics.quarantinedLaneCount)
      if (![candidateSales, accepted, quarantined].every((value) => Number.isInteger(value) && value >= 0)) {
        fail(`${release}: invalid release-lane diagnostic counts`)
      } else {
        registryCounts.candidates += candidateSales
        registryCounts.accepted += accepted
        registryCounts.quarantined += quarantined
      }
      if ((diagnostics.acceptedLanes?.length ?? 0) !== accepted) {
        fail(`${release}: accepted-lane diagnostic detail does not match its count`)
      }
      if ((diagnostics.quarantinedLanes?.length ?? 0) !== quarantined) {
        fail(`${release}: quarantined-lane diagnostic detail does not match its count`)
      }
      const acceptedLabels = new Set((diagnostics.acceptedLanes ?? []).map((lane) => normalize(lane.label)))
      for (const lane of model.multipliers) {
        if (
          !['base', 'official'].includes(lane.modelRegistryClass) &&
          !acceptedLabels.has(normalize(lane.variation))
        ) {
          fail(`${release}: modeled lane ${lane.variation} bypassed the release registry`)
        }
      }
    }
  }

  const duplicatePlayers = duplicateValues(model.players.map((player) => normalize(player.playerName)))
  for (const player of duplicatePlayers) fail(`${release}: duplicate player ${player}`)

  const duplicateLanes = duplicateValues(model.multipliers.map((lane) => normalize(lane.variation)))
  for (const lane of duplicateLanes) fail(`${release}: duplicate release lane ${lane}`)

  const canonicalizeLane = model.releaseYear === 2026 && model.category === 'bowman'
    ? canonicalizeBowman2026AutoLabel
    : canonicalizeHistoricalBowmanAutoLabel
  if (model.modelVersion === FAIR_VALUE_MODEL_VERSION) {
    const canonicalLabels = []
    for (const lane of model.multipliers) {
      const canonical = canonicalizeLane(lane.variation, { assumeAuto: true })
      if (!canonical) fail(`${release}: unresolved canonical lane ${lane.variation}`)
      else canonicalLabels.push(normalize(canonical))
    }
    for (const lane of duplicateValues(canonicalLabels)) fail(`${release}: duplicate canonical release lane ${lane}`)
  }

  for (const lane of model.multipliers) {
    if (!finitePositive(lane.avgMultiplier)) {
      fail(`${release}: ${lane.variation} has invalid multiplier ${lane.avgMultiplier}`)
    }
    if (model.modelVersion === FAIR_VALUE_MODEL_VERSION) {
      if (!finitePositive(lane.modelLowMultiplier) || !finitePositive(lane.modelHighMultiplier)) {
        fail(`${release}: ${lane.variation} is missing its valuation interval`)
      } else if (
        Number(lane.modelLowMultiplier) > Number(lane.avgMultiplier) ||
        Number(lane.modelHighMultiplier) < Number(lane.avgMultiplier)
      ) {
        fail(`${release}: ${lane.variation} interval does not contain its point estimate`)
      }
      if (!Number.isFinite(Number(lane.modelConfidence)) || Number(lane.modelConfidence) < 0 || Number(lane.modelConfidence) > 1) {
        fail(`${release}: ${lane.variation} has invalid confidence ${lane.modelConfidence}`)
      }
      if (!['observed', 'modeled', 'indicative'].includes(lane.modelEvidence)) {
        fail(`${release}: ${lane.variation} has no valid evidence tier`)
      } else {
        evidenceCounts[lane.modelEvidence] += 1
      }
      if (typeof lane.modelActionable !== 'boolean') {
        fail(`${release}: ${lane.variation} has no actionability decision`)
      }
      if (lane.modelEvidence === 'indicative') {
        if (lane.modelActionable !== false) fail(`${release}: ${lane.variation} is indicative but actionable`)
        if (Number(lane.modelConfidence) > 0.42) fail(`${release}: ${lane.variation} indicative confidence exceeds 42%`)
      }
      if (lane.modelEvidence === 'observed' && lane.modelActionable !== true) {
        fail(`${release}: ${lane.variation} is observed but not actionable`)
      }
      if (!isBaseLane(lane.variation) && !lane.structuralPriorSource) {
        fail(`${release}: ${lane.variation} has no structural prior provenance`)
      }
      if (!isBaseLane(lane.variation) && !['official', 'standard', 'release-confirmed'].includes(lane.modelRegistryClass)) {
        fail(`${release}: ${lane.variation} has no release-registry decision`)
      }
      if (lane.modelRegistryClass === 'release-confirmed') {
        const registrySupported =
          Number(lane.registryPlayerCount) >= 2 ||
          Number(lane.registryExplicitSales) >= 2 ||
          Number(lane.totalSales) >= 4
        if (!registrySupported) {
          fail(`${release}: ${lane.variation} bypassed release-specific identity support`)
        }
      }
      if (!(model.releaseYear === 2026 && model.category === 'bowman') && !isBaseLane(lane.variation)) {
        const genericPrior = historicalBowmanAutoPrior(lane.variation)
        if (!genericPrior) {
          fail(`${release}: ${lane.variation} has no cross-release structural prior`)
        } else {
          const adjustment = Number(lane.avgMultiplier) / genericPrior.multiplier
          if (adjustment < 0.4 || adjustment > 2.5) {
            fail(`${release}: ${lane.variation} escaped its historical guardrail (${adjustment.toFixed(2)}x prior)`)
          }
        }
      }
    }
  }

  for (const player of model.players) {
    if (!player.playerName.trim()) fail(`${release}: player with an empty name`)
    if (!Number.isFinite(Number(player.baseAvgPrice)) || Number(player.baseAvgPrice) < 0) {
      fail(`${release}: ${player.playerName} has invalid base price ${player.baseAvgPrice}`)
    }

    const playerCanonicalLabels = player.variations.map((variation) => {
      if (model.modelVersion !== FAIR_VALUE_MODEL_VERSION) return normalize(variation.variation)
      const canonical = canonicalizeLane(variation.variation, { assumeAuto: true })
      if (!canonical) fail(`${release}: ${player.playerName} has unresolved lane ${variation.variation}`)
      return normalize(canonical ?? variation.variation)
    })
    const playerDuplicateLanes = duplicateValues(playerCanonicalLabels)
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

function isBaseLane(value) {
  return normalize(value) === 'base auto' || normalize(value) === 'base'
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
  if (base?.modelEvidence !== 'observed' || base?.modelActionable !== true) {
    fail('2026-Bowman: Base Auto must be observed and actionable')
  }
}

const playerCount = STATIC_CHECKLIST_MODELS.reduce((sum, model) => sum + model.players.length, 0)
const laneCount = STATIC_CHECKLIST_MODELS.reduce((sum, model) => sum + model.multipliers.length, 0)
console.log(`Fair-value audit: ${STATIC_CHECKLIST_MODELS.length} releases, ${playerCount} players, ${laneCount} release lanes`)
console.log(`Evidence tiers: ${evidenceCounts.observed} observed, ${evidenceCounts.modeled} modeled, ${evidenceCounts.indicative} indicative`)
console.log(`Release registry: ${registryCounts.accepted} accepted, ${registryCounts.quarantined} quarantined from ${registryCounts.candidates} candidate sales`)
console.log(`Snapshot generated: ${STATIC_CHECKLIST_GENERATED_AT}`)
for (const warning of warnings) console.warn(`WARN: ${warning}`)

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`)
  process.exitCode = 1
} else {
  console.log(`PASS: ${FAIR_VALUE_MODEL_VERSION} invariants are intact`)
}
