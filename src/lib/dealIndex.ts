import type { ChecklistModel, MarketplaceListing, PulseSnapshot } from '../types'

const DEAL_INDEX_STORAGE_KEY = 'bowman-trader:deal-index:v1'
const DEAL_INDEX_MAX_RECORDS = 1_200
const DEAL_INDEX_BOARD_MAX_AGE_MS = 15 * 60_000
const DEAL_INDEX_RETAIN_MS = 4 * 60 * 60_000

interface DealIndexRecord {
  id: string
  listing: MarketplaceListing
  firstSeenAt: string
  lastSeenAt: string
  seenCount: number
}

interface DealIndexStore {
  version: 1
  updatedAt: string
  records: DealIndexRecord[]
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function listingIdentity(listing: MarketplaceListing) {
  return String(listing.item_id ?? listing.id ?? listing.listing_url ?? listing.url ?? listing.title ?? '')
}

function playerKey(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function listingPlayerName(listing: MarketplaceListing) {
  return String(listing.player_name ?? listing.prospect?.name ?? '').trim()
}

function emptyStore(): DealIndexStore {
  return { version: 1, updatedAt: new Date(0).toISOString(), records: [] }
}

function readStore() {
  if (!canUseStorage()) return emptyStore()

  try {
    const raw = window.localStorage.getItem(DEAL_INDEX_STORAGE_KEY)
    if (!raw) return emptyStore()
    const store = JSON.parse(raw) as DealIndexStore
    if (store.version !== 1 || !Array.isArray(store.records)) return emptyStore()
    return store
  } catch {
    return emptyStore()
  }
}

function pruneRecords(records: DealIndexRecord[], now = Date.now()) {
  return records
    .filter((record) => {
      const lastSeenAt = new Date(record.lastSeenAt).getTime()
      return Number.isFinite(lastSeenAt) && now - lastSeenAt <= DEAL_INDEX_RETAIN_MS
    })
    .sort((left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime())
    .slice(0, DEAL_INDEX_MAX_RECORDS)
}

function writeStore(store: DealIndexStore) {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(DEAL_INDEX_STORAGE_KEY, JSON.stringify(store))
  } catch {
    const compacted = { ...store, records: store.records.slice(0, Math.floor(DEAL_INDEX_MAX_RECORDS / 2)) }
    try {
      window.localStorage.setItem(DEAL_INDEX_STORAGE_KEY, JSON.stringify(compacted))
    } catch {
      // Browser storage can be full or disabled. The app still works without the index.
    }
  }
}

function freshListingsFromStore(store: DealIndexStore, maxAgeMs = DEAL_INDEX_BOARD_MAX_AGE_MS) {
  const now = Date.now()
  return pruneRecords(store.records, now)
    .filter((record) => now - new Date(record.lastSeenAt).getTime() <= maxAgeMs)
    .map((record) => record.listing)
}

export function readCachedDealSnapshot(): PulseSnapshot | null {
  const store = readStore()
  const listings = freshListingsFromStore(store)
  if (listings.length === 0) return null

  return {
    listings,
    source: 'live',
    fetchedAt: store.updatedAt,
    totalCount: listings.length,
    scanStats: {
      depth: 'deep',
      phase: 'cache',
      durationMs: 0,
      networkCalls: 0,
      cacheHits: listings.length,
      dedupeHits: 0,
      priceBands: 0,
      pagesFetched: 0,
      checklistPlayers: 0,
      checklistPlayerUniverse: 0,
      checklistCoverageComplete: false,
      checklistCoverageRan: false,
      binListings: listings.length,
      checklistListings: 0,
      liveListings: 0,
      dedupedListings: listings.length,
      totalCount: listings.length,
    },
  }
}

export function mergeDealIndexSnapshot(snapshot: PulseSnapshot): PulseSnapshot {
  const store = readStore()
  const now = new Date()
  const nowIso = now.toISOString()
  const recordsById = new Map<string, DealIndexRecord>()

  for (const record of pruneRecords(store.records, now.getTime())) {
    recordsById.set(record.id, record)
  }

  for (const listing of snapshot.listings) {
    const id = listingIdentity(listing)
    if (!id) continue
    const current = recordsById.get(id)
    recordsById.set(id, {
      id,
      listing,
      firstSeenAt: current?.firstSeenAt ?? nowIso,
      lastSeenAt: nowIso,
      seenCount: (current?.seenCount ?? 0) + 1,
    })
  }

  const records = pruneRecords([...recordsById.values()], now.getTime())
  const nextStore = { version: 1 as const, updatedAt: nowIso, records }
  writeStore(nextStore)

  const listings = freshListingsFromStore(nextStore)
  return {
    ...snapshot,
    listings,
    fetchedAt: nowIso,
    totalCount: snapshot.totalCount ?? listings.length,
    scanStats: snapshot.scanStats
      ? {
          ...snapshot.scanStats,
          dedupedListings: listings.length,
        }
      : snapshot.scanStats,
  }
}

export function prioritizeChecklistPlayerNames(models: ChecklistModel[]) {
  const store = readStore()
  const hitCounts = new Map<string, number>()

  for (const record of pruneRecords(store.records)) {
    const key = playerKey(listingPlayerName(record.listing))
    if (!key) continue
    hitCounts.set(key, (hitCounts.get(key) ?? 0) + Math.max(1, record.seenCount))
  }

  const players = models.flatMap((model) =>
    model.players.map((player) => ({
      name: player.playerName.trim(),
      key: playerKey(player.playerName),
      baseAvgPrice: player.baseAvgPrice,
      baseSalesCount: player.baseSalesCount,
    })),
  )
  const seen = new Set<string>()

  return players
    .filter((player) => {
      if (!player.name || seen.has(player.key)) return false
      seen.add(player.key)
      return true
    })
    .sort((left, right) => {
      return (
        (hitCounts.get(right.key) ?? 0) - (hitCounts.get(left.key) ?? 0) ||
        right.baseAvgPrice - left.baseAvgPrice ||
        right.baseSalesCount - left.baseSalesCount ||
        left.name.localeCompare(right.name)
      )
    })
    .map((player) => player.name)
}
