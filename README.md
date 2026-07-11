# Backstop Card Finder

Local price atlas for Bowman 1st auto cards. The app turns checklist data into a player x variation model using a recency-weighted base price, set-level variation multiples, and Formulated Consensus dynasty context, then can scan active marketplace listings and rank them against the model by raw dollar edge.

## Run

```bash
npm install
npm run dev
```

The app opens directly into the Backstop workflow: find underpriced players, price a card, and scan active BINs/auctions against the current model. The current source-of-truth path is official Bowman checklists + Wax Pack Hero 1st Bowman evidence + Card Hedge/local sold comps; eBay is the default active-listing layer, while Fanatics Collect is available only through explicitly authorized search/feed access.

## Product Navigation

The public workflow has three primary jobs:

- `/` — **Value Board**: the default Top 25 rank-to-price gaps, with player search and universal set/team filters.
- `/deals` — **Live Deals**: a recommended Top 25 scan first, followed by optional custom scans for a player, parallel, set, or price rule.
- `/price` — **Price a Card**: player, parallel, grade, and all-in price calculator.

Case hits, sealed wax, and system health live at `/case-hits`, `/sealed-wax`, and `/health`. Teams are facets of the same player universe rather than separate product areas; the legacy `/teams/marlins` route remains available for backward compatibility but is not part of primary navigation.

Use Node 22.13+ locally. This repo includes `.nvmrc` set to Node 22 to match Vercel.

For the current source-of-truth spec, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Run the full local guardrail pass with:

```bash
npm run check
```

## Current Architecture

The scale path should stay intentionally simple:

```text
Official checklists + Wax Pack Hero 1st lists
  -> checklist universe and card lanes
  -> Card Hedge sold comps + hosted canonical comp cache
  -> base-auto anchors and variation fair values
  -> live marketplace scans (eBay BINs/auctions; authorized Fanatics Collect feed)
  -> opportunity board, live chart, reject/cleanup loop
```

Card Hedge and the canonical comp cache are the pricing core. Production models live in Neon and refresh independently of deployments; the local SQLite database is an offline research and taxonomy workbench. Live marketplace providers only answer "what is active right now?" and raw query pages/snapshots are cached before scoring so multiple users do not repeat the same external calls. eBay Browse powers active BINs and auctions. Fanatics Collect requires a user-entered player, team, or set for targeted searches; marketplace-wide retrieval remains disabled unless a written authorization reference and approved data path are configured. The legacy checklist feed is no longer part of normal startup when local checklist data exists.

Subscription read: keep Card Hedge and eBay active. Market Movers is now a validation/taxonomy backup unless Card Hedge coverage proves weaker than expected. Fanatics Collect wide retrieval requires written data-access permission or a licensed export/feed; user-entered scoped searches are handled separately. The legacy checklist feed can be cancelled after local checklists and multipliers cover the releases you care about.

## Hosted Storage

The production scale layer uses two small managed stores:

- **Upstash Redis**: shared 24-hour cache for marketplace query pages and daily ranking refreshes. This protects eBay/Fanatics request budgets when multiple users scan the same player, set, or variation.
- **Neon Postgres**: durable sold comps, modeled player lanes, refresh queues and run telemetry, plus expiring live-market snapshots. Active listings and immutable sold evidence remain separate by design.

Production comp freshness is a two-speed pipeline: the Card Hedge Elite daily export bulk-loads eligible Bowman base-auto sales once per UTC day, while targeted Card Hedge search/comps calls repair identity gaps and user-requested players immediately. Known Card Hedge card IDs skip repeat searches. See [`docs/HOSTED_COMPS_RUNBOOK.md`](docs/HOSTED_COMPS_RUNBOOK.md) for the freshness contract, safety rules, and recovery flow.

Local development still falls back to the ignored SQLite files in `local-data/`. Production should set these Vercel environment variables:

```bash
DATABASE_URL=your_neon_connection_string
UPSTASH_REDIS_REST_URL=your_upstash_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
CRON_SECRET=your_long_random_cron_secret
```

If Vercel provisions the Redis integration with KV-compatible names, `KV_REST_API_URL` and `KV_REST_API_TOKEN` are accepted as aliases. Keep all of these server-side only.

## Consensus Rankings

Dynasty context is refreshed from Scout the Statline's Formulated Consensus endpoint. The app pulls hitters and pitchers separately, always includes low-coverage rows, then normalizes them into one combined ranking layer for lookup, BIN targeting, and dynasty-value sorting.

