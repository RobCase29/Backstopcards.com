# Fanatics Collect Wide Scan

## Outcome

Backstop supports two distinct Fanatics paths: a user-initiated scoped search and a licensed wide feed. The scoped path requires the user to enter a player, team, or set before each search. The wide path can run a Fanatics-only, fixed-price inventory sweep from an authorized cursor-based feed. Both paths match returned Bowman cards to the loaded checklist/model universe and rank accepted listings by model edge.

This boundary is intentional. Fanatics Collect's [Terms of Use](https://support.fanaticscollect.com/en_us/terms-of-use-r11C70QTge) currently prohibit scraping, automated data mining, and systematic retrieval. No public developer API or published integration quota was found during implementation. Do not enable the adapter unless Fanatics has granted written permission or supplied a licensed feed/export that explicitly covers this use.

## What is implemented

- Independent Fanatics capability status at `/api/fanatics-collect/status`.
- Fail-closed scope validation for user-initiated search and separate authorization checks for the wide-feed path.
- A dedicated `POST /api/fanatics-collect/wide-scan` endpoint.
- Cursor pagination with page and wall-clock budgets.
- One bounded retry that honors `Retry-After` for `429` and `503` responses.
- Cursor-loop detection and explicit `complete` versus `partial` coverage.
- UUID-based deduplication without collapsing two legitimate listings of the same card.
- Source observation time and authorization provenance in every scan response.
- Image removal by default unless the authorization explicitly includes downstream image rights.
- A strict client matcher that requires an active fixed-price listing, positive ask, Bowman autograph title, year evidence, exactly one checklist player, exactly one release model, and all existing adjacent-product title guards.
- Marketplace-namespaced identities (`fanatics-collect:<listing id>`).
- Unknown shipping remains unknown instead of being represented as a known `$0` cost.
- A dedicated **Wide Fanatics sweep** action on the Live Deals page. It uses every loaded model, switches the result sort to raw dollar edge, and never calls eBay.
- A dedicated `/fanatics` discovery page where the user selects Player, Team, or Set, enters a specific scope, and receives model-ranked results. Recent scopes and player hold targets persist locally.
- Full sold-cache enrichment in batches rather than stopping at the first 160 players.

## Authorized feed contract

The user-scoped route is `POST /api/fanatics-collect/search`. Every request must include a nonblank scope:

```json
{
  "scope": { "type": "player", "value": "Aiva Arquette" },
  "queries": [],
  "limit": 40
}
```

`scope.type` must be `player`, `team`, or `set`; `scope.value` must contain 2–80 characters and cannot contain wildcard characters. Blank/unscoped requests fail before any upstream call. Responses record the scope in `provenance`, and query-shaped responses may be cached under that exact request scope. The UI derives player queries from the loaded Bowman checklist rather than accepting an unrestricted marketplace-wide request.

The licensed wide-feed path is configured separately:

Configure:

```text
FANATICS_COLLECT_AUTHORIZATION_ID=<written permission or license reference>
FANATICS_COLLECT_WIDE_SCAN_AUTHORIZED=true
FANATICS_COLLECT_AUTHORIZED_FEED_URL=https://approved.example/feed
FANATICS_COLLECT_AUTHORIZED_FEED_TOKEN=<server-side bearer token>
FANATICS_COLLECT_WIDE_MAX_PAGES=40
FANATICS_COLLECT_WIDE_TIME_BUDGET_MS=25000
FANATICS_COLLECT_IMAGE_RIGHTS_AUTHORIZED=false
FANATICS_QUERY_CACHE_FRESH_TTL_SECONDS=86400
FANATICS_QUERY_CACHE_STALE_TTL_SECONDS=259200
```

Targeted checklist searches use a two-window Redis policy: results are served
normally during the fresh window, retained through the stale window, and used
after the fresh window only when a live Fanatics refresh fails. The API labels
that response `stale-fallback`; the client surfaces the upstream failure rather
than presenting old inventory as live.

The server sends a `GET` request with these query parameters:

```text
limit=<page size>
cursor=<opaque cursor, omitted on page one>
query=Bowman
saleType=FIXED
status=active
category=baseball
```

It sends the bearer token when configured and an `X-Backstop-Authorization-Id` header on every request. The feed response must be JSON:

```json
{
  "items": [],
  "nextCursor": "opaque-next-cursor",
  "hasMore": true,
  "total": 1250,
  "observedAt": "2026-07-11T12:00:00.000Z"
}
```

`listings` or `data` can be used instead of `items`; `next_cursor`/`has_more` are also accepted. The final page must return `hasMore: false` or no next cursor. Reaching a page/time budget or repeating a cursor produces a partial scan, and the UI must not treat it as exhaustive.

Each item should supply, when licensed and available:

- a stable listing UUID/ID and Fanatics URL;
- sale type and current status;
- title, year, structured release/set, and card number;
- asking price;
- grading company/grade;
- listing/source observation timestamps;
- seller, offer, and quantity fields;
- image fields only if downstream display rights are included.

## Matching and pricing guardrails

The query or feed scope only discovers candidates; it never establishes card identity. A listing is scored only after the matcher resolves one model lane. Same-player/same-year release ambiguity is rejected unless structured release evidence resolves it. Draft, Sapphire, Mega, Sterling, Bowman's Best, inserts, digital cards, lots, paper, and other unsupported product families remain outside the normal Bowman Chrome autograph model.

Fanatics Buy Now asks have no buyer's premium, but shipping, tax, and payment costs may still vary. Because the authorized feed contract does not guarantee shipping, the normalized listing stores shipping as unknown. The displayed edge is therefore ask-versus-model, not a guaranteed delivered-cost profit.

Wide results reuse Backstop's sold-comp/fair-value engine. The preset selects **Spread** so the largest raw modeled dollar edges appear first; ROI, conviction, trust, and other existing sorts remain available. Ambiguous and rejected records contribute to scan diagnostics but never enter the ranked deal list.

## Operating rules

1. Written permission must cover automated systematic retrieval, derived price scoring, retention, display, refresh cadence, allowed fields, and image use.
2. Keep credentials server-side. Never use a Fanatics account session or browser cookies.
3. Set page/time limits no higher than the licensed quota permits.
4. Treat `401`, `403`, schema failures, cursor loops, or repeated `429` responses as a stop condition.
5. A partial run must never imply that unseen prior listings ended.
6. Keep fixed-price, auction, and sold records in separate lanes. Fanatics auctions require a 20% buyer's premium and extended-bidding logic and are deliberately out of scope for this first wide-scan implementation.

## Acceptance checklist

- Disabled environments perform no Fanatics upstream request.
- Fanatics-only wide scan performs no eBay request.
- Duplicate UUIDs collapse; distinct UUIDs for the same card remain distinct.
- Wrong-year, wrong-player, ambiguous-release, non-auto, non-fixed, inactive, and unsupported-product records do not score.
- Complete and partial coverage are distinguishable in the API response.
- The globally highest dollar edge is ranked before presentation limits are applied.
- Relevant unit, server, lint, type, and production-build checks pass.

## Next step after permission

Replace the generic feed URL contract with Fanatics' supplied schema/authentication details, record their quota and retention terms beside the authorization reference, run a small read-only certification sweep, review matcher diagnostics, and only then raise page/cadence limits.
