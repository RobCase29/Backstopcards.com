import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { BOWMAN_2026_CHROME_AUTO_VARIATIONS } from '../shared/bowman2026Taxonomy.js'

const DEFAULT_SHEETS = ['Base', 'Prospects', 'Autographs', 'Inserts']
const FIRST_EVIDENCE_SOURCE = 'market-title-first-signal'
export const WAX_PACK_HERO_FIRST_SOURCE = 'wax-pack-hero-firstbowman'

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function titleCase(value) {
  return compact(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^(?:B&W|HTA|RC|SSP|SP|CPA|BPA|CRA|PRV|BCP|BP)$/i.test(word)) return word.toUpperCase()
      if (/^\/\d+$/.test(word)) return word
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
    })
    .join(' ')
}

export function slugify(value, fallback = 'unknown') {
  const slug = compact(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || fallback
}

export function cleanPlayerName(value) {
  return compact(value).replace(/,+\s*$/g, '')
}

export function normalizePlayerKey(value) {
  return cleanPlayerName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function boolInt(value) {
  return value ? 1 : 0
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function releaseKeyFromParts(year, name) {
  return `${year}-${slugify(String(name).replace(/\b(?:19|20)\d{2}\b/g, ''), 'bowman')}`
}

function fileHash(filePath) {
  if (!filePath || !existsSync(filePath)) return ''
  return createHash('sha1').update(readFileSync(filePath)).digest('hex')
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value ?? ''))
  } catch {
    return fallback
  }
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `).get(tableName),
  )
}

function unzipText(filePath, member) {
  try {
    return execFileSync('unzip', ['-p', filePath, member], { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 })
  } catch (error) {
    throw new Error(`Could not read ${member} from ${filePath}: ${error.message}`)
  }
}

function xmlDecode(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function htmlDecode(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function stripHtmlToLines(html) {
  const text = htmlDecode(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
  return text
    .split(/\n+/)
    .map((line) => compact(line))
    .filter(Boolean)
}

export function parseWaxPackHeroFirstBowmanHtml(html, options = {}) {
  const cardPrefix = options.cardPrefix ?? 'BP'
  const prefixPattern = cardPrefix ? new RegExp(`^${cardPrefix}-\\d+$`, 'i') : null
  return parseWaxPackHeroFirstBowmanPage(html, options).entries
    .filter((entry) => !prefixPattern || prefixPattern.test(entry.cardNo))
    .map((entry) => ({
      cardNo: entry.cardNo,
      playerName: entry.playerName,
      title: entry.title,
      sourceKey: entry.cardNo,
      confidence: entry.confidence,
    }))
}

function firstBowmanYearFromText(value) {
  return Number(String(value ?? '').match(/\b((?:19|20)\d{2})\b/)?.[1] ?? 0) || null
}

function cleanWaxPackHeroPlayerName(value) {
  return cleanPlayerName(
    htmlDecode(value)
      .replace(/\((?:shop\s+on\s+)?(?:eBay|ebay)(?:\s+link)?\)/gi, '')
      .replace(/\s+-\s*(?:eBay|Shop)\b.*$/gi, '')
      .replace(/\s*[←→].*$/g, '')
      .replace(/\s+\|.*$/g, '')
      .trim(),
  )
}

function normalizeWaxPackHeroSection(line, fallbackYear) {
  const cleaned = compact(
    htmlDecode(line)
      .replace(/[←→]/g, ' ')
      .replace(/\s+-\s+WaxPackHero.*$/i, '')
      .replace(/\s+\|\s+WaxPackHero.*$/i, ''),
  )
  if (!cleaned || !/\bBowman\b/i.test(cleaned)) return ''
  if (/^(?:First Bowman|Home|Baseball Card|Sports Card|Topps|Panini|Checklist|Review|Tags|Comments?)\b/i.test(cleaned)) return ''
  if (/\b(?:print runs?|odds|autographs?|parallels?|set details|contents?)\b/i.test(cleaned) && !/^\d{4}\s+Bowman\b/i.test(cleaned)) return ''
  if (/[,;]/.test(cleaned) && !/^\d{4}\s+Bowman\b/i.test(cleaned) && !/^Bowman\b/i.test(cleaned)) return ''

  const sectionMatch = cleaned.match(/\b((?:(?:19|20)\d{2}\s+)?Bowman(?:\s+(?:Chrome|Draft|Prospects|Mega|Sapphire))*)\b/i)
  if (!sectionMatch) return ''
  let section = titleCase(sectionMatch[1].replace(/\s+/g, ' '))
  if (!/\b(?:19|20)\d{2}\b/.test(section) && fallbackYear) section = `${fallbackYear} ${section}`
  if (!/\bBowman\b/i.test(section)) return ''
  return section
}

function defaultFirstBowmanSection(fallbackYear) {
  return fallbackYear ? `${fallbackYear} Bowman` : 'Bowman'
}

export function parseWaxPackHeroFirstBowmanPage(html, options = {}) {
  const fallbackYear =
    Number(options.releaseYear ?? options.year ?? 0) ||
    firstBowmanYearFromText(options.sourceUrl) ||
    firstBowmanYearFromText(html)
  const cardPattern = /^([A-Z]{1,6}-\d+[A-Z]?)\s+(.+?)\s*$/i
  const entries = []
  const sections = new Map()
  const seen = new Set()
  let currentSection = defaultFirstBowmanSection(fallbackYear)

  for (const line of stripHtmlToLines(html)) {
    const section = normalizeWaxPackHeroSection(line, fallbackYear)
    if (section) {
      currentSection = section
      sections.set(section, (sections.get(section) ?? 0) + 0)
      continue
    }

    const match = line.match(cardPattern)
    if (!match) continue
    const cardNo = match[1].toUpperCase()
    const playerName = cleanWaxPackHeroPlayerName(match[2])
    if (!playerName || /\b(?:checklist|waxpackhero|ebay|review|comments?)\b/i.test(playerName)) continue

    const releaseYear = firstBowmanYearFromText(currentSection) ?? fallbackYear
    const releaseName = currentSection || defaultFirstBowmanSection(releaseYear)
    const releaseKey = releaseKeyFromParts(releaseYear, releaseName)
    const key = `${releaseKey}:${cardNo}:${normalizePlayerKey(playerName)}`
    if (seen.has(key)) continue
    seen.add(key)
    sections.set(releaseName, (sections.get(releaseName) ?? 0) + 1)
    entries.push({
      releaseYear,
      releaseName,
      releaseKey,
      section: releaseName,
      cardNo,
      playerName,
      title: `${cardNo} ${playerName}`,
      sourceKey: `${releaseName}:${cardNo}`,
      confidence: 0.99,
    })
  }

  return {
    releaseYear: fallbackYear,
    sections: [...sections.entries()].map(([section, cards]) => ({ section, cards })),
    entries,
  }
}

function parseAttributes(value) {
  const attrs = {}
  for (const match of value.matchAll(/\s([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) attrs[match[1]] = xmlDecode(match[2])
  return attrs
}

function parseSharedStrings(xlsxPath) {
  let xml = ''
  try {
    xml = unzipText(xlsxPath, 'xl/sharedStrings.xml')
  } catch {
    return []
  }
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((textMatch) => xmlDecode(textMatch[1])).join(''),
  )
}

function workbookSheets(xlsxPath) {
  const workbookXml = unzipText(xlsxPath, 'xl/workbook.xml')
  const relsXml = unzipText(xlsxPath, 'xl/_rels/workbook.xml.rels')
  const rels = new Map()
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = parseAttributes(match[1])
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, attrs.Target.replace(/^\/?xl\//, ''))
  }
  return [...workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)].map((match) => {
    const attrs = parseAttributes(match[1])
    const target = rels.get(attrs['r:id'])
    return {
      name: attrs.name,
      path: target ? `xl/${target}` : '',
    }
  })
}

function columnNumber(cellRef) {
  const letters = String(cellRef ?? '').match(/^[A-Z]+/)?.[0] ?? ''
  return [...letters].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0)
}

function parseSheetRows(xlsxPath, sheetPath, sharedStrings) {
  const xml = unzipText(xlsxPath, sheetPath)
  const rows = []
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = parseAttributes(cellMatch[1])
      const colIndex = Math.max(0, columnNumber(attrs.r) - 1)
      const body = cellMatch[2]
      let value = ''
      if (attrs.t === 's') {
        const index = Number(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? -1)
        value = sharedStrings[index] ?? ''
      } else if (attrs.t === 'inlineStr') {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => xmlDecode(match[1])).join('')
      } else {
        value = xmlDecode(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '')
      }
      row[colIndex] = value
    }
    rows.push(row.map((value) => compact(value)))
  }
  return rows
}

function isCardCountRow(value) {
  return /^\d+\s+cards?$/i.test(compact(value))
}

function rowLooksLikeCard(row) {
  const filled = row.filter(Boolean)
  if (filled.length < 2) return false
  if (isCardCountRow(filled[0])) return false
  if (!cleanPlayerName(row[1] ?? row[2] ?? '')) return false
  return true
}

function normalizeSection(section) {
  return compact(section).replace(/\s+-\s+/g, ' - ')
}

export function extractChecklistRows(xlsxPath, options = {}) {
  const sheetNames = options.sheetNames ?? DEFAULT_SHEETS
  const sharedStrings = parseSharedStrings(xlsxPath)
  const sheets = workbookSheets(xlsxPath).filter((sheet) => sheetNames.includes(sheet.name))
  const entries = []
  for (const sheet of sheets) {
    const rows = parseSheetRows(xlsxPath, sheet.path, sharedStrings)
    let section = sheet.name
    for (const row of rows) {
      const filled = row.filter(Boolean)
      if (filled.length === 1 && !isCardCountRow(filled[0])) {
        section = normalizeSection(filled[0])
        continue
      }
      if (!rowLooksLikeCard(row)) continue
      const playerName = cleanPlayerName(row[1])
      if (!playerName) continue
      entries.push({
        sourceSheet: sheet.name,
        section: normalizeSection(section),
        cardNo: compact(row[0]),
        playerName,
        team: compact(row[2]),
        rookieFlag: compact(row[3]),
      })
    }
  }
  return entries
}

export function classifyChecklistSection(section, cardNo = '') {
  const raw = normalizeSection(section)
  const text = `${raw} ${cardNo}`
  const isAuto = /\bauto(?:graph|graphs|graphed)?\b/i.test(text)
  const isChrome = /\bchrome\b|\bCPA[-\s]?|\bCRA[-\s]?|\bBCP[-\s]?/i.test(text)
  const isPaper = /\bpaper\b|\bbase\s+prospect\b|\bBPA[-\s]?|\bPRV[-\s]?/i.test(text)
  const isCaseHit = /\bcrystallized\b|\bpatchwork\b|\banime\b|\bbowman\s+spotlights?\b|\bfinal\s+draft\b/i.test(text)
  const isInsert = isCaseHit || /\btop\s*100\b|\belectric\s+sluggers?\b|\bpower\s+chords?\b|\bunder\s+the\s+radar\b|\bbowman\s+sterling\b|\bdraft\s+pick\s+pairings?\b|\bultimate\b/i.test(text)
  let cardClass = 'base'
  if (isCaseHit) cardClass = 'case-hit'
  else if (isInsert && isAuto) cardClass = 'insert-auto'
  else if (isPaper && isAuto) cardClass = 'paper-auto'
  else if (isAuto) cardClass = 'auto'
  else if (isInsert) cardClass = 'insert'
  else if (isChrome) cardClass = 'chrome'
  else if (isPaper) cardClass = 'paper'

  let productFamily = 'Bowman'
  if (/\bmega\b|\bmojo\b/i.test(text)) productFamily = 'Bowman Mega'
  else if (/\bsapphire\b/i.test(text)) productFamily = 'Bowman Sapphire'
  else if (/\bdraft\b/i.test(text)) productFamily = 'Bowman Draft'
  else if (isChrome || cardClass === 'auto') productFamily = 'Bowman Chrome'
  else if (isPaper || cardClass === 'paper-auto') productFamily = 'Bowman Paper'

  const cardFamily = titleCase(raw || 'Base')
  let chaseCategory = 'support'
  if (/^Chrome Prospect Autographs$/i.test(raw)) chaseCategory = 'flagship-auto'
  else if (/Chrome Prospect .*Autographs/i.test(raw)) chaseCategory = 'parallel-auto'
  else if (/Autographs/i.test(raw)) chaseCategory = 'auto'
  else if (isCaseHit) chaseCategory = 'case-hit'
  else if (/Chrome Prospects/i.test(raw)) chaseCategory = 'chrome-prospect'
  else if (/Base Prospects/i.test(raw)) chaseCategory = 'paper-prospect'
  else if (isInsert) chaseCategory = 'insert'
  else if (/Base Set/i.test(raw)) chaseCategory = 'base'

  return {
    productFamily,
    cardFamily,
    cardClass,
    insertName: isInsert ? raw : '',
    isAuto,
    isChrome,
    isPaper,
    isInsert,
    isCaseHit,
    chaseCategory,
  }
}

export function createChecklistLedgerSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS checklist_releases (
      release_key TEXT PRIMARY KEY,
      release_year INTEGER NOT NULL,
      release_name TEXT NOT NULL,
      product_line TEXT NOT NULL DEFAULT 'Bowman',
      source_path TEXT,
      source_hash TEXT,
      imported_at TEXT NOT NULL,
      raw_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS checklist_cards (
      checklist_card_key TEXT PRIMARY KEY,
      release_key TEXT NOT NULL,
      release_year INTEGER NOT NULL,
      source_sheet TEXT,
      section TEXT NOT NULL,
      card_no TEXT NOT NULL,
      player_name TEXT NOT NULL,
      player_key TEXT NOT NULL,
      team TEXT,
      rookie_flag TEXT,
      product_family TEXT NOT NULL,
      card_family TEXT NOT NULL,
      card_class TEXT NOT NULL,
      insert_name TEXT,
      is_auto INTEGER NOT NULL DEFAULT 0,
      is_chrome INTEGER NOT NULL DEFAULT 0,
      is_paper INTEGER NOT NULL DEFAULT 0,
      is_insert INTEGER NOT NULL DEFAULT 0,
      is_case_hit INTEGER NOT NULL DEFAULT 0,
      chase_category TEXT NOT NULL DEFAULT 'support',
      first_status TEXT NOT NULL DEFAULT 'unknown',
      first_confidence REAL NOT NULL DEFAULT 0,
      first_evidence_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(release_key) REFERENCES checklist_releases(release_key)
    );

    CREATE TABLE IF NOT EXISTS checklist_player_signals (
      release_key TEXT NOT NULL,
      player_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      first_status TEXT NOT NULL DEFAULT 'unknown',
      first_confidence REAL NOT NULL DEFAULT 0,
      first_evidence_count INTEGER NOT NULL DEFAULT 0,
      non_first_evidence_count INTEGER NOT NULL DEFAULT 0,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY(release_key, player_key),
      FOREIGN KEY(release_key) REFERENCES checklist_releases(release_key)
    );

    CREATE TABLE IF NOT EXISTS checklist_variation_templates (
      template_key TEXT PRIMARY KEY,
      release_key TEXT NOT NULL,
      template_group TEXT NOT NULL,
      product_family TEXT NOT NULL,
      card_family TEXT NOT NULL,
      card_class TEXT NOT NULL,
      variation_label TEXT NOT NULL,
      serial_denominator INTEGER,
      print_run REAL,
      scarcity_rank REAL,
      chase_tier TEXT NOT NULL DEFAULT 'support',
      applies_to_sections TEXT NOT NULL,
      is_base_template INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(release_key) REFERENCES checklist_releases(release_key)
    );

    CREATE TABLE IF NOT EXISTS checklist_card_universe (
      universe_card_key TEXT PRIMARY KEY,
      release_key TEXT NOT NULL,
      checklist_card_key TEXT NOT NULL,
      template_key TEXT NOT NULL,
      release_year INTEGER NOT NULL,
      card_no TEXT NOT NULL,
      player_name TEXT NOT NULL,
      player_key TEXT NOT NULL,
      team TEXT,
      product_family TEXT NOT NULL,
      card_family TEXT NOT NULL,
      card_class TEXT NOT NULL,
      variation_label TEXT NOT NULL,
      serial_denominator INTEGER,
      print_run REAL,
      scarcity_rank REAL,
      grade_bucket TEXT NOT NULL DEFAULT 'Raw',
      first_status TEXT NOT NULL DEFAULT 'unknown',
      chase_category TEXT NOT NULL DEFAULT 'support',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(release_key) REFERENCES checklist_releases(release_key),
      FOREIGN KEY(checklist_card_key) REFERENCES checklist_cards(checklist_card_key),
      FOREIGN KEY(template_key) REFERENCES checklist_variation_templates(template_key)
    );

    CREATE TABLE IF NOT EXISTS checklist_market_evidence (
      evidence_key TEXT PRIMARY KEY,
      release_key TEXT NOT NULL,
      checklist_card_key TEXT,
      universe_card_key TEXT,
      player_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      source TEXT NOT NULL,
      source_key TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      evidence_value TEXT NOT NULL,
      confidence REAL NOT NULL,
      title TEXT NOT NULL,
      observed_at TEXT,
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(release_key) REFERENCES checklist_releases(release_key)
    );

    CREATE INDEX IF NOT EXISTS idx_checklist_cards_release_player ON checklist_cards(release_key, player_key);
    CREATE INDEX IF NOT EXISTS idx_checklist_cards_section ON checklist_cards(release_key, section);
    CREATE INDEX IF NOT EXISTS idx_checklist_universe_release_player ON checklist_card_universe(release_key, player_key);
    CREATE INDEX IF NOT EXISTS idx_checklist_universe_lane ON checklist_card_universe(release_key, card_class, variation_label);
    CREATE INDEX IF NOT EXISTS idx_checklist_evidence_player ON checklist_market_evidence(release_key, player_key);
  `)
}

