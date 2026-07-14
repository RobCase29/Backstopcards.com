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

/**
 * The official 2026 Bowman Chrome Prospect Autograph lanes. Structural
 * multipliers are deliberately priors, not prices. They preserve the original
 * ProspectPulse-style curve until release sales provide stronger evidence.
 */
export const BOWMAN_2026_CHROME_AUTO_VARIATIONS = Object.freeze([
  variation('base-auto', 'Base Auto', null, 1, 1, ['base auto', 'base autograph'], { printRun: 1880, reliability: 1 }),
  variation('refractor-499', 'Refractor /499', 499, 1.35, 2, ['refractor', 'refractor redemption']),
  variation('speckle-299', 'Speckle /299', 299, 1.75, 3, ['speckle', 'speckled']),
  variation('purple-250', 'Purple /250', 250, 1.65, 4, ['purple']),
  variation('blue-150', 'Blue /150', 150, 1.95, 5, ['blue']),
  variation('blue-x-fractor-150', 'Blue X-Fractor /150', 150, 2.2, 6, ['blue x-fractor', 'blue xfractor']),
  variation('hta-choice-150', 'HTA Choice /150', 150, 1.75, 7, ['hta choice']),
  variation('aqua-125', 'Aqua /125', 125, 2.05, 8, ['aqua']),
  variation('mini-diamond-100', 'Mini Diamond /100', 100, 2.55, 9, ['mini diamond', 'mini-diamond']),
  variation('green-99', 'Green /99', 99, 2.25, 10, ['green']),
  variation('green-grass-99', 'Green Grass /99', 99, 2.4, 11, ['green grass', 'grass green']),
  variation('reptilian-green-99', 'Reptilian Green /99', 99, 2.4, 12, ['reptilian green', 'green reptilian', 'reptilian']),
  variation('green-shimmer-99', 'Green Shimmer /99', 99, 2.45, 13, ['green shimmer']),
  variation('green-lava-99', 'Green Lava /99', 99, 2.4, 14, ['green lava']),
  variation('packfractor-89', 'Packfractor /89', 89, 4.5, 15, ['packfractor', 'pack fractor']),
  variation('yellow-75', 'Yellow /75', 75, 3, 16, ['yellow']),
  variation('yellow-x-fractor-75', 'Yellow X-Fractor /75', 75, 3.3, 17, ['yellow x-fractor', 'yellow xfractor']),
  variation('gold-50', 'Gold /50', 50, 4, 18, ['gold']),
  variation('gold-shimmer-50', 'Gold Shimmer /50', 50, 4.4, 19, ['gold shimmer']),
  variation('gold-lava-50', 'Gold Lava /50', 50, 4.3, 20, ['gold lava']),
  variation('logofractor-35', 'Logofractor /35', 35, 5.5, 21, ['logofractor', 'logo fractor']),
  variation('orange-25', 'Orange /25', 25, 7, 22, ['orange']),
  variation('orange-x-fractor-25', 'Orange X-Fractor /25', 25, 7.5, 23, ['orange x-fractor', 'orange xfractor']),
  variation('orange-shimmer-25', 'Orange Shimmer /25', 25, 7.25, 24, ['orange shimmer']),
  variation('orange-wave-25', 'Orange Wave /25', 25, 7, 25, ['orange wave']),
  variation('gold-ink-15', 'Gold Ink /15', 15, 16, 26, ['gold ink', 'gold image variation', 'gold ink auto'], { reliability: 0.3 }),
  variation('bw-shimmer-11', 'B&W Shimmer /11', 11, 16, 27, ['b&w shimmer', 'b and w shimmer', 'black and white shimmer', 'bw shimmer'], { reliability: 0.3 }),
  variation('black-10', 'Black /10', 10, 12, 28, ['black']),
  variation('black-x-fractor-10', 'Black X-Fractor /10', 10, 13, 29, ['black x-fractor', 'black xfractor']),
  variation('gumball-5', 'Gumball Snack Pack /5', 5, 20, 30, ['gumball', 'gum ball', 'bubble gum'], { reliability: 0.25 }),
  variation('sunflower-5', 'Sunflower Snack Pack /5', 5, 20, 31, ['sunflower seeds', 'sunflower seed', 'sunflower'], { reliability: 0.25 }),
  variation('peanuts-5', 'Peanuts Snack Pack /5', 5, 20, 32, ['peanuts', 'peanut'], { reliability: 0.25 }),
  variation('popcorn-5', 'Popcorn Snack Pack /5', 5, 20, 33, ['popcorn'], { reliability: 0.25 }),
  variation('red-5', 'Red /5', 5, 20, 34, ['red'], { reliability: 0.25 }),
  variation('red-lava-5', 'Red Lava /5', 5, 22, 35, ['red lava'], { reliability: 0.25 }),
  variation('red-x-fractor-5', 'Red X-Fractor /5', 5, 22, 36, ['red x-fractor', 'red xfractor'], { reliability: 0.25 }),
  variation('firefractor-3', 'Firefractor /3', 3, 30, 37, ['firefractor', 'fire fractor'], { reliability: 0.2 }),
  variation('superfractor-1', 'Superfractor /1', 1, 80, 38, ['superfractor', 'super fractor', 'super'], { reliability: 0.15 }),
  variation('printing-plate-1', 'Printing Plate /1', 1, 50, 39, ['printing plate', 'plate'], { reliability: 0.15 }),
])

