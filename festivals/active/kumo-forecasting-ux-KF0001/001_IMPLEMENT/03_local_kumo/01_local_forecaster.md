---
fest_type: task
fest_id: 01_local_forecaster.md
fest_name: local_forecaster
fest_parent: 03_local_kumo
fest_order: 1
fest_status: completed
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.661163+01:00
fest_updated: 2026-11-17T00:57:03.244621+01:00
fest_tracking: true
---


# Task: local forecaster

## Objective

LocalKumo class with the same predict contract as KumoClient.

## Requirements

- [x] Uses structured-data-models, weights pinned by version and hash
- [x] Same allowlist: ids, dates, quantities, prices, product type. No titles or personal data
- [x] Tests use real code paths; the model call is the only stand-in

## Implementation

Plug into the Forecaster protocol in backend_v2/app/forecast.py. Chosen by a setting.

## Done When

- [x] All requirements met
- [x] Test suite passes
- [x] A run on the local preview data returns ranges

## Findings (2026-11-17)

- backend_v2/app/kumo_local.py: LocalKumo takes the same request KumoClient sends and answers in the
  same shape, so forecast.py is unchanged. Chosen with KUMO_RUNTIME=local (default stays hosted); no
  NVIDIA key needed and nothing leaves the server.
- Weights: nvidia/Kumo-Relational v1.0.1, regressor.pt, SHA-256 checked before the model loads.
  Package pinned in backend_v2/requirements-kumo-local.txt (structured-data-models==0.2.1).
- Only allowlisted columns are copied; product ids are dropped (rows join on instance_id). A sales row
  on or after its anchor date is refused.
- backend_v2/tests/test_kumo_local.py: 7 tests. The anchor check and the hash check were each broken
  on purpose and their tests failed, then restored.
- Full suite: 234 passed, 1 skipped (tests/run_on_plain_postgres.sh).
- Real weights on made-up sales: 40 products, 240 labelled examples, 3.3 s on CPU including loading.
  Ranges came back for all 40. This shows the pipeline works, not how accurate it is.

Limits:
- The run used made-up sales through the real request builder, not the preview database, which has no orders.
- The disk is full (about 1 GB free). torch could not be installed into backend_v2/.venv, so the local
  tests ran with the scratch environment's packages on PYTHONPATH. Without them these 7 tests skip.
- One made-up product got a near-zero-width range (71.8-72.0). Check range width in 02_local_vs_hosted_check.
- verify_weights asks Hugging Face for the file path; a server with no internet needs the weights cached first.
- D016 is still the owner's call. Local is built and switched off by default.