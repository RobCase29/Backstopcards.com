import { titleMatchesBowman2026ChromeAutoBlocker } from './bowman2026Official'
import { titleLooksHandSignedAuto } from './handSigned'

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
  /\bascensions?\b/i,
  /\bdraft\s+night\b/i,
  /\bdie[-\s]?cut\b/i,
]

export function titleEligibleForBowmanChromeAutoModel(title: string) {
  return !titleMatchesBowman2026ChromeAutoBlocker(title) && !BOWMAN_CHROME_AUTO_MODEL_BLOCKERS.some((pattern) => pattern.test(title))
}

export function normalizedTitleWords(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function normalizedTitleKey(value: string) {
  return normalizedTitleWords(value).join(' ')
}

export function titleMatchesSearchTerm(value: string, searchTerm: string) {
  const haystack = normalizedTitleKey(value)
  const needle = normalizedTitleKey(searchTerm)
  if (!needle) return true
  if (haystack.includes(needle)) return true
  const words = needle.split(' ').filter(Boolean)
  return words.length > 0 && words.every((word) => haystack.includes(word))
}

export function titleMatchesPlayerName(title: string, playerName: string) {
  const titleWords = new Set(normalizedTitleWords(title))
  const playerWords = normalizedTitleWords(playerName).filter((word) => word.length > 1)
  return playerWords.every((word) => titleWords.has(word))
}

export function variationSearchAliases(variationTerm: string) {
  const term = variationTerm.trim()
  const normalized = normalizedTitleKey(term)
  const aliases = new Set<string>([term])
  if (/\bimage\b/.test(normalized) && /\bgold\b/.test(normalized)) aliases.add('gold ink')
  if (/\bimage\b/.test(normalized) && /\bblack\b/.test(normalized)) aliases.add('black ink')
  if (/\bimage\b/.test(normalized) && /\bred\b/.test(normalized)) aliases.add('red ink')
  if (/\bmini\s+diamond\b/.test(normalized)) aliases.add('mini diamond')
  if (/\bb\s+w\b|\bblack\s+white\b/.test(normalized)) aliases.add('black white shimmer')
  if (/\bpackfractor\b/.test(normalized)) aliases.add('packfractor')
  return [...aliases]
}

export function titleMatchesVariationTerm(title: string, variationTerm?: string) {
  if (!variationTerm?.trim()) return true
  return variationSearchAliases(variationTerm).some((alias) => titleMatchesSearchTerm(title, alias))
}

export function variationQueryTerm(variationTerm = '') {
  const normalized = normalizedTitleKey(variationTerm)
  if (/\bimage\b/.test(normalized) && /\bgold\b/.test(normalized)) return 'gold ink'
  if (/\bimage\b/.test(normalized) && /\bblack\b/.test(normalized)) return 'black ink'
  if (/\bimage\b/.test(normalized) && /\bred\b/.test(normalized)) return 'red ink'
  return variationTerm
}

const BASE_AUTO_EXCLUSION_PATTERN =
  /\b(?:superfractor|super\s+fractor|refractor|xfractor|x-fractor|logofractor|firefractor|packfractor|speckle|atomic|mini\s*diamond|shimmer|lava|wave|raywave|mojo|sapphire|image\s+variation|peanuts?|popcorn|sunflower|gum\s*ball|gumball|snack\s+pack)\b/i
const BASE_AUTO_COLOR_PARALLEL_PATTERN =
  /\b(?:blue|green|aqua|purple|yellow|gold|orange|red|black|rose|fuchsia|teal|pink|silver|pearl)\s+(?:refractor|auto|parallel|lava|wave|shimmer)\b|\b(?:refractor|auto|parallel|lava|wave|shimmer)\s+(?:blue|green|aqua|purple|yellow|gold|orange|red|black|rose|fuchsia|teal|pink|silver|pearl)\b/i

export function titleSerialDenominator(title: string) {
  if (/\b1\s*\/\s*1\b|\b1[-\s]?of[-\s]?1\b|\bone\s+of\s+one\b/i.test(title)) return 1
  const match = title.match(/(?:\/|#\/|numbered\s+to\s+)(\d{1,3})\b/i)
  return match ? Number(match[1]) : null
}

export function titleLooksLikeBaseAuto(title: string) {
  if (titleSerialDenominator(title)) return false
  return !BASE_AUTO_EXCLUSION_PATTERN.test(title) && !BASE_AUTO_COLOR_PARALLEL_PATTERN.test(title)
}

export function titleLooksLikePackIssuedAuto(title: string) {
  return /\b(auto|autos|autograph|autographed|autographs|signed|signature|redemption)\b/i.test(title)
}

export function titleLooksLikeAutograph(title: string) {
  if (/\b(non[-\s]?auto|no\s+auto|unsigned|facsimile|reprint)\b/i.test(title)) return false
  if (titleLooksHandSignedAuto(title)) return false
  return /\b(auto|autos|autograph|autographed|autographs|signed|signature|redemption)\b/i.test(title)
}

export function titleLooksLikeLowSerialNonAuto(title: string) {
  const serialDenominator = titleSerialDenominator(title)
  return Boolean(
    serialDenominator &&
      serialDenominator <= 99 &&
      /\bbowman\b/i.test(title) &&
      /\b(1st|first)\b/i.test(title) &&
      !titleLooksLikePackIssuedAuto(title) &&
      !titleLooksHandSignedAuto(title),
  )
}

type SuperfractorTitleOptions = {
  requireBowman?: boolean
}

export function titleLooksLikeSuperfractor(title: string, options: SuperfractorTitleOptions = {}) {
  const serialDenominator = titleSerialDenominator(title)
  const hasSuperfractorText = /\bsuperfractor\b|\bsuper\s+fractor\b/i.test(title)
  const hasLooseSuperOneOfOne =
    serialDenominator === 1 && /\bsuper\b/i.test(title) && !/\bprinting\s+plate\b|\bplate\b/i.test(title)
  const hasRequiredProduct = options.requireBowman === false || /\bbowman\b/i.test(title)
  return Boolean(
    hasRequiredProduct &&
      (hasSuperfractorText || hasLooseSuperOneOfOne) &&
      !/\bbunt\b|\bdigital\b|\bnft\b|\breprint\b|\bcustom\b|\bprinting\s+plate\b|\bplate\b/i.test(title) &&
      !titleLooksHandSignedAuto(title),
  )
}

function parallelText(title: string) {
  return title.replace(/\b(?:red\s+sox|white\s+sox|reds?|blue\s+jays)\b/gi, ' ')
}

export function lowSerialNonAutoVariationLabel(title: string, serialDenominator: number | null) {
  const normalized = parallelText(title).toLowerCase()
  const parallel =
    /\bsuperfractor\b|\bsuper\s+fractor\b/.test(normalized)
      ? 'Superfractor'
      : /\bred\b/.test(normalized)
        ? 'Red'
        : /\borange\b/.test(normalized)
          ? 'Orange'
          : /\bgold\b/.test(normalized)
            ? 'Gold'
            : /\bblack\b/.test(normalized)
              ? 'Black'
              : /\bgreen\b/.test(normalized)
                ? 'Green'
                : /\byellow\b/.test(normalized)
                  ? 'Yellow'
                  : /\bmini\s*diamond\b/.test(normalized)
                    ? 'Mini Diamond'
                    : 'Numbered'
  return serialDenominator ? `${parallel} /${serialDenominator}` : parallel
}

export function superfractorVariationLabel(title: string) {
  return titleLooksLikePackIssuedAuto(title) ? 'Superfractor Auto /1' : 'Superfractor /1'
}

export function titleCanUseBowmanSuperfractorAutoProxy(title: string) {
  if (!/\bbowman\b/i.test(title)) return false
  if (!titleLooksLikeAutograph(title)) return false
  if (
    /\b(top\s*100|scouts?\s+top\s*100|afl|all[-\s]?star|platinum|transcendent|sterling|bowman'?s?\s+best|meteor|summer\s*camp|ascensions?|draft\s+night|power\s*chords?|die[-\s]?cut)\b/i.test(
      title,
    )
  ) {
    return false
  }
  return (
    /\b(1st|first)\b/i.test(title) ||
    /\bchrome\s+prospect\b/i.test(title) ||
    /\b(?:bcp|bcpa|cpa|cda|bdpa|bma|bca)[-\s]?[a-z0-9]+\b/i.test(title)
  )
}
