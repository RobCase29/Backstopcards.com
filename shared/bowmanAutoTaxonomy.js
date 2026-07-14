import { extractSerialDenominator } from './bowman2026Taxonomy.js'
import { classifyBowmanAutoTitleScope } from './bowmanAutoTitleScope.js'

const TEAM_COLOR_CONTEXTS = [
  /\bboston\s+red\s+sox\b/gi,
  /\bred\s+sox\b/gi,
  /\bchicago\s+white\s+sox\b/gi,
  /\bwhite\s+sox\b/gi,
  /\btoronto\s+blue\s+jays\b/gi,
  /\bblue\s+jays\b/gi,
  /\bcincinnati\s+reds\b/gi,
]

const STANDARD_SCARCITY_CURVE = Object.freeze([
  [499, 1.35],
  [400, 1.48],
  [299, 1.65],
  [250, 1.78],
  [199, 1.9],
  [150, 2.1],
  [125, 2.25],
  [100, 2.55],
  [99, 2.6],
  [89, 3.1],
  [76, 3.2],
  [75, 3.25],
  [71, 3.4],
  [50, 4.5],
  [35, 5.7],
  [25, 7.4],
  [15, 10.2],
  [11, 12.2],
  [10, 13],
  [8, 15],
  [5, 22],
  [3, 31],
  [1, 65],
])

