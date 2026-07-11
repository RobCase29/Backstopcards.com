import { ExternalLink, RefreshCw, Search, ShieldCheck, Star, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { EbayBinScanResult } from './lib/ebay'
import type { FanaticsCollectStatus } from './lib/fanaticsCollect'
import {
  fanaticsPlayerKey,
  filterFanaticsDealOpportunities,
  type FanaticsDealSort,
  type FanaticsGradeFilter,
  type FanaticsValueBand,
} from './lib/fanaticsDealFilters'
import type { Opportunity } from './types'
import './FanaticsCollectPage.css'

const HOLD_TARGETS_KEY = 'backstop:fanatics-hold-targets:v1'

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function readHoldTargets() {
  if (typeof window === 'undefined') return [] as string[]
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HOLD_TARGETS_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : []
  } catch {
    return []
  }
}

function writeHoldTargets(targets: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HOLD_TARGETS_KEY, JSON.stringify(targets))
  } catch {
    // The page still works for this session when storage is unavailable.
  }
}

function valueLabel(opportunity: Opportunity) {
  const ratio = opportunity.listing.allInPrice / Math.max(opportunity.fairValue, 1)
  if (ratio <= 0.8) return 'Strong value'
  if (ratio <= 1) return 'Fair or better'
  if (ratio <= 1.15) return 'Near model'
  if (ratio <= 1.5) return 'Within 50%'
  return 'Above model'
}

