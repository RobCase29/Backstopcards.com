# Backstop v2 Roadmap

The product has one job: make the next card worth inspecting obvious. Everything else supports that decision.

## Shipped foundation

1. **Hosted canonical comp ingest**
   - Neon now owns production comp lanes, item-level sales, queue state, and sync-run telemetry.
   - Elite daily exports provide broad discovery; known IDs use direct comps; batch FMV supplies a daily corroboration layer.
   - The generated snapshot is bootstrap/offline fallback, not the freshness mechanism.

2. **Recoverable coverage gaps**
   - Missing players stay searchable and can be prioritized from the board or calculator in one click.
   - A hosted comp now updates price, trust, filtering, calculator eligibility, and deal-scan eligibility as one state transition.

3. **Authenticated automation**
   - Rankings and comp jobs cross the invite-only middleware only with `CRON_SECRET`.
   - The comp job is idempotent, budgeted, resumable, and records each run.

## Now: finish the gold-standard model

4. **Coverage SLO and exception inbox** ★★★★★
   - Target 95% of confirmed 1st Bowman players with a base-auto identity and 90% with a decision-ready price.
   - Prioritize by ranking, active-listing demand, stale age, and failed-match reason.
   - Turn parser misses into a small review inbox instead of invisible queue debt.

5. **Variation-level canonical lanes** ★★★★★
   - Extend the hosted contract from flagship base autos to official auto parallels and low-numbered non-auto/case-hit lanes.
   - Learn time-proximate variation multiples while retaining release priors for thin cards.
   - Surface direct-comp agreement beside model value, not as a second conflicting price.

6. **Reliable live-market adapters** ★★★★
   - Keep provider calls behind the shared query cache, with source-level success/failure reporting and a graceful partial-results state.
   - Success metric: eBay/Fanatics outages never blank the board and cache hits absorb repeat scans.

## Next: turn research into a better buying decision

7. **Explainable deal score** ★★★★★
   - Show one compact reason stack: live edge, recent comp agreement, comp depth, and rank-vs-price signal.
   - Keep scores sortable, but make every score inspectable in one click.

8. **True player/card search** ★★★★
   - Return player, team, release, variation, raw/graded, and live listings in one structured result surface.
   - Preserve the daily board as the fastest discovery view; do not make users choose a data system before searching.

9. **Watchlists and price movement** ★★★★
   - Let a user save a player/card lane and surface only meaningful changes: a new low ask, a comp reset, or a ranking move.

## Scale safely

10. **Split the client by workflow** ★★★★
   - Extract Daily Board, Live Deals, Price My Card, Sealed Wax, and Case Hits into lazy route modules.
   - Target: reduce initial JavaScript from roughly 1.3 MB to a focused board shell plus the selected workflow.

11. **Admin operations surface** ★★★★
   - Keep source health, queue depth, parser exceptions, and API spend in an admin-only view. The customer-facing board should stay quiet and decision-first.

## Explicit non-goals

- Live listings never become permanent sold comps.
- Thin or unclassified data never masquerades as decision-ready pricing.
- Marketplace search results never define the checklist universe.