function templateKey(releaseKey, template) {
  return [releaseKey, slugify(template.templateGroup), slugify(template.variationLabel), template.serialDenominator ?? template.printRun ?? 'base'].join('|')
}

function template(sections, variationLabel, options = {}) {
  const firstSection = sections[0] ?? 'Base'
  const meta = classifyChecklistSection(firstSection)
  const serialDenominator = numberOrNull(options.serialDenominator)
  const printRun = numberOrNull(options.printRun)
  return {
    templateGroup: options.templateGroup ?? firstSection,
    productFamily: options.productFamily ?? meta.productFamily,
    cardFamily: options.cardFamily ?? meta.cardFamily,
    cardClass: options.cardClass ?? meta.cardClass,
    variationLabel,
    serialDenominator,
    printRun,
    scarcityRank: numberOrNull(options.scarcityRank) ?? serialDenominator ?? printRun ?? 100_000,
    chaseTier: options.chaseTier ?? meta.chaseCategory,
    appliesToSections: sections,
    isBaseTemplate: Boolean(options.isBaseTemplate),
  }
}

export function bowman2026VariationTemplates() {
  const flagshipAutos = ['Chrome Prospect Autographs']
  const chromeAutoParallels = BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((definition) =>
    template(flagshipAutos, definition.label, {
      isBaseTemplate: definition.id === 'base-auto',
      serialDenominator: definition.serialDenominator,
      printRun: definition.printRun,
      scarcityRank: definition.scarcityOrder,
      chaseTier: 'flagship-auto',
    }),
  )

  return [
    ...chromeAutoParallels,
    template(['Chrome Prospect Gold Ink Autographs'], 'Gold Ink /15', { serialDenominator: 15, cardClass: 'auto', chaseTier: 'flagship-auto' }),
    template(['Chrome Prospect Packfractor Autographs'], 'Packfractor /89', { serialDenominator: 89, cardClass: 'auto', chaseTier: 'flagship-auto' }),
    template(['Chrome Rookie Autographs'], 'Base Rookie Auto', { isBaseTemplate: true, printRun: 500, cardClass: 'auto', chaseTier: 'auto' }),
    template(['Base Prospect Retail Autographs'], 'Base Paper Auto', { isBaseTemplate: true, printRun: 700, cardClass: 'paper-auto', productFamily: 'Bowman Paper', chaseTier: 'auto' }),
    template(['Base Rookie and Veteran Retail Autographs'], 'Base Paper Auto', { isBaseTemplate: true, printRun: 200, cardClass: 'paper-auto', productFamily: 'Bowman Paper', chaseTier: 'auto' }),
    template(['Draft Pick Pairings'], 'Draft Pick Pairings Auto', { isBaseTemplate: true, cardClass: 'insert-auto', chaseTier: 'auto' }),
    template(['Ultimate Autograph Booklet'], 'Ultimate Auto Book /10', { serialDenominator: 10, cardClass: 'insert-auto', chaseTier: 'auto' }),
    template(['Base Prospects'], 'Base Paper', { isBaseTemplate: true, cardClass: 'paper', productFamily: 'Bowman Paper', chaseTier: 'paper-prospect' }),
    template(['Base Prospects'], 'Logo Foil Pattern', { printRun: 100, cardClass: 'paper', productFamily: 'Bowman Paper', chaseTier: 'paper-prospect' }),
    template(['Chrome Prospects'], 'Base Chrome', { isBaseTemplate: true, cardClass: 'chrome', productFamily: 'Bowman Chrome', chaseTier: 'chrome-prospect' }),
    template(['Chrome Prospects'], 'Mojo', { printRun: 42800, cardClass: 'chrome', productFamily: 'Bowman Mega', chaseTier: 'chrome-prospect' }),
    template(['Chrome Prospects'], 'Reptilian', { printRun: 8190, cardClass: 'chrome', productFamily: 'Bowman Chrome', chaseTier: 'chrome-prospect' }),
    template(['Chrome Prospects'], 'Lazer Refractor', { printRun: 9450, cardClass: 'chrome', productFamily: 'Bowman Chrome', chaseTier: 'chrome-prospect' }),
    template(['Chrome Prospects'], 'X-Fractor', { printRun: 775, cardClass: 'chrome', productFamily: 'Bowman Chrome', chaseTier: 'chrome-prospect' }),
    template(['Chrome Prospects'], 'Etched In Glass', { printRun: 350, cardClass: 'chrome', productFamily: 'Bowman Chrome', chaseTier: 'chrome-prospect' }),
    template(['Chrome Prospects'], 'Logo Foil Pattern', { printRun: 100, cardClass: 'chrome', productFamily: 'Bowman Chrome', chaseTier: 'chrome-prospect' }),
    template(['Chrome Prospects Packfractor Variation'], 'Packfractor /89', { serialDenominator: 89, cardClass: 'chrome', productFamily: 'Bowman Chrome', chaseTier: 'chrome-prospect' }),
    template(['Base Set'], 'Base', { isBaseTemplate: true, cardClass: 'base', productFamily: 'Bowman', chaseTier: 'base' }),
    template(['Base - Red RC Variations'], 'Red RC Variation', { printRun: 20690, cardClass: 'base', productFamily: 'Bowman', chaseTier: 'base' }),
    template(['Base - Etched In Glass Variations', 'Chrome Prospects - Etched In Glass Variations'], 'Etched In Glass', {
      printRun: 350,
      cardClass: 'chrome',
      productFamily: 'Bowman Chrome',
      chaseTier: 'chrome-prospect',
    }),
    template(['Bowman Scouts Top 100'], 'Top 100', { isBaseTemplate: true, printRun: 34900, cardClass: 'insert', chaseTier: 'insert' }),
    template(['Electric Sluggers'], 'Electric Sluggers', { isBaseTemplate: true, printRun: 69630, cardClass: 'insert', chaseTier: 'insert' }),
    template(['Under The Radar'], 'Under The Radar', { isBaseTemplate: true, printRun: 80900, cardClass: 'insert', chaseTier: 'insert' }),
    template(['Bowman Sterling'], 'Bowman Sterling', { isBaseTemplate: true, printRun: 107805, cardClass: 'insert', chaseTier: 'insert' }),
    template(['Power Chords'], 'Power Chords', { isBaseTemplate: true, printRun: 29070, cardClass: 'insert', chaseTier: 'insert' }),
    template(['Crystallized'], 'Crystallized', { isBaseTemplate: true, printRun: 100, cardClass: 'case-hit', chaseTier: 'case-hit' }),
    template(['Crystallized'], 'Crystallized Gold /50', { serialDenominator: 50, cardClass: 'case-hit', chaseTier: 'case-hit' }),
    template(['Crystallized'], 'Crystallized Orange /25', { serialDenominator: 25, cardClass: 'case-hit', chaseTier: 'case-hit' }),
    template(['Crystallized'], 'Crystallized Red /5', { serialDenominator: 5, cardClass: 'case-hit', chaseTier: 'case-hit' }),
    template(['Crystallized'], 'Crystallized Superfractor /1', { serialDenominator: 1, cardClass: 'case-hit', chaseTier: 'case-hit' }),
    template(['Patchwork'], 'Patchwork', { isBaseTemplate: true, printRun: 185, cardClass: 'case-hit', chaseTier: 'case-hit' }),
    template(['Anime'], 'Anime', { isBaseTemplate: true, printRun: 190, cardClass: 'case-hit', chaseTier: 'case-hit' }),
    template(['Anime - Kanji Variations'], 'Anime Kanji', { isBaseTemplate: true, printRun: 5, cardClass: 'case-hit', chaseTier: 'case-hit' }),
    template(['Bowman Spotlights'], 'Bowman Spotlights', { isBaseTemplate: true, printRun: 140, cardClass: 'case-hit', chaseTier: 'case-hit' }),
    template(['Final Draft', 'Final  Draft'], 'Final Draft', { isBaseTemplate: true, printRun: 185, cardClass: 'case-hit', chaseTier: 'case-hit' }),
  ]
}

