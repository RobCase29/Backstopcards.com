import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  BookOpenCheck,
  Brain,
  Database,
  Download,
  Gauge,
  KeyRound,
  Layers,
  LogOut,
  RefreshCw,
  Search,
  Sigma,
  TableProperties,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  clearPulseSession,
  fetchChecklistCatalog,
  fetchChecklistModel,
  getPulseStatus,
  getStoredPulseSession,
  isPulseAuthError,
  loginProspectPulse,
  savePulseSession,
} from './lib/prospectPulse'
import {
  buildPricingMatrix,
  filterPricingRows,
  formatMultiplier,
  pickPreviewQuotes,
  type BasePriceSource,
  type PricingRow,
  type ReleaseMathSummary,
  type VariationQuote,
} from './lib/matrix'
import type { ChecklistModel } from './types'

type CategoryFilter = 'all' | ChecklistModel['category']
type BaseSourceFilter = 'all' | BasePriceSource
type SortMode = 'base-desc' | 'top-desc' | 'confidence-desc' | 'player-asc' | 'release-desc'

const CATEGORY_LABELS: Record<ChecklistModel['category'], string> = {
  bowman: 'Bowman',
  chrome: 'Chrome',
  draft: 'Draft',
}

const SOURCE_LABELS: Record<BasePriceSource, string> = {
  'weighted-sales': 'Weighted',
  'blended-sales': 'Blended',
  'twma-fallback': 'Fallback',
}

const SORT_LABELS: Record<SortMode, string> = {
  'base-desc': 'Model Base',
  'top-desc': 'Top Model',
  'confidence-desc': 'Confidence',
  'player-asc': 'Player A-Z',
  'release-desc': 'Release',
}

function sortRows(rows: PricingRow[], sortMode: SortMode) {
  const sorted = [...rows]
  if (sortMode === 'top-desc') {
    return sorted.sort((left, right) => right.topVariationPrice - left.topVariationPrice || right.baseTwmaPrice - left.baseTwmaPrice)
  }
  if (sortMode === 'confidence-desc') {
    return sorted.sort((left, right) => right.baseConfidence - left.baseConfidence || right.baseTwmaPrice - left.baseTwmaPrice)
  }
  if (sortMode === 'player-asc') {
    return sorted.sort((left, right) => left.playerName.localeCompare(right.playerName) || right.baseTwmaPrice - left.baseTwmaPrice)
  }
  if (sortMode === 'release-desc') {
    return sorted.sort((left, right) => right.releaseYear - left.releaseYear || left.release.localeCompare(right.release) || right.baseTwmaPrice - left.baseTwmaPrice)
  }
  return sorted.sort((left, right) => right.baseTwmaPrice - left.baseTwmaPrice || right.topVariationPrice - left.topVariationPrice)
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

type ReleaseOption = {
  id: string
  label: string
  category: ChecklistModel['category']
  categoryLabel?: string
  year: number
  release: string
  totalPlayers?: number | null
  firstChromeAutos?: number | null
  activeChecklistPlayers?: number | null
}

const FALLBACK_RELEASE_OPTIONS: ReleaseOption[] = [
  {
    id: '2026-bowman',
    label: '2026 Bowman',
    category: 'bowman',
    categoryLabel: 'Bowman',
    year: 2026,
    release: '2026-Bowman',
  },
  {
    id: '2025-bowman-draft',
    label: '2025 Bowman Draft',
    category: 'draft',
    categoryLabel: 'Bowman Draft',
    year: 2025,
    release: '2025-Bowman-Draft',
  },
]

const CHECKLIST_CATEGORIES: ChecklistModel['category'][] = ['bowman', 'chrome', 'draft']
const CHECKLIST_MIN_YEAR = 2021
const CHECKLIST_LOAD_CONCURRENCY = 6
const LEADERBOARD_RENDER_LIMIT = 500

function money(value: number) {
  return currency.format(value)
}

function compactVariation(label: string) {
  return label
    .replace(/\b(autograph|autographs|autographed|auto)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function latestFetchedAt(models: ChecklistModel[]) {
  const timestamps = models.map((model) => Date.parse(model.fetchedAt)).filter(Number.isFinite)
  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps)).toISOString()
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = []
  let cursor = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await worker(items[index], index)
      }
    }),
  )

  return results
}

