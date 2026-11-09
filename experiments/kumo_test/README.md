# Kumo test (KN0001 phase 003)

Does Kumo Relational forecast real shop sales clearly better than a simple baseline?

Run in order, with `.venv/bin/python -I`:
`prepare.py` → `baseline.py` → `run_kumo.py` → `score_kumo.py`.

`data/` and `cache/` are gitignored. The API key is read from `backend_v2/.env` and is never printed.