Refresh the local ranking snapshots with:

```bash
npm run rankings:refresh
```

The generated snapshots are:

- `src/data/sts_formulated_consensus_hitters.csv`
- `src/data/sts_formulated_consensus_pitchers.csv`

Production rankings refresh through Vercel Cron at `/api/rankings/refresh`, which writes to the runtime cache instead of the read-only deployment filesystem. The bundled CSV files are fallback snapshots for local development and outage recovery.

## Legacy Checklist Feed (Fallback Only)

The app can still use the older private checklist feed as a server-side fallback while the local checklist ledger and Card Hedge comp cache become the scale backbone. Normal page load now asks the local checklist ledger first. Do not put third-party passwords in this repo.

If a release is missing from the local ledger, create `.env.local` from `.env.example` and set:

```bash
PROSPECTPULSE_ACCESS_TOKEN=your_legacy_feed_access_token
```

The token stays server-side in the Vite dev proxy. For a longer-lived private deployment, set the server-managed login variables instead:

```bash
PROSPECTPULSE_EMAIL=your_account_email
PROSPECTPULSE_PASSWORD=your_account_password
```

When either server-managed option is present, every approved browser uses the same server-side connection. There is intentionally no public in-app login form for this fallback path.

For a private deployment, set any legacy feed credential in the host's server environment and protect the site with an invite-only gate such as Cloudflare Access, Vercel password protection/auth middleware, or Google Workspace sign-in. Do not commit `.env.local`, third-party passwords, or live tokens.

## Private Web Access

The repo now includes a Vercel access gate for the hosted app. Every route, static asset, and API endpoint is blocked until the visitor enters the shared invite code. Successful access sets a signed, HttpOnly, Secure, SameSite=Lax cookie for seven days.

Set these Vercel environment variables before sharing a deployment:

```bash
APP_ACCESS_CODE=long_random_code_you_give_to_friends
APP_SESSION_SECRET=separate_long_random_cookie_signing_secret
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_ENV=production
EBAY_MARKETPLACE_ID=EBAY_US
CARD_HEDGE_API_KEY=your_card_hedge_api_key
CRON_SECRET=your_long_random_cron_secret
DATABASE_URL=your_neon_connection_string
UPSTASH_REDIS_REST_URL=your_upstash_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
```

Legacy checklist-feed credentials can also be set server-side when needed: `PROSPECTPULSE_ACCESS_TOKEN`, or `PROSPECTPULSE_EMAIL` plus `PROSPECTPULSE_PASSWORD`.

If `APP_ACCESS_CODE` or `APP_SESSION_SECRET` is missing, the middleware returns a locked configuration message instead of serving the app. For a tighter friend-by-friend model later, replace the shared code with Vercel Deployment Protection, Cloudflare Access, or a small user table with per-user codes and revocation.

## Security Notes

Treat the API proxy as private infrastructure. It holds Card Hedge, eBay, and optional legacy-feed credentials server-side, so the site should not be reachable without an access gate.

Minimum safe setup before sharing:

1. Keep `.env.local` local only. It is ignored by git via `*.local`.
2. Put any hosted version behind the included Vercel access gate, Cloudflare Access, Tailscale, Vercel Deployment Protection, or another invite-only gate before sharing the URL.
3. Do not expose `npm run dev` directly to the public internet. Use a private tunnel/access layer for local sharing, or deploy with an equivalent server-side API/proxy layer.
4. Keep Card Hedge, eBay, and optional legacy-feed tokens in server environment variables only. Never place them in `VITE_` variables or client code.
5. Rotate any credential that was pasted into chat, screenshots, logs, or a public issue tracker.

The local and hosted API proxies reject cross-origin POSTs, oversized JSON bodies, unknown legacy-feed function routes, and non-Bowman eBay queries to reduce accidental token/API-quota exposure.

## eBay BIN Radar

The BIN Deal Radar can scan one loaded checklist or every loaded checklist. It builds eBay Browse API queries from the selected player bucket, fetches active fixed-price listings, maps each item into the app's listing model, rejects player-title mismatches, excludes adjacent products such as Sapphire/Mega/Sterling/Inception/Paper/Power Chords from regular Bowman model matching, then ranks positive opportunities by:

```text
modeled variation price - all-in BIN price
```

The radar can scan the full checklist, focus on a specific player name, focus on a variation/parallel term such as `packfractor`, `gold shimmer`, or `red lava`, or use the `Target 50` bucket. `Target 50` scores the best players to hunt using modeled base-auto price, consensus rank, prospect rank, source coverage, and current market quality.

