import type { SalesCacheSale } from './salesCache'

export type SalesLabScope = 'all' | 'chrome-autos' | 'autos' | 'chrome' | 'paper' | 'inserts' | 'case-hits' | 'graded'
export type SalesLabGrade = 'all' | 'raw' | 'graded'

export const SALES_LAB_DAY_MS = 86_400_000
export const SALES_LAB_RECENT_DAYS = 30
export const SALES_LAB_PRIOR_DAYS = 90

const SALES_LAB_DEFAULT_UNNUMBERED_PRINT_RUN = 50_000
const SALES_LAB_INFERRED_DENOMINATORS: Array<{ pattern: RegExp; denominator: number }> = [
  { pattern: /\bsuperfractor\b|\bsuper\b/i, denominator: 1 },
  { pattern: /\bred\b/i, denominator: 5 },
  { pattern: /\bblack\b.*\bimage\s+variation\b|\bblack\s+raywave\b|\bblack\s+shimmer\b/i, denominator: 10 },
  { pattern: /\bblack\b/i, denominator: 10 },
  { pattern: /\borange\b/i, denominator: 25 },
  { pattern: /\blogofractor\b.*\bauto|\bauto\b.*\blogofractor\b/i, denominator: 35 },
  { pattern: /\bgold\b.*\bimage\s+variation\b|\bgold\s+ink\b/i, denominator: 15 },
  { pattern: /\bgold\b/i, denominator: 50 },
  { pattern: /\byellow\b/i, denominator: 75 },
  { pattern: /\bgreen\b/i, denominator: 99 },
  { pattern: /\bpackfractor\b/i, denominator: 89 },
  { pattern: /\baqua\b/i, denominator: 125 },
  { pattern: /\bblue\b/i, denominator: 150 },
  { pattern: /\bpurple\b/i, denominator: 250 },
  { pattern: /\bspeckle\b/i, denominator: 299 },
  { pattern: /\bwave\b/i, denominator: 350 },
  { pattern: /\blava\b/i, denominator: 399 },
  { pattern: /\brefractor\b/i, denominator: 499 },
  { pattern: /\b(?:image|photo)\s+variations?\b|\bvariations?\s+(?:image|photo)\b/i, denominator: 120 },
]
const SALES_LAB_KNOWN_PRINT_RUNS: Array<{ pattern: RegExp; copies: number; label: string }> = [
  { pattern: /\banime\b.*\bkanji\b|\bkanji\b/i, copies: 5, label: '5 run' },
  { pattern: /\bpeanuts?\b|\bpopcorn\b/i, copies: 10, label: '~10 run' },
  { pattern: /\bgumball\b|\bsunflower\b/i, copies: 11, label: '~11 run' },
  { pattern: /\bb\s*&\s*w\b.*\bshimmer\b|\bb\s+and\s+w\b.*\bshimmer\b|\bbw\b.*\bshimmer\b|\bblack\s*(?:and|&)\s*white\b.*\bshimmer\b/i, copies: 11, label: '~11 run' },
  { pattern: /\bmojo\b.*\bb\s*&\s*w\b.*\bauto\b|\bmojo\b.*\bb\s+and\s+w\b.*\bauto\b|\bmojo\b.*\bblack\s*(?:and|&)\s*white\b.*\bauto\b/i, copies: 15, label: '~15 run' },
  { pattern: /\bmojo\b.*\bimage\s+variation\b.*\bauto\b|\bimage\s+variation\b.*\bmojo\b.*\bauto\b/i, copies: 25, label: '25 run' },
  { pattern: /^(?!.*\bauto\b).*?\blogofractor\b/i, copies: 65, label: '~65 run' },
  { pattern: /\bbowman\s+logo\s+pattern\b|\blogo\s+foil(?:\s+pattern)?\b/i, copies: 100, label: '~100 run' },
  { pattern: /\bcrystall?ized\b/i, copies: 100, label: '~100 run' },
  { pattern: /\bmojo\b.*\brookie\b.*\bauto\b|\brookie\b.*\bmojo\b.*\bauto\b/i, copies: 120, label: '~120 run' },
  { pattern: /\bbowman\s+spotlights?\b|\bspotlights?\b/i, copies: 140, label: '~140 run' },
  { pattern: /\bmojo\b.*\bimage\s+variation\b|\bimage\s+variation\b.*\bmojo\b/i, copies: 150, label: '~150 run' },
  { pattern: /\bpatchwork\b/i, copies: 185, label: '~185 run' },
  { pattern: /\bfinal\s+draft\b/i, copies: 185, label: '~185 run' },
  { pattern: /\banime\b/i, copies: 190, label: '~190 run' },
  { pattern: /\ball[-\s]?america\s+game\b.*\bred\s+ink\b/i, copies: 10, label: '10 run' },
  { pattern: /\ball[-\s]?america\s+game\b.*\bauto\b/i, copies: 199, label: '~199 run' },
  { pattern: /\bpaper\b.*\brookie\b.*\bauto\b|\brookie\b.*\bpaper\b.*\bauto\b|\bpaper\b.*\bvets?\b.*\bauto\b/i, copies: 200, label: '~200 run' },
  { pattern: /\betched\s+(?:in\s+)?(?:stained\s+)?glass\b/i, copies: 350, label: '~350 run' },
  { pattern: /\bchrome\s+rookie\b.*\bauto\b|\brookie\b.*\bchrome\b.*\bauto\b/i, copies: 500, label: '~500 run' },
  { pattern: /\bpaper\b.*\bauto\b|\bpaper-auto\b/i, copies: 700, label: '~700 run' },
  { pattern: /\bx[-\s]?fractor\b|\bxfractor\b/i, copies: 775, label: '~775 run' },
  { pattern: /\bprospect\b.*\bmojo\b.*\bauto\b|\bmojo\b.*\bprospect\b.*\bauto\b|\bbowman\s+mega\b.*\bauto\b/i, copies: 1_490, label: '~1,490 run' },
  { pattern: /\bchrome\s+prospect\b.*\bauto\b|\bbase\s+auto\b|\bautos\b.*\bbowman\s+chrome\b/i, copies: 1_880, label: '~1,880 run' },
  { pattern: /\bmega\s+futures?\b/i, copies: 2_140, label: '~2,140 run' },
  { pattern: /\breptilian\b/i, copies: 8_190, label: '~8,190 run' },
  { pattern: /\blazer\s+refractor\b|\blaser\s+refractor\b/i, copies: 9_450, label: '~9,450 run' },
  { pattern: /\belectric\s+sluggers?\b.*\bmojo\b|\bmojo\b.*\belectric\s+sluggers?\b/i, copies: 9_500, label: '~9,500 run' },
  { pattern: /\bred\s+rc\s+variation\b/i, copies: 20_690, label: '~20,690 run' },
  { pattern: /\bpower\s+chords?\b/i, copies: 29_070, label: '~29,070 run' },
  { pattern: /\btop\s*100\b|\bbowman\s+scouts?\b/i, copies: 34_900, label: '~34,900 run' },
  { pattern: /\bbowman\s+sterling\b.*\bmojo\b|\bmojo\b.*\bbowman\s+sterling\b/i, copies: 47_555, label: '~47,555 run' },
  { pattern: /\bmojo\b/i, copies: 42_800, label: '~42,800 run' },
  { pattern: /\belectric\s+sluggers?\b/i, copies: 69_630, label: '~69,630 run' },
  { pattern: /\bunder\s+the\s+radar\b/i, copies: 80_900, label: '~80,900 run' },
  { pattern: /\bbowman\s+sterling\b/i, copies: 107_805, label: '~107,805 run' },
]
const SALES_LAB_FALLBACK_PRINT_RUNS: Array<{ pattern: RegExp; copies: number; label: string }> = [
  { pattern: /\bchrome\b/i, copies: 50_000, label: 'unserialed' },
]

