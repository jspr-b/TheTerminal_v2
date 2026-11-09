# Kumo Relational: what we confirmed against the real API (2026-11-08)

- Used the hosted REST endpoint directly, no NVIDIA client package needed: `POST https://ai.api.nvidia.com/v1/structured-data/nvidia/kumo-relational/predictions`, bearer key.
- Format: JSON task plus inline context, not PQL. PQL belongs to the NVIDIA Python client. NVIDIA's public docs do not describe this JSON format; what follows was found by calling it.
- `task.kind` tested: `binary_classification` and `regression` work. `forecasting` is recognised and returns 422 "forecasting requires task.step_size"; not used yet.
- Regression with `output.fields` `["prediction","quantiles"]` returned only quantiles (0.005 to 0.995) with `output_type: quantiles`. We use the 0.5 quantile as the forecast.
- One-to-many related tables work: `sales_daily` with several rows per instance, joined on `instance_id, product_id`.
- Related rows are per instance (`instance_id` in each key), so each prediction carries its own history. That is what stops future data leaking in.
- `entity_table_names` has one table, matching the one-entity-table rule (C-50).
- Limits from NVIDIA docs: request 30 MiB; context rows 1,000 by default; 10,000 scored rows per call; 15 tables; 1 to 6 hops. Rate limits are not published.
- Observed: 59 sequential calls, 0.7 to 1.1 MB each, about 2 s per call, no 429s, 0 missing predictions.