To enable live scans, create `.env.local` from `.env.example` and set:

```bash
EBAY_CLIENT_ID=your_app_client_id
EBAY_CLIENT_SECRET=your_app_client_secret
EBAY_ENV=production
EBAY_MARKETPLACE_ID=EBAY_US
```

Restart `npm run dev` after adding credentials. Optional fields:

```bash
EBAY_ZIP_CODE=10001
EBAY_CATEGORY_ID=
EBAY_QUERY_CACHE_ENABLED=true
EBAY_BIN_QUERY_CACHE_TTL_SECONDS=86400
EBAY_AUCTION_QUERY_CACHE_TTL_SECONDS=600
```

`EBAY_ZIP_CODE` improves shipping context. `EBAY_CATEGORY_ID` can narrow search once you choose the correct eBay leaf category for trading cards.

The `/api/ebay/search` proxy caches raw eBay query pages before the app maps and scores them. Fixed-price Browse pages default to 24 hours, so if one visitor scans `Aiva Arquette 2026 Bowman Chrome 1st auto`, the next visitor reuses that page instead of spending another eBay request. Auction pages default to 10 minutes because current bids and end times go stale quickly. The deployed site uses Upstash Redis first, then Vercel Runtime Cache if available, and finally the local SQLite cache in development. Scan stats report live pages versus cached pages so rate-limit savings are visible.

## Fanatics Collect Wide Scan (Authorized Data Only)

The dedicated `/fanatics` page turns a user-entered player, team, or set into a clean Bowman prospect-auto deal board. Each scoped search is bounded, cached with provenance, matched against loaded checklists, and ranked against model. The page also provides value bands, raw/graded and max-price filters, deal sorts, recent scopes, and persistent personal hold targets. The Deals page retains a separate Fanatics-only wide-feed action that stays disabled until an approved cursor feed is configured.

See [the Fanatics wide-scan plan and feed contract](docs/FANATICS_COLLECT_WIDE_SCAN.md) for configuration, legal/operational guardrails, response schema, matching rules, and acceptance criteria.

## eBay Sold Access (Optional)

The app now prefers Card Hedge and the local canonical comp cache for sold-comp modeling. The eBay sold route remains as an optional future path if Marketplace Insights access is enabled. It uses the 2026 Bowman checklist as the guardrail, requests sold items through the local `/api/ebay/sold` proxy, then:

1. Rejects paper, digital, redeemed, insert, and wrong-player sold rows.
2. Classifies sold titles into base auto or a known release variation.
3. Builds each player's base anchor from recent base sold comps using the same time-weighted logic as the main matrix.
4. Solves release-level variation multiples from `variation sold price / modeled base price`.
5. Returns a `ChecklistModel` overlay with `source: ebay-sold-model`, so it can plug into the same matrix/scoring pipeline.

Sold-listing data depends on eBay Marketplace Insights access. The local proxy targets:

```text
/buy/marketplace_insights/v1_beta/item_sales/search
```

If eBay grants Marketplace Insights with a different OAuth scope, set this optional value in `.env.local`:

```bash
EBAY_MARKETPLACE_INSIGHTS_SCOPE=
```

The regular Browse API still powers active BIN/auction discovery. Card Hedge/local canonical comps are the intended pricing core unless eBay sold-comps access proves cleaner at scale.

## Local Sales Cache

Market Movers sold rows can be imported into a local SQLite cache so immutable comps do not need to be re-pulled every refresh. Raw scrape files, the SQLite database, and generated summaries live under `local-data/`, which is ignored by Git.

```bash
npm run sales:import:market-movers -- local-data/market-movers/aiva-arquette-bowman-2026-06-23.raw.json
```

For the normal scale workflow, drop any fresh `*.raw.json` Market Movers pulls into `local-data/market-movers/` and run:

```bash
npm run sales:sync
npm run sales:doctor
```

`sales:sync` sweeps the folder, upserts rows by item ID, re-normalizes cached rows with the latest title parser, preserves manual sale flags and bucket merges, and rebuilds each affected player's model from the full cached history instead of only the newest pull. This is the path to importing every player over time without losing older comps.

`sales:doctor` reports cache health: raw rows, modeled players, latest sold date, reviewed/flagged rows, bucket overrides, missing base-auto anchors, and fresh live-market buy dots.

