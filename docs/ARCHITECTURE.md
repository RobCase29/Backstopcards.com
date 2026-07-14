# Backstop Architecture

This is the working source-of-truth spec for Backstop Card Finder. The product should open on a value board, let the user narrow by player, set, or current team, then run live deal scans against a cached market layer.

## Product Surface

The app has three primary jobs:

1. Rank players by rank-vs-price mismatch.
2. Price a player/card/grade quickly.
3. Scan live BINs and auctions for listings that are near or below fair value.

Anything that does not directly support those jobs should live in an operations drawer, a beta lab, or a script.

## Source Roles

```text
Official checklists + Wax Pack Hero 1st lists
  -> checklist universe and card lanes
  -> Baseball Oracle MiLB Prospect Rank + Career Outlook
     -> Scout the Statline movement/coverage context + MLB fallback
  -> Card Hedge Elite daily export (broad discovery)
  -> Card Hedge targeted search + comps (precision fallback)
  -> Neon canonical hosted comp lanes + refresh queue
  -> base-auto anchors and variation fair values
  -> live marketplace scans
     -> eBay Browse active BIN/auction scans today
     -> Fanatics Collect active fixed-price scans through public search-key access
  -> Upstash Redis marketplace query cache
  -> Neon live opportunity snapshots, rejects, and cleanup feedback
```

### Keep Active

- Card Hedge: scalable recent sold comps and daily refresh inputs.
- eBay Browse: active BIN and auction discovery today.
- Fanatics Collect: active fixed-price card discovery through the public search-key + Algolia path; no account login should be stored.
- Baseball Oracle snapshots: authoritative global Prospect Rank for matched MiLB players, plus Career Outlook and provider lineage.
- Scout the Statline snapshots: movement and coverage context for prospects, plus the MLB dynasty-rank fallback.
- Neon Postgres: production sold-comp lanes, item-level comp history, refresh queue, live snapshots, rejects, and cleanup memory.
- Local canonical SQLite cache: development/import tooling and offline fallback.
- Upstash Redis: hosted shared cache for repeated marketplace pages and ranking refreshes.

### Optional / Fallback

- Market Movers: validation and emergency taxonomy comparison. It should not be the default scale path.
- Legacy checklist feed: temporary checklist/multiplier fallback only. Normal page load should prefer the local checklist ledger.
- eBay sold APIs: optional future improvement if Marketplace Insights access becomes cleaner than Card Hedge.

## Runtime Data Policy

Sold comps are immutable enough to store permanently. Live listings are not.

- Production canonical sold comps are stored in Neon and update independently of deployments.
- Card Hedge's Elite daily export is filtered through the official queued player universe and strict flagship-base-auto taxonomy before any row is accepted.
- Known Card Hedge card IDs refresh directly; unknown players use the more expensive search-plus-comps path only until identity is established.
- Batch FMV is corroborating evidence. Direct sold comps lead when sample depth is healthy; correlated/segment estimates never silently override them.
- Fixed-price live marketplace query pages are cached for 24 hours when the provider supports stable query reuse.
- Auction/live-bid query pages are cached briefly because bids and end times move.
- Production stores reusable marketplace query pages in Upstash Redis before mapping/scoring.
- Production stores live opportunity snapshots in Neon as observations, but every listing needs freshness metadata and should be treated as stale quickly.
- Local development and disaster recovery may fall back to ignored SQLite files and the generated static snapshot.
- User rejects and bucket merges are cleanup signal, not throwaway UI state.
- Ranking API calls are server-only. The browser consumes the app's normalized ranking bundle and never calls Baseball Oracle directly.
- Ranking snapshots preserve stable Oracle player/MLBAM IDs, record and snapshot IDs, schema/contract versions, model and as-of fields, evidence tier, volatility, and match provenance.
- Identity matching prefers persisted provider IDs and MLBAM IDs. Name/team fallback must be unique; ambiguous candidates fail closed.

## Modeling Policy

Base auto price is the anchor. Variation pricing should prefer, in order:

1. Direct canonical sold lane for that player and variation.
2. Direct lane blended with nearby base-auto sales when sample size is thin.
3. Proximity multiple solved from variation sale / base anchor close to the sale date.
4. Release-level multiple only when player-level evidence is absent.
5. Explicit low-confidence label when none of the above is available.

The value board should use current base-auto price against rank-implied base price. For a current MiLB player, Baseball Oracle's served Prospect Rank is the authoritative prospect ordinal and Career Outlook is a separate dynasty-quality signal. STS trend and coverage data may supplement that player, but it must not overwrite the Oracle ordinal. STS MLB dynasty rank is the fallback for players who aged out of a current Oracle MiLB prospect list.

Do not collapse the following ranks into one field or label:

1. **Global Oracle Prospect Rank**: the provider-served position in the current MiLB universe, evaluated against the universe size shipped with that snapshot.
2. **Bowman-local prospect rank**: the relative position among Oracle-ranked players represented in the active Bowman checklist universe.
3. **Opportunity rank**: Backstop's price-aware ordering derived from ranking context, Career Outlook, comp evidence, and market price.

Oracle Rookie Pre-Debut Rank and MLB Career Rank belong to different stage universes and must not be numerically compared with MiLB Prospect Rank. The Bowman-local ordinal is a convenience projection, while opportunity rank is a model result; neither may be labeled or exported as an Oracle rank.

## Scale Guardrails

- Checklist ledger is the universe; marketplace search results are evidence.
- Marketplace titles can confirm 1st status, team, grade, card lane, and listing quality, but they should not create the universe on their own.
- Every external API call should pass through a server route with caching, rate-limit accounting, and no browser-visible secrets.
- Broad scans should use cached query pages and constrained player buckets.
- Hosted scans should check Redis before spending marketplace API requests and should write fresh snapshots to Neon after scoring.
- Classification fixes should be encoded as parser rules or bucket overrides after repeated misses.
- Rankings refresh through the hosted `/api/rankings/refresh` cron path and persist to Redis or Vercel Runtime Cache. The local equivalent is `npm run rankings:refresh`.
- The refresh resolves checklist identities to exact Oracle player IDs before requesting current signals. Snapshot/contract drift and ambiguous identity matches fail closed.
- Bundled Oracle and STS CSV files are fallback snapshots and audit artifacts, not the production write target. They retain enough lineage to explain which provider record, snapshot, model, and match produced each ranking row.
- Vercel Hobby runs one authenticated daily comp cron. On-demand player refreshes use the same durable queue, and a future worker can increase cadence without changing the data contract.

## Subscription Decisions

For the current architecture, Card Hedge and eBay are the important paid/credentialed services. Upstash Redis and Neon are infrastructure, not data subscriptions, and should stay because they reduce API spend and make the hosted app coherent across users. Fanatics Collect is active marketplace discovery but currently does not need a paid/API credential path. Market Movers can be cancelled once Card Hedge coverage and canonical classification are good enough across a few full releases. The legacy checklist feed can be cancelled once the local checklist ledger has all target releases and multipliers covered.

## Next Refactors

1. Promote the shared marketplace listing model so eBay, Fanatics Collect, COMC, and future sources use the same query/result contract.
2. Rename `/api/sales-cache` and `salesCache` internals to canonical sold model while preserving backward-compatible routes.
3. Split the case-hit lab, sealed wax page, and sales model lab into lazily loaded modules.
4. Add an admin-only operations page for export status, queue age, parser exceptions, cache hit rate, and marketplace saved calls.
5. Promote repeated manual rejects into versioned taxonomy fixtures and replay them in CI.