function checklistCardKey(releaseKey, row) {
  return [releaseKey, slugify(row.section), slugify(row.cardNo), slugify(row.playerName)].join('|')
}

function universeCardKey(card, templateRow) {
  return [card.checklistCardKey, templateRow.templateKey, slugify('raw')].join('|')
}

export function upsertChecklistRelease(db, options) {
  const nowIso = options.nowIso ?? new Date().toISOString()
  const releaseKey = options.releaseKey ?? releaseKeyFromParts(options.releaseYear, options.releaseName)
  db.prepare(`
    INSERT INTO checklist_releases (
      release_key, release_year, release_name, product_line, source_path, source_hash, imported_at, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(release_key) DO UPDATE SET
      release_year=excluded.release_year,
      release_name=excluded.release_name,
      product_line=excluded.product_line,
      source_path=excluded.source_path,
      source_hash=excluded.source_hash,
      imported_at=excluded.imported_at,
      raw_json=excluded.raw_json
  `).run(
    releaseKey,
    options.releaseYear,
    options.releaseName,
    options.productLine ?? 'Bowman',
    options.sourcePath ?? '',
    options.sourceHash ?? '',
    nowIso,
    JSON.stringify(options.rawJson ?? {}),
  )
  return releaseKey
}

export function upsertChecklistRows(db, releaseKey, releaseYear, rows, options = {}) {
  const nowIso = options.nowIso ?? new Date().toISOString()
  const seen = new Set()
  const upsert = db.prepare(`
    INSERT INTO checklist_cards (
      checklist_card_key, release_key, release_year, source_sheet, section, card_no, player_name, player_key,
      team, rookie_flag, product_family, card_family, card_class, insert_name, is_auto, is_chrome, is_paper,
      is_insert, is_case_hit, chase_category, first_status, first_confidence, first_evidence_count, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', 0, 0, ?, ?)
    ON CONFLICT(checklist_card_key) DO UPDATE SET
      source_sheet=excluded.source_sheet,
      section=excluded.section,
      card_no=excluded.card_no,
      player_name=excluded.player_name,
      player_key=excluded.player_key,
      team=excluded.team,
      rookie_flag=excluded.rookie_flag,
      product_family=excluded.product_family,
      card_family=excluded.card_family,
      card_class=excluded.card_class,
      insert_name=excluded.insert_name,
      is_auto=excluded.is_auto,
      is_chrome=excluded.is_chrome,
      is_paper=excluded.is_paper,
      is_insert=excluded.is_insert,
      is_case_hit=excluded.is_case_hit,
      chase_category=excluded.chase_category,
      updated_at=excluded.updated_at
  `)

  for (const row of rows) {
    const playerName = cleanPlayerName(row.playerName)
    if (!playerName || !row.cardNo) continue
    const cardRow = { ...row, playerName }
    const key = checklistCardKey(releaseKey, cardRow)
    const meta = classifyChecklistSection(row.section, row.cardNo)
    seen.add(key)
    upsert.run(
      key,
      releaseKey,
      releaseYear,
      row.sourceSheet,
      row.section,
      row.cardNo,
      playerName,
      normalizePlayerKey(playerName),
      row.team,
      row.rookieFlag,
      meta.productFamily,
      meta.cardFamily,
      meta.cardClass,
      meta.insertName,
      boolInt(meta.isAuto),
      boolInt(meta.isChrome),
      boolInt(meta.isPaper),
      boolInt(meta.isInsert),
      boolInt(meta.isCaseHit),
      meta.chaseCategory,
      nowIso,
      nowIso,
    )
  }

  if (options.prune) {
    const existing = db.prepare('SELECT checklist_card_key AS key FROM checklist_cards WHERE release_key = ?').all(releaseKey)
    const remove = db.prepare('DELETE FROM checklist_cards WHERE checklist_card_key = ?')
    for (const row of existing) {
      if (!seen.has(row.key)) remove.run(row.key)
    }
  }

  return { cards: seen.size }
}

