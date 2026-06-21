export const BOWMAN_CHROME_AUTO_MODEL_BLOCKERS = [
  /\btopps\s+bunt\s+digital\b/i,
  /\btopps\s+bunt\b/i,
  /\bbunt\b/i,
  /\bdigital\b/i,
  /\bredeemed\b/i,
  /\bpaper\b/i,
  /(?:^|\s|#)bpa[-\s]?[a-z0-9]+/i,
  /\bsapphire\b/i,
  /\bmega\s*box\b|\bmega\b/i,
  /\bsterling\b/i,
  /\binception\b/i,
  /\btranscendent\b/i,
  /\bfinest\b/i,
  /\bbowman'?s?\s+best\b/i,
  /\bpanini\b/i,
  /\bleaf\b/i,
  /\bpower\s*chords?\b/i,
  /\bdie[-\s]?cut\b/i,
  /\belectric\s+sluggers?\b/i,
  /\bunder\s+the\s+radar\b/i,
  /\bpatchwork\b/i,
  /\bcrystall?ized\b/i,
  /\banime\b/i,
  /\bkanji\b/i,
  /\bspotlights?\b/i,
]

export function titleEligibleForBowmanChromeAutoModel(title: string) {
  return !BOWMAN_CHROME_AUTO_MODEL_BLOCKERS.some((pattern) => pattern.test(title))
}
