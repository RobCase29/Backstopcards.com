import { detectOfficial2026BowmanFamily } from './bowman-2026-official.mjs'

const ONE_DAY_MS = 86_400_000
const LOGO_FOIL_PATTERN = /\blogo\s+foil(?:\s+pattern)?\b|\bbowman\s+logo\s+pattern\b|\bNL\/AL\s+logo\s+foil\b/i
const IMAGE_VARIATION_PATTERN = /\b(?:image|photo)\s+variations?\b|\bvariations?\s+(?:image|photo)\b/i
const ETCHED_IN_GLASS_PATTERN = /\betched\s+(?:in\s+)?(?:stained\s+)?glass\b/i
const SNACK_PACK_PATTERN = /\bsnack\s+pack\b|\bgum\s*ball\b|\bbubble\s+gum\b|\bpeanuts?\b|\bpopcorn\b|\bsunflower(?:\s+seeds?)?\b/i
const SIGNATURE_WORD_PATTERN = /\b(auto|autos|autograph|autographed|autographs|signed|signature)\b/i
const EXPLICIT_HAND_SIGNED_PATTERN =
  /\b(?:ip|in\s*person)\s*(?:auto|autos|autograph|autographed|autographs|signed|signature)?\b|\bhand\s*signed\b|\bauto\s+signed\b|\bsigned\s+(?:rare|auto|autos|autograph|autographs|signature)\b|\b(?:auto|autograph|autographed)\s+signed\b/i
const BASE_CARD_NUMBER_PATTERN = /\b(?:BCP|BP)[-\s]?\d+\b/i
const CERTIFIED_AUTO_NUMBER_PATTERN = /\b(?:CPA|BPA|CRA|PRV)[-\s]?[A-Z0-9]+\b/i

const INSERT_PATTERNS = [
  ['snack pack', SNACK_PACK_PATTERN],
  ['mega futures', /\bmega\s+futures?\b/i],
  ['bowman sterling', /\bbowman\s+sterling\b|\bsterling\b/i],
  ['draft pick pairings', /\bdraft\s+pick\s+pairings?\b|\bDPPA[-\s]?[A-Z0-9]+\b/i],
  ['electric sluggers', /\belectric\s+sluggers?\b/i],
  ['crystallized', /\bcrystallized\b/i],
  ['patchwork', /\bpatchwork\b/i],
  ['anime kanji', /\bkanji\b/i],
  ['anime', /\banime\b/i],
  ['bowman spotlights', /\bspotlights?\b/i],
  ['final draft', /\bfinal\s+draft\b/i],
  ['power chords', /\bpower\s+chords?\b/i],
  ['ascensions', /\bascensions?\b/i],
  ['draft night', /\bdraft\s+night\b/i],
  ['ultimate autograph booklet', /\bultimate\s+auto(?:graph)?\s+booklet\b|\bUAC[-\s]?\d+\b/i],
  ['all-america game', /\ball[-\s]?america\s+game\b/i],
  ['top 100', /\btop\s*100\b|\bBTP-\d+\b/i],
]

const MODIFIER_PATTERNS = [
  ['Logo Foil Pattern', LOGO_FOIL_PATTERN],
  ['Etched In Glass', ETCHED_IN_GLASS_PATTERN],
  ['HTA Choice', /\bhta\s+choice\b/i],
  ['Packfractor', /\bpackfractor\b/i],
  ['Logofractor', /\blogofractor\b/i],
  ['Firefractor', /\bfirefractor\b/i],
  ['Lazer Refractor', /\blazer\s+refractor\b|\blaser\s+refractor\b/i],
  ['X-Fractor', /\bx[-\s]*(?:re)?fractor\b|\bxfractor\b/i],
  ['Mini Diamond', /\bmini[-\s]*diamond\b/i],
  ['Speckle', /\bspeckl(?:e|ed)\b/i],
  ['Sparkle', /\bsparkle\b/i],
  ['Lava', /\blava\b/i],
  ['B&W Shimmer', /\bb\s*&\s*w\b.*\bshimmer\b|\bb\s+and\s+w\b.*\bshimmer\b|\bbw\b.*\bshimmer\b|\bblack\s*(?:and|&)\s*white\b.*\bshimmer\b/i],
  ['Shimmer', /\bshimmer\b/i],
  ['RayWave', /\bray\s*wave\b|\braywave\b/i],
  ['Wave', /\bwave\b/i],
  ['Mojo', /\bmojo\b/i],
  ['Lunar', /\blunar\b/i],
  ['Geometric', /\bgeometric\b/i],
  ['Reptilian', /\breptilian\b/i],
  ['Grass', /\bgrass\b/i],
  ['Atomic', /\batomic\b/i],
  ['Rose', /\brose\b/i],
  ['Image Variation', IMAGE_VARIATION_PATTERN],
]