export function seedVariationTemplates(db, releaseKey, templates = bowman2026VariationTemplates(), options = {}) {
  const nowIso = options.nowIso ?? new Date().toISOString()
  const upsert = db.prepare(`
    INSERT INTO checklist_variation_templates (
      template_key, release_key, template_group, product_family, card_family, card_class, variation_label,
      serial_denominator, print_run, scarcity_rank, chase_tier, applies_to_sections, is_base_template, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(template_key) DO UPDATE SET
      template_group=excluded.template_group,
      product_family=excluded.product_family,
      card_family=excluded.card_family,
      card_class=excluded.card_class,
      variation_label=excluded.variation_label,
      serial_denominator=excluded.serial_denominator,
      print_run=excluded.print_run,
      scarcity_rank=excluded.scarcity_rank,
      chase_tier=excluded.chase_tier,
      applies_to_sections=excluded.applies_to_sections,
      is_base_template=excluded.is_base_template,
      updated_at=excluded.updated_at
  `)
  const seeded = []
  for (const item of templates) {
    const key = templateKey(releaseKey, item)
    seeded.push(key)
    upsert.run(
      key,
      releaseKey,
      item.templateGroup,
      item.productFamily,
      item.cardFamily,
      item.cardClass,
      item.variationLabel,
      item.serialDenominator,
      item.printRun,
      item.scarcityRank,
      item.chaseTier,
      JSON.stringify(item.appliesToSections),
      boolInt(item.isBaseTemplate),
      nowIso,
      nowIso,
    )
  }
  if (options.prune) {
    const placeholders = seeded.map(() => '?').join(', ')
    db.prepare(`DELETE FROM checklist_variation_templates WHERE release_key = ? AND template_key NOT IN (${placeholders})`).run(
      releaseKey,
      ...seeded,
    )
  }
  return { templates: seeded.length }
}

