const SIGNATURE_WORD_PATTERN = /\b(auto|autos|autograph|autographed|autographs|signed|signature)\b/i
const EXPLICIT_HAND_SIGNED_PATTERN =
  /\b(?:ip|in\s*person)\s*(?:auto|autos|autograph|autographed|autographs|signed|signature)?\b|\bhand\s*signed\b|\bauto\s+signed\b|\bsigned\s+(?:rare|auto|autos|autograph|autographs|signature)\b|\b(?:auto|autograph|autographed)\s+signed\b/i
const BASE_CARD_NUMBER_PATTERN = /\b(?:BCP|BP)[-\s]?\d+\b/i
const CERTIFIED_AUTO_NUMBER_PATTERN = /\b(?:CPA|BPA|CRA|PRV)[-\s]?[A-Z0-9]+\b/i

export function titleLooksHandSignedAuto(value: string | null | undefined) {
  const title = String(value ?? '')
  if (!SIGNATURE_WORD_PATTERN.test(title)) return false
  if (EXPLICIT_HAND_SIGNED_PATTERN.test(title)) return true
  return BASE_CARD_NUMBER_PATTERN.test(title) && !CERTIFIED_AUTO_NUMBER_PATTERN.test(title)
}
