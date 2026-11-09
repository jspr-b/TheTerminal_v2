-- Kumo runs, predictions and merchant-approved actions. D001, D012.
-- These rows are generated here, not imported, so they have no source or external_id.

create table kumo_runs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  model text not null check (model in ('relational','tabular','forecast','anomaly')),
  query_name text not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed','skipped')),
  trigger text not null check (trigger in ('schedule','sync_done','manual_admin','backtest')),
  started_at timestamptz, finished_at timestamptz,
  rows integer, latency_ms integer, attempt integer not null default 1, endpoint text, error text,
  created_at timestamptz not null default now(),
  unique (merchant_id, id)
);
create index kumo_runs_time_idx on kumo_runs (merchant_id, created_at desc);

create table predictions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  run_id uuid not null,
  model text not null, model_version text,
  entity_type text not null, entity_id uuid not null, location_id uuid,
  target text not null, horizon_days integer,
  value numeric, lower numeric, upper numeric, probability numeric,
  payload jsonb, explanation jsonb,
  generated_at timestamptz not null,
  is_stale boolean not null default false,
  unique (merchant_id, id),
  foreign key (merchant_id, run_id) references kumo_runs (merchant_id, id) on delete cascade,
  foreign key (merchant_id, location_id) references locations (merchant_id, id)
);
create index predictions_time_idx on predictions (merchant_id, generated_at desc);
create index predictions_lookup_idx on predictions (merchant_id, target, entity_id, generated_at desc);

-- Human in the loop: the database refuses an approved action with no approver.
create table actions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  prediction_id uuid,
  kind text not null,
  title text not null,
  details jsonb,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','executing','done','failed','paused')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  check (status not in ('approved','executing','done') or (approved_by is not null and approved_at is not null)),
  foreign key (merchant_id, prediction_id) references predictions (merchant_id, id)
);
create index actions_time_idx on actions (merchant_id, created_at desc);
