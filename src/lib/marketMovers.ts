import type { ChecklistModel } from '../types'
import {
  buildEbaySoldVariationModel,
  mapEbaySoldItemToComp,
  summarizeEbaySoldModel,
  type EbaySoldComp,
  type EbaySoldModelResult,
  type RawEbaySoldItem,
} from './ebaySold'

export interface MarketMoversSaleRow {
  itemId: string
  title: string
  salePrice: number
  soldDate: string
  saleType?: string
  seller?: string
}

export interface MarketMoversImportResult {
  rows: MarketMoversSaleRow[]
  comps: EbaySoldComp[]
  rejectedRows: number
}

type UnknownRecord = Record<string, unknown>

const MARKET_MOVERS_CAPTURE_SCRIPT = `(() => {
  const grid = document.querySelector('.SalesHistory_table__4Q_Y5 .Table_gridContainer__hHQKG');
  if (!grid) {
    alert('No Market Movers comps grid found.');
    return;
  }
  const rows = new Map();
  for (const child of [...grid.children]) {
    const text = child.textContent.replace(/\\s+/g, ' ').trim();
    const rowMatch = child.getAttribute('style')?.match(/grid-row-start:\\s*(\\d+)/);
    const colMatch = child.getAttribute('style')?.match(/grid-column-start:\\s*(\\d+)/);
    if (!rowMatch || !colMatch) continue;
    const row = rows.get(rowMatch[1]) || {};
    const col = Number(colMatch[1]);
    if (col === 3) {
      const match = text.match(/^(.*?)Item ID:\\s*(\\d+)/);
      row.title = (match?.[1] || text).trim();
      row.itemId = match?.[2] || '';
    }
    if (col === 4) row.salePriceText = text;
    if (col === 5) row.soldDate = text;
    if (col === 7) row.saleType = text;
    if (col === 8) row.seller = text;
    rows.set(rowMatch[1], row);
  }
  const payload = [...rows.values()].filter((row) => row.itemId && row.title);
  navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  alert('Copied ' + payload.length + ' Market Movers comps.');
})();`

export const MARKET_MOVERS_CAPTURE_BOOKMARKLET = `javascript:${encodeURIComponent(MARKET_MOVERS_CAPTURE_SCRIPT)}`