export const SALES_LAB_SCOPE_LABELS: Record<SalesLabScope, string> = {
  all: 'All card types',
  'chrome-autos': 'Chrome autos',
  autos: 'Autos',
  chrome: 'Chrome',
  paper: 'Paper',
  inserts: 'Inserts',
  'case-hits': 'Case hits',
  graded: 'Graded',
}

export const SALES_LAB_GRADE_LABELS: Record<SalesLabGrade, string> = {
  all: 'Raw + graded',
  raw: 'Raw only',
  graded: 'Graded only',
}

export function saleTypeLabel(sale: SalesCacheSale) {
  if (sale.cardClass === 'paper-auto') return 'Paper Autos'
  if (sale.cardClass === 'insert-auto') return 'Insert Autos'
  if (sale.isAuto) return 'Autos'
  if (sale.isCaseHit) return 'Case Hits'
  if (sale.isInsert) return 'Inserts'
  if (sale.isPaper) return 'Paper'
  if (sale.isChrome) return 'Chrome'
  return 'Base'
}

export function saleSourceTypeLabel(sale: SalesCacheSale) {
  const cardClass = sale.sourceCardClass ?? sale.cardClass
  if (cardClass === 'paper-auto') return 'Paper Autos'
  if (cardClass === 'insert-auto') return 'Insert Autos'
  if (sale.sourceIsAuto ?? sale.isAuto) return 'Autos'
  if (sale.sourceIsCaseHit ?? sale.isCaseHit) return 'Case Hits'
  if (sale.sourceIsInsert ?? sale.isInsert) return 'Inserts'
  if (sale.sourceIsPaper ?? sale.isPaper) return 'Paper'
  if (sale.sourceIsChrome ?? sale.isChrome) return 'Chrome'
  return 'Base'
}

