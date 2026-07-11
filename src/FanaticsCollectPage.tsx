import { ExternalLink, RefreshCw, Search, Star, Target } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { EbayBinScanResult } from './lib/ebay'
import type { FanaticsCollectScopeType, FanaticsCollectStatus } from './lib/fanaticsCollect'
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
const RECENT_SCOPES_KEY = 'backstop:fanatics-recent-scopes:v1'

type RecentScope = { type: FanaticsCollectScopeType; value: string }

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

function readRecentScopes() {
  if (typeof window === 'undefined') return [] as RecentScope[]
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_SCOPES_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((scope): scope is RecentScope =>
      Boolean(scope && typeof scope === 'object' && ['player', 'team', 'set'].includes(String((scope as RecentScope).type)) && String((scope as RecentScope).value).trim()),
    ).slice(0, 6)
  } catch {
    return []
  }
}

function writeRecentScopes(scopes: RecentScope[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_SCOPES_KEY, JSON.stringify(scopes.slice(0, 6)))
  } catch {
    // Recent scopes are a convenience; searches still work without storage.
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
  onSearch,
}: {
  opportunities: Opportunity[]
  scan: EbayBinScanResult | null
  status: FanaticsCollectStatus | null
  loading: boolean
  error: string | null
  onSearch: (scopeType: FanaticsCollectScopeType, scopeValue: string) => void
}) {
  const [filterQuery, setFilterQuery] = useState('')
  const [scopeType, setScopeType] = useState<FanaticsCollectScopeType>('player')
  const [scopeValue, setScopeValue] = useState('')
  const [recentScopes, setRecentScopes] = useState<RecentScope[]>(readRecentScopes)
  const [valueBand, setValueBand] = useState<FanaticsValueBand>('within-50')
  const [grade, setGrade] = useState<FanaticsGradeFilter>('all')
  const [sort, setSort] = useState<FanaticsDealSort>('edge')
  const [maxPrice, setMaxPrice] = useState(0)
  const [holdsOnly, setHoldsOnly] = useState(false)
  const [holdTargets, setHoldTargets] = useState<string[]>(readHoldTargets)
  const searchReady = Boolean(status?.targetedSearch?.configured)
  const fanaticsOpportunities = useMemo(
    () => opportunities.filter((opportunity) => opportunity.listing.marketplace === 'fanatics-collect'),
    [opportunities],
  )
  const filtered = useMemo(
    () =>
      filterFanaticsDealOpportunities(fanaticsOpportunities, {
        query: filterQuery,
        valueBand,
        grade,
        sort,
        maxPrice,
        holdsOnly,
        holdTargets,
      }),
    [fanaticsOpportunities, filterQuery, grade, holdTargets, holdsOnly, maxPrice, sort, valueBand],
  )
  const holdKeys = useMemo(() => new Set(holdTargets.map(fanaticsPlayerKey)), [holdTargets])
  const withinModelWindowCount = fanaticsOpportunities.filter(
    (opportunity) => opportunity.listing.allInPrice <= opportunity.fairValue * 1.5,
  ).length
  const latestLabel = scan?.fetchedAt ? new Date(scan.fetchedAt).toLocaleString() : 'Enter a scope to search'

  const submitScope = (event: FormEvent) => {
    event.preventDefault()
    const value = scopeValue.trim()
    if (!value || !searchReady || loading) return
    const next = [{ type: scopeType, value }, ...recentScopes.filter((scope) => !(scope.type === scopeType && fanaticsPlayerKey(scope.value) === fanaticsPlayerKey(value)))].slice(0, 6)
    setRecentScopes(next)
    writeRecentScopes(next)
    onSearch(scopeType, value)
  }

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
        <form className="fanatics-scope-search" onSubmit={submitScope}>
          <select value={scopeType} onChange={(event) => setScopeType(event.target.value as FanaticsCollectScopeType)} aria-label="Fanatics search scope">
            <option value="player">Player</option>
            <option value="team">Team</option>
            <option value="set">Set</option>
          </select>
          <input
            value={scopeValue}
            onChange={(event) => setScopeValue(event.target.value)}
            placeholder={scopeType === 'player' ? 'e.g. Aiva Arquette' : scopeType === 'team' ? 'e.g. Miami Marlins' : 'e.g. 2026 Bowman Chrome'}
            aria-label={`Fanatics ${scopeType} search`}
          />
          <button className="fanatics-scan-button" type="submit" disabled={!searchReady || loading || scopeValue.trim().length < 2}>
            <RefreshCw size={17} className={loading ? 'spin' : undefined} />
            {loading ? 'Finding deals' : 'Find Fanatics deals'}
          </button>
        </form>
      </header>

      {recentScopes.length > 0 ? (
        <div className="fanatics-recent-scopes" aria-label="Recent Fanatics searches">
          <span>Recent</span>
          {recentScopes.map((scope) => (
            <button key={`${scope.type}:${scope.value}`} type="button" onClick={() => { setScopeType(scope.type); setScopeValue(scope.value); onSearch(scope.type, scope.value) }} disabled={loading || !searchReady}>
              {scope.type}: {scope.value}
            </button>
          ))}
        </div>
      ) : null}

      <div className="fanatics-summary" aria-label="Fanatics scan summary">
        <span><strong>{fanaticsOpportunities.length.toLocaleString()}</strong> modeled listings</span>
        <span><strong>{withinModelWindowCount.toLocaleString()}</strong> within 50% of model</span>
        <span><strong>{holdTargets.length.toLocaleString()}</strong> hold targets</span>
        <span><strong>{scan?.stats.upstreamPagesFetched.toLocaleString() ?? '0'}</strong> feed pages</span>
        <span>{latestLabel}</span>
      </div>

      <div className="fanatics-filter-bar" aria-label="Fanatics listing filters">
        <label className="fanatics-search">
          <Search size={17} />
          <input
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
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
          <strong>{scan ? 'No cards match these filters.' : 'Search a player, team, or set to build this board.'}</strong>
          <span>{scan ? 'Try the all-listings view, remove the price cap, or enter another scope.' : 'We’ll rank every matched result against the Backstop model.'}</span>
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