function templateAppliesToCard(templateRow, cardRow) {
  const sections = parseJson(templateRow.appliesToSections, [])
  return sections.some((section) => normalizeSection(section).toLowerCase() === normalizeSection(cardRow.section).toLowerCase())
}

export function rebuildChecklistUniverse(db, releaseKey, options = {}) {
  const nowIso = options.nowIso ?? new Date().toISOString()
  const cards = db.prepare(`
    SELECT
      checklist_card_key AS checklistCardKey,
      release_key AS releaseKey,
      release_year AS releaseYear,
      section,
      card_no AS cardNo,
      player_name AS playerName,
      player_key AS playerKey,
      team,
      first_status AS firstStatus,
      chase_category AS chaseCategory
    FROM checklist_cards
    WHERE release_key = ?
    ORDER BY player_name, section, card_no
  `).all(releaseKey)
  const templates = db.prepare(`
    SELECT
      template_key AS templateKey,
      template_group AS templateGroup,
      product_family AS productFamily,
      card_family AS cardFamily,
      card_class AS cardClass,
      variation_label AS variationLabel,
      serial_denominator AS serialDenominator,
      print_run AS printRun,
      scarcity_rank AS scarcityRank,
      chase_tier AS chaseTier,
      applies_to_sections AS appliesToSections
    FROM checklist_variation_templates
    WHERE release_key = ?
  `).all(releaseKey)
  db.prepare('DELETE FROM checklist_card_universe WHERE release_key = ?').run(releaseKey)
  const insert = db.prepare(`
    INSERT INTO checklist_card_universe (
      universe_card_key, release_key, checklist_card_key, template_key, release_year, card_no, player_name,
      player_key, team, product_family, card_family, card_class, variation_label, serial_denominator, print_run,
      scarcity_rank, grade_bucket, first_status, chase_category, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Raw', ?, ?, ?, ?)
  `)
  let universeRows = 0
  for (const card of cards) {
    const matches = templates.filter((row) => templateAppliesToCard(row, card))
    for (const templateRow of matches) {
      insert.run(
        universeCardKey(card, templateRow),
        releaseKey,
        card.checklistCardKey,
        templateRow.templateKey,
        card.releaseYear,
        card.cardNo,
        card.playerName,
        card.playerKey,
        card.team,
        templateRow.productFamily,
        templateRow.cardFamily,
        templateRow.cardClass,
        templateRow.variationLabel,
        templateRow.serialDenominator,
        templateRow.printRun,
        templateRow.scarcityRank,
        card.firstStatus,
        templateRow.chaseTier || card.chaseCategory,
        nowIso,
        nowIso,
      )
      universeRows += 1
    }
  }
  return { universeRows }
}