Fresh BIN/auction scans are also cached as short-lived live-market snapshots. Production writes them to Neon; local development uses SQLite. They hydrate the Live Market Map after reloads, but expire automatically so stale active listings do not contaminate permanent sold-comp models.

## Official Checklist Ledger

The scale model starts from the official Bowman checklist, not from whatever a marketplace search happens to return. The checklist ledger stores the release, every official card row, player-level chase signals, reusable variation templates, and the generated player x variation universe that Card Hedge, eBay, and manual cleanup can attach to later.

Import the 2026 Bowman workbook with:

```bash
npm run checklist:import:2026
```

That command reads `/Users/rc3/Downloads/2026-Bowman-Baseball-Checklist.xlsx`, upserts the official cards, seeds the 2026 variation template catalog, rebuilds the modelable universe, scans already-cached comp titles for `1st Bowman` evidence, and seeds the canonical refresh queue. It also writes a checkpoint report to:

```text
local-data/checklists/2026-bowman-checklist-ledger.json
```

Important modeling rule: the official checklist is the source of truth for what exists, while cached sales/listings are the source of truth for chase status. Because the workbook does not cleanly separate 1st Bowman players from non-1st players, the app infers `confirmed_1st`, `likely_1st`, `non_1st`, or `unknown` from Card Hedge, Market Movers, and future eBay titles. Unknown players stay in the universe, but confirmed 1st autos get queue priority.

Wax Pack Hero's First Bowman release lists are wired in as a high-confidence chase-status source. Refresh 2026 1st Bowman evidence with:

```bash
npm run checklist:firsts:2026
```

That command fetches the 2026 Wax Pack Hero page, parses the `BP-*` 1st Bowman player list, records it as `wax-pack-hero-firstbowman` evidence, rebuilds the generated universe, and reseeds the comp-refresh queue so confirmed 1sts float to the top. Marketplace/Card Hedge/Market Movers title evidence remains useful as backup and for catching edge cases.

Use this when taxonomy rules change or a new checklist file arrives:

```bash
npm run checklist:import:2026
npm run checklist:firsts:2026
npm run canonical:rebuild
npm run sales:doctor
```

`sales:doctor` reports checklist health, including official card count, generated universe rows, first-status coverage, and queued comp-refresh players.

The ledger is also inspectable through the local/private API:

```text
/api/checklist/status
/api/checklist/universe?player=Aiva%20Arquette&cardClass=auto&limit=20
```

Universe rows are returned least scarce to most scarce within the chase category, so a player auto ladder starts at Base Auto and walks toward the rarer parallels.

## Card Hedge API

Card Hedge is wired as the preferred server-side data source for scalable recent comps and price refreshes. Keep the API key server-only in `.env.local` or the deployment host:

```bash
CARD_HEDGE_API_KEY=your_card_hedge_api_key
CARD_HEDGE_PLAN=elite
CARD_HEDGE_RATE_LIMIT_PER_MINUTE=80
CARD_HEDGE_DAILY_LIMIT=200000
```

The server proxy exposes only app-safe routes under `/api/card-hedge/*`, tracks provider usage, and never returns the API key to the browser. Production ingests the Elite daily price export into Neon and uses direct search/comps calls only for targeted recovery. The bundled queue and lane seeds keep first deploys readable before the first hosted sync.

For local research, Elite accounts can also cache the daily price export locally:

```bash
npm run card-hedge:daily-export -- --date=2026-06-24
```

Exports stream into `local-data/card-hedge/daily/` with a sidecar metadata file. The hosted equivalent runs once per UTC day: export first, strict checklist/player/taxonomy filtering, item-level Neon upserts, affected-lane recomputation, then targeted `/comps` and `/card-search` repair for remaining gaps.

For targeted player work, use Card Hedge search plus comps. This writes native Card Hedge source tables and still mirrors the same comp rows into the older sales/model cache for compatibility:

```bash
npm run card-hedge:sync-player -- --player "Aiva Arquette" --year 2026 --grades Raw --count 100
```

When native Card Hedge rows exist, `npm run canonical:rebuild` reads those rows directly and suppresses the mirrored `card-hedge-comps` rows so the same sale is not counted twice. This is the preferred scale path: Card Hedge native comps -> Bowman taxonomy parser -> canonical card ledger -> pricing/deal model.

Run the controlled 2026 pilot before widening the pull:

```bash
npm run card-hedge:pilot-2026 -- --dry-run
npm run card-hedge:pilot-2026 -- --rpm 80 --grades Raw --count 100 --max-cards 120
```

