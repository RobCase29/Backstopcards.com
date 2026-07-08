# Phase 1 Domain Split

## What Changed

Marketplace title classification now lives in `src/lib/cardTitleGuards.ts`.

The shared domain layer owns:

- player/search normalization
- variation aliasing for marketplace query and match text
- serial denominator parsing
- base-auto detection
- low-serial non-auto detection and labels
- Superfractor detection and labels
- Bowman Superfractor auto proxy eligibility

`src/lib/ebay.ts`, `src/lib/fanaticsCollect.ts`, `src/lib/ebaySold.ts`, `src/lib/caseHits.ts`, and the Marlins page helpers in `src/App.tsx` now call this shared logic instead of maintaining parallel classifier implementations.

## Migration

No database migration is required.

When adding a new marketplace, provider, or scan mode:

1. Put reusable title/card taxonomy rules in `src/lib/cardTitleGuards.ts`.
2. Keep provider files limited to query construction, fetch behavior, provider response parsing, and listing mapping.
3. Add golden cases in `src/lib/cardTitleGuards.test.ts` before changing classifier semantics.
4. Only add provider-local title guards when the rule depends on provider-specific response fields rather than card-domain taxonomy.

## Verification

Run:

```sh
npm run lint
npm test
npm run build
```

## Re-Evaluation Checkpoint

This phase intentionally does not redesign the data pipeline. Remaining concerns after the split:

- marketplace fetch orchestration still lives in frontend-facing modules
- Marlins-specific ranking still depends on `App.tsx`
- model/pricing provenance is still too implicit for high-confidence deal ranking
- large static checklist payloads still dominate client bundle shape