export function saleTaxonomyLabel(sale: SalesCacheSale) {
  return [sale.releaseYear, sale.productFamily, sale.cardClass, sale.insertName, readableVariationLabel(sale.variationLabel), sale.gradeBucket]
    .filter(Boolean)
    .join(' / ')
}

export function isBareSerialLabel(label: string) {
  return /(?:^|\/\s*)(?:unlabeled\s*)?\/\s*\d{1,4}\b/i.test(String(label ?? '').trim())
}

export function readableVariationLabel(label: string) {
  const cleaned = String(label || 'Base').trim()
  return isBareSerialLabel(cleaned) ? `Unlabeled ${cleaned.replace(/\s+/g, '')}` : cleaned
}

export function saleBucketShortLabel(sale: SalesCacheSale) {
  return [sale.productFamily, sale.insertName, readableVariationLabel(sale.variationLabel), sale.gradeBucket].filter(Boolean).join(' / ')
}

export function saleSourceBucketShortLabel(sale: SalesCacheSale) {
  return [
    sale.sourceProductFamily ?? sale.productFamily,
    sale.sourceInsertName ?? sale.insertName,
    readableVariationLabel(sale.sourceVariationLabel ?? sale.variationLabel),
    sale.sourceGradeBucket ?? sale.gradeBucket,
  ]
    .filter(Boolean)
    .join(' / ')
}

export function saleOriginalBucketKey(sale: SalesCacheSale) {
  return sale.sourceBucketKey || sale.bucketKey
}

export function soldSaleUrl(sale: SalesCacheSale | null) {
  const itemId = String(sale?.itemId ?? '').trim()
  const ebayItemId = itemId.match(/\b\d{9,14}\b/)?.[0] ?? ''
  return ebayItemId ? `https://www.ebay.com/itm/${ebayItemId}` : ''
}

const NON_AUTO_CHROME_VARIATION_PATTERN =
  /\breptilian\b|\blazer\s+refractor\b|\blaser\s+refractor\b|\blogo\s+foil\b|\bbowman\s+logo\s+pattern\b|\betched\s+(?:in\s+)?(?:stained\s+)?glass\b|\bred\s+rc\s+variation\b/i

export function isFlagshipChromeAutoLane(sale: SalesCacheSale) {
  if (sale.cardClass !== 'auto' || sale.productFamily !== 'Bowman Chrome') return false
  const label = `${sale.insertName ?? ''} ${sale.variationLabel ?? ''}`
  if (NON_AUTO_CHROME_VARIATION_PATTERN.test(label)) return false
  return true
}

export function saleMatchesLabScope(sale: SalesCacheSale, scope: SalesLabScope) {
  if (scope === 'all') return true
  if (scope === 'chrome-autos') return isFlagshipChromeAutoLane(sale)
  if (scope === 'autos') return sale.isAuto
  if (scope === 'chrome') return sale.isChrome && !sale.isAuto && !sale.isInsert
  if (scope === 'paper') return sale.isPaper
  if (scope === 'inserts') return sale.isInsert && !sale.isCaseHit
  if (scope === 'case-hits') return sale.isCaseHit
  return sale.gradeBucket !== 'Raw'
}

export function saleMatchesGrade(sale: SalesCacheSale, grade: SalesLabGrade) {
  if (grade === 'all') return true
  if (grade === 'raw') return sale.gradeBucket === 'Raw'
  return sale.gradeBucket !== 'Raw'
}

export function saleToneClass(sale: SalesCacheSale) {
  if (sale.erroneous) return 'flagged'
  if (sale.gradeBucket !== 'Raw') return 'graded'
  if (sale.cardClass === 'paper-auto') return 'paper'
  if (sale.cardClass === 'insert-auto') return 'insert'
  if (sale.isAuto) return 'auto'
  if (sale.isCaseHit) return 'case-hit'
  if (sale.isInsert) return 'insert'
  if (sale.isPaper) return 'paper'
  if (sale.isChrome) return 'chrome'
  return 'base'
}

