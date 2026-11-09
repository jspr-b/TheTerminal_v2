#!/bin/sh
# Isolation tests on a temporary plain Postgres, no Docker needed (pip package "pgserver").
# Builds the schema from empty twice, then runs the suite on the second build. Removes everything afterwards.
set -eu
cd "$(dirname "$0")/.."
BIN="$(.venv/bin/python -c 'import pgserver,pathlib; print(pathlib.Path(pgserver.__file__).parent / "pginstall/bin")')"
DIR="$(mktemp -d /tmp/kn-core-test.XXXXXX)"
PORT=54329
"$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" -w start >/dev/null
trap '"$BIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null; rm -rf "$DIR"' EXIT
run_psql() { "$BIN/psql" -q -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }
for build in 1 2; do
  run_psql -d postgres -c "drop database if exists core_test" -c "create database core_test"
  cat db/test_bootstrap.sql db/migrations/*.sql | run_psql -d core_test
  echo "build $build: clean"
done
CORE_TEST_DB_URL="postgresql://postgres@127.0.0.1:$PORT/core_test" .venv/bin/python -m pytest -q "$@"