const BY_ID = new Map(BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((item) => [item.id, item]))
const BY_LABEL = new Map(BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((item) => [normalize(item.label), item]))
const BY_DENOMINATOR = new Map()
for (const item of BOWMAN_2026_CHROME_AUTO_VARIATIONS) {
  if (!item.serialDenominator) continue
  const rows = BY_DENOMINATOR.get(item.serialDenominator) ?? []
  rows.push(item)
  BY_DENOMINATOR.set(item.serialDenominator, rows)
}

function variation(id, label, serialDenominator, priorMultiplier, scarcityOrder, aliases, options = {}) {
  return Object.freeze({
    id,
    label,
    productFamily: 'Bowman Chrome',
    cardClass: 'auto',
    serialDenominator,
    printRun: options.printRun ?? serialDenominator,
    priorMultiplier,
    priorReliability: options.reliability ?? 0.6,
    scarcityOrder,
    aliases: Object.freeze(aliases),
  })
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeIdentityNoise(title, playerName = '') {
  let text = String(title ?? '')
  if (playerName.trim()) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(playerName.trim()).replace(/\\\s+/g, '\\s+')}\\b`, 'gi'), ' ')
  }
  for (const pattern of TEAM_COLOR_CONTEXTS) text = text.replace(pattern, ' ')
  return normalize(text)
}

export function extractSerialDenominator(title) {
  const text = String(title ?? '')
  const explicit = text.match(/(?:#\s*\/|\bout\s+of\s+|\bnumbered\s+to\s+|\bserial(?:ly)?\s+numbered\s+to\s+)(\d{1,4})\b/i)
  if (explicit) return Number(explicit[1])
  // Do not turn grades (9.5/10), dates (3/1/2036), or ratios into serial
  // numbers. A serial fraction either begins at a clean token boundary or is
  // written as a bare /N, and cannot be followed by another slash.
  const fractions = [...text.matchAll(/(?<![.\d])(?:\d{1,4}\s*)?\/\s*(\d{1,4})\b(?!\s*\/)/g)]
  for (const fraction of fractions) {
    const denominator = Number(fraction[1])
    if (denominator > 0 && denominator <= 999) return denominator
  }
  return null
}

function explicitCandidates(text) {
  const checks = [
    ['gold-ink-15', /\bgold\s+ink\b|\bgold\s+image\s+variation\b/],
    ['bw-shimmer-11', /\b(?:b\s*(?:and|&)\s*w|bw|black\s+(?:and|&)\s+white)\s+shimmer\b/],
    ['sunflower-5', /\bsunflower(?:\s+seeds?)?\b/],
    ['gumball-5', /\b(?:gum\s*ball|gumball|bubble\s*gum)\b/],
    ['peanuts-5', /\bpeanuts?\b/],
    ['popcorn-5', /\bpopcorn\b/],
    ['printing-plate-1', /\bprinting\s+plate\b/],
    ['superfractor-1', /\bsuper\s*fractor\b|\bsuperfractor\b/],
    ['firefractor-3', /\bfire\s*fractor\b|\bfirefractor\b/],
    ['logofractor-35', /\blogo\s*fractor\b|\blogofractor\b/],
    ['packfractor-89', /\bpack\s*fractor\b|\bpackfractor\b/],
    ['mini-diamond-100', /\bmini[-\s]*diamond\b/],
    ['hta-choice-150', /\bhta\s+choice\b/],
    ['blue-x-fractor-150', /\bblue\s+x[-\s]*(?:re)?fractor\b|\bblue\s+xfractor\b/],
    ['yellow-x-fractor-75', /\byellow\s+x[-\s]*(?:re)?fractor\b|\byellow\s+xfractor\b/],
    ['orange-x-fractor-25', /\borange\s+x[-\s]*(?:re)?fractor\b|\borange\s+xfractor\b/],
    ['red-x-fractor-5', /\bred\s+x[-\s]*(?:re)?fractor\b|\bred\s+xfractor\b/],
    ['black-x-fractor-10', /\bblack\s+x[-\s]*(?:re)?fractor\b|\bblack\s+xfractor\b/],
    ['green-grass-99', /\bgreen\s+grass\b|\bgrass\s+green\b/],
    ['reptilian-green-99', /\b(?:reptilian\s+green|green\s+reptilian|reptilian)\b/],
    ['green-shimmer-99', /\bgreen\s+shimmer\b/],
    ['green-lava-99', /\bgreen\s+lava\b/],
    ['gold-shimmer-50', /\bgold\s+shimmer\b/],
    ['gold-lava-50', /\bgold\s+lava\b/],
    ['orange-shimmer-25', /\borange\s+shimmer\b/],
    ['orange-wave-25', /\borange\s+wave\b/],
    ['red-lava-5', /\bred\s+lava\b/],
    ['speckle-299', /\bspeckl(?:e|ed)\b/],
    ['purple-250', /\bpurple\b/],
    ['aqua-125', /\baqua\b/],
    ['yellow-75', /\byellow\b/],
    ['orange-25', /\borange\b/],
    ['gold-50', /\bgold\b/],
    ['green-99', /\bgreen\b/],
    ['blue-150', /\bblue\b/],
    ['black-10', /\bblack\b/],
    ['red-5', /\bred\b/],
  ]
  return checks.filter(([, pattern]) => pattern.test(text)).map(([id]) => BY_ID.get(id)).filter(Boolean)
}

export function bowman2026AutoDefinition(value) {
  if (!value) return null
  if (typeof value === 'object' && value.id) return BY_ID.get(value.id) ?? null
  const normalized = normalize(value)
  const direct = BY_LABEL.get(normalized)
  if (direct) return direct
  return BOWMAN_2026_CHROME_AUTO_VARIATIONS.find((item) => item.aliases.some((alias) => normalize(alias) === normalized)) ?? null
}

export function canonicalizeBowman2026AutoVariation(title, options = {}) {
  const original = String(title ?? '').trim()
  const text = removeIdentityNoise(original, options.playerName)
  const serialDenominator = extractSerialDenominator(original)
  const scope = classifyBowmanAutoTitleScope(original)
  if (!scope.eligible) {
    return result(null, 'out-of-scope', 0.99, serialDenominator, [scope.reason])
  }
  const outOfScope = /\b(?:sapphire|mega|mojo|paper|retail)\b/.test(text) || /\bimage\s+variation\b/.test(text)
  if (outOfScope) {
    return result(null, 'out-of-scope', 0.99, serialDenominator, ['adjacent Bowman product or non-flagship auto lane'])
  }

  const candidates = explicitCandidates(text)
  const candidate = candidates[0] ?? null
  if (candidate) {
    if (serialDenominator && candidate.serialDenominator && serialDenominator !== candidate.serialDenominator) {
      return result(null, 'conflict', 0.99, serialDenominator, [
        `${candidate.label} conflicts with explicit /${serialDenominator}`,
      ])
    }
    return result(candidate, 'matched', serialDenominator ? 0.99 : 0.94, candidate.serialDenominator, [
      `official modifier matched ${candidate.label}`,
    ])
  }

  const genericRefractor = /\brefractor\b/.test(text) && !/\b(?:x[-\s]*fractor|xfractor)\b/.test(text)
  if (genericRefractor && (!serialDenominator || serialDenominator === 499)) {
    const definition = BY_ID.get('refractor-499')
    return result(definition, 'matched', serialDenominator ? 0.98 : 0.9, 499, ['generic flagship refractor maps to /499'])
  }

  if (serialDenominator) {
    const denominatorCandidates = BY_DENOMINATOR.get(serialDenominator) ?? []
    if (denominatorCandidates.length === 1) {
      return result(denominatorCandidates[0], 'matched', 0.78, serialDenominator, ['unique official serial denominator'])
    }
    if (denominatorCandidates.length > 1) {
      return result(null, 'ambiguous', 0.25, serialDenominator, [
        `/${serialDenominator} belongs to ${denominatorCandidates.map((item) => item.label).join(', ')}`,
      ])
    }
    return result(null, 'conflict', 0.92, serialDenominator, [`/${serialDenominator} is not an official flagship auto lane`])
  }

  const looksAuto = options.assumeAuto || /\b(?:auto|autograph|autographed|redemption|signed)\b/.test(text)
  if (looksAuto) {
    const definition = BY_ID.get('base-auto')
    return result(definition, 'matched', 0.88, null, ['no official parallel evidence; classified as base auto'])
  }
  return result(null, 'unknown', 0.2, null, ['insufficient flagship auto evidence'])
}

export function canonicalizeBowman2026AutoLabel(value, options = {}) {
  const direct = bowman2026AutoDefinition(value)
  if (direct) return direct.label
  const resolved = canonicalizeBowman2026AutoVariation(value, options)
  return resolved.definition?.label ?? null
}

function result(definition, status, confidence, serialDenominator, reasons) {
  return Object.freeze({
    definition,
    status,
    confidence,
    serialDenominator,
    reasons: Object.freeze(reasons),
    modelEligible: status === 'matched' && Boolean(definition),
  })
}

export function isOfficialBowman2026ChromeAutoLabel(value) {
  return Boolean(bowman2026AutoDefinition(value))
}

export function sortBowman2026AutoLabels(left, right) {
  const leftDefinition = bowman2026AutoDefinition(left)
  const rightDefinition = bowman2026AutoDefinition(right)
  return (leftDefinition?.scarcityOrder ?? 10_000) - (rightDefinition?.scarcityOrder ?? 10_000) || String(left).localeCompare(String(right))
}
