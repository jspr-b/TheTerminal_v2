# GPU worker: Kumo Forecast and Kumo Anomaly

Everything in The Terminal runs without a GPU except these two models (NVIDIA Kumo-TS). They live
in their own containers; the backend talks to them over HTTP.

| Piece | Where | Status |
|---|---|---|
| HTTP API (`/health`, `/v1/forecast`, `/v1/anomaly`) | `worker.py` | Tested here with a stand-in model (`tests/`) |
| Real model calls | `models.py` | Written against Kumo-TS commit `ad459475`; **not run yet** (needs the GPU box) |
| Container | `Dockerfile`, `../docker-compose.gpu.yml` | Compose file validated; image not built yet |
| Backend client, store series, runs, routes | `backend_v2/app/gpu.py`, `main.py` | Tested against a fake worker |
| Sections in the app | `backend_v2/app/catalog.py` | Say "Runs on a GPU server, not set up yet" until `KUMO_GPU_URL` is set |

## Turning it on

On a machine with an NVIDIA GPU (8 GB+ VRAM) and the NVIDIA Container Toolkit:

```bash
docker compose -f docker-compose.gpu.yml up -d --build
curl http://127.0.0.1:8101/health   # {"model": "forecast", "device": "cuda"}
curl http://127.0.0.1:8102/health   # {"model": "anomaly",  "device": "cuda"}
```

Then in `backend_v2/.env`: `KUMO_GPU_URL=http://<gpu-host>:8101` and `KUMO_GPU_ANOMALY_URL=http://<gpu-host>:8102`.
Keep the ports private: the workers have no login.

## First checks on the GPU box

1. Run one forecast and one anomaly call by hand; confirm the columns `models.py` reads
   (`<target>_forecast`, `Anomaly`, `MAE`) are still there.
2. Kumo Forecast gives one value per day, no range. Store totals stay hidden ("blocked") until the
   range method passes the totals backtest (festival KF0001, 04_backtest_tool/03).
3. Licence: Kumo Forecast is Apache-2.0; Kumo Anomaly's README says research and development only.
   Owner signs off before Anomaly alerts are shown to merchants.

## Tests

`../backend_v2/.venv/bin/python -m pytest gpu_worker/tests` (from the repo root). No GPU or torch needed.
