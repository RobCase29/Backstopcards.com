export type Bowman2026FamilyKind =
  | 'flagship-auto'
  | 'paper-auto'
  | 'insert-auto'
  | 'insert'
  | 'case-hit'
  | 'base'
  | 'prospect'

export type Bowman2026OfficialFamily = {
  name: string
  kind: Bowman2026FamilyKind
  count: number
  sheet: 'Base' | 'Prospects' | 'Autographs' | 'Inserts'
  patterns: RegExp[]
  chromeAutoModelBlocker: boolean
}

export const BOWMAN_2026_OFFICIAL_FAMILIES: Bowman2026OfficialFamily[] = [
  {
    name: 'Chrome Prospect Autographs',
    kind: 'flagship-auto',
    count: 87,
    sheet: 'Autographs',
    patterns: [/\bCPA[-\s]?[A-Z0-9]+\b/i, /\bchrome\s+prospect\s+auto(?:graph)?s?\b/i],
    chromeAutoModelBlocker: false,
  },
  {
    name: 'Chrome Prospect Gold Ink Autographs',
    kind: 'flagship-auto',
    count: 47,
    sheet: 'Autographs',
    patterns: [/\bgold\s+ink\b/i],
    chromeAutoModelBlocker: false,
  },
  {
    name: 'Chrome Prospect Packfractor Autographs',
    kind: 'flagship-auto',
    count: 39,
    sheet: 'Autographs',
    patterns: [/\bpackfractor\b(?=.*\bauto(?:graph)?s?\b)/i],
    chromeAutoModelBlocker: false,
  },
  {
    name: 'Chrome Rookie Autographs',
    kind: 'flagship-auto',
    count: 13,
    sheet: 'Autographs',
    patterns: [/\bCRA[-\s]?[A-Z0-9]+\b/i, /\bchrome\s+rookie\s+auto(?:graph)?s?\b/i],
    chromeAutoModelBlocker: false,
  },
  {
    name: 'Base Prospect Retail Autographs',
    kind: 'paper-auto',
    count: 31,
    sheet: 'Autographs',
    patterns: [/\bBPA[-\s]?[A-Z0-9]+\b/i, /\bbase\s+prospect\s+retail\s+auto(?:graph)?s?\b/i, /\bpaper\s+prospect\s+retail\s+auto(?:graph)?s?\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Base Rookie and Veteran Retail Autographs',
    kind: 'paper-auto',
    count: 35,
    sheet: 'Autographs',
    patterns: [/\bPRV[-\s]?[A-Z0-9]+\b/i, /\bbase\s+rookie\s+(?:and|&)\s+veteran\s+retail\s+auto(?:graph)?s?\b/i, /\bpaper\s+rookie.*auto(?:graph)?s?\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Draft Pick Pairings',
    kind: 'insert-auto',
    count: 16,
    sheet: 'Autographs',
    patterns: [/\bDPPA[-\s]?[A-Z0-9]+\b/i, /\bdraft\s+pick\s+pairings?\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Bowman Sterling Autographs',
    kind: 'insert-auto',
    count: 10,
    sheet: 'Autographs',
    patterns: [/\bbowman\s+sterling\s+auto(?:graph)?s?\b/i, /\bsterling\b(?=.*\bauto(?:graph)?s?\b)/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Electric Sluggers Autographs',
    kind: 'insert-auto',
    count: 14,
    sheet: 'Autographs',
    patterns: [/\belectric\s+sluggers?\b(?=.*\bauto(?:graph)?s?\b)/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Under The Radar Autographs',
    kind: 'insert-auto',
    count: 13,
    sheet: 'Autographs',
    patterns: [/\bunder\s+the\s+radar\b(?=.*\bauto(?:graph)?s?\b)/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Power Chords Autographs',
    kind: 'insert-auto',
    count: 15,
    sheet: 'Autographs',
    patterns: [/\bpower\s+chords?\b(?=.*\bauto(?:graph)?s?\b)/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Ultimate Autograph Booklet',
    kind: 'insert-auto',
    count: 1,
    sheet: 'Autographs',
    patterns: [/\bUAC[-\s]?\d+\b/i, /\bultimate\s+auto(?:graph)?\s+booklet\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'All-America Game Autographs',
    kind: 'insert-auto',
    count: 1,
    sheet: 'Autographs',
    patterns: [/\ball[-\s]?america\s+game\s+auto(?:graph)?s?\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Bowman Scouts Top 100',
    kind: 'insert',
    count: 100,
    sheet: 'Inserts',
    patterns: [/\bbowman\s+scouts?\s+top\s*100\b/i, /\btop\s*100\b/i, /\bBTP[-\s]?\d+\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Bowman Sterling',
    kind: 'insert',
    count: 15,
    sheet: 'Inserts',
    patterns: [/\bbowman\s+sterling\b/i, /\bBST[-\s]?\d+\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Patchwork',
    kind: 'case-hit',
    count: 30,
    sheet: 'Inserts',
    patterns: [/\bpatchwork\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Electric Sluggers',
    kind: 'insert',
    count: 25,
    sheet: 'Inserts',
    patterns: [/\belectric\s+sluggers?\b/i, /\bES[-\s]?\d+\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Under The Radar',
    kind: 'insert',
    count: 20,
    sheet: 'Inserts',
    patterns: [/\bunder\s+the\s+radar\b/i, /\bUR[-\s]?\d+\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Power Chords',
    kind: 'insert',
    count: 25,
    sheet: 'Inserts',
    patterns: [/\bpower\s+chords?\b/i, /\bPC[-\s]?\d+\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Anime - Kanji Variations',
    kind: 'case-hit',
    count: 7,
    sheet: 'Inserts',
    patterns: [/\banime\b(?=.*\bkanji\b)/i, /\bkanji\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Anime',
    kind: 'case-hit',
    count: 29,
    sheet: 'Inserts',
    patterns: [/\banime\b/i, /\bBA[-\s]?\d+\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Final Draft',
    kind: 'case-hit',
    count: 20,
    sheet: 'Inserts',
    patterns: [/\bfinal\s+draft\b/i, /\bFD[-\s]?\d+\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Crystallized',
    kind: 'case-hit',
    count: 20,
    sheet: 'Inserts',
    patterns: [/\bcrystall?ized\b/i, /\bBWC[-\s]?\d+\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Bowman Spotlights',
    kind: 'case-hit',
    count: 15,
    sheet: 'Inserts',
    patterns: [/\bbowman\s+spotlights?\b/i, /\bspotlights?\b/i, /\bBS[-\s]?\d+\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Chrome Prospects Packfractor Variation',
    kind: 'prospect',
    count: 150,
    sheet: 'Prospects',
    patterns: [/\bBCP[-\s]?\d+\b(?=.*\bpackfractor\b)/i, /\bchrome\s+prospects?\s+packfractor\s+variation\b/i],
    chromeAutoModelBlocker: false,
  },
  {
    name: 'Base - Etched In Glass Variations',
    kind: 'base',
    count: 12,
    sheet: 'Base',
    patterns: [/\betched\s+(?:in\s+)?(?:stained\s+)?glass\b/i],
    chromeAutoModelBlocker: true,
  },
  {
    name: 'Base - Red RC Variations',
    kind: 'base',
    count: 40,
    sheet: 'Base',
    patterns: [/\bred\s+rc\s+variation\b/i],
    chromeAutoModelBlocker: true,
  },
]

export function matchBowman2026OfficialFamily(title: string) {
  return BOWMAN_2026_OFFICIAL_FAMILIES.find((family) => family.patterns.some((pattern) => pattern.test(title))) ?? null
}

export function titleMatchesBowman2026ChromeAutoBlocker(title: string) {
  return BOWMAN_2026_OFFICIAL_FAMILIES.some(
    (family) => family.chromeAutoModelBlocker && family.patterns.some((pattern) => pattern.test(title)),
  )
}