const STANDARD_AUTO_PARALLEL_DENOMINATORS = [
  { pattern: /\bsuperfractor\b|\bsuper\b/i, denominator: 1 },
  { pattern: /\bred\b/i, denominator: 5 },
  { pattern: /\bblack\b/i, denominator: 10 },
  { pattern: /\borange\b/i, denominator: 25 },
  { pattern: /\bgold\b/i, denominator: 50 },
  { pattern: /\byellow\b/i, denominator: 75 },
  { pattern: /\bgreen\b/i, denominator: 99 },
  { pattern: /\baqua\b/i, denominator: 125 },
  { pattern: /\bblue\b/i, denominator: 150 },
  { pattern: /\bpurple\b/i, denominator: 250 },
]

const COLOR_PATTERNS = [
  ['Superfractor', /\bsuperfractor\b|\bsuper\b/i],
  ['Red', /\bred\b/i],
  ['Orange', /\borange\b/i],
  ['Gold', /\bgold\b/i],
  ['Yellow', /\byellow\b/i],
  ['Green', /\bgreen\b/i],
  ['Aqua', /\baqua\b/i],
  ['Blue', /\bblue\b/i],
  ['Purple', /\bpurple\b/i],
  ['Pink', /\bpink\b/i],
  ['Black', /\bblack\b/i],
  ['Pearl', /\bpearl\b/i],
]

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseMarketMoversMoney(value) {
  const parsed = Number(
    String(value ?? '')
      .replace(/best offer accepted/i, '')
      .replace(/[$,%\s,]/g, ''),
  )
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseMarketMoversDate(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, month, day, year] = match
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ''
  }
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ''
}

function titleMatchesPlayer(title, playerName) {
  const words = new Set(normalizeText(title).split(' ').filter(Boolean))
  return normalizeText(playerName)
    .split(' ')
    .filter((word) => word.length > 1)
    .every((word) => words.has(word))
}