function titleMatchesPlayer(title, playerName) {
  const words = new Set(
    compact(title)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean),
  )
  return normalizePlayerKey(playerName)
    .split(' ')
    .filter((word) => word.length > 1)
    .every((word) => words.has(word))
}

function classifyFirstEvidence(title) {
  if (/\b(?:non|not)\s*[- ]?\s*1st\b|\bnot\s+(?:a\s+)?first\b/i.test(title)) return 'non_1st'
  if (/\b(?:1st|first)\s+bowman\b|\bbowman\s+(?:1st|first)\b|\b1st\s+(?:chrome|auto|autograph|prospect)\b/i.test(title)) return 'first'
  return ''
}

function marketTitleRows(db, releaseYear) {
  const rows = []
  if (tableExists(db, 'market_movers_sales_raw')) {
    rows.push(
      ...db.prepare(`
        SELECT
          source AS source,
          item_id AS sourceKey,
          player_name AS playerName,
          title,
          sold_at AS observedAt,
          raw_json AS rawJson
        FROM market_movers_sales_raw
        WHERE title LIKE ?
      `).all(`%${releaseYear}%`),
    )
  }
  if (tableExists(db, 'card_hedge_sales')) {
    rows.push(
      ...db.prepare(`
        SELECT
          'card_hedge_sale' AS source,
          price_history_id AS sourceKey,
          player_name AS playerName,
          title,
          sold_at AS observedAt,
          raw_json AS rawJson
        FROM card_hedge_sales
        WHERE title LIKE ?
      `).all(`%${releaseYear}%`),
    )
  }
  if (tableExists(db, 'card_hedge_cards')) {
    rows.push(
      ...db.prepare(`
        SELECT
          'card_hedge_card' AS source,
          card_id AS sourceKey,
          player_name AS playerName,
          description AS title,
          last_seen_at AS observedAt,
          raw_json AS rawJson
        FROM card_hedge_cards
        WHERE description LIKE ?
      `).all(`%${releaseYear}%`),
    )
  }
  return rows
}

function firstEligibleCardClause() {
  return `
    section LIKE '%Prospect%'
    OR card_no LIKE 'BP-%'
    OR card_no LIKE 'BCP-%'
    OR card_no LIKE 'BD-%'
    OR card_no LIKE 'BDC-%'
    OR card_no LIKE 'CPA-%'
    OR card_no LIKE 'BPA-%'
  `
}

