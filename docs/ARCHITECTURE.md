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
  -> Card Hedge sold comps
  -> canonical SQLite sold-comp cache
  -> base-auto anchors and variation fair values
  -> live marketplace scans
     -> eBay Browse active BIN/auction scans today
     -> Fanatics Collect active fixed-price scans through public search-key access
  -> live opportunity snapshots, rejects, and cleanup feedback
```

### Keep Active

- Card Hedge: scalable recent sold comps and daily refresh inputs.
- eBay Browse: active BIN and auction discovery today.
- Fanatics Collect: active fixed-price card discovery through the public search-key + Algolia path; no account login should be stored.
- Scout the Statline snapshots: value-board ranking, trend, and coverage context.
- Local canonical SQLite cache: durable modeling layer and cleanup memory.

### Optional / Fallback

- Market Movers: validation and emergency taxonomy comparison. It should not be the default scale path.
- Legacy checklist feed: temporary checklist/multiplier fallback only. Normal page load should prefer the local checklist ledger.
- eBay sold APIs: optional future improvement if Marketplace Insights access becomes cleaner than Card Hedge.

## Runtime Data Policy

Sold comps are immutable enough to store permanently. Live listings are not.

- Canonical sold comps are stored locally and rebuilt into stable card lanes.
- Fixed-price live marketplace query pages are cached for 24 hours when the provider supports stable query reuse.
- Auction/live-bid query pages are cached briefly because bids and end times move.
- Live opportunity snapshots can be stored as observations, but every listing needs freshness metadata and should be treated as stale quickly.
- User rejects and bucket merges are cleanup signal, not throwaway UI state.

## Modeling Policy

Base auto price is the anchor. Variation pricing should prefer, in order:

1. Direct canonical sold lane for that player and variation.
2. Direct lane blended with nearby base-auto sales when sample size is thin.
3. Proximity multiple solved from variation sale / base anchor close to the sale date.
4. Release-level multiple only when player-level evidence is absent.
5. Explicit low-confidence label when none of the above is available.

The value board should use current base-auto price against rank-implied base price. Prospect ranking gets priority over MLB-only dynasty rank when both exist. MLB dynasty rank is useful for players who aged out of prospect lists.

## Scale Guardrails

- Checklist ledger is the universe; marketplace search results are evidence.
- Marketplace titles can confirm 1st status, team, grade, card lane, and listing quality, but they should not create the universe on their own.
- Every external API call should pass through a server route with caching, rate-limit accounting, and no browser-visible secrets.
- Broad scans should use cached query pages and constrained player buckets.
- Classification fixes should be encoded as parser rules or bucket overrides after repeated misses.

## Subscription Decisions

For the current architecture, Card Hedge and eBay are the important paid/credentialed services. Fanatics Collect is active marketplace discovery but currently does not need a paid/API credential path. Market Movers can be cancelled once Card Hedge coverage and canonical classification are good enough across a few full releases. The legacy checklist feed can be cancelled once the local checklist ledger has all target releases and multipliers covered.

## Next Refactors

1. Rename `ProspectPulseListing` to a neutral marketplace listing type.
2. Promote the shared marketplace listing model so eBay, Fanatics Collect, COMC, and future sources use the same query/result contract.
3. Rename `/api/sales-cache` and `salesCache` UI copy to canonical sold model.
4. Split the beta case-hit lab and sales model lab into lazily loaded modules.
5. Add a scheduled Card Hedge refresh pipeline that writes canonical rows without manual browser capture.
6. Add an admin-only source health page for cache hit rate, marketplace saved calls, and stale lanes.
