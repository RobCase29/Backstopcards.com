import type { MarketplaceListing } from '../types'

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  cells.push(current.trim())
  return cells
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map(normalizeHeader)

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  })
}

function num(value: unknown) {
  const cleaned = String(value ?? '').replace(/[$,%\s,]/g, '')
  const parsed = Number(cleaned)
  if (Number.isFinite(parsed)) return parsed
  const match = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (match) return Number(match[0])
  return Number.isFinite(parsed) ? parsed : undefined
}

function get(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeHeader(key)
    if (row[normalized] !== undefined && row[normalized] !== '') return row[normalized]
  }
  return undefined
}

function rowToListing(row: Record<string, unknown>, index: number): MarketplaceListing {
  const player = String(get(row, ['player', 'player_name', 'name']) ?? 'Unknown player')
  const price = num(get(row, ['current_price', 'price', 'price_paid', 'bid', 'ask'])) ?? 0
  const market =
    num(get(row, ['market_price', 'avg_comp_price', 'avg_comp', 'twma', 'fair_value', 'comp'])) ?? price
  const compCount = Math.floor(num(get(row, ['comp_count', 'comps'])) ?? 0)

  return {
    item_id: String(get(row, ['item_id', 'id']) ?? `import-${index}`),
    player_name: player,
    title: String(get(row, ['title']) ?? player),
    buying_format: String(get(row, ['buying_format', 'format', 'kind']) ?? 'bin').toLowerCase(),
    current_price: price,
    shipping_cost: num(get(row, ['shipping', 'shipping_cost'])) ?? 0,
    avgCompPrice: market,
    bid_count: num(get(row, ['bid_count', 'bids'])) ?? 0,
    end_time: String(get(row, ['end_time', 'ends_at']) ?? '') || null,
    listing_url: String(get(row, ['listing_url', 'url']) ?? ''),
    release_year: num(get(row, ['release_year', 'year'])) ?? null,
    product_type: String(get(row, ['product_type', 'release']) ?? 'Bowman Chrome'),
    variation: String(get(row, ['variation', 'parallel']) ?? 'Base'),
    serial_denominator: num(get(row, ['serial_denominator', 'serial', 'numbered_to'])) ?? null,
    comps: Array.from({ length: Math.max(0, compCount) }, (_, compIndex) => ({
      id: `import-${index}-comp-${compIndex}`,
      sale_price: market,
    })),
    prospect: {
      name: player,
      level: String(get(row, ['level']) ?? ''),
      position: String(get(row, ['position']) ?? ''),
      team: String(get(row, ['team']) ?? ''),
      ranking: num(get(row, ['ranking', 'rank'])) ?? null,
      age: num(get(row, ['age'])) ?? null,
    },
  }
}

export function parseListingText(text: string, filename = 'import'): MarketplaceListing[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  if (filename.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) return parsed as MarketplaceListing[]
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const rows = record.listings ?? record.data ?? record.items
      if (Array.isArray(rows)) return rows as MarketplaceListing[]
    }
    throw new Error('JSON import needs an array, or an object with listings/data/items.')
  }

  return parseCsv(trimmed).map(rowToListing)
}

export async function parseListingFile(file: File) {
  return parseListingText(await file.text(), file.name.toLowerCase())
}
