# Fair Value Model

Backstop fair value is a versioned evidence hierarchy, not a direct copy of the
latest sale and not a single universal parallel multiple. The same fair-value
rail must power the calculator, player board, BIN scanner, auction scanner, and
live-market chart.

## Current Contract

Model version: `backstop-fv-v2`

For 2026 Bowman Chrome Prospect Autos, the official release taxonomy is the
source of truth for lane identity, serial denominator, scarcity order, and the
structural starting curve. Sold evidence can refine that curve; it cannot add
invented lanes or let one sparse comp replace the model.

The hierarchy is blended in log-price space:

1. **Structural release prior** - the official parallel and print-run curve.
2. **Release-level proximity ratios** - variation sales divided by base-auto
   sales from the same player and nearby dates.
3. **Player-level proximity ratios** - player-specific evidence, with less
   weight than the release curve to prevent thin-player overfitting.
4. **Direct lane comps** - a recency-weighted lane estimate, bounded by the
   release rail and weighted by sample depth, freshness, and dispersion.
5. **Active-listing comps** - confirmation only; they receive a small capped
   weight and never define fair value by themselves.

Raw, graded, hand-signed, paper, adjacent products, and non-auto cards remain
separate evidence domains. A listing must first map to a canonical lane before
it can receive a model value.

## Safeguards

- Base Auto always equals `1x`.
- Every official 2026 Bowman auto lane exists exactly once.
- Player and release lanes cannot be duplicated after normalization.
- Sparse direct evidence is shrunk toward the structural/release curve.
- Release adjustments are bounded relative to their structural priors.
- Calculator and scanner values use the same central blending functions.
- Generated models carry a model version and fail audit when invariants drift.

## Validation

The v2 walk-forward backtest uses only sales available before each holdout sale.
On the current canonical dataset it improves median absolute percentage error
from about `28.3%` to `26.0%`, improves mean absolute log error by about `10.9%`,
and raises predictions within 35% of sale price from about `59.5%` to `64.4%`.

These metrics are guardrails, not permission to trust a mislabeled card. Lane
classification, source provenance, and duplicate quarantine happen before
price fitting.

## Release Workflow

Run this sequence whenever canonical sales or taxonomy rules change:

```bash
npm run canonical:rebuild
npm run checklist:static-snapshot
npm run model:audit
npm run model:backtest
npm run check
```

`model:audit` is the hard release gate. `model:backtest` reports predictive
quality and should be compared with the prior run before deployment.

## Known Boundary

Some upstream evidence exposes only a coarse release label. When a player has
cards in multiple same-year Bowman families, family identity must come from the
canonical card lane or title classifier. Expanding the durable data contract to
store an immutable release ID per sale is the next meaningful model-data
improvement; it is preferable to compensating with more heuristic title rules.
