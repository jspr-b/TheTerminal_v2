-- Data from the apps that come after Shopify: refunds and abandoned checkouts (Shopify),
-- ads (Google, Meta, TikTok...), payments (Stripe, PayPal), support (Gorgias).
-- Same rules as 002: merchant_id on every row, upsert key (merchant_id, source, external_id),
-- composite foreign keys so a row can never point at another merchant, a time index per table.
-- source is the provider: 'shopify', 'google-ads', 'meta-marketing-api', 'tiktok-ads', 'stripe', 'paypal', 'gorgias'.
-- Privacy (CLAUDE.md): no names, emails, street addresses, ticket text or card details. City level at most.

create table refunds (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  order_id uuid not null,
  refunded_at timestamptz not null,
  amount numeric(14,4), currency text,
  restock boolean,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, order_id) references orders (merchant_id, id) on delete cascade
);
create index refunds_time_idx on refunds (merchant_id, refunded_at desc);

create table refund_lines (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  refund_id uuid not null,
  order_line_id uuid, product_id uuid,
  quantity integer not null, amount numeric(14,4),
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, refund_id) references refunds (merchant_id, id) on delete cascade,
  foreign key (merchant_id, order_line_id) references order_lines (merchant_id, id),
  foreign key (merchant_id, product_id) references products (merchant_id, id)
);
create index refund_lines_time_idx on refund_lines (merchant_id, ingested_at desc);
create index refund_lines_product_idx on refund_lines (merchant_id, product_id);

create table checkouts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  customer_id uuid,
  created_at_platform timestamptz not null,
  completed_at timestamptz,
  total numeric(14,4), currency text, line_count integer,
  ship_city text, ship_country text,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, customer_id) references customers (merchant_id, id)
);
create index checkouts_time_idx on checkouts (merchant_id, created_at_platform desc);

create table ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  name text not null,
  status text, objective text,
  daily_budget numeric(14,4), currency text,
  target_roas numeric,
  created_at_platform timestamptz, updated_at_platform timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id)
);
create index ad_campaigns_time_idx on ad_campaigns (merchant_id, created_at_platform desc);

create table ads (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  campaign_id uuid not null,
  name text, status text, format text,
  created_at_platform timestamptz, updated_at_platform timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, campaign_id) references ad_campaigns (merchant_id, id) on delete cascade
);
create index ads_time_idx on ads (merchant_id, created_at_platform desc);

-- One row per campaign (or ad) per day, optionally per region. Spend and results as the platform reports them.
create table ad_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  campaign_id uuid not null, ad_id uuid,
  date date not null,
  region text,
  spend numeric(14,4), impressions bigint, clicks bigint,
  conversions numeric, conversion_value numeric(14,4), currency text,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, source, external_id),
  foreign key (merchant_id, campaign_id) references ad_campaigns (merchant_id, id) on delete cascade,
  foreign key (merchant_id, ad_id) references ads (merchant_id, id) on delete cascade
);
create index ad_daily_metrics_time_idx on ad_daily_metrics (merchant_id, date desc);

create table payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  order_id uuid,
  amount numeric(14,4) not null, currency text,
  status text check (status in ('succeeded','failed','pending','refunded','partially_refunded')),
  method text, failure_code text,
  risk_level text,
  created_at_platform timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, order_id) references orders (merchant_id, id)
);
create index payments_time_idx on payments (merchant_id, created_at_platform desc);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  payment_id uuid, order_id uuid,
  amount numeric(14,4) not null, currency text,
  reason text, status text, outcome text check (outcome in ('won','lost','open')),
  opened_at timestamptz not null, closed_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, payment_id) references payments (merchant_id, id),
  foreign key (merchant_id, order_id) references orders (merchant_id, id)
);
create index disputes_time_idx on disputes (merchant_id, opened_at desc);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  customer_id uuid,
  status text, amount numeric(14,4), currency text, billing_interval text,
  started_at timestamptz, next_charge_at timestamptz, cancelled_at timestamptz,
  failed_charges integer not null default 0,
  created_at_platform timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, customer_id) references customers (merchant_id, id)
);
create index subscriptions_time_idx on subscriptions (merchant_id, created_at_platform desc);

-- Ticket facts only. Subject and message text stay in Gorgias: they hold names and addresses.
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  customer_id uuid, order_id uuid,
  channel text, status text, tags text[],
  messages_count integer, satisfaction_score numeric,
  ended_in_refund boolean,
  created_at_platform timestamptz not null, closed_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, customer_id) references customers (merchant_id, id),
  foreign key (merchant_id, order_id) references orders (merchant_id, id)
);
create index support_tickets_time_idx on support_tickets (merchant_id, created_at_platform desc);

-- Same merchant separation as 004_rls.sql: members read their own rows, only the service writes.
do $$
declare t text;
begin
  foreach t in array array[
    'refunds','refund_lines','checkouts','ad_campaigns','ads','ad_daily_metrics',
    'payments','disputes','subscriptions','support_tickets'
  ] loop
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('alter table %I enable row level security', t);
    execute format('grant select on %I to authenticated', t);
    execute format($p$create policy %I on %I for select to authenticated
      using (merchant_id in (select mu.merchant_id from merchant_users mu where mu.user_id = (select auth.uid())))$p$, t || '_member', t);
  end loop;
end $$;