When a title parser or taxonomy rule improves, reclassify cached Card Hedge rows locally without spending API calls:

```bash
npm run card-hedge:sync-player -- --player "Aiva Arquette" --year 2026 --reclassify-only
```

`sales:doctor` reports Card Hedge cards/sales, source breakdown, canonical coverage, and whether cached Card Hedge rows are ready for local reclassification. Market Movers remains useful as a secondary validation surface, but Card Hedge is the faster path we should build around if the comp coverage proves equivalent.

Market Movers card-search and detail-panel captures can also be imported as structured 365-day card snapshots. Use the structured Market Movers capture helper from the app/library on a logged-in Market Movers page after selecting the desired card and time window, save the clipboard JSON as `*.structured.json` under `local-data/market-movers/`, then run:

```bash
npm run sales:sync:structured
```

Structured captures populate card records, latest card metrics, and daily completed-sale aggregates. This complements raw sold rows: the raw cache remains best for item-level modeling, while the structured cache gives fast charting and Market Movers' own taxonomy for the last 365 days.

Canonical comp models now sit underneath both import paths. Run:

```bash
npm run canonical:rebuild
```

to rebuild the normalized card ledger from everything already cached, or use the full one-command refresh:

```bash
npm run sales:refresh
```

The canonical layer creates stable card identities across item-level sales, Market Movers card snapshots, manual bucket merges, and future eBay sold/listing feeds. It stores one row per canonical card/grade, daily chart prices, and summary metrics such as median, recent 3/5 average, 30/90-day time-weighted models, auction/BIN counts, and latest comp date. This is the intended scale path for recent comps across every checklist player and variation.

To work through the 2026 Bowman checklist at scale, start from the official checklist ledger, generate the next Market Movers batch only when you need browser-assisted validation, then import and sync queue status:

```bash
npm run checklist:import:2026
npm run comps:batch:market-movers -- --limit=8
npm run sales:refresh
npm run comps:queue:sync
```

The batch command writes a JSON manifest and a simple local HTML link sheet under `local-data/queues/`. It does not mark players complete until actual Market Movers raw or structured captures are imported into the database, so the queue can pause and resume safely.

The importer writes:

- `local-data/backstop-sales.sqlite`
- `*.model-summary.json`
- `*.model-buckets.csv`
- durable per-player `*.cache-summary.json`
- durable per-player `*.cache-buckets.csv`

Rows are deduped by item ID, normalized into card buckets, and separated into model-eligible single cards versus noise such as lots, redeemed cards, player mismatches, and in-person autos.

## Legacy Checklist Feed Fallback

The older private checklist feed is still wired as an optional fallback for older release multiplier/base-price data, but it is no longer the source of truth for scale work. New work should start with:

```bash
npm run checklist:import:2026
npm run checklist:firsts:2026
npm run card-hedge:pilot-2026 -- --dry-run
npm run canonical:rebuild
npm run sales:doctor
```

Primary modeled-price inputs now come from:

1. Official Bowman checklist rows, including generated player x variation universe rows
2. Wax Pack Hero 1st Bowman release lists as high-confidence chase evidence
3. Card Hedge/native comp rows and local canonical sold-comp summaries
4. Manual cleanup flags and bucket merges for taxonomy fixes
5. Active eBay Browse listings as the downstream deal comparison layer

The old feed can still fill temporary gaps while Card Hedge coverage and local comps are being expanded, but anything new should be designed around the checklist ledger and canonical comp model.

## Data Import

Import `.json` arrays or `.csv` files with columns such as:

```csv
player,price,market_price,variation,release,listing_url,bid_count,end_time
Eli Willits,285,455,Blue /150,2026 Bowman Chrome,https://example.com,0,
```

## Scoring

The board opens on the most underpriced decision-ready players: rank-implied base value is compared with the current sold-comp base, then tempered by model quality and ranking coverage. Search, team, set, model-quality, and rank filters can narrow that board without changing the underlying price evidence. Consensus-powered sorts include overall rank, prospect/MLB rank, dynasty score, value score, momentum, and BIN target score. Export writes the long-form valuation ladder with price source, sale depth, ranking context, and deal-target fields.

The live BIN radar ranks fetched listings by raw dollar spread, but it is now downstream of the model. Unsupported players, wrong-set matches, and adjacent product families are excluded instead of being modeled from broad search noise.

Known ended or sold listings are excluded from ranking by default. eBay Browse search should return active purchasable inventory; the local scorer still treats any listing with an expired `end_time` as ended.