export function salesTrendLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'No trend'
  const rounded = Math.round(value * 100)
  if (rounded > 0) return `+${rounded}%`
  if (rounded < 0) return `${rounded}%`
  return 'Flat'
}

export function salesTrendClass(value: number | null) {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 0.04) return 'neutral'
  return value > 0 ? 'up' : 'down'
}

export function salesAgeLabel(days: number | null) {
  if (days === null || !Number.isFinite(days)) return 'No date'
  if (days <= 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 45) return `${days}d ago`
  return `${Math.round(days / 30)}mo ago`
}

export function serialDenominatorFromLabel(label: string) {
  const match = label.match(/\/\s*(\d{1,4})\b/)
  return match ? Number(match[1]) : null
}

export type SalesBucketKeyParts = {
  releaseYear: number | string | null | undefined
  productFamily: string
  cardClass: string
  variationLabel: string
  gradeBucket: string
}

export function salesBucketKeyForParts(parts: SalesBucketKeyParts) {
  return [
    parts.releaseYear ?? 'unknown-year',
    parts.productFamily,
    parts.cardClass,
    parts.variationLabel,
    parts.gradeBucket,
  ]
    .map((part) => String(part ?? '').trim() || 'unknown')
    .join(' | ')
}

export function inferredCanonicalSerialDenominator(label: string) {
  const explicit = serialDenominatorFromLabel(label)
  if (explicit) return explicit
  return SALES_LAB_INFERRED_DENOMINATORS.find((candidate) => candidate.pattern.test(label))?.denominator ?? null
}

export function variationLabelWithSerial(label: string, serialDenominator: number | null) {
  const cleanedLabel = String(label || 'Base').trim()
  if (!serialDenominator || serialDenominatorFromLabel(cleanedLabel)) return cleanedLabel
  return `${cleanedLabel} /${serialDenominator}`
}

export function salesScarcityModel(sale: SalesCacheSale | null, label: string, type: string) {
  const labelDenominator = serialDenominatorFromLabel(label)
  const serialDenominator = labelDenominator ?? sale?.serialDenominator ?? null
  if (serialDenominator) {
    return {
      copies: serialDenominator,
      label: `/${serialDenominator}`,
      numbered: true,
    }
  }

  const search = `${sale?.productFamily ?? ''} ${sale?.cardClass ?? ''} ${sale?.insertName ?? ''} ${sale?.variationLabel ?? ''} ${label} ${type}`
  const knownPrintRun = SALES_LAB_KNOWN_PRINT_RUNS.find((candidate) => candidate.pattern.test(search))
  if (knownPrintRun) {
    return {
      copies: knownPrintRun.copies,
      label: knownPrintRun.label,
      numbered: false,
    }
  }

  const inferredDenominator = SALES_LAB_INFERRED_DENOMINATORS.find((candidate) => candidate.pattern.test(search))?.denominator
  if (inferredDenominator) {
    return {
      copies: inferredDenominator,
      label: `~/${inferredDenominator}`,
      numbered: true,
    }
  }

  const fallbackPrintRun = SALES_LAB_FALLBACK_PRINT_RUNS.find((candidate) => candidate.pattern.test(search))
  if (fallbackPrintRun) {
    return {
      copies: fallbackPrintRun.copies,
      label: fallbackPrintRun.label,
      numbered: false,
    }
  }

  return {
    copies: SALES_LAB_DEFAULT_UNNUMBERED_PRINT_RUN,
    label: 'unserialed',
    numbered: false,
  }
}

export function compareSalesBucketsByScarcity<
  T extends { estimatedCopies: number; numbered: boolean; label: string; type: string; modelPrice: number; count: number },
>(left: T, right: T) {
  const copiesSort = right.estimatedCopies - left.estimatedCopies
  if (Math.abs(copiesSort) > 0.001) return copiesSort
  if (left.numbered !== right.numbered) return left.numbered ? 1 : -1
  const bareSort = Number(isBareSerialLabel(left.label)) - Number(isBareSerialLabel(right.label))
  if (bareSort !== 0) return bareSort
  const typeSort = left.type.localeCompare(right.type)
  if (typeSort !== 0) return typeSort
  const labelSort = left.label.localeCompare(right.label)
  if (labelSort !== 0) return labelSort
  return right.modelPrice - left.modelPrice || right.count - left.count
}