function recomputeChecklistFirstSignals(db, releaseKey, options = {}) {
  const nowIso = options.nowIso ?? new Date().toISOString()
  const players = db.prepare(`
    SELECT player_key AS playerKey, MIN(player_name) AS playerName
    FROM checklist_cards
    WHERE release_key = ?
    GROUP BY player_key
  `).all(releaseKey)
  const aggregates = new Map(players.map((row) => [row.playerKey, { ...row, first: [], nonFirst: [] }]))

  const evidenceRows = db.prepare(`
    SELECT
      player_key AS playerKey,
      player_name AS playerName,
      source,
      source_key AS sourceKey,
      evidence_value AS evidenceValue,
      confidence,
      title,
      observed_at AS observedAt
    FROM checklist_market_evidence
    WHERE release_key = ?
      AND evidence_type = 'first_status'
    ORDER BY confidence DESC, created_at DESC
  `).all(releaseKey)

  for (const row of evidenceRows) {
    const aggregate = aggregates.get(row.playerKey)
    if (!aggregate) continue
    const evidence = {
      source: row.source,
      sourceKey: row.sourceKey,
      confidence: Number(row.confidence ?? 0),
      title: row.title,
      observedAt: row.observedAt,
    }
    if (row.evidenceValue === 'first') aggregate.first.push(evidence)
    else if (row.evidenceValue === 'non_1st') aggregate.nonFirst.push(evidence)
  }

  const upsertSignal = db.prepare(`
    INSERT INTO checklist_player_signals (
      release_key, player_key, player_name, first_status, first_confidence, first_evidence_count,
      non_first_evidence_count, evidence_json, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(release_key, player_key) DO UPDATE SET
      player_name=excluded.player_name,
      first_status=excluded.first_status,
      first_confidence=excluded.first_confidence,
      first_evidence_count=excluded.first_evidence_count,
      non_first_evidence_count=excluded.non_first_evidence_count,
      evidence_json=excluded.evidence_json,
      updated_at=excluded.updated_at
  `)
  for (const aggregate of aggregates.values()) {
    const firstCount = aggregate.first.length
    const nonFirstCount = aggregate.nonFirst.length
    const maxFirstConfidence = Math.max(0, ...aggregate.first.map((row) => Number(row.confidence ?? 0)))
    const status =
      firstCount >= 2 || maxFirstConfidence >= 0.98
        ? 'confirmed_1st'
        : firstCount === 1
          ? 'likely_1st'
          : nonFirstCount > 0
            ? 'non_1st'
            : 'unknown'
    const modeledConfidence =
      status === 'unknown' ? 0 : Math.min(0.99, Math.max(maxFirstConfidence, 0.55 + firstCount * 0.1 + Math.max(0, firstCount - nonFirstCount) * 0.03))
    upsertSignal.run(
      releaseKey,
      aggregate.playerKey,
      aggregate.playerName,
      status,
      Number(modeledConfidence.toFixed(3)),
      firstCount,
      nonFirstCount,
      JSON.stringify([...aggregate.first.slice(0, 6), ...aggregate.nonFirst.slice(0, 3)]),
      nowIso,
    )
  }

  db.prepare(`
    UPDATE checklist_cards
    SET
      first_status = COALESCE((
        SELECT s.first_status
        FROM checklist_player_signals s
        WHERE s.release_key = checklist_cards.release_key
          AND s.player_key = checklist_cards.player_key
      ), 'unknown'),
      first_confidence = COALESCE((
        SELECT s.first_confidence
        FROM checklist_player_signals s
        WHERE s.release_key = checklist_cards.release_key
          AND s.player_key = checklist_cards.player_key
      ), 0),
      first_evidence_count = COALESCE((
        SELECT s.first_evidence_count
        FROM checklist_player_signals s
        WHERE s.release_key = checklist_cards.release_key
          AND s.player_key = checklist_cards.player_key
      ), 0),
      updated_at = ?
    WHERE release_key = ?
      AND (${firstEligibleCardClause()})
  `).run(nowIso, releaseKey)

  db.prepare(`
    UPDATE checklist_cards
    SET first_status = 'unknown', first_confidence = 0, first_evidence_count = 0, updated_at = ?
    WHERE release_key = ?
      AND NOT (${firstEligibleCardClause()})
  `).run(nowIso, releaseKey)

  return { signals: aggregates.size, evidence: evidenceRows.length }
}

export function refreshChecklistFirstEvidence(db, releaseKey, options = {}) {
  const nowIso = options.nowIso ?? new Date().toISOString()
  const release = db.prepare('SELECT release_year AS releaseYear FROM checklist_releases WHERE release_key = ?').get(releaseKey)
  if (!release) return { signals: 0, evidence: 0 }
  const players = db.prepare(`
    SELECT player_key AS playerKey, MIN(player_name) AS playerName
    FROM checklist_cards
    WHERE release_key = ?
    GROUP BY player_key
  `).all(releaseKey)
  const playerMap = new Map(players.map((row) => [row.playerKey, row]))
  db.prepare('DELETE FROM checklist_market_evidence WHERE release_key = ? AND source = ?').run(releaseKey, FIRST_EVIDENCE_SOURCE)
  const insertEvidence = db.prepare(`
    INSERT INTO checklist_market_evidence (
      evidence_key, release_key, player_key, player_name, source, source_key, evidence_type, evidence_value,
      confidence, title, observed_at, raw_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'first_status', ?, ?, ?, ?, ?, ?)
  `)
  let evidenceCount = 0
  for (const row of marketTitleRows(db, release.releaseYear)) {
    const title = compact(row.title)
    const evidenceValue = classifyFirstEvidence(title)
    if (!evidenceValue) continue
    const playerKey = normalizePlayerKey(row.playerName)
    const player = playerMap.get(playerKey)
    if (!player || !titleMatchesPlayer(title, player.playerName)) continue
    const evidenceKey = createHash('sha1')
      .update([releaseKey, row.source, row.sourceKey, evidenceValue, title].join('|'))
      .digest('hex')
    insertEvidence.run(
      evidenceKey,
      releaseKey,
      playerKey,
      player.playerName,
      FIRST_EVIDENCE_SOURCE,
      `${row.source}:${row.sourceKey}`,
      evidenceValue,
      evidenceValue === 'first' ? 0.9 : 0.7,
      title,
      row.observedAt,
      row.rawJson ?? '{}',
      nowIso,
    )
    evidenceCount += 1
  }

  return { ...recomputeChecklistFirstSignals(db, releaseKey, { nowIso }), marketEvidence: evidenceCount }
}