const MARKET_MOVERS_STRUCTURED_CAPTURE_SCRIPT = `(() => {
  const capturedAt = new Date().toISOString();
  const compact = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const money = (value) => {
    const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const integer = (value) => {
    const parsed = Number(String(value || '').replace(/[^0-9-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const percent = (value) => {
    const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const visible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const text = (el) => compact(el?.textContent);
  const directTexts = (el) => [...(el?.children || [])].map(text).filter(Boolean);
  const leafTexts = (root) => {
    const out = [];
    const walk = (node) => {
      if (!node || !visible(node)) return;
      const children = [...node.children].filter(visible);
      if (children.length === 0) {
        const value = text(node);
        if (value) out.push(value);
        return;
      }
      const own = [...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => compact(child.textContent))
        .filter(Boolean)
        .join(' ');
      if (own) out.push(own);
      children.forEach(walk);
    };
    walk(root);
    return out.filter((value, index, values) => value && values[index - 1] !== value);
  };
  const firstDateIndex = (values) => values.findIndex((value) => /^\\d{1,2}\\/\\d{1,2}\\/\\d{4}$/.test(value));
  const parseCardRow = (row, index) => {
    const content = row.querySelector('[class*="max-w"]') || row;
    const contentLines = directTexts(content);
    const priceCell = [...row.querySelectorAll('p, div')]
      .find((el) => /\\$\\s?\\d/.test(text(el)) && /\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test(text(el)));
    const priceDateLines = directTexts(priceCell);
    const fallbackText = text(row);
    const fallbackDate = fallbackText.match(/\\d{1,2}\\/\\d{1,2}\\/\\d{4}/)?.[0] || '';
    const fallbackPrice = fallbackText.match(/\\$\\s?[\\d,.]+/)?.[0] || '';
    return {
      index,
      playerName: contentLines[0] || '',
      cardTitle: contentLines[1] || '',
      category: contentLines[2] || '',
      grade: contentLines[3] || '',
      latestPriceText: priceDateLines.find((line) => /^\\$/.test(line)) || fallbackPrice,
      latestPrice: money(priceDateLines.find((line) => /^\\$/.test(line)) || fallbackPrice),
      latestDate: priceDateLines.find((line) => /^\\d{1,2}\\/\\d{1,2}\\/\\d{4}$/.test(line)) || fallbackDate,
      imageUrl: row.querySelector('img')?.src || '',
      rawText: fallbackText,
    };
  };
  const parseSelectedCard = () => {
    const flyouts = [...document.querySelectorAll('div')]
      .filter((el) => visible(el) && el.getBoundingClientRect().x > window.innerWidth * 0.45 && /Completed Sales/i.test(text(el)));
    const root = flyouts.sort((a, b) => text(a).length - text(b).length)[0] || null;
    if (!root) return null;
    const values = leafTexts(root);
    const dateIndex = firstDateIndex(values);
    const playerName = values[0] || '';
    const cardTitle = values[1] || '';
    const category = values[2] || '';
    const grade = values[3] || '';
    const latestDate = dateIndex >= 0 ? values[dateIndex] : '';
    const latestPriceText = dateIndex >= 0 ? values.slice(dateIndex + 1).find((value) => /^\\$/.test(value)) || '' : '';
    const trendText = values.find((value) => /^[-+]?\\d+(?:\\.\\d+)?%$/.test(value)) || '';
    const avgLabelIndex = values.findIndex((value) => /Day Avg/i.test(value));
    const salesCountIndex = values.findIndex((value) => /Sales Count/i.test(value));
    const dailyHeaderIndex = values.findIndex((value, index) => value === 'Date' && values[index + 1] === 'Number of Sales');
    const dailySales = [];
    if (dailyHeaderIndex >= 0) {
      for (let index = dailyHeaderIndex + 3; index < values.length - 2; index += 3) {
        if (/^Page\\b|^For Sale$/i.test(values[index])) break;
        if (!/^\\d{1,2}\\/\\d{1,2}\\/\\d{4}$/.test(values[index])) break;
        dailySales.push({
          date: values[index],
          saleCount: integer(values[index + 1]),
          avgPriceText: values[index + 2],
          avgPrice: money(values[index + 2]),
        });
      }
    }
    return {
      playerName,
      cardTitle,
      category,
      grade,
      latestDate,
      latestPriceText,
      latestPrice: money(latestPriceText),
      trendText,
      trendPct: percent(trendText),
      selectedWindowLabel: avgLabelIndex >= 0 ? values[avgLabelIndex] : '',
      selectedWindowDays: avgLabelIndex >= 0 ? integer(values[avgLabelIndex]) : null,
      rollingAverageText: avgLabelIndex > 0 ? values[avgLabelIndex - 1] : '',
      rollingAverage: avgLabelIndex > 0 ? money(values[avgLabelIndex - 1]) : null,
      salesCount: salesCountIndex > 0 ? integer(values[salesCountIndex - 1]) : null,
      dailySales,
      imageUrl: root.querySelector('img')?.src || '',
      leafText: values,
      rawText: text(root),
    };
  };
  const cards = [...document.querySelectorAll('li[class*="VerticalTilesList_item"]')]
    .map(parseCardRow)
    .filter((row) => row.playerName || row.cardTitle || row.category);
  const selectedCard = parseSelectedCard();
  const payload = {
    source: 'market-movers-structured-capture',
    sourceUrl: location.href,
    capturedAt,
    query: document.querySelector('input[placeholder="e.g. Luka Doncic Prizm"]')?.value || '',
    cards,
    selectedCard,
  };
  navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  alert('Copied Market Movers structured capture: ' + cards.length + ' card rows' + (selectedCard ? ' + selected card detail.' : '.'));
})();`

export const MARKET_MOVERS_STRUCTURED_CAPTURE_BOOKMARKLET = `javascript:${encodeURIComponent(MARKET_MOVERS_STRUCTURED_CAPTURE_SCRIPT)}`

function numberValue(value: unknown, fallback = 0) {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value ?? '').replace(/[$,%\s,]/g, '').replace(/Best Offer Accepted/i, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function firstString(values: unknown[], fallback = '') {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return fallback
}

function dateFromMarketMovers(value: unknown) {
  const raw = firstString([value], '')
  if (!raw) return ''
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, month, day, year] = slashMatch
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ''
  }
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ''
}

function rowFromRecord(record: UnknownRecord): MarketMoversSaleRow | null {
  const itemId = firstString([record.itemId, record.item_id, record.ebayItemId, record.id], '')
  const title = firstString([record.title, record.listingTitle, record.name], '')
  const salePrice = numberValue(record.salePrice ?? record.price ?? record.salePriceText ?? record.amount, 0)
  const soldDate = dateFromMarketMovers(record.soldDate ?? record.saleDate ?? record.date ?? record.soldAt)
  if (!itemId || !title || salePrice <= 0 || !soldDate) return null
  return {
    itemId,
    title,
    salePrice,
    soldDate,
    saleType: firstString([record.saleType, record.format], ''),
    seller: firstString([record.seller, record.sellerName], ''),
  }
}

