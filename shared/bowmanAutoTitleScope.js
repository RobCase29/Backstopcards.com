const INSERT_AUTO_RULES = Object.freeze([
  rule('class-of-auto', /\bclass\s+of\s+(?:19|20)\d{2}\b/),
  rule('under-armour-auto', /\bunder\s+armou?r\b/),
  rule('all-america-auto', /\ball[-\s]*america(?:n)?\b/),
  rule('perfect-game-auto', /\bperfect\s+game\b/),
  rule('franchise-futures-auto', /\bfranchise\s+futures\b/),
  rule('draft-pairings-auto', /\bdraft\s+(?:pick\s+)?pairings?\b/),
  rule('ascensions-auto', /\bascensions?\b/),
  rule('draft-night-auto', /\bdraft\s+night\b/),
  rule('power-chords-auto', /\bpower\s+chords?\b/),
  rule('rising-infernos-auto', /\brising\s+infernos?\b/),
])

const MULTI_CARD_RULES = Object.freeze([
  rule('multi-subject-auto', /\b(?:dual|triple|quad(?:ruple)?)\s+(?:player\s+)?(?:auto|autograph)s?\b/),
  rule('multi-card-lot', /\b(?:lot\s+of\s+\d+|\d+\s+(?:card|auto|autograph)s?\s+lot|(?:card|auto|autograph)\s+lot|complete\s+set)\b/),
])

const AFTERMARKET_RULES = Object.freeze([
  rule('hand-signed', /\bhand[-\s]*signed\b/),
  rule('in-person-auto', /\bin[-\s]*person\b|\bip\s+(?:auto|autograph)\b/),
  rule('seller-described-signature', /\b(?:signed\s+rare|auto\s+signed|signed\s+auto)\b/),
])

const DIGITAL_OR_REDEEMED_RULES = Object.freeze([
  rule('digital-card', /\btopps\s+bunt\s+digital\b|\bdigital\s+card\b/),
  rule('already-redeemed', /\balready\s+redeemed\b|\bredeemed\s+(?:card|redemption)\b/),
])

function rule(reason, pattern) {
  return Object.freeze({ reason, pattern })
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

/**
 * Product-agnostic scope gate for flagship Bowman manufacturer autos.
 * Redemptions are intentionally eligible: they represent the same physical
 * manufacturer auto lane. Insert autos, lots, duals, and aftermarket
 * signatures are separate markets and may not inform the flagship curve.
 */
export function classifyBowmanAutoTitleScope(title) {
  const text = normalize(title)
  for (const candidate of [
    ...DIGITAL_OR_REDEEMED_RULES,
    ...AFTERMARKET_RULES,
    ...MULTI_CARD_RULES,
    ...INSERT_AUTO_RULES,
  ]) {
    if (candidate.pattern.test(text)) {
      return Object.freeze({
        eligible: false,
        status: 'out-of-scope',
        reason: candidate.reason,
      })
    }
  }
  return Object.freeze({ eligible: true, status: 'eligible', reason: null })
}