const PROFILES = Object.freeze([
  profile('printing-plate', 'Printing Plate', /\bprinting\s+plate\b/, { factor: 0.78, defaultDenominator: 1 }),
  profile('superfractor', 'Superfractor', /\bsuper\s*fractor\b/, { factor: 1.15, defaultDenominator: 1 }),
  profile('gold-ink', 'Gold Ink', /\bgold\s+(?:ink|image\s+variation)\b/, { factor: 1.35, defaultDenominator: 15 }),
  profile('bw-shimmer', 'B&W Shimmer', /\b(?:b\s*(?:and|&)\s*w|bw|black\s+(?:and|&)\s+white)\s+shimmer\b/, { factor: 1.3, defaultDenominator: 11 }),
  profile('gumball-snack-pack', 'Gumball Snack Pack', /\b(?:gum\s*ball|gumball|bubble\s+gum)\b/, { factor: 1.02, defaultDenominator: 5 }),
  profile('sunflower-snack-pack', 'Sunflower Snack Pack', /\bsunflower(?:\s+seeds?)?\b/, { factor: 1.02, defaultDenominator: 5 }),
  profile('peanuts-snack-pack', 'Peanuts Snack Pack', /\bpeanuts?\b/, { factor: 1.02, defaultDenominator: 5 }),
  profile('popcorn-snack-pack', 'Popcorn Snack Pack', /\bpopcorn\b/, { factor: 1.02, defaultDenominator: 5 }),
  profile('hta-choice-mojo', 'HTA Choice Mojo', /\bhta\s+choice\s+mojo\b/, { factor: 0.98, defaultDenominator: 150 }),
  profile('hta-choice', 'HTA Choice', /\bhta\s+choice\b/, { factor: 0.9, defaultDenominator: 150 }),
  profile('gold-mini-diamond', 'Gold Mini Diamond', /\bgold\s+mini[-\s]*diamond\b/, { factor: 1.18, defaultDenominator: 50 }),
  profile('mini-diamond', 'Mini Diamond', /\bmini[-\s]*diamond\b/, { factor: 1.12, defaultDenominator: 100 }),
  profile('image-variation', 'Image Variation', /\bimage\s+variation\b/, { factor: 1.2 }),
  profile('blue-raywave', 'Blue RayWave', /\bblue\s+ray\s*wave\b/, { factor: 1.1, defaultDenominator: 150 }),
  profile('black-raywave', 'Black RayWave', /\bblack\s+ray\s*wave\b/, { factor: 1.1 }),
  profile('red-wave', 'Red Wave', /\bred\s+wave\b/, { factor: 1.12, defaultDenominator: 5 }),
  profile('orange-wave', 'Orange Wave', /\borange\s+wave\b/, { factor: 1.1, defaultDenominator: 25 }),
  profile('gold-wave', 'Gold Wave', /\bgold\s+wave\b/, { factor: 1.1, defaultDenominator: 50 }),
  profile('blue-wave', 'Blue Wave', /\bblue\s+wave\b/, { factor: 1.08, defaultDenominator: 150 }),
  profile('green-wave', 'Green Wave', /\bgreen\s+wave\b/, { factor: 1.08 }),
  profile('black-wave', 'Black Wave', /\bblack\s+wave\b/, { factor: 1.08, defaultDenominator: 1 }),
  profile('red-lava', 'Red Lava', /\bred\s+lava\b/, { factor: 1.12, defaultDenominator: 5 }),
  profile('orange-lava', 'Orange Lava', /\borange\s+lava\b/, { factor: 1.1, defaultDenominator: 25 }),
  profile('green-lava', 'Green Lava', /\bgreen\s+lava\b/, { factor: 1.08, defaultDenominator: 99 }),
  profile('aqua-lava', 'Aqua Lava', /\baqua\s+lava\b/, { factor: 1.08, defaultDenominator: 199 }),
  profile('gold-shimmer', 'Gold Shimmer', /\bgold\s+shimmer\b/, { factor: 1.12, defaultDenominator: 50 }),
  profile('orange-shimmer', 'Orange Shimmer', /\borange\s+shimmer\b/, { factor: 1.1, defaultDenominator: 25 }),
  profile('green-shimmer', 'Green Shimmer', /\bgreen\s+shimmer\b/, { factor: 1.1, defaultDenominator: 99 }),
  profile('red-shimmer', 'Red Shimmer', /\bred\s+shimmer\b/, { factor: 1.1, defaultDenominator: 5 }),
  profile('green-grass', 'Green Grass', /\b(?:green\s+grass|grass\s+green)\b/, { factor: 1.08, defaultDenominator: 99 }),
  profile('blue-reptilian', 'Blue Reptilian', /\b(?:blue\s+reptilian|reptilian\s+blue)\b/, { factor: 1.08, defaultDenominator: 150 }),
  profile('green-reptilian', 'Green Reptilian', /\b(?:green\s+reptilian|reptilian\s+green)\b/, { factor: 1.08, defaultDenominator: 99 }),
  profile('blue-lunar', 'Blue Lunar', /\bblue\s+lunar(?:\s+crater)?\b/, { factor: 1.08, defaultDenominator: 150 }),
  profile('lunar', 'Lunar', /\blunar(?:\s+crater)?\b/, { factor: 1.05 }),
  profile('x-fractor', 'X-Fractor', /\bx[-\s]*(?:re)?fractor\b|\bxfractor\b/, { factor: 1.1 }),
  profile('sparkle', 'Sparkle', /\bsparkle\b/, { factor: 1.1 }),
  profile('speckle', 'Speckle', /\bspeckl(?:e|ed)\b/, { factor: 1.06 }),
  profile('blue-atomic', 'Blue Atomic', /\bblue\s+atomic\b/, { factor: 1.08, defaultDenominator: 150 }),
  profile('green-atomic', 'Green Atomic', /\bgreen\s+atomic\b/, { factor: 1.08, defaultDenominator: 99 }),
  profile('gold-atomic', 'Gold Atomic', /\bgold\s+atomic\b/, { factor: 1.1, defaultDenominator: 50 }),
  profile('orange-atomic', 'Orange Atomic', /\borange\s+atomic\b/, { factor: 1.1, defaultDenominator: 25 }),
  profile('red-atomic', 'Red Atomic', /\bred\s+atomic\b/, { factor: 1.12, defaultDenominator: 5 }),
  profile('atomic', 'Atomic', /\batomic\b/, { factor: 1.08, defaultDenominator: 100 }),
  profile('mojo', 'Mojo', /\bmojo\b/, { factor: 0.96 }),
  profile('purple', 'Purple', /\bpurple\b/, { factor: 0.98, defaultDenominator: 250 }),
  profile('blue', 'Blue', /\bblue\b/, { factor: 1, defaultDenominator: 150 }),
  profile('aqua', 'Aqua', /\baqua\b/, { factor: 1.02, defaultDenominator: 199 }),
  profile('green', 'Green', /\bgreen\b/, { factor: 1, defaultDenominator: 99 }),
  profile('yellow', 'Yellow', /\byellow\b/, { factor: 1, defaultDenominator: 75 }),
  profile('gold', 'Gold', /\bgold\b/, { factor: 1, defaultDenominator: 50 }),
  profile('orange', 'Orange', /\borange\b/, { factor: 1, defaultDenominator: 25 }),
  profile('black', 'Black', /\bblack\b/, { factor: 1 }),
  profile('red', 'Red', /\bred\b/, { factor: 1, defaultDenominator: 5 }),
  // Generic "refractor" must come after every named color/texture. Seller
  // titles commonly say "Purple Refractor /250"; matching the generic token
  // first creates a duplicate Refractor /250 lane with no physical meaning.
  profile('refractor', 'Refractor', /\brefractor\b/, { factor: 1, defaultDenominator: 499 }),
])

