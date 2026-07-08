import type { NormalizedListing, MarketplaceListing } from '../types'

const LISTING_REJECTION_STORAGE_KEY = 'backstop-card-finder:listing-rejections:v1'
const LISTING_REJECTION_MAX_RECORDS = 750

type RejectableListing = Partial<MarketplaceListing> | Partial<NormalizedListing>
type ListingFields = Partial<MarketplaceListing> & Partial<NormalizedListing>

export interface ListingRejection {
  key: string
  keys: string[]
  playerName: string
  title: string
  listingUrl?: string | null
  rejectedAt: string
  note: string
}

interface ListingRejectionStore {
  version: 1
  updatedAt: string
  records: ListingRejection[]
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function cleanText(value: unknown) {
  return String(value ?? '').trim()
}

function listingFields(listing: RejectableListing) {
  return listing as ListingFields
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value)
    const itemId = extractEbayItemId(value)
    if (itemId) return `https://www.ebay.com/itm/${itemId}`
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return value.trim()
  }
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function extractEbayItemId(value: unknown) {
  const text = cleanText(value)
  if (!text) return null

  const direct = text.match(/^\d{8,}$/)
  if (direct) return direct[0]

  const patterns = [
    /\/itm\/(?:[^/?#]+\/)?(\d{8,})(?:[/?#]|$)/i,
    /[?&](?:item|itemid|itemId|itm)=([0-9]{8,})\b/i,
    /\b(?:legacyItemId|itemId)["'=:\s]+([0-9]{8,})\b/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

function listingPlayerName(listing: RejectableListing) {
  const fields = listingFields(listing)
  return cleanText(fields.playerName ?? fields.player_name ?? fields.prospect?.name)
}

function listingTitle(listing: RejectableListing) {
  return cleanText(listingFields(listing).title)
}

function listingUrl(listing: RejectableListing) {
  const fields = listingFields(listing)
  return cleanText(fields.listingUrl ?? fields.listing_url ?? fields.url)
}

export function listingRejectionKeys(listing: RejectableListing) {
  const keys: string[] = []
  const fields = listingFields(listing)
  const id = cleanText(fields.id ?? fields.item_id)
  const url = listingUrl(listing)
  const title = listingTitle(listing)
  const playerName = listingPlayerName(listing)
  const itemId = extractEbayItemId(id) ?? extractEbayItemId(url)

  if (itemId) keys.push(`item:${itemId}`)
  if (id) keys.push(`id:${id}`)
  if (url) keys.push(`url:${normalizeUrl(url)}`)
  if (title && !itemId && !url) keys.push(`title:${normalizeTitle(`${playerName} ${title}`)}`)

  return [...new Set(keys.filter(Boolean))]
}

export function createListingRejection(listing: RejectableListing, note = 'Marked incorrect in BIN Radar'): ListingRejection | null {
  const keys = listingRejectionKeys(listing)
  if (keys.length === 0) return null

  return {
    key: keys[0],
    keys,
    playerName: listingPlayerName(listing),
    title: listingTitle(listing),
    listingUrl: listingUrl(listing) || null,
    rejectedAt: new Date().toISOString(),
    note,
  }
}

export function readListingRejections() {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(LISTING_REJECTION_STORAGE_KEY)
    if (!raw) return []
    const store = JSON.parse(raw) as ListingRejectionStore
    if (store.version !== 1 || !Array.isArray(store.records)) return []
    return store.records
      .filter((record) => record?.key && Array.isArray(record.keys))
      .slice(0, LISTING_REJECTION_MAX_RECORDS)
  } catch {
    return []
  }
}

export function writeListingRejections(records: ListingRejection[]) {
  if (!canUseStorage()) return

  const compacted = records.slice(0, LISTING_REJECTION_MAX_RECORDS)
  const store: ListingRejectionStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: compacted,
  }

  try {
    window.localStorage.setItem(LISTING_REJECTION_STORAGE_KEY, JSON.stringify(store))
  } catch {
    try {
      window.localStorage.setItem(
        LISTING_REJECTION_STORAGE_KEY,
        JSON.stringify({ ...store, records: compacted.slice(0, Math.floor(LISTING_REJECTION_MAX_RECORDS / 2)) }),
      )
    } catch {
      // Storage is best-effort. The app still works without persistent local cleanup.
    }
  }
}

export function listingRejectionKeySet(records: ListingRejection[]) {
  const keys = new Set<string>()
  for (const record of records) {
    keys.add(record.key)
    for (const key of record.keys) keys.add(key)
  }
  return keys
}

export function isListingRejected(listing: RejectableListing, rejectedKeys: Set<string>) {
  return listingRejectionKeys(listing).some((key) => rejectedKeys.has(key))
}

export function upsertListingRejection(records: ListingRejection[], rejection: ListingRejection) {
  const nextKeys = new Set([rejection.key, ...rejection.keys])
  return [
    rejection,
    ...records.filter((record) => !record.keys.some((key) => nextKeys.has(key)) && !nextKeys.has(record.key)),
  ].slice(0, LISTING_REJECTION_MAX_RECORDS)
}

export function removeListingRejection(records: ListingRejection[], rejection: ListingRejection) {
  const removeKeys = new Set([rejection.key, ...rejection.keys])
  return records.filter((record) => !record.keys.some((key) => removeKeys.has(key)) && !removeKeys.has(record.key))
}

export function clearListingRejectionStorageForTests() {
  if (!canUseStorage()) return
  window.localStorage.removeItem(LISTING_REJECTION_STORAGE_KEY)
}