export function upsertExplicitFirstBowmanEvidence(db, releaseKey, entries, options = {}) {
  const nowIso = options.nowIso ?? new Date().toISOString()
  const source = options.source ?? WAX_PACK_HERO_FIRST_SOURCE
  const sourceUrl = options.sourceUrl ?? ''
  const release = db.prepare('SELECT release_year AS releaseYear FROM checklist_releases WHERE release_key = ?').get(releaseKey)
  if (!release) return { matched: 0, unmatched: entries.length, unmatchedEntries: entries }
  const players = db.prepare(`
    SELECT player_key AS playerKey, MIN(player_name) AS playerName
    FROM checklist_cards
    WHERE release_key = ?
    GROUP BY player_key
  `).all(releaseKey)
  const playerMap = new Map(players.map((row) => [row.playerKey, row]))
  const cardsByPlayer = db.prepare(`
    SELECT checklist_card_key AS checklistCardKey, card_no AS cardNo, section
    FROM checklist_cards
    WHERE release_key = ? AND player_key = ?
    ORDER BY
      CASE
        WHEN card_no = ? THEN 0
        WHEN section LIKE '%Prospect%' THEN 1
        ELSE 2
      END
    LIMIT 1
  `)
  const insertEvidence = db.prepare(`
    INSERT INTO checklist_market_evidence (
      evidence_key, release_key, checklist_card_key, player_key, player_name, source, source_key,
      evidence_type, evidence_value, confidence, title, observed_at, raw_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'first_status', 'first', ?, ?, ?, ?, ?)
  `)
  db.prepare('DELETE FROM checklist_market_evidence WHERE release_key = ? AND source = ?').run(releaseKey, source)

  const unmatchedEntries = []
  let matched = 0
  for (const entry of entries) {
    const playerName = cleanPlayerName(entry.playerName)
    const playerKey = normalizePlayerKey(playerName)
    const player = playerMap.get(playerKey)
    if (!player) {
      unmatchedEntries.push(entry)
      continue
    }
    const cardNo = compact(entry.cardNo)
    const card = cardsByPlayer.get(releaseKey, playerKey, cardNo) ?? {}
    const sourceKey = compact(entry.sourceKey) || [sourceUrl, cardNo || playerName].filter(Boolean).join('#')
    const title = compact(entry.title) || [cardNo, player.playerName, `${release.releaseYear} Bowman 1st Bowman`].filter(Boolean).join(' ')
    const rawJson = JSON.stringify({ ...entry, sourceUrl })
    const evidenceKey = createHash('sha1').update([releaseKey, source, sourceKey, playerKey].join('|')).digest('hex')
    insertEvidence.run(
      evidenceKey,
      releaseKey,
      card.checklistCardKey ?? null,
      playerKey,
      player.playerName,
      source,
      sourceKey,
      Number(entry.confidence ?? 0.99),
      title,
      entry.observedAt ?? nowIso,
      rawJson,
      nowIso,
    )
    matched += 1
  }

  return { ...recomputeChecklistFirstSignals(db, releaseKey, { nowIso }), matched, unmatched: unmatchedEntries.length, unmatchedEntries }
}

export function importChecklistWorkbook(db, options) {
  createChecklistLedgerSchema(db)
  const nowIso = options.nowIso ?? new Date().toISOString()
  const releaseYear = Number(options.releaseYear)
  const releaseName = options.releaseName ?? `${releaseYear} Bowman`
  const releaseKey = options.releaseKey ?? releaseKeyFromParts(releaseYear, releaseName)
  const rows = extractChecklistRows(options.workbookFile)
  upsertChecklistRelease(db, {
    releaseKey,
    releaseYear,
    releaseName,
    productLine: options.productLine ?? 'Bowman',
    sourcePath: options.workbookFile,
    sourceHash: fileHash(options.workbookFile),
    nowIso,
    rawJson: { importer: 'checklist-ledger', sheetNames: DEFAULT_SHEETS },
  })
  const checklist = upsertChecklistRows(db, releaseKey, releaseYear, rows, { nowIso, prune: options.prune ?? true })
  const templates = seedVariationTemplates(db, releaseKey, bowman2026VariationTemplates(), { nowIso, prune: options.pruneTemplates ?? true })
  const firstEvidence = refreshChecklistFirstEvidence(db, releaseKey, { nowIso })
  const universe = rebuildChecklistUniverse(db, releaseKey, { nowIso })
  return {
    releaseKey,
    releaseYear,
    releaseName,
    rows: rows.length,
    checklistCards: checklist.cards,
    templates: templates.templates,
    firstEvidence,
    universe,
  }
}

export function summarizeChecklistLedger(db) {
  if (!tableExists(db, 'checklist_releases')) {
    return { releases: 0, cards: 0, universeCards: 0, templates: 0, players: 0, firstStatuses: [] }
  }
  const releases = db.prepare('SELECT COUNT(*) AS count FROM checklist_releases').get()
  const cards = tableExists(db, 'checklist_cards')
    ? db.prepare('SELECT COUNT(*) AS count, COUNT(DISTINCT player_key) AS players FROM checklist_cards').get()
    : { count: 0, players: 0 }
  const universe = tableExists(db, 'checklist_card_universe')
    ? db.prepare('SELECT COUNT(*) AS count FROM checklist_card_universe').get()
    : { count: 0 }
  const templates = tableExists(db, 'checklist_variation_templates')
    ? db.prepare('SELECT COUNT(*) AS count FROM checklist_variation_templates').get()
    : { count: 0 }
  const firstStatuses = tableExists(db, 'checklist_player_signals')
    ? db.prepare(`
        SELECT first_status AS firstStatus, COUNT(*) AS players
        FROM checklist_player_signals
        GROUP BY first_status
        ORDER BY players DESC
      `).all()
    : []
  const sections = tableExists(db, 'checklist_cards')
    ? db.prepare(`
        SELECT section, COUNT(*) AS cards, COUNT(DISTINCT player_key) AS players
        FROM checklist_cards
        GROUP BY section
        ORDER BY cards DESC
      `).all()
    : []
  return {
    releases: Number(releases?.count ?? 0),
    cards: Number(cards?.count ?? 0),
    players: Number(cards?.players ?? 0),
    universeCards: Number(universe?.count ?? 0),
    templates: Number(templates?.count ?? 0),
    firstStatuses,
    sections,
  }
}