function serialDenominatorFromTitle(title) {
  const text = String(title ?? '')
  const explicit = text.match(/(?:#\/|\/|out\s+of\s+|numbered\s+to\s+)(\d{1,4})\b/i)
  if (explicit) return Number(explicit[1])

  const fraction = text.match(/\b\d{1,4}\s*\/\s*(\d{1,4})\b/)
  if (!fraction) return null
  const denominator = Number(fraction[1])
  return Number.isFinite(denominator) && denominator > 0 ? denominator : null
}

function releaseYearFromTitle(title) {
  const match = String(title ?? '').match(/\b(20\d{2})\b/)
  if (match) return Number(match[1])
  const shortMatch = String(title ?? '').match(/\b(2[1-9])\s+bowman\b/i)
  return shortMatch ? 2000 + Number(shortMatch[1]) : null
}

function gradeFromTitle(title) {
  const compactMatch = String(title ?? '').match(/\b(PSA|BGS|SGC|CGC)\s*(10|9\.5|9|8\.5|8|7\.5|7)\b/i)
  const spacedMatch = String(title ?? '').match(
    /\b(PSA|BGS|SGC|CGC)\b(?:\s+(?:GEM\s*MT|MINT|AUTHENTIC|PRISTINE|TRUE\s*GEM))*\s+(10|9\.5|9|8\.5|8|7\.5|7)\b/i,
  )
  const match = compactMatch ?? spacedMatch
  if (!match) return { company: null, grade: null, bucket: 'Raw' }
  const company = match[1].toUpperCase()
  const grade = Number(match[2])
  return {
    company,
    grade,
    bucket: `${company} ${Number.isInteger(grade) ? grade.toFixed(0) : String(grade)}`,
  }
}

function titleLooksHandSignedAuto(title) {
  if (!SIGNATURE_WORD_PATTERN.test(title)) return false
  if (EXPLICIT_HAND_SIGNED_PATTERN.test(title)) return true
  return BASE_CARD_NUMBER_PATTERN.test(title) && !CERTIFIED_AUTO_NUMBER_PATTERN.test(title)
}

function detectInsert(title) {
  const match = INSERT_PATTERNS.find(([, pattern]) => pattern.test(title))
  return match ? match[0] : null
}

function displayInsertName(insertName) {
  return String(insertName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length <= 3 && word === word.toUpperCase() ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(' ')
}

function snackPackVariant(title) {
  const text = String(title ?? '')
  if (/\bsunflower(?:\s+seeds?)?\b/i.test(text)) return 'Sunflower'
  if (/\bgum\s*ball\b|\bbubble\s+gum\b/i.test(text)) return 'Gumball'
  if (/\bpeanuts?\b/i.test(text)) return 'Peanuts'
  if (/\bpopcorn\b/i.test(text)) return 'Popcorn'
  return 'Snack Pack'
}

function detectProductFamily(title, isPaper, isAuto = false) {
  if (/\bbowman'?s\s+best\b/i.test(title)) return "Bowman's Best"
  if (/\bsapphire\b/i.test(title)) return 'Bowman Sapphire'
  if (/\bbowman\s+sterling\b|\bsterling\b/i.test(title)) return 'Bowman Sterling'
  if (/\bdraft\b/i.test(title)) return 'Bowman Draft'
  if (/\bmega\b|\bmojo\b/i.test(title)) return 'Bowman Mega'
  if (isAuto && SNACK_PACK_PATTERN.test(title)) return 'Bowman Chrome'
  if (isPaper) return 'Bowman Paper'
  if (isAuto && /\bhta\s+choice\b|\brefractor\b|\bx[-\s]*(?:re)?fractor\b|\bxfractor\b|\bmini[-\s]*diamond\b|\bpackfractor\b|\blogofractor\b/i.test(title)) {
    return 'Bowman Chrome'
  }
  if (/\bchrome\b|\bBCP-\d+\b|\bCPA-[A-Z]+\b/i.test(title)) return 'Bowman Chrome'
  return 'Bowman'
}

function detectVariation(title, flags) {
  const rawColor = COLOR_PATTERNS.find(([, pattern]) => pattern.test(title))?.[0] ?? null
  const modifiers = MODIFIER_PATTERNS.filter(([, pattern]) => pattern.test(title)).map(([label]) => label)
  const uniqueModifiers = [
    ...new Set(
      modifiers.filter(
        (label) =>
          !(label === 'Wave' && modifiers.includes('RayWave')) &&
          !(label === 'Shimmer' && modifiers.includes('B&W Shimmer')),
      ),
    ),
  ]
  const color = rawColor === 'Black' && uniqueModifiers.includes('B&W Shimmer') ? null : rawColor
  const serialDenominator = serialDenominatorFromTitle(title) ?? inferredKnownDenominator(title, flags)
  if (flags.isAftermarketAuto) return 'Hand Signed Auto'
  if (LOGO_FOIL_PATTERN.test(title)) return 'Logo Foil Pattern'
  if (ETCHED_IN_GLASS_PATTERN.test(title)) return 'Etched In Glass'
  if (/\bgold\s+ink\b/i.test(title)) return `Gold Image Variation${serialDenominator ? ` /${serialDenominator}` : ''}`
  if (flags.isSnackPackAuto) return `${snackPackVariant(title)} Snack Pack /${serialDenominator ?? 5}`

  if (flags.insertName) {
    const insertParts = [displayInsertName(flags.insertName)]
    if (color) insertParts.push(color)
    insertParts.push(...uniqueModifiers)
    if (serialDenominator) insertParts.push(`/${serialDenominator}`)
    return insertParts.join(' ')
  }
  if (flags.isAuto && serialDenominator === 35 && isGenericRefractorTitle(title) && !color && uniqueModifiers.length === 0) {
    return 'Logofractor /35'
  }
  if (flags.isAuto && serialDenominator === 499 && !color && uniqueModifiers.length === 0) return 'Refractor /499'
  if (isGenericRefractorTitle(title) && !color && uniqueModifiers.length === 0) return `Refractor /${serialDenominator ?? 499}`
  if (flags.isAuto && !color && uniqueModifiers.length === 0 && !serialDenominator) return 'Base Auto'

  const parts = []
  if (color) parts.push(color)
  parts.push(...uniqueModifiers)
  if (serialDenominator) parts.push(`/${serialDenominator}`)

  if (parts.length > 0) return parts.join(' ')
  if (flags.isAuto) return 'Base Auto'
  if (flags.isPaper) return 'Base Paper'
  if (flags.isChrome) return 'Base Chrome'
  return 'Base'
}

function inferredKnownDenominator(title, flags) {
  if (!flags.isAuto) return null
  if (/\bgold\s+ink\b/i.test(title)) return 15
  if (flags.isSnackPackAuto) return 5
  if (flags.isAuto && /\bb\s*&\s*w\b.*\bshimmer\b|\bb\s+and\s+w\b.*\bshimmer\b|\bbw\b.*\bshimmer\b|\bblack\s*(?:and|&)\s*white\b.*\bshimmer\b/i.test(title)) return 11
  if (flags.isAuto && /\blogofractor\b/i.test(title)) return 35
  if (flags.isAuto && isGenericRefractorTitle(title)) return 499
  if (/\bhta\s+choice\b/i.test(title)) return 150
  if (/\bmini[-\s]*diamond\b/i.test(title)) return 100
  if (/\bpackfractor\b/i.test(title)) return 89
  if (/\bgreen\s+grass\b/i.test(title)) return 99
  if (/\bblue\b/i.test(title) && /\bx[-\s]*(?:re)?fractor\b|\bxfractor\b/i.test(title)) return 150
  if (shouldInferStandardAutoParallelDenominator(title, flags)) return standardAutoParallelDenominator(title)
  return null
}

function shouldInferStandardAutoParallelDenominator(title, flags) {
  if (!flags.isAuto) return false
  if (IMAGE_VARIATION_PATTERN.test(title)) return false
  return Boolean(flags.isRedemption || /\bparallel\b/i.test(title))
}

function standardAutoParallelDenominator(title) {
  return STANDARD_AUTO_PARALLEL_DENOMINATORS.find(({ pattern }) => pattern.test(title))?.denominator ?? null
}

function isGenericRefractorTitle(title) {
  const text = String(title ?? '')
  if (!/\brefractor\b/i.test(text)) return false
  if (/\b(?:superfractor|logofractor|firefractor|packfractor|x\s*(?:re)?fractor|xfractor|l[ae]zer\s+refractor)\b/i.test(text)) return false
  if (COLOR_PATTERNS.some(([, pattern]) => pattern.test(text))) return false
  if (
    MODIFIER_PATTERNS.some(
      ([label, pattern]) => label !== 'Image Variation' && label !== 'Wave' && pattern.test(text),
    )
  ) {
    return false
  }
  return true
}

function detectChannel(saleType, salePriceText) {
  const joined = `${saleType ?? ''} ${salePriceText ?? ''}`
  if (/\bauction\b/i.test(joined)) return 'auction'
  if (/\bfixed\s+price\b|\bbest\s+offer\b|\bbuy\s+it\s+now\b|\bBIN\b/i.test(joined)) return 'bin'
  return 'unknown'
}

function exclusionReason(flags) {
  if (!flags.isBowman) return 'not bowman'
  if (!flags.matchesPlayer) return 'player mismatch'
  if (flags.isDigital) return 'digital card'
  if (flags.isRedeemed) return 'redeemed redemption'
  if (flags.isLot) return 'multi-card lot'
  if (flags.salePrice <= 0) return 'missing price'
  if (!flags.soldAt) return 'missing sold date'
  return null
}

function cardClass(flags) {
  if (flags.officialFamily?.cardClass) return flags.officialFamily.cardClass
  if (flags.isCaseHit) return 'case-hit'
  if (flags.isSnackPackAuto) return 'auto'
  if (flags.isInsert && flags.isAuto) return 'insert-auto'
  if (flags.isPaper && flags.isAuto) return 'paper-auto'
  if (flags.isAuto) return 'auto'
  if (flags.isInsert) return 'insert'
  if (flags.isPaper) return 'paper'
  if (flags.isChrome) return 'chrome'
  return 'base'
}

function bucketKeyForSale(sale) {
  return [
    `player=${sale.playerName}`,
    sale.releaseYear ?? 'unknown-year',
    sale.productFamily,
    sale.cardClass,
    sale.variationLabel,
    sale.gradeBucket,
  ].join(' | ')
}

export function normalizeMarketMoversSale(row, playerName, options = {}) {
  const title = String(row.title ?? '').trim()
  const salePrice = parseMarketMoversMoney(row.salePriceText ?? row.salePrice)
  const soldAt = parseMarketMoversDate(row.soldDate ?? row.soldAt)
  const releaseYear = releaseYearFromTitle(title) ?? options.defaultReleaseYear ?? null
  const officialFamily = releaseYear === 2026 ? detectOfficial2026BowmanFamily(title) : null
  const isLogoFoilPattern = LOGO_FOIL_PATTERN.test(title)
  const isPaper =
    Boolean(officialFamily?.isPaper) ||
    ((/\bpaper\b|\bBP-\d+\b|\bBPA[-\s]?[A-Z0-9]+\b|\bPRV[-\s]?[A-Z0-9]+\b/i.test(title) || isLogoFoilPattern) && !/\bchrome\b|\bBCP-\d+\b/i.test(title))
  const isRedemption = /\bredemption\b/i.test(title)
  const isAuto =
    Boolean(officialFamily?.isAuto) ||
    isRedemption ||
    /\bauto(?:graph|graphs|graphed)?\b|\bautograph\b|\bCPA-[A-Z]+\b|\bBPA[-\s]?[A-Z0-9]+\b|\bCRA-[A-Z]+\b|\bPRV[-\s]?[A-Z0-9]+\b/i.test(title)
  const isSnackPackAuto = Boolean(isAuto && SNACK_PACK_PATTERN.test(title))
  const insertName = officialFamily?.insertName ?? (isSnackPackAuto ? null : detectInsert(title))
  const isChrome = Boolean(officialFamily?.isChrome) || isSnackPackAuto || /\bchrome\b|\bBCP-\d+\b|\bCPA-[A-Z]+\b|\bCRA-[A-Z]+\b/i.test(title)
  const isCaseHit =
    Boolean(officialFamily?.isCaseHit) || Boolean(insertName && /crystallized|patchwork|anime|spotlights|final draft|ascensions|draft night/i.test(insertName))
  const flags = {
    salePrice,
    soldAt,
    matchesPlayer: titleMatchesPlayer(title, playerName),
    isBowman: /\bbowman\b/i.test(title),
    isDigital: /\btopps\s+bunt\s+digital\b|\bdigital\b/i.test(title),
    isAftermarketAuto: titleLooksHandSignedAuto(title),
    isRedeemed: /\bredeemed\b/i.test(title),
    isLot: /\b(lot|lots|set of|bundle|pick your card)\b/i.test(title) || /\(\d+\)\s+chrome\s+lot/i.test(title),
    isAuto,
    isPaper,
    isChrome,
    isInsert: !isSnackPackAuto && (Boolean(officialFamily?.isInsert) || Boolean(insertName)),
    isCaseHit,
    insertName,
    officialFamily,
    isRedemption,
    isSnackPackAuto,
  }
  const grade = gradeFromTitle(title)
  const productFamily = officialFamily?.productFamily ?? detectProductFamily(title, isPaper, isAuto)
  const variationLabel = detectVariation(title, flags)
  const serialDenominator = serialDenominatorFromTitle(title) ?? inferredKnownDenominator(title, flags)
  const reason = exclusionReason(flags)
  const normalized = {
    itemId: String(row.itemId ?? ''),
    playerName,
    title,
    salePrice,
    salePriceText: String(row.salePriceText ?? ''),
    soldAt,
    soldDate: String(row.soldDate ?? ''),
    saleType: String(row.saleType ?? ''),
    channel: detectChannel(row.saleType, row.salePriceText),
    seller: String(row.seller ?? ''),
    sourcePage: Number(row.sourcePage ?? 0) || null,
    sourceOffset: Number(row.sourceOffset ?? 0),
    releaseYear,
    productFamily,
    cardClass: cardClass(flags),
    variationLabel,
    serialDenominator,
    gradeCompany: grade.company,
    gradeValue: grade.grade,
    gradeBucket: grade.bucket,
    insertName,
    isBowman: flags.isBowman,
    isChrome,
    isPaper,
    isAuto,
    isInsert: flags.isInsert,
    isCaseHit,
    isRedemption,
    isRedeemed: flags.isRedeemed,
    isDigital: flags.isDigital,
    isLot: flags.isLot,
    modelEligible: !reason,
    exclusionReason: reason,
  }
  return {
    ...normalized,
    bucketKey: bucketKeyForSale(normalized),
  }
}

function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function percentile(values, pct) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * pct
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function ageDays(soldAt, asOf) {
  return Math.max(0, (asOf - soldAt) / ONE_DAY_MS)
}

function weightedLogPrice(sales, asOf, halfLifeDays) {
  if (sales.length === 0) return 0
  const logPrices = sales.map((sale) => Math.log(sale.salePrice))
  const center = median(logPrices)
  const deviations = logPrices.map((value) => Math.abs(value - center))
  const mad = median(deviations)
  const clipWidth = sales.length >= 5 && mad > 0 ? Math.max(0.22, mad * 1.4826 * 2.25) : Number.POSITIVE_INFINITY
  const weighted = sales.map((sale) => {
    const soldTime = new Date(sale.soldAt).getTime()
    const clipped = Math.min(center + clipWidth, Math.max(center - clipWidth, Math.log(sale.salePrice)))
    return {
      logPrice: clipped,
      weight: Math.pow(0.5, ageDays(soldTime, asOf) / halfLifeDays),
    }
  })
  const totalWeight = weighted.reduce((total, sale) => total + sale.weight, 0)
  if (totalWeight <= 0) return 0
  return Math.exp(weighted.reduce((total, sale) => total + sale.logPrice * sale.weight, 0) / totalWeight)
}

function summarizeBucket(bucketKey, sales, asOf) {
  const prices = sales.map((sale) => sale.salePrice).filter((price) => price > 0)
  const latestSoldAt = sales.reduce((latest, sale) => (sale.soldAt > latest ? sale.soldAt : latest), '')
  const sales30 = sales.filter((sale) => ageDays(new Date(sale.soldAt).getTime(), asOf) <= 30).length
  const sales90 = sales.filter((sale) => ageDays(new Date(sale.soldAt).getTime(), asOf) <= 90).length
  const anchor = sales[0]
  return {
    bucketKey,
    playerName: anchor.playerName,
    releaseYear: anchor.releaseYear,
    productFamily: anchor.productFamily,
    cardClass: anchor.cardClass,
    variationLabel: anchor.variationLabel,
    gradeBucket: anchor.gradeBucket,
    serialDenominator: anchor.serialDenominator,
    count: sales.length,
    sales30,
    sales90,
    auctionCount: sales.filter((sale) => sale.channel === 'auction').length,
    binCount: sales.filter((sale) => sale.channel === 'bin').length,
    minPrice: Math.min(...prices),
    q1Price: percentile(prices, 0.25),
    medianPrice: median(prices),
    avgPrice: prices.reduce((total, price) => total + price, 0) / prices.length,
    q3Price: percentile(prices, 0.75),
    maxPrice: Math.max(...prices),
    modelPrice: weightedLogPrice(sales, asOf, 30),
    latestSoldAt,
  }
}

function weightedMedian(items, valueKey = 'value', weightKey = 'weight') {
  const clean = items
    .map((item) => ({
      value: Number(item[valueKey]),
      weight: Math.max(0, Number(item[weightKey]) || 0),
    }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0 && item.weight > 0)
    .sort((left, right) => left.value - right.value)
  if (clean.length === 0) return 0
  const totalWeight = clean.reduce((total, item) => total + item.weight, 0)
  let running = 0
  for (const item of clean) {
    running += item.weight
    if (running >= totalWeight / 2) return item.value
  }
  return clean.at(-1)?.value ?? 0
}

function bucketLabel(bucket) {
  return normalizeText(`${bucket.productFamily ?? ''} ${bucket.variationLabel ?? ''}`)
}

function bucketDenominator(bucket) {
  const direct = Number(bucket.serialDenominator)
  if (Number.isFinite(direct) && direct > 0) return direct
  const match = String(bucket.variationLabel ?? '').match(/\/\s*(\d{1,4})\b/)
  return match ? Number(match[1]) : null
}

function autoVariationMultiplier(bucket) {
  if (bucket.cardClass !== 'auto') return null
  if (bucket.gradeBucket !== 'Raw') return null
  if (bucket.variationLabel === 'Base Auto') return null
  const label = bucketLabel(bucket)
  if (/\bhand\s+signed\b/i.test(bucket.variationLabel)) return null
  const denominator = bucketDenominator(bucket)

  if (/\bb\s+w\s+shimmer\b|\bb\s+and\s+w\b|\bblack\s+and\s+white\b|\bbw\s+shimmer\b/.test(label)) {
    return { multiplier: 16, reliability: 0.3, key: 'b&w shimmer /11' }
  }
  if (/\bsunflower\b|\bgumball\b|\bpeanuts?\b|\bpopcorn\b|\bsnack\s+pack\b/.test(label)) {
    return { multiplier: 20, reliability: 0.25, key: 'snack pack /5' }
  }
  if (/\bpackfractor\b/.test(label)) return { multiplier: 4.5, reliability: 0.45, key: 'packfractor /89' }
  if (/\blogofractor\b/.test(label) || denominator === 35) return { multiplier: 5.5, reliability: 0.55, key: 'logofractor /35' }
  if (/\bmini\s+diamond\b/.test(label) || denominator === 100) return { multiplier: 2.55, reliability: 0.75, key: 'mini diamond /100' }
  if (/\bhta\s+choice\b/.test(label)) return { multiplier: 1.75, reliability: 0.8, key: 'hta choice /150' }
  if (/\bspeckle\b|\bsparkle\b/.test(label) || denominator === 299) return { multiplier: 1.75, reliability: 0.85, key: 'speckle /299' }
  if (/\bpurple\b/.test(label) || denominator === 250) return { multiplier: 1.65, reliability: 0.85, key: 'purple /250' }
  if (/\brefractor\b/.test(label) && denominator === 499) return { multiplier: 1.35, reliability: 0.95, key: 'refractor /499' }
  if (/\bblue\b/.test(label) || denominator === 150) return { multiplier: 1.95, reliability: 0.8, key: 'blue /150' }
  if (/\baqua\b/.test(label) || denominator === 125) return { multiplier: 2.05, reliability: 0.78, key: 'aqua /125' }
  if (/\bgreen\b|\breptilian\b|\bgrass\b/.test(label) || denominator === 99) return { multiplier: 2.25, reliability: 0.78, key: 'green /99' }
  if (/\byellow\b/.test(label) || denominator === 75) return { multiplier: 3, reliability: 0.65, key: 'yellow /75' }
  if (/\bgold\b/.test(label) || denominator === 50) return { multiplier: 4, reliability: 0.62, key: 'gold /50' }
  if (/\borange\b/.test(label) || denominator === 25) return { multiplier: 7, reliability: 0.45, key: 'orange /25' }
  if (/\bblack\b/.test(label) || denominator === 10) return { multiplier: 12, reliability: 0.32, key: 'black /10' }
  if (/\bred\b|\bsuperfractor\b/.test(label) || denominator === 5 || denominator === 1) {
    return { multiplier: denominator === 1 ? 80 : 20, reliability: 0.18, key: denominator === 1 ? 'superfractor /1' : 'red /5' }
  }
  return null
}

function inferBaseAutoPriceFromVariations(buckets) {
  const autoCandidates = buckets
    .map((bucket) => {
      const expected = autoVariationMultiplier(bucket)
      if (!expected || !bucket.modelPrice) return null
      const isChrome = bucket.productFamily === 'Bowman Chrome'
      const isMega = bucket.productFamily === 'Bowman Mega' || /\bmojo\b/i.test(bucket.variationLabel ?? '')
      const productReliability = isChrome ? 1 : isMega ? 0.35 : 0.25
      const saleWeight = Math.sqrt(Math.min(16, Math.max(1, bucket.count ?? 1)))
      const recentWeight = bucket.sales30 > 0 ? 1.15 : 1
      return {
        bucket,
        key: expected.key,
        value: bucket.modelPrice / expected.multiplier,
        weight: expected.reliability * productReliability * saleWeight * recentWeight,
      }
    })
    .filter(Boolean)

  const chromeCandidates = autoCandidates.filter((candidate) => candidate.bucket.productFamily === 'Bowman Chrome')
  const preferred = chromeCandidates.length >= 2 ? chromeCandidates : autoCandidates
  if (preferred.length === 0) return null

  const firstPass = weightedMedian(preferred)
  if (!firstPass) return null
  const filtered = preferred.filter((candidate) => candidate.value >= firstPass * 0.4 && candidate.value <= firstPass * 2.5)
  const finalCandidates = filtered.length >= Math.min(3, preferred.length) ? filtered : preferred
  const price = weightedMedian(finalCandidates)
  if (!price) return null

  const supportingBuckets = finalCandidates
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 8)
    .map((candidate) => ({
      bucketKey: candidate.bucket.bucketKey,
      variationLabel: candidate.bucket.variationLabel,
      productFamily: candidate.bucket.productFamily,
      modelPrice: candidate.bucket.modelPrice,
      saleCount: candidate.bucket.count,
      multiplierKey: candidate.key,
      impliedBasePrice: candidate.value,
      weight: candidate.weight,
    }))

  return {
    price,
    source: 'variation-implied',
    candidateCount: preferred.length,
    supportingBuckets,
  }
}

export function buildMarketMoversNormalizedPlayerModel(normalized, playerName, options = {}) {
  const asOf = options.asOf ? new Date(options.asOf).getTime() : Date.now()
  const modelEligibleSales = normalized.filter((sale) => sale.modelEligible)
  const bucketsByKey = new Map()
  for (const sale of modelEligibleSales) {
    if (!bucketsByKey.has(sale.bucketKey)) bucketsByKey.set(sale.bucketKey, [])
    bucketsByKey.get(sale.bucketKey).push(sale)
  }
  const buckets = [...bucketsByKey.entries()]
    .map(([key, bucketSales]) => summarizeBucket(key, bucketSales, asOf))
    .sort((left, right) => right.modelPrice - left.modelPrice || right.count - left.count)

  const baseAutoBucket =
    buckets.find(
      (bucket) =>
        bucket.cardClass === 'auto' &&
        bucket.gradeBucket === 'Raw' &&
        bucket.variationLabel === 'Base Auto' &&
        bucket.productFamily === 'Bowman Chrome',
    ) ??
    buckets.find((bucket) => bucket.cardClass === 'auto' && bucket.gradeBucket === 'Raw' && bucket.variationLabel === 'Base Auto') ??
    null
  const inferredBaseAuto = baseAutoBucket ? null : inferBaseAutoPriceFromVariations(buckets)
  const baseAutoPrice = baseAutoBucket?.modelPrice ?? inferredBaseAuto?.price ?? null
  const bucketsWithRelatives = buckets.map((bucket) => ({
    ...bucket,
    baseAutoMultiple: baseAutoPrice && bucket.modelPrice ? bucket.modelPrice / baseAutoPrice : null,
  }))

  return {
    playerName,
    generatedAt: new Date(asOf).toISOString(),
    totalRows: normalized.length,
    normalizedRows: normalized.length,
    modelEligibleRows: modelEligibleSales.length,
    excludedRows: normalized.length - modelEligibleSales.length,
    baseAutoPrice,
    baseAutoBucket,
    baseAutoSource: baseAutoBucket ? 'direct' : inferredBaseAuto?.source ?? null,
    baseAutoInferred: inferredBaseAuto,
    buckets: bucketsWithRelatives,
    normalized,
    exclusions: Object.entries(
      normalized.reduce((counts, sale) => {
        if (sale.exclusionReason) counts[sale.exclusionReason] = (counts[sale.exclusionReason] ?? 0) + 1
        return counts
      }, {}),
    )
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count),
  }
}

export function buildMarketMoversPlayerModel(rows, playerName, options = {}) {
  const normalized = rows.map((row) => normalizeMarketMoversSale(row, playerName, { defaultReleaseYear: options.defaultReleaseYear }))
  return buildMarketMoversNormalizedPlayerModel(normalized, playerName, options)
}

export function modelBucketCsvRows(model) {
  const header = [
    'bucketKey',
    'productFamily',
    'cardClass',
    'variationLabel',
    'gradeBucket',
    'count',
    'sales30',
    'sales90',
    'auctionCount',
    'binCount',
    'modelPrice',
    'medianPrice',
    'minPrice',
    'maxPrice',
    'baseAutoMultiple',
    'latestSoldAt',
  ]
  const lines = [header]
  for (const bucket of model.buckets) {
    lines.push(
      header.map((key) => {
        const value = bucket[key]
        if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
        return String(value ?? '')
      }),
    )
  }
  return lines.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
}
