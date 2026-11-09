# backend_v2

The new data layer for The Terminal. Plan: `festivals/planning/kumo-nango-data-platform-KN0001/`.

## Database

Migrations are in `db/migrations/`. `supabase/migrations` is a link to that folder.

Run from `backend_v2/`:

```bash
supabase start -x realtime,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,studio,postgres-meta
supabase db reset --local        # rebuild from empty
.venv/bin/python -m pytest       # isolation tests, local database only
supabase stop
```

No Docker space? `tests/run_on_plain_postgres.sh` builds the schema twice and runs the same tests on a temporary plain Postgres.

The hosted project is only changed on the owner's say-so. Connection details come from the environment.
`backend_v2/.env` is gitignored.