function parseJsonRows(input: string): MarketMoversSaleRow[] {
  try {
    const parsed = JSON.parse(input) as unknown
    const parsedRows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as UnknownRecord).rows)
        ? (parsed as { rows: unknown[] }).rows
        : []
    const rows: unknown[] = parsedRows
    return rows.flatMap((row) => {
      if (!row || typeof row !== 'object') return []
      const normalized = rowFromRecord(row as UnknownRecord)
      return normalized ? [normalized] : []
    })
  } catch {
    return []
  }
}

function parseDelimitedRows(input: string): MarketMoversSaleRow[] {
  return input
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split(/\t| {2,}/).map((part) => part.trim()).filter(Boolean)
      if (parts.length < 4) return []
      const titlePart = parts.find((part) => /item id:\s*\d+/i.test(part)) ?? parts[0]
      const titleMatch = titlePart.match(/^(.*?)Item ID:\s*(\d+)/i)
      const itemId = titleMatch?.[2] ?? firstString([parts.find((part) => /^\d{9,}$/.test(part))], '')
      const title = titleMatch?.[1]?.trim() || parts[0]
      const pricePart = parts.find((part) => /\$[\d,]+/.test(part))
      const datePart = parts.find((part) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(part))
      const salePrice = numberValue(pricePart, 0)
      const soldDate = dateFromMarketMovers(datePart)
      if (!itemId || !title || salePrice <= 0 || !soldDate) return []
      return [
        {
          itemId,
          title,
          salePrice,
          soldDate,
          saleType: firstString([parts.find((part) => /auction|fixed price/i.test(part))], ''),
          seller: parts[parts.length - 1] ?? '',
        },
      ]
    })
}

export function parseMarketMoversRows(input: string): MarketMoversSaleRow[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  return parseJsonRows(trimmed).concat(parseDelimitedRows(trimmed))
}

function rawItemFromMarketMovers(row: MarketMoversSaleRow, playerName: string, model: ChecklistModel): RawEbaySoldItem {
  return {
    itemId: row.itemId,
    legacyItemId: row.itemId,
    title: row.title,
    itemWebUrl: `https://www.ebay.com/itm/${row.itemId}`,
    soldPrice: { value: row.salePrice, currency: 'USD' },
    itemSoldDate: row.soldDate,
    saleType: row.saleType,
    _bowmanTraderQuery: {
      q: `${playerName} Market Movers`,
      playerName,
      release: model.release,
      releaseYear: model.releaseYear,
      category: model.category,
    },
  }
}

export function importMarketMoversComps(input: string, model: ChecklistModel): MarketMoversImportResult {
  const rows = parseMarketMoversRows(input)
  const seenRows = new Set<string>()
  const uniqueRows = rows.filter((row) => {
    const key = row.itemId || `${row.title}:${row.salePrice}:${row.soldDate}`
    if (seenRows.has(key)) return false
    seenRows.add(key)
    return true
  })
  const comps: EbaySoldComp[] = []
  const seenComps = new Set<string>()

  for (const row of uniqueRows) {
    for (const player of model.players) {
      const comp = mapEbaySoldItemToComp(rawItemFromMarketMovers(row, player.playerName, model), model, { requireFirstBowman: false })
      if (!comp) continue
      const key = comp.itemId || `${comp.playerName}:${comp.title}:${comp.salePrice}:${comp.soldAt}`
      if (!seenComps.has(key)) {
        seenComps.add(key)
        comps.push(comp)
      }
      break
    }
  }

  return {
    rows: uniqueRows,
    comps,
    rejectedRows: Math.max(0, uniqueRows.length - comps.length),
  }
}

export function buildMarketMoversSoldModel(input: string, seedModel: ChecklistModel): EbaySoldModelResult {
  const imported = importMarketMoversComps(input, seedModel)
  if (imported.rows.length === 0) throw new Error('No Market Movers comps were found in the import.')
  if (imported.comps.length === 0) throw new Error('Market Movers comps imported, but none matched this checklist model.')

  const model = {
    ...buildEbaySoldVariationModel(seedModel, imported.comps),
    source: 'market-movers-sold-model' as const,
  }
  const stats = summarizeEbaySoldModel(seedModel, imported.comps, model, {
    queriesRun: 1,
    queriesSucceeded: 1,
    queriesFailed: 0,
    pagesFetched: 1,
    upstreamTotal: imported.rows.length,
    dedupedItems: imported.rows.length,
  })

  return {
    model,
    comps: imported.comps,
    fetchedAt: new Date().toISOString(),
    errors: imported.rejectedRows > 0 ? [{ error: `${imported.rejectedRows.toLocaleString()} Market Movers rows rejected by checklist guardrails.` }] : [],
    stats,
  }
}