export function FanaticsCollectPage({
  opportunities,
  scan,
  status,
  loading,
  error,
  onRunScan,
}: {
  opportunities: Opportunity[]
  scan: EbayBinScanResult | null
  status: FanaticsCollectStatus | null
  loading: boolean
  error: string | null
  onRunScan: () => void
}) {
  const [query, setQuery] = useState('')
  const [valueBand, setValueBand] = useState<FanaticsValueBand>('within-50')
  const [grade, setGrade] = useState<FanaticsGradeFilter>('all')
  const [sort, setSort] = useState<FanaticsDealSort>('edge')
  const [maxPrice, setMaxPrice] = useState(0)
  const [holdsOnly, setHoldsOnly] = useState(false)
  const [holdTargets, setHoldTargets] = useState<string[]>(readHoldTargets)
  const authorized = Boolean(status?.wideScan?.configured)
  const fanaticsOpportunities = useMemo(
    () => opportunities.filter((opportunity) => opportunity.listing.marketplace === 'fanatics-collect'),
    [opportunities],
  )
  const filtered = useMemo(
    () =>
      filterFanaticsDealOpportunities(fanaticsOpportunities, {
        query,
        valueBand,
        grade,
        sort,
        maxPrice,
        holdsOnly,
        holdTargets,
      }),
    [fanaticsOpportunities, grade, holdTargets, holdsOnly, maxPrice, query, sort, valueBand],
  )
  const holdKeys = useMemo(() => new Set(holdTargets.map(fanaticsPlayerKey)), [holdTargets])
  const withinModelWindowCount = fanaticsOpportunities.filter(
    (opportunity) => opportunity.listing.allInPrice <= opportunity.fairValue * 1.5,
  ).length
  const latestLabel = scan?.fetchedAt ? new Date(scan.fetchedAt).toLocaleString() : 'No authorized scan yet'

  const toggleHoldTarget = (playerName: string) => {
    const playerKey = fanaticsPlayerKey(playerName)
    const next = holdKeys.has(playerKey)
      ? holdTargets.filter((target) => fanaticsPlayerKey(target) !== playerKey)
      : [...holdTargets, playerName].sort((left, right) => left.localeCompare(right))
    setHoldTargets(next)
    writeHoldTargets(next)
    if (next.length === 0) setHoldsOnly(false)
  }

  return (
    <section className="fanatics-desk" aria-label="Fanatics Collect Bowman prospect auto finder">
      <header className="fanatics-hero">
        <div>
          <span className="fanatics-kicker">
            <Target size={15} />
            Fanatics Collect · Bowman prospect autos
          </span>
          <h2>Collect finds, without the clunky hunt.</h2>
          <p>See every matched card within 50% of model, then narrow the board or save the players you want to hold.</p>
        </div>
        <button className="fanatics-scan-button" type="button" onClick={onRunScan} disabled={!authorized || loading}>
          <RefreshCw size={17} className={loading ? 'spin' : undefined} />
          {loading ? 'Scanning Fanatics' : authorized ? 'Run wide Fanatics scan' : 'Approved feed required'}
        </button>
      </header>

      <div className="fanatics-summary" aria-label="Fanatics scan summary">
        <span><strong>{fanaticsOpportunities.length.toLocaleString()}</strong> modeled listings</span>
        <span><strong>{withinModelWindowCount.toLocaleString()}</strong> within 50% of model</span>
        <span><strong>{holdTargets.length.toLocaleString()}</strong> hold targets</span>
        <span><strong>{scan?.stats.upstreamPagesFetched.toLocaleString() ?? '0'}</strong> feed pages</span>
        <span>{latestLabel}</span>
      </div>

      {!authorized ? (
        <div className="fanatics-permission-note">
          <ShieldCheck size={18} />
          <div>
            <strong>Ready for an approved Fanatics feed.</strong>
            <span>{status?.wideScan?.message ?? 'Written data-access permission is required before automated retrieval can run.'}</span>
          </div>
          <a href={status?.termsUrl} target="_blank" rel="noreferrer">Review terms <ExternalLink size={13} /></a>
        </div>
      ) : null}

      <div className="fanatics-filter-bar" aria-label="Fanatics listing filters">
        <label className="fanatics-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player, set, or parallel"
            aria-label="Search Fanatics prospect autos"
          />
        </label>
        <label>
          <span>Value</span>
          <select value={valueBand} onChange={(event) => setValueBand(event.target.value as FanaticsValueBand)}>
            <option value="within-50">Within 50% of model</option>
            <option value="fair-or-better">Fair or better</option>
            <option value="near-model">Within 15% of model</option>
            <option value="all">All modeled listings</option>
          </select>
        </label>
        <label>
          <span>Card</span>
          <select value={grade} onChange={(event) => setGrade(event.target.value as FanaticsGradeFilter)}>
            <option value="all">Raw + graded</option>
            <option value="raw">Raw only</option>
            <option value="graded">Graded only</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as FanaticsDealSort)}>
            <option value="edge">Biggest $ edge</option>
            <option value="discount">Best discount</option>
            <option value="price">Lowest price</option>
            <option value="confidence">Highest confidence</option>
          </select>
        </label>
        <label>
          <span>Max ask</span>
          <input
            type="number"
            min="0"
            step="25"
            value={maxPrice || ''}
            placeholder="No max"
            onChange={(event) => setMaxPrice(Math.max(0, Number(event.target.value) || 0))}
            aria-label="Maximum Fanatics ask price"
          />
        </label>
        <button
          className={holdsOnly ? 'hold-filter active' : 'hold-filter'}
          type="button"
          onClick={() => setHoldsOnly((current) => !current)}
          disabled={holdTargets.length === 0}
        >
          <Star size={15} fill={holdsOnly ? 'currentColor' : 'none'} />
          My hold targets
        </button>
      </div>

      <div className="fanatics-result-head">
        <div>
          <span>Prospect auto board</span>
          <strong>{filtered.length.toLocaleString()} cards</strong>
        </div>
        <small>Edges compare the visible ask with Backstop model value; shipping and tax may be additional.</small>
      </div>

      {error ? <div className="fanatics-error" role="alert">{error}</div> : null}

      {filtered.length === 0 ? (
        <div className="fanatics-empty">
          <Target size={25} />
          <strong>{scan ? 'No cards match these filters.' : 'Run the authorized wide scan to build this board.'}</strong>
          <span>{scan ? 'Try the all-listings view, remove the price cap, or search another player.' : 'Then star any player to create your personal hold-target view.'}</span>
        </div>
      ) : (
        <div className="fanatics-card-grid">
          {filtered.map((opportunity) => {
            const player = opportunity.listing.playerName
            const isHold = holdKeys.has(fanaticsPlayerKey(player))
            return (
              <article className="fanatics-card" key={opportunity.listing.id}>
                <div className="fanatics-card-topline">
                  <span className="fanatics-value-chip">{valueLabel(opportunity)}</span>
                  <button
                    type="button"
                    className={isHold ? 'fanatics-star active' : 'fanatics-star'}
                    onClick={() => toggleHoldTarget(player)}
                    aria-label={isHold ? `Remove ${player} from hold targets` : `Add ${player} to hold targets`}
                    title={isHold ? 'Remove hold target' : 'Save as hold target'}
                  >
                    <Star size={16} fill={isHold ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <div className="fanatics-card-copy">
                  <span>{opportunity.listing.releaseLabel} · {opportunity.matchedVariation ?? opportunity.listing.variationLabel}</span>
                  <h3>{player}</h3>
                  <p>{opportunity.listing.title}</p>
                </div>
                <div className="fanatics-price-grid">
                  <span><small>Ask</small><strong>{money(opportunity.listing.allInPrice)}</strong></span>
                  <span><small>Model</small><strong>{money(opportunity.fairValue)}</strong></span>
                  <span className={opportunity.edgeDollars >= 0 ? 'positive' : ''}>
                    <small>Difference</small><strong>{money(opportunity.edgeDollars)}</strong>
                  </span>
                  <span><small>Discount</small><strong>{percent(opportunity.discountPct)}</strong></span>
                </div>
                <div className="fanatics-card-footer">
                  <span>{Math.round(opportunity.confidence * 100)}% confidence · {opportunity.valuationSource.replace(/-/g, ' ')}</span>
                  <a href={opportunity.listing.listingUrl || undefined} target="_blank" rel="noreferrer">
                    View on Collect <ExternalLink size={13} />
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