function downloadMatrixCsv(rows: PricingRow[]) {
  const headers = [
    'Rank',
    'Player',
    'Release',
    'Modeled Base',
    'Pulse Base',
    'Base Source',
    'Base Confidence',
    '30D Base Sales',
    '90D Base Sales',
    'Raw Base Sales',
    'Variation',
    'Multiplier',
    'Modeled Price',
  ]
  const csvRows = rows.flatMap((row) =>
    row.ladder.map((quote) => [
      row.rank,
      row.playerName,
      row.release,
      row.baseTwmaPrice.toFixed(2),
      row.pulseBasePrice.toFixed(2),
      row.basePriceSource,
      row.baseConfidence.toFixed(2),
      row.baseSales30,
      row.baseSales90,
      row.rawBaseSales,
      quote.label,
      quote.multiplier.toFixed(4),
      quote.price.toFixed(2),
    ]),
  )
  const csv = [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bowman-multiple-valuations-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof BadgeDollarSign
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warn' | 'info'
}) {
  return (
    <div className="stat-tile">
      <div className={`stat-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function MarketTape({
  rowCount,
  variationCount,
  solvedCells,
  topBase,
  topVariation,
  loadedSets,
  liveConnected,
}: {
  rowCount: number
  variationCount: number
  solvedCells: number
  topBase: number
  topVariation: number
  loadedSets: number
  liveConnected: boolean
}) {
  const cells = [
    ['SETS', loadedSets > 0 ? loadedSets.toLocaleString() : '--', 'neutral'],
    ['PLAYERS', rowCount.toLocaleString(), rowCount > 0 ? 'up' : 'flat'],
    ['VARIATIONS', variationCount.toLocaleString(), variationCount > 0 ? 'up' : 'flat'],
    ['SOLVED', solvedCells.toLocaleString(), solvedCells > 0 ? 'up' : 'flat'],
    ['TOP BASE', money(topBase), topBase > 0 ? 'up' : 'flat'],
    ['TOP MODEL', money(topVariation), topVariation > 0 ? 'up' : 'flat'],
    ['SOURCE', liveConnected ? 'CONNECTED' : 'PUBLIC', liveConnected ? 'up' : 'flat'],
  ] as const

  return (
    <section className="market-tape" aria-label="Market tape">
      {cells.map(([label, value, tone]) => (
        <div className={`tape-cell ${tone}`} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  )
}

function MathAudit({
  summaries,
  missingBaseRows,
  unresolvedMultipliers,
}: {
  summaries: ReleaseMathSummary[]
  missingBaseRows: number
  unresolvedMultipliers: number
}) {
  return (
    <section className="math-audit">
      <div className="audit-title">
        <Sigma size={18} />
        <div>
          <h2>Multiple Valuations</h2>
          <span>30/90 base x release multiple</span>
        </div>
      </div>

      <div className="audit-grid">
        {summaries.length > 0 ? (
          summaries.map((summary) => (
            <div className="audit-card" key={summary.release}>
              <span>{summary.release}</span>
              <strong>{summary.resolvedCells.toLocaleString()}</strong>
              <small>
                {summary.pricedPlayers.toLocaleString()} players x {summary.variations.toLocaleString()} variations
              </small>
              <em>
                {formatMultiplier(summary.minMultiplier)} to {formatMultiplier(summary.maxMultiplier)}
              </em>
              <small>
                {summary.weightedBaseRows} weighted / {summary.blendedBaseRows} blended / {summary.fallbackBaseRows} fallback
              </small>
            </div>
          ))
        ) : (
          <div className="audit-card muted">
            <span>Waiting</span>
            <strong>--</strong>
            <small>Connect ProspectPulse for player base data</small>
            <em>Multipliers ready after load</em>
          </div>
        )}
      </div>

      {missingBaseRows > 0 || unresolvedMultipliers > 0 ? (
        <div className="audit-warning">
          <strong>Open math items</strong>
          <span>
            {missingBaseRows.toLocaleString()} missing base rows / {unresolvedMultipliers.toLocaleString()} unusable multipliers
          </span>
        </div>
      ) : null}
    </section>
  )
}

function PreviewQuote({ quote }: { quote: VariationQuote }) {
  return (
    <span className="preview-quote">
      <strong>{money(quote.price)}</strong>
      <small>{compactVariation(quote.label)}</small>
    </span>
  )
}

function Leaderboard({
  rows,
  totalRows,
  selectedId,
  onSelect,
}: {
  rows: PricingRow[]
  totalRows: number
  selectedId?: string
  onSelect: (rowId: string) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state board-empty">
        <BarChart3 size={28} />
        <strong>No priced players loaded.</strong>
        <span>Connect ProspectPulse to load player base data.</span>
      </div>
    )
  }

  return (
    <div className="leaderboard-shell">
      <div className="leaderboard-head">
        <span>#</span>
        <span>Player</span>
        <span>Model Base</span>
        <span>Top Model</span>
        <span>{totalRows > rows.length ? `Curve: top ${rows.length} of ${totalRows}` : 'Curve'}</span>
      </div>
      <div className="leaderboard-list">
        {rows.map((row) => (
          <button
            className={`leaderboard-row ${selectedId === row.id ? 'selected' : ''}`}
            key={row.id}
            type="button"
            onClick={() => onSelect(row.id)}
            aria-pressed={selectedId === row.id}
          >
            <span className="rank-chip">{row.rank}</span>
            <span className="player-chip">
              <strong>{row.playerName}</strong>
              <small>{row.release}</small>
            </span>
            <span className="money-chip">
              <strong>{money(row.baseTwmaPrice)}</strong>
              <small>{row.baseMethod}</small>
            </span>
            <span className="money-chip top">
              <strong>{money(row.topVariationPrice)}</strong>
              <small>{Math.round(row.baseConfidence * 100)}% base / {row.variationCount} solved</small>
            </span>
            <span className="curve-strip">
              {pickPreviewQuotes(row.ladder).map((quote) => (
                <PreviewQuote quote={quote} key={`${row.id}:${quote.key}`} />
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function LadderDetail({ row }: { row?: PricingRow }) {
  if (!row) {
    return (
      <section className="detail-card">
        <div className="empty-state compact">
          <TableProperties size={24} />
          <strong>No player selected.</strong>
        </div>
      </section>
    )
  }

  const topQuote = row.ladder.reduce((best, quote) => (quote.price > best.price ? quote : best), row.ladder[0])

  return (
    <section className="detail-card ladder-detail">
      <div className="detail-title">
        <TableProperties size={18} />
        <div>
          <span>Selected Player</span>
          <h2>{row.playerName}</h2>
          <small>{row.release}</small>
        </div>
      </div>

      <div className="formula-strip">
        <div>
          <span>Model Base</span>
          <strong>{money(row.baseTwmaPrice)}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{row.basePriceSource.replace('-', ' ')}</strong>
        </div>
        <div>
          <span>Highest</span>
          <strong>{money(row.topVariationPrice)}</strong>
        </div>
        <div>
          <span>30D / 90D</span>
          <strong>{row.baseSales30} / {row.baseSales90}</strong>
        </div>
      </div>

      <div className="base-source-note">
        <span>Pulse base {money(row.pulseBasePrice)}</span>
        <span>{row.baseMethod}</span>
        <span>{Math.round(row.baseConfidence * 100)}% confidence</span>
      </div>

      <div className="variation-grid">
        {row.ladder.map((quote) => (
          <div className={`variation-card ${quote.key === topQuote.key ? 'top' : ''}`} key={`${row.id}:detail:${quote.key}`}>
            <span>{compactVariation(quote.label)}</span>
            <strong>{money(quote.price)}</strong>
            <small>
              {money(row.baseTwmaPrice)} x {formatMultiplier(quote.multiplier)}
            </small>
          </div>
        ))}
      </div>
    </section>
  )
}

function ModelStatus({
  models,
  loading,
  error,
  onRefresh,
}: {
  models: ChecklistModel[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}) {
  const totalPlayers = models.reduce((total, model) => total + (model.totalPlayers ?? model.players.length), 0)
  const loadedPlayers = models.reduce((total, model) => total + model.players.length, 0)
  const variationCount = models.reduce((total, model) => total + model.multipliers.length, 0)
  const playerCoverage =
    totalPlayers > 0
      ? `${loadedPlayers.toLocaleString()} / ${totalPlayers.toLocaleString()}`
      : models.length > 0
        ? loadedPlayers.toLocaleString()
        : '--'
  const sourceLabel = error
    ? error
    : models.some((model) => model.source === 'authenticated-player-model')
      ? `Player base data loaded: ${loadedPlayers.toLocaleString()}`
      : totalPlayers
        ? `Public multiples only; ${totalPlayers.toLocaleString()} players require connection`
        : 'Waiting for checklist model'

  return (
    <section className="detail-card model-status">
      <div className="section-title">
        <BookOpenCheck size={18} />
        <h2>Model Load</h2>
        <button className="icon-button" type="button" onClick={onRefresh} aria-label="Refresh model">
          <RefreshCw size={15} className={loading ? 'spin' : undefined} />
        </button>
      </div>
      <div className="model-facts">
        <div>
          <span>Sets</span>
          <strong>{models.length || '--'}</strong>
        </div>
        <div>
          <span>Players</span>
          <strong>{playerCoverage}</strong>
        </div>
        <div>
          <span>Vars</span>
          <strong>{variationCount ? variationCount.toLocaleString() : '--'}</strong>
        </div>
      </div>
      <div className={`model-source ${models.some((model) => model.source === 'authenticated-player-model') ? 'connected' : ''}`}>
        <Brain size={16} />
        <span>{sourceLabel}</span>
      </div>
    </section>
  )
}

function App() {
  const [liveConnected, setLiveConnected] = useState(false)
  const [authEmail, setAuthEmail] = useState(() => getStoredPulseSession()?.user?.email ?? '')
  const [authPassword, setAuthPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [releaseOptions, setReleaseOptions] = useState<ReleaseOption[]>(FALLBACK_RELEASE_OPTIONS)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [checklistModels, setChecklistModels] = useState<ChecklistModel[]>([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [checklistProgress, setChecklistProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [query, setQuery] = useState('')
  const [releaseFilter, setReleaseFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [baseSourceFilter, setBaseSourceFilter] = useState<BaseSourceFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('base-desc')
  const [selectedRowId, setSelectedRowId] = useState<string | undefined>()
  const checklistRequestRef = useRef<AbortController | null>(null)
  const checklistRequestIdRef = useRef(0)

  const loadChecklistCatalog = useCallback(async (signal?: AbortSignal) => {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const catalog = await fetchChecklistCatalog({
        categories: CHECKLIST_CATEGORIES,
        minYear: CHECKLIST_MIN_YEAR,
        signal,
      })
      const nextReleaseOptions = catalog.length > 0 ? catalog : FALLBACK_RELEASE_OPTIONS
      setReleaseOptions(nextReleaseOptions)
      setCatalogError(catalog.length > 0 ? null : 'Using fallback checklist catalog')
      return nextReleaseOptions
    } catch (catalogLoadError) {
      if (signal?.aborted) return FALLBACK_RELEASE_OPTIONS
      setCatalogError(catalogLoadError instanceof Error ? catalogLoadError.message : 'Checklist catalog load failed')
      setReleaseOptions(FALLBACK_RELEASE_OPTIONS)
      return FALLBACK_RELEASE_OPTIONS
    } finally {
      if (!signal?.aborted) setCatalogLoading(false)
    }
  }, [])

  const loadChecklistModel = useCallback(async (releases: ReleaseOption[]) => {
    checklistRequestRef.current?.abort()
    const requestId = checklistRequestIdRef.current + 1
    checklistRequestIdRef.current = requestId
    const controller = new AbortController()
    checklistRequestRef.current = controller
    setChecklistLoading(true)
    setChecklistError(null)
    setChecklistProgress({ loaded: 0, total: releases.length })

    try {
      const settledModels = await mapWithConcurrency(releases, CHECKLIST_LOAD_CONCURRENCY, async (release) => {
        try {
          const value = await fetchChecklistModel({
            category: release.category,
            year: release.year,
            release: release.release,
            totalPlayers: release.totalPlayers,
            firstChromeAutos: release.firstChromeAutos,
            activeChecklistPlayers: release.activeChecklistPlayers,
            signal: controller.signal,
          })
          return { status: 'fulfilled' as const, value }
        } catch (reason) {
          return { status: 'rejected' as const, reason }
        } finally {
          if (checklistRequestIdRef.current === requestId && !controller.signal.aborted) {
            setChecklistProgress((progress) =>
              progress ? { ...progress, loaded: Math.min(progress.total, progress.loaded + 1) } : progress,
            )
          }
        }
      })
      if (checklistRequestIdRef.current !== requestId) return
      const models = settledModels.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

      if (models.length === 0) {
        const firstError = settledModels.find((result) => result.status === 'rejected')
        throw firstError?.status === 'rejected' ? firstError.reason : new Error('Model load failed')
      }

      setChecklistModels(models)
      setChecklistError(models.length < releases.length ? `Loaded ${models.length} / ${releases.length} checklist models` : null)
    } catch (modelError) {
      if (checklistRequestIdRef.current !== requestId || controller.signal.aborted) return
      setChecklistError(modelError instanceof Error ? modelError.message : 'Model load failed')
    } finally {
      if (checklistRequestIdRef.current === requestId) {
        setChecklistLoading(false)
        setChecklistProgress(null)
        if (checklistRequestRef.current === controller) checklistRequestRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    const catalogController = new AbortController()
    getPulseStatus()
      .then((status) => {
        if (active) setLiveConnected(status.connected)
      })
      .catch(() => {
        if (active) setLiveConnected(false)
      })
    const modelTimer = window.setTimeout(() => {
      void (async () => {
        const catalog = await loadChecklistCatalog(catalogController.signal)
        if (active) await loadChecklistModel(catalog)
      })()
    }, 0)

    return () => {
      active = false
      catalogController.abort()
      window.clearTimeout(modelTimer)
    }
  }, [loadChecklistCatalog, loadChecklistModel])

  useEffect(() => {
    return () => {
      checklistRequestIdRef.current += 1
      checklistRequestRef.current?.abort()
    }
  }, [])

  const matrix = useMemo(() => buildPricingMatrix(checklistModels), [checklistModels])
  const visibleRows = useMemo(() => {
    const searchedRows = filterPricingRows(matrix.rows, query)
    const filteredRows = searchedRows.filter((row) => {
      if (releaseFilter !== 'all' && row.release !== releaseFilter) return false
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (baseSourceFilter !== 'all' && row.basePriceSource !== baseSourceFilter) return false
      return true
    })
    return sortRows(filteredRows, sortMode)
  }, [baseSourceFilter, categoryFilter, matrix.rows, query, releaseFilter, sortMode])
  const renderedRows = useMemo(() => visibleRows.slice(0, LEADERBOARD_RENDER_LIMIT), [visibleRows])
  const selectedRow = renderedRows.find((row) => row.id === selectedRowId) ?? renderedRows[0]
  const topBase = matrix.rows[0]?.baseTwmaPrice ?? 0
  const topVariation = matrix.rows.reduce((max, row) => Math.max(max, row.topVariationPrice), 0)
  const modelUpdatedAt = latestFetchedAt(checklistModels)

  async function refreshChecklistUniverse() {
    const catalog = await loadChecklistCatalog()
    await loadChecklistModel(catalog)
  }

  async function connectProspectPulse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setChecklistError(null)
    let sessionSaved = false

    try {
      const session = await loginProspectPulse(authEmail.trim(), authPassword)
      savePulseSession(session)
      sessionSaved = true
      setLiveConnected(true)
      setAuthEmail(session.user?.email ?? authEmail.trim())
      setAuthPassword('')
      await loadChecklistModel(releaseOptions)
    } catch (connectError) {
      setLiveConnected(sessionSaved && !isPulseAuthError(connectError))
      setChecklistError(connectError instanceof Error ? connectError.message : 'Could not connect ProspectPulse')
    } finally {
      setAuthBusy(false)
    }
  }

  function disconnectProspectPulse() {
    clearPulseSession()
    setLiveConnected(false)
    setAuthPassword('')
    void loadChecklistModel(releaseOptions)
  }

  return (
    <main className="app-shell valuation-app">
      <section className="workbench-topbar">
        <div className="brand-block">
          <div className="eyebrow">
            <Activity size={14} />
            Recency Valuation Board
          </div>
          <h1>Bowman Trader</h1>
          <div className="release-line">
            <span>{releaseOptions.length} releases</span>
            <span>{CHECKLIST_MIN_YEAR}+ seasons</span>
            <span>Bowman / Chrome / Draft</span>
          </div>
        </div>

        <div className="top-actions">
          <button className="primary-button" type="button" onClick={() => void refreshChecklistUniverse()} disabled={checklistLoading || catalogLoading}>
            <RefreshCw size={16} className={checklistLoading ? 'spin' : undefined} />
            {catalogLoading
              ? 'Discovering'
              : checklistProgress
                ? `Loading ${checklistProgress.loaded}/${checklistProgress.total}`
                : checklistLoading
                  ? 'Refreshing'
                  : 'Refresh'}
          </button>
          <button className="ghost-button" type="button" onClick={() => downloadMatrixCsv(visibleRows)}>
            <Download size={16} />
            Export
          </button>
        </div>
      </section>

      <section className="status-strip valuation-status">
        <span className={`source-chip ${liveConnected ? 'connected' : 'offline'}`}>
          {liveConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {liveConnected ? 'ProspectPulse connected' : 'Public multiples only'}
        </span>
        <span>{releaseOptions.length.toLocaleString()} checklist releases</span>
        <span>{matrix.totalPricedPlayers.toLocaleString()} priced players</span>
        <span>{matrix.totalResolvedCells.toLocaleString()} solved valuations</span>
        <span>
          {matrix.weightedBaseRows.toLocaleString()} weighted / {matrix.blendedBaseRows.toLocaleString()} blended /{' '}
          {matrix.fallbackBaseRows.toLocaleString()} fallback
        </span>
        {checklistProgress ? <span>Loading {checklistProgress.loaded.toLocaleString()} / {checklistProgress.total.toLocaleString()}</span> : null}
        <span>{modelUpdatedAt ? `Updated ${new Date(modelUpdatedAt).toLocaleTimeString()}` : 'Awaiting player bases'}</span>
        {catalogError ? <strong>{catalogError}</strong> : null}
        {checklistError ? <strong>{checklistError}</strong> : null}
      </section>

      <MarketTape
        rowCount={matrix.totalPricedPlayers}
        variationCount={matrix.totalVariations}
        solvedCells={matrix.totalResolvedCells}
        topBase={topBase}
        topVariation={topVariation}
        loadedSets={checklistModels.length}
        liveConnected={liveConnected}
      />

      <MathAudit summaries={matrix.summaries} missingBaseRows={matrix.missingBaseRows} unresolvedMultipliers={matrix.unresolvedMultipliers} />

      <section className="workbench-layout">
        <div className="valuation-workspace">
          <div className="metric-grid">
            <StatTile icon={Database} label="Players" value={matrix.totalPricedPlayers.toLocaleString()} tone="info" />
            <StatTile icon={Layers} label="Variations" value={matrix.totalVariations.toLocaleString()} tone="neutral" />
            <StatTile icon={BadgeDollarSign} label="Top Base" value={money(topBase)} tone="good" />
            <StatTile icon={Gauge} label="Top Model" value={money(topVariation)} tone="warn" />
          </div>

          <div className="toolbar valuation-toolbar">
            <label className="search-box">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, release, variation" />
            </label>
            <label className="filter-select">
              <span>Set</span>
              <select value={releaseFilter} onChange={(event) => setReleaseFilter(event.target.value)}>
                <option value="all">All sets</option>
                {releaseOptions.map((release) => (
                  <option value={release.release} key={release.id}>
                    {release.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>Family</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}>
                <option value="all">All families</option>
                {CHECKLIST_CATEGORIES.map((category) => (
                  <option value={category} key={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>Base</span>
              <select value={baseSourceFilter} onChange={(event) => setBaseSourceFilter(event.target.value as BaseSourceFilter)}>
                <option value="all">All sources</option>
                {Object.entries(SOURCE_LABELS).map(([source, label]) => (
                  <option value={source} key={source}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>Sort</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                {Object.entries(SORT_LABELS).map(([mode, label]) => (
                  <option value={mode} key={mode}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="deal-count">
              <strong>{visibleRows.length.toLocaleString()}</strong>
              <span>rows</span>
            </div>
            {visibleRows.length > renderedRows.length ? (
              <div className="deal-count">
                <strong>{renderedRows.length.toLocaleString()}</strong>
                <span>shown</span>
              </div>
            ) : null}
          </div>

          <Leaderboard rows={renderedRows} totalRows={visibleRows.length} selectedId={selectedRow?.id} onSelect={setSelectedRowId} />
        </div>

        <aside className="detail-rail">
          <section className="detail-card connection-card">
            <div className="section-title">
              <KeyRound size={18} />
              <h2>ProspectPulse</h2>
            </div>
            {liveConnected ? (
              <div className="connected-box">
                <span>Connected</span>
                <strong>{authEmail || 'Local session'}</strong>
                <button className="ghost-button" type="button" onClick={disconnectProspectPulse}>
                  <LogOut size={16} />
                  Disconnect
                </button>
              </div>
            ) : (
              <form className="connect-form" onSubmit={(event) => void connectProspectPulse(event)}>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    autoComplete="username"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    required
                  />
                </label>
                <button className="primary-button" type="submit" disabled={authBusy}>
                  <RefreshCw size={16} className={authBusy ? 'spin' : undefined} />
                  Connect
                </button>
              </form>
            )}
          </section>

          <LadderDetail row={selectedRow} />
          <ModelStatus models={checklistModels} loading={checklistLoading} error={checklistError} onRefresh={() => void loadChecklistModel(releaseOptions)} />
        </aside>
      </section>
    </main>
  )
}

export default App