const STRICT_PROFILE_DENOMINATORS = Object.freeze({
  'printing-plate': [1],
  superfractor: [1],
  'gold-ink': [15],
  'bw-shimmer': [11],
  'gumball-snack-pack': [5],
  'sunflower-snack-pack': [5],
  'peanuts-snack-pack': [5],
  'popcorn-snack-pack': [5],
  'gold-mini-diamond': [50],
  'mini-diamond': [100],
  'blue-raywave': [150],
  'red-wave': [5],
  'orange-wave': [25],
  'gold-wave': [50],
  'blue-wave': [150],
  'red-lava': [5],
  'orange-lava': [25],
  'green-lava': [99],
  'aqua-lava': [199, 150, 125],
  'gold-shimmer': [50],
  'orange-shimmer': [25],
  'green-shimmer': [99],
  'red-shimmer': [5],
  'green-grass': [99],
  'blue-reptilian': [150],
  'green-reptilian': [99],
  'blue-lunar': [150],
  'blue-atomic': [150],
  'green-atomic': [99],
  'gold-atomic': [50],
  'orange-atomic': [25],
  'red-atomic': [5],
  atomic: [100],
  refractor: [499],
  purple: [250],
  blue: [150],
  aqua: [199, 150, 125],
  green: [99],
  yellow: [75],
  gold: [50],
  orange: [25],
  red: [5],
})

const OUT_OF_SCOPE = /\b(?:paper|sapphire)\b/

