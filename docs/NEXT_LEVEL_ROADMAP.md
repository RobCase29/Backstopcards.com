# Backstop v2 Roadmap

The product has one job: make the next card worth inspecting obvious. Everything else supports that decision.

## Now: make the board trustworthy

1. **Server-side canonical comp ingest**
   - Move Card Hedge refreshes from price-update checkpoints to a durable job that upserts normalized sales and rebuilds only affected canonical lanes.
   - Keep the generated static snapshot as offline/bootstrap fallback, not the primary freshness mechanism.
   - Success metric: every covered player lane has a dated comp summary and the board never needs a deploy to reflect a daily refresh.

2. **Base-auto coverage and taxonomy queue**
   - Prioritize players with many raw sales but no classified base-auto anchor.
   - Encode recurring title failures as canonical parser rules; retain manual bucket merges only for genuine edge cases.
   - Success metric: reduce the current high-sale missing-base list to zero for the active Bowman universe.

3. **Reliable live-market adapters**
   - Keep provider calls behind the shared query cache, with source-level success/failure reporting and a graceful partial-results state.
   - Success metric: eBay/Fanatics outages never blank the board and cache hits absorb repeat scans.

## Next: turn research into a better buying decision

4. **Explainable deal score**
   - Show one compact reason stack: live edge, recent comp agreement, comp depth, and rank-vs-price signal.
   - Keep scores sortable, but make every score inspectable in one click.

5. **True player/card search**
   - Return player, team, release, variation, raw/graded, and live listings in one structured result surface.
   - Preserve the daily board as the fastest discovery view; do not make users choose a data system before searching.

6. **Watchlists and price movement**
   - Let a user save a player/card lane and surface only meaningful changes: a new low ask, a comp reset, or a ranking move.

## Scale safely

7. **Split the client by workflow**
   - Extract Daily Board, Live Deals, Price My Card, Sealed Wax, and Case Hits into lazy route modules.
   - Target: reduce initial JavaScript from roughly 1.3 MB to a focused board shell plus the selected workflow.

8. **Neon as the canonical hosted store**
   - Promote the durable sold-comp schema from local SQLite to Neon for production, keeping Redis only for short-lived query and ranking cache entries.
   - This makes daily refreshes, cleanup decisions, and multi-user scans consistent across deployments.

9. **Admin operations surface**
   - Keep source health, queue depth, parser exceptions, and API spend in an admin-only view. The customer-facing board should stay quiet and decision-first.

## Explicit non-goals

- Live listings never become permanent sold comps.
- Thin or unclassified data never masquerades as decision-ready pricing.
- Marketplace search results never define the checklist universe.
