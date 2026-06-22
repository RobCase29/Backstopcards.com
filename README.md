# Backstop Card Finder

Local price atlas for Bowman 1st auto cards. The app turns ProspectPulse checklist data into a player x variation model using a recency-weighted base price, set-level variation multiples, and Scout the Statline rank/trend context, then can scan active eBay Buy It Now listings and rank them against the model by raw dollar edge.

## Run

```bash
npm install
npm run dev
```

The app opens directly into the checklist price atlas. If a ProspectPulse session or token is available, it loads player-level base data; otherwise it can still show public set multiplier curves where available.

Use Node 22.13+ locally. This repo includes `.nvmrc` set to Node 22 to match Vercel.

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

The token stays server-side in the Vite dev proxy. For a longer-lived private deployment, set the server-managed login variables instead:

```bash
PROSPECTPULSE_EMAIL=your_account_email
PROSPECTPULSE_PASSWORD=your_account_password
```

When either server-managed option is present, the app treats ProspectPulse as a managed connection: the UI shows `ProspectPulse managed`, every approved browser uses the same server-side connection, and the local disconnect button is hidden because users do not own that session.

For a private deployment, set `PROSPECTPULSE_ACCESS_TOKEN` in the host's server environment and protect the site with an invite-only gate such as Cloudflare Access, Vercel password protection/auth middleware, or Google Workspace sign-in. Do not commit `.env.local`, ProspectPulse passwords, or live tokens.

## Private Web Access

The repo now includes a Vercel access gate for the hosted app. Every route, static asset, and API endpoint is blocked until the visitor enters the shared invite code. Successful access sets a signed, HttpOnly, Secure, SameSite=Lax cookie for seven days.

Set these Vercel environment variables before sharing a deployment:

```bash
APP_ACCESS_CODE=long_random_code_you_give_to_friends
APP_SESSION_SECRET=separate_long_random_cookie_signing_secret
PROSPECTPULSE_ACCESS_TOKEN=your_server_side_prospectpulse_token
# Or use PROSPECTPULSE_EMAIL and PROSPECTPULSE_PASSWORD for server-managed login
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_ENV=production
EBAY_MARKETPLACE_ID=EBAY_US
```

If `APP_ACCESS_CODE` or `APP_SESSION_SECRET` is missing, the middleware returns a locked configuration message instead of serving the app. For a tighter friend-by-friend model later, replace the shared code with Vercel Deployment Protection, Cloudflare Access, or a small user table with per-user codes and revocation.

## Security Notes

Treat the API proxy as private infrastructure. It holds the ProspectPulse and eBay credentials server-side, so the site should not be reachable without an access gate.

Minimum safe setup before sharing:

1. Keep `.env.local` local only. It is ignored by git via `*.local`.
2. Put any hosted version behind the included Vercel access gate, Cloudflare Access, Tailscale, Vercel Deployment Protection, or another invite-only gate before sharing the URL.
3. Do not expose `npm run dev` directly to the public internet. Use a private tunnel/access layer for local sharing, or deploy with an equivalent server-side API/proxy layer.
4. Keep ProspectPulse and eBay tokens in server environment variables only. Never place them in `VITE_` variables or client code.
5. Rotate any credential that was pasted into chat, screenshots, logs, or a public issue tracker.

The local and hosted API proxies reject cross-origin POSTs, oversized JSON bodies, unknown ProspectPulse function routes, and non-Bowman eBay queries to reduce accidental token/API-quota exposure.

## eBay BIN Radar

The BIN Deal Radar can scan one loaded checklist or every loaded checklist. It builds eBay Browse API queries from the selected player bucket, fetches active fixed-price listings, maps each item into the app's listing model, rejects player-title mismatches, excludes adjacent products such as Sapphire/Mega/Sterling/Inception/Paper/Power Chords from regular Bowman model matching, then ranks positive opportunities by:

```text
modeled variation price - all-in BIN price
```

The radar can scan the full checklist, focus on a specific player name, focus on a variation/parallel term such as `packfractor`, `gold shimmer`, or `red lava`, or use the `Target 50` bucket. `Target 50` scores the best players to hunt using modeled base-auto price, STS overall rank, STS prospect rank, and 3/7/14/30-day STS rank movement.

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
```

`EBAY_ZIP_CODE` improves shipping context. `EBAY_CATEGORY_ID` can narrow search once you choose the correct eBay leaf category for trading cards.

## eBay Sold Model Lab

The eBay Sold Model Lab is the first pass at replacing ProspectPulse valuation math with our own sold-comp infrastructure. It uses the 2026 Bowman checklist as the guardrail, requests sold items through the local `/api/ebay/sold` proxy, then:

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

The regular Browse API still powers active BIN discovery; the sold model is intended to become the pricing core once sold-comps access is confirmed.

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

When player-level checklist data is available, the board expands every checklist player across every set variation. The leaderboard is ranked by modeled base auto value, and each selected player exposes a complete multiplier valuation ladder. The lookup is model-first; live eBay/BIN discovery is a downstream comparison layer against that pricing core.

Authenticated checklist coverage should show the combined player count as `loaded / total` in the Model Load panel. Public ProspectPulse overview can provide set multiplier curves before authenticated player bases are loaded.

## Data Import

Import `.json` arrays or `.csv` files with columns such as:

```csv
player,price,market_price,variation,release,listing_url,bid_count,end_time
Eli Willits,285,455,Blue /150,2026 Bowman Chrome,https://example.com,0,
```

## Scoring

The board is sorted by modeled base auto value by default and includes database-style search, set/category/source/STS filters, and sort controls. STS-powered sorts include overall rank, prospect rank, dynasty score, momentum, riser value, and BIN target score. Export writes the full long-form valuation ladder to CSV, including base source, confidence, 30/90-day sale counts, STS ranks, STS trends, and BIN target score.

The live BIN radar ranks fetched listings by raw dollar spread, but it is now downstream of the model. Unsupported players, wrong-set matches, and adjacent product families are excluded instead of being modeled from broad search noise.

Known ended or sold listings are excluded from ranking by default. eBay Browse search should return active purchasable inventory; the local scorer still treats any listing with an expired `end_time` as ended.