function profile(id, label, pattern, options = {}) {
  return Object.freeze({ id, label, pattern, factor: options.factor ?? 1, defaultDenominator: options.defaultDenominator ?? null })
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function identityText(title, playerName = '') {
  let text = String(title ?? '')
  if (playerName.trim()) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(playerName.trim()).replace(/\\\s+/g, '\\s+')}\\b`, 'gi'), ' ')
  }
  for (const context of TEAM_COLOR_CONTEXTS) text = text.replace(context, ' ')
  return normalize(text)
}

export function standardBowmanAutoMultiplier(serialDenominator) {
  const denominator = Number(serialDenominator)
  if (!Number.isFinite(denominator) || denominator <= 0) return null
  const exact = STANDARD_SCARCITY_CURVE.find(([value]) => value === denominator)
  if (exact) return exact[1]
  const descending = [...STANDARD_SCARCITY_CURVE].sort((left, right) => right[0] - left[0])
  if (denominator >= descending[0][0]) return descending[0][1]
  if (denominator <= descending.at(-1)[0]) return descending.at(-1)[1]
  for (let index = 0; index < descending.length - 1; index += 1) {
    const upper = descending[index]
    const lower = descending[index + 1]
    if (denominator > upper[0] || denominator < lower[0]) continue
    const progress = (Math.log(upper[0]) - Math.log(denominator)) / (Math.log(upper[0]) - Math.log(lower[0]))
    return Math.exp(Math.log(upper[1]) + (Math.log(lower[1]) - Math.log(upper[1])) * progress)
  }
  return null
}

export function historicalBowmanAutoPrior(value) {
  const resolved = typeof value === 'string' ? canonicalizeHistoricalBowmanAutoVariation(value, { assumeAuto: true }) : value
  const definition = resolved?.definition ?? resolved
  if (!definition?.serialDenominator || !definition.modelEligible) return null
  const baseline = standardBowmanAutoMultiplier(definition.serialDenominator)
  if (!baseline) return null
  return Object.freeze({
    multiplier: baseline * definition.profile.factor,
    reliability: definition.inferredDenominator ? 0.34 : definition.profile.id === 'refractor' ? 0.56 : 0.46,
    source: 'cross-release-structure',
    identity: definition.identity,
  })
}

export function canonicalizeHistoricalBowmanAutoVariation(title, options = {}) {
  const original = String(title ?? '').trim()
  const text = identityText(original, options.playerName)
  const explicitDenominator = extractSerialDenominator(original)
  const scope = classifyBowmanAutoTitleScope(original)

  if (!scope.eligible) return result(null, 'out-of-scope', 0.99, [scope.reason])
  if (OUT_OF_SCOPE.test(text)) return result(null, 'out-of-scope', 0.99, ['adjacent product or insert auto'])

  const matchedProfiles = PROFILES.filter((candidate) => candidate.pattern.test(text))
  const matched = matchedProfiles[0] ?? null
  if (matched) {
    const denominator = explicitDenominator ?? matched.defaultDenominator
    if (!denominator) return result(null, 'ambiguous', 0.3, [`${matched.label} has no reliable serial denominator`])
    const allowedDenominators = STRICT_PROFILE_DENOMINATORS[matched.id]
    if (explicitDenominator && allowedDenominators && !allowedDenominators.includes(explicitDenominator)) {
      return result(null, 'ambiguous', 0.18, [
        `${matched.label} /${explicitDenominator} conflicts with the known ${allowedDenominators.map((value) => `/${value}`).join(' or ')} lane`,
      ])
    }
    const inferredDenominator = !explicitDenominator
    const definition = Object.freeze({
      identity: `${matched.id}:${denominator}`,
      label: `${matched.label} /${denominator}`,
      profile: matched,
      serialDenominator: denominator,
      inferredDenominator,
      registryClass: allowedDenominators ? 'standard' : 'release-confirmed',
      modelEligible: true,
    })
    return result(definition, 'matched', inferredDenominator ? 0.76 : 0.97, [
      inferredDenominator ? `standard ${matched.label} denominator inferred` : `explicit ${matched.label} /${denominator}`,
    ])
  }

  if (explicitDenominator) {
    return result(null, 'ambiguous', 0.2, [`/${explicitDenominator} has no trustworthy parallel identity`])
  }

  const looksAuto = options.assumeAuto || /\b(?:auto|autograph|redemption|on card)\b/.test(text)
  if (looksAuto) {
    return result(Object.freeze({
      identity: 'base-auto',
      label: 'Base Auto',
      profile: Object.freeze({ id: 'base-auto', label: 'Base Auto', factor: 1, defaultDenominator: null }),
      serialDenominator: null,
      inferredDenominator: false,
      registryClass: 'base',
      modelEligible: true,
    }), 'matched', 0.86, ['no parallel evidence; classified as base auto'])
  }
  return result(null, 'unknown', 0.15, ['insufficient manufacturer-auto evidence'])
}

export function canonicalizeHistoricalBowmanAutoLabel(value, options = {}) {
  return canonicalizeHistoricalBowmanAutoVariation(value, options).definition?.label ?? null
}

function result(definition, status, confidence, reasons) {
  return Object.freeze({
    definition,
    status,
    confidence,
    reasons: Object.freeze(reasons),
    modelEligible: status === 'matched' && Boolean(definition?.modelEligible),
  })
}
