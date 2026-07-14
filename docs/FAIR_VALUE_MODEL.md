# Fair Value Model

Backstop fair value is a versioned evidence hierarchy. It is not the latest
sale, an asking-price average, or one universal parallel multiple. The same
model rail powers the calculator, value board, live scanner, and market chart.

## Current Contract

Model version: `backstop-fv-v3`

For 2026 Bowman Chrome Prospect Autos, the official release taxonomy defines
lane identity, serial denominator, scarcity order, and the structural starting
curve. Sold evidence may refine an official lane; it may not invent one.

### Base Auto

The base auto is the player-specific market anchor. Weekly walk-forward tuning
selected this policy:

- the ten most recent eligible sales;
- a ten-day half-life in log-price space;
- channel-aware weighting (`auction > BIN > unknown`);
- median/MAD outlier resistance;
- a guarded trend adjustment that activates only with adequate depth and span;
- a prediction interval and an explicit effective sample size.

On the untouched June 20-27 holdout, this reduced weekly-center median absolute
percentage error from `19.1%` to `16.2%`, reduced mean absolute log error from
`0.218` to `0.177`, and placed `97.5%` of player-week estimates within 50% of
the realized center versus `86.4%` for the prior 45-day unlimited window.

### Variation Lanes

Variation prices are blended in log space:

1. **Structural prior** - official parallel identity, scarcity, and print-run
   logic.
2. **Release proximity ratios** - each player's variation sales divided by
   that player's nearby base-auto market, collapsed to one vote per player.
3. **Player proximity ratios** - the player's own lane/base relationship.
4. **Direct lane comps** - up to ten recent sales, used as a bounded refinement.

The production weights, caps, 28-day ratio half-life, and 20% weighted-median
stabilizer were selected with four weekly tuning folds and checked on a held-out
week. A more complex price-elasticity curve and an ensemble were tested and
rejected because they did not improve holdout error consistently.

Raw, graded, hand-signed, paper, adjacent products, and non-auto cards remain
separate evidence domains. A listing must map to one canonical lane before it
can receive a model value.

## Evidence Contract

Every release lane carries a point estimate, expected range, confidence, and
one of three evidence tiers:

- **Market-backed** (`observed`) - deep coherent empirical evidence.
- **Modeled** - useful market evidence anchored by the structural curve.
- **Indicative** - structural prior or very thin evidence; calculator display
  only and excluded from high-conviction deal ranking.

Confidence is not a substitute for the range. Sparse or volatile lanes receive
wider ranges and hard confidence ceilings. The best estimate and whether it is
safe to act on are deliberately separate decisions.

### Decision Policy

The calculator may display every canonical lane, including an indicative
estimate, so the user can orient around scarcity. The deal engine is stricter:

- a base anchor must be reproducible from current raw sales or a sufficiently
  deep variation-implied estimate;
- an exact or blended variation must clear the model-confidence threshold;
- indicative lanes are capped at 42% confidence and cannot produce an A, A+,
  Buy Now, or Make Offer signal;
- thin legacy summaries remain visible as context but never masquerade as
  current market evidence.

This separates **what the card may be worth** from **whether Backstop has enough
evidence to recommend acting on that value**.

## Source Isolation

The hosted comp store persists raw transactions, third-party comp summaries,
third-party FMV, and Backstop fair value in separate fields. Only a value
tagged with the current `backstop-fv-v3` version may replace the matrix anchor.
When raw transactions are present, the app reproduces the v3 estimate from
those sales before applying it. Unversioned legacy cache points are ignored.

Card Hedge comp and FMV values remain useful corroborating evidence, but they
cannot overwrite the canonical model. This prevents the board, calculator,
scanner, and selected-player view from drifting because they loaded different
cache shapes.

## Safeguards

- Base Auto is exactly `1x` and market-backed.
- Every official 2026 Bowman auto lane exists exactly once.
- Normalized player and release lanes cannot be duplicated.
- Sparse evidence is shrunk toward the official structural curve.
- Release adjustments are bounded relative to structural priors.
- Calculator and scanner use the same player-lane blending function.
- Indicative lanes cannot be actionable and cannot exceed 42% confidence.
- Every point estimate must sit inside its generated valuation interval.
- Generated snapshots carry the model version and fail audit when invariants
  drift.

## Validation

`npm run model:backtest` runs seven weekly walk-forward folds. Every prediction
uses only sales available before its cutoff. It reports base and variation
accuracy separately, uses player-week or player-lane-week medians so repeated
sales cannot dominate a score, and breaks variation performance out by evidence
tier.

`npm run model:research` is the slower parameter study. It keeps tuning folds,
an untouched test fold, and later forward folds separate. Research output is
diagnostic; production constants change only when the held-out result supports
them.

These metrics cannot rescue a misclassified card. Taxonomy, provenance,
deduplication, and quarantine happen before fitting.

Current seven-fold walk-forward results on the canonical 2026 Bowman raw-auto
market:

- base-auto median absolute percentage error: `14.6%` (legacy: `18.2%`);
- base-auto estimates within 50% of the future weekly center: `94.5%`
  (legacy: `85.5%`);
- variation median absolute percentage error: `24.8%` (structural prior only:
  `28.9%`);
- variation estimates within 50%: `83.9%` (structural prior only: `79.0%`).

Prediction intervals include irreducible market process noise, not only the
sampling error of the mean. This prevents deep but volatile lanes from showing
an unrealistically narrow range.

## Release Workflow

Run this sequence whenever canonical sales or taxonomy rules change:

```bash
npm run canonical:rebuild
npm run checklist:static-snapshot
npm run model:audit
npm run model:backtest
npm run check
```

`model:audit` is the hard invariant gate. `model:backtest` is the predictive
quality gate and must be compared with the previous release before deployment.

## Known Boundary

Some upstream evidence exposes only a coarse release label. When one player has
cards in multiple same-year Bowman families, family identity must come from the
canonical card lane or title classifier. The durable fix is an immutable
release ID on every sale, not another layer of fuzzy title heuristics.
