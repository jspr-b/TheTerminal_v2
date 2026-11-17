#!/bin/sh
# Local demo without any keys: temporary Postgres with made-up data, then the API on :8000.
# Writes the demo login to frontend/.env.development.local (read only by `next dev`). Removed when stopped.
set -eu
cd "$(dirname "$0")/.."
BIN="$(.venv/bin/python -c 'import pgserver,pathlib; print(pathlib.Path(pgserver.__file__).parent / "pginstall/bin")')"
DIR="$(mktemp -d /tmp/terminal-demo.XXXXXX)"
PORT=54332
"$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" -w start >/dev/null
trap '"$BIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null; rm -rf "$DIR"' EXIT
"$BIN/psql" -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -c "create database terminal_demo"
cat db/test_bootstrap.sql db/migrations/*.sql | "$BIN/psql" -q -h 127.0.0.1 -p "$PORT" -U postgres -d terminal_demo -v ON_ERROR_STOP=1
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PORT/terminal_demo"
export SUPABASE_JWT_SECRET="local-demo-only-secret-at-least-32-bytes-long"
TOKEN="$(.venv/bin/python scripts/demo_seed.py)"
ENVF=../frontend/.env.development.local
touch "$ENVF"
grep -v -e '^NEXT_PUBLIC_DEV_TOKEN=' -e '^NEXT_PUBLIC_DEV_MERCHANT=' -e '^NEXT_PUBLIC_SHOW_UNTESTED=' "$ENVF" > "$ENVF.tmp" || true
# SHOW_UNTESTED: local dev may show sell-out risk before its backtest; production builds never set it.
printf 'NEXT_PUBLIC_DEV_TOKEN=%s\nNEXT_PUBLIC_DEV_MERCHANT=00000000-0000-0000-0000-000000000001\nNEXT_PUBLIC_SHOW_UNTESTED=1\n' "$TOKEN" >> "$ENVF.tmp"
mv "$ENVF.tmp" "$ENVF"
echo "Demo data ready (made-up). Start the app: cd frontend && npm run dev"
# Only the DB and JWT settings above: keys in .env (Nango, NVIDIA, GPU) still apply if present.
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
