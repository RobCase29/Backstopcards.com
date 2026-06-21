# Bowman Trader

Local price atlas for Bowman 1st auto cards. The app turns ProspectPulse checklist data into a player x variation model using a recency-weighted base price and the set-level variation multiples. Live BIN listings can come back later as a separate comparison layer against that model.

## Run

```bash
npm install
npm run dev
```

The app opens directly into the checklist price atlas. If a ProspectPulse session or token is available, it loads player-level base data; otherwise it can still show public set multiplier curves where available.

Use Node 20.19+, 22.13+, or 24+. This repo includes `.nvmrc` set to Node 24.

Run the full local guardrail pass with:

```bash
npm run check
```

## ProspectPulse Connection

Do not put your ProspectPulse password in this repo.

Option A: use the in-app ProspectPulse form. The local dev proxy exchanges your email/password for a Supabase session and stores only the session in browser local storage.

Option B: create `.env.local` from `.env.example` and set:

```bash
PROSPECTPULSE_ACCESS_TOKEN=your_supabase_access_token
```

The token stays server-side in the Vite dev proxy.

## Checklist Model

The modeled universe is discovered from ProspectPulse and capped at 2021+ for speed:

- Bowman: `2021-Bowman` through current
- Bowman Chrome: `2021-Bowman-Chrome` through current
- Bowman Draft: `2021-Bowman-Draft` through current

It calls ProspectPulse `api-checklists` for each supported set:

- `getCategoryOverview` for Bowman, Bowman Chrome, and Bowman Draft
- `getCategoryYearMultipliers` with the set category and year
- `getChecklistPlayers` with the set release when authenticated

Modeled-price inputs:

1. Raw dated base sales, when ProspectPulse provides them
2. A recency-weighted robust base model: 30-day weighted when samples are healthy, 30/90-day blend when samples are thin
3. ProspectPulse player base TWMA as the fallback when raw base sales are unavailable
4. The selected release's variation multiplier
5. Modeled value = modeled base x release multiplier

When player-level checklist data is available, the board expands every checklist player across every set variation. The leaderboard is ranked by modeled base auto value, and each selected player exposes a complete multiplier valuation ladder. The lookup is model-first; eBay/BIN discovery can be layered on later without changing the pricing core.

Authenticated checklist coverage should show the combined player count as `loaded / total` in the Variation Model panel. Public ProspectPulse overview currently reports 87 total players for 2026 Bowman and 102 total players for 2025 Bowman Draft.

## Data Import

Import `.json` arrays or `.csv` files with columns such as:

```csv
player,price,market_price,variation,release,listing_url,bid_count,end_time
Eli Willits,285,455,Blue /150,2026 Bowman Chrome,https://example.com,0,
```

## Scoring

The board is sorted by modeled base auto value by default and includes database-style search, set/category/source filters, and sort controls. Export writes the full long-form valuation ladder to CSV, including base source, confidence, and 30/90-day sale counts.

The optional live BIN overlay still ranks fetched listings by raw dollar spread, but it is now downstream of the model. Unsupported players and wrong-set matches are excluded instead of being modeled from broad ProspectPulse noise.

Deep refresh is the default. It requests active BIN price bands in parallel, emits partial band results while checklist coverage continues, uses short-lived API response caching, then finishes with a full checklist-player coverage pass.

Known ended or sold listings are excluded from ranking by default. A listing with an expired `end_time` is treated as ended even if it came through the BIN feed. Availability still needs final confirmation on eBay because ProspectPulse can occasionally surface stale links without enough metadata to identify them locally.
