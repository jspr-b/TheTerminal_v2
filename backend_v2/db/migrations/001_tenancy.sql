-- Merchants, membership and the integration bookkeeping. D005, D018.
-- Tokens live in Nango; only connection ids are stored here.

create table merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'onboarding' check (status in ('onboarding','importing','active','paused','closed')),
  timezone text,
  currency text,
  created_at timestamptz not null default now()
);

create table merchant_users (
  merchant_id uuid not null references merchants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','viewer')),
  created_at timestamptz not null default now(),
  primary key (merchant_id, user_id)
);
create index merchant_users_user_idx on merchant_users (user_id);

create table merchant_integrations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  provider text not null,
  nango_connection_id text not null,
  nango_integration_id text,
  status text not null default 'connecting' check (status in ('connecting','connected','importing','synced','error','revoked')),
  scopes text[],
  account_label text,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  history_start date,
  unique (merchant_id, id),
  unique (merchant_id, provider, nango_connection_id)
);
create index merchant_integrations_time_idx on merchant_integrations (merchant_id, last_sync_at desc);

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  integration_id uuid not null,
  model text not null,
  kind text not null check (kind in ('initial','incremental','webhook','backfill')),
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  records_done integer not null default 0,
  records_estimate integer,
  oldest_record_at timestamptz,
  newest_record_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  foreign key (merchant_id, integration_id) references merchant_integrations (merchant_id, id) on delete cascade
);
create index import_jobs_time_idx on import_jobs (merchant_id, created_at desc);

-- Every synced payload as received. Holds personal data, so members cannot read it (see 004).
create table raw_records (
  id bigint generated always as identity primary key,
  merchant_id uuid not null references merchants(id) on delete cascade,
  provider text not null,
  model text not null,
  external_id text not null,
  payload jsonb not null,
  payload_hash text not null,
  fetched_at timestamptz not null default now(),
  unique (merchant_id, provider, model, external_id, payload_hash)
);
create index raw_records_time_idx on raw_records (merchant_id, fetched_at desc);
