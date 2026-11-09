#!/bin/sh
# Local development: temporary Postgres, a real import from the Nango dev connection, then the API on :8000.
# Everything is removed when this stops. Never touches the hosted database.
set -eu
cd "$(dirname "$0")/.."
BIN="$(.venv/bin/python -c 'import pgserver,pathlib; print(pathlib.Path(pgserver.__file__).parent / "pginstall/bin")')"
DIR="$(mktemp -d /tmp/terminal-dev.XXXXXX)"
PORT=54330
"$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" -w start >/dev/null
trap '"$BIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null; rm -rf "$DIR"' EXIT
"$BIN/psql" -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -c "create database terminal_dev"
cat db/test_bootstrap.sql db/migrations/*.sql | "$BIN/psql" -q -h 127.0.0.1 -p "$PORT" -U postgres -d terminal_dev -v ON_ERROR_STOP=1
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PORT/terminal_dev"
export SUPABASE_JWT_SECRET="local-dev-only-secret-at-least-32-bytes-long"
export NANGO_CONNECTION="${NANGO_CONNECTION:-$(grep '^NANGO_DEV_CONNECTION=' .env | cut -d= -f2-)}"
.venv/bin/python scripts/dev_seed.py
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
