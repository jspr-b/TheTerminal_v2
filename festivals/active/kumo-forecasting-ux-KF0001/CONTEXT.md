# Context: Kumo forecasting and the Command UX (KF0001)

## Why this festival exists

Command shows Shopify stock and one Kumo number (14-day demand per product). Kumo can serve most of
Shopify ideas #1-#12, and the UX has no timeline, product page or customers page. This festival
builds those predictions and screens behind the rules in CLAUDE.md.

## Constraints

- Ranges or low/medium/high only, 14 days at most, "too few sales" instead of a number.
- Kumo only, no fallback model. Stale results say so.
- No advice, no approve buttons, nothing carried out.
- Mockup first, owner approval before any build (02 blocks 11).
- Accuracy claims only from measured backtests, never the dev store.
- Real merchant data goes to NVIDIA only after the owner confirms (D016).

## Decisions

- 2026-11-16: Shopify only. Keep the 3D globe.
- 2026-11-17: docs/pages.md is the agreed feature list. Command keeps sell-out risk colours, the
  stock-by-day slider and "could run out" cards (our math on Kumo ranges).
- 2026-11-17: Commits for this festival stage only this festival's files. SM0001 has unfinished,
  uncommitted work in the same tree (backend_v2/app/forecast.py, kumo.py, their tests, frontend
  changes) that must not ride along.

## Assumptions

- No backend_v2/.env on this machine: no live Nango import and no hosted Kumo run. Local runs use
  made-up data and prove the pipeline only.
- Local open weights (structured-data-models) cover regression and yes/no; ranking needs hosted or a NIM.

## Open questions (owner)

- High: OpenMDW-1.1 licence and D016, hosted or local (01/02). Licence cards for Tabular, Forecast, Anomaly (01/04).
- High: approve the mockups and docs/pages.md (02/07).
- High: the owner said "I only want output of Kumo" about the Command timeline mockup, then pages.md
  kept the our-math features. Both mockup versions exist; confirm which one at approval (02/01).
- Medium: #7 horizon (10/04). Demand heatmap: one product at a time or wait for the totals test (04/03).
- Medium: a pilot store, needed for #3 and any accuracy claim.

## Session handoff

### 2026-11-17

- Done: 01/01 prediction map. 02/01-04 mockups in docs/mockups/ (command-map, command-map-kumo-only,
  products, customers, states). 03/01 LocalKumo (backend_v2/app/kumo_local.py, KUMO_RUNTIME=local).
- Blocked on the owner: 01/02 (licence, D016), 02/05 (demand heatmap, click-through). Their sequences wait.
- Per-mockup "owner has clicked through" boxes are open and collected in 02/07.
- Nothing committed: sequence commit gates have not been reached (01 and 02 are blocked before them).
- Disk is full (about 1 GB free). torch is not in backend_v2/.venv; local Kumo tests need
  PYTHONPATH=~/.hermes/cache/scratch/kumo-local/.venv/lib/python3.12/site-packages or they skip.
- Next: `fest next` gives 03/02 local vs hosted check. It needs the UK wholesaler data fetched again
  and has no hosted key here, so only the local side can run.
