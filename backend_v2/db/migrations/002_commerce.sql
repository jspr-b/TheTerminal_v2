-- Store data. Every table: merchant_id, source, external_id, and the platform's own timestamps.
-- References use (merchant_id, id), so a row can never point at another merchant's row.
-- Customers hold city level only: no names, emails or street addresses (R9).

create table locations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  name text not null,
  kind text not null default 'store' check (kind in ('store','warehouse','3pl','app')),
  city text, province text, country text,
  lat double precision, lng double precision,
  is_active boolean not null default true,
  fulfills_online_orders boolean,
  created_at_platform timestamptz, updated_at_platform timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id)
);
create index locations_time_idx on locations (merchant_id, created_at_platform desc);

create table products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  title text not null,
  status text, product_type text, vendor text, tags text[],
  created_at_platform timestamptz, updated_at_platform timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id)
);
create index products_time_idx on products (merchant_id, created_at_platform desc);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  product_id uuid not null,
  title text, sku text, barcode text,
  price numeric(14,4), compare_at_price numeric(14,4), unit_cost numeric(14,4),
  inventory_item_external_id text,
  created_at_platform timestamptz, updated_at_platform timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, product_id) references products (merchant_id, id) on delete cascade
);
create index product_variants_time_idx on product_variants (merchant_id, created_at_platform desc);
create index product_variants_product_idx on product_variants (merchant_id, product_id);

create table inventory_levels (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  variant_id uuid not null, location_id uuid not null,
  available integer, committed integer, incoming integer, on_hand integer,
  reserved integer, damaged integer, safety_stock integer, quality_control integer,
  updated_at_platform timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, source, external_id),
  unique (merchant_id, variant_id, location_id),
  foreign key (merchant_id, variant_id) references product_variants (merchant_id, id) on delete cascade,
  foreign key (merchant_id, location_id) references locations (merchant_id, id) on delete cascade
);
create index inventory_levels_time_idx on inventory_levels (merchant_id, updated_at_platform desc);

create table inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  variant_id uuid not null, location_id uuid not null,
  snapshot_date date not null,
  available integer, incoming integer, on_hand integer,
  likely_stockout boolean not null default false,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, source, external_id),
  unique (merchant_id, variant_id, location_id, snapshot_date),
  foreign key (merchant_id, variant_id) references product_variants (merchant_id, id) on delete cascade,
  foreign key (merchant_id, location_id) references locations (merchant_id, id) on delete cascade
);
create index inventory_snapshots_time_idx on inventory_snapshots (merchant_id, snapshot_date desc);

create table price_history (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  variant_id uuid not null,
  price numeric(14,4) not null, compare_at_price numeric(14,4),
  recorded_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, source, external_id),
  foreign key (merchant_id, variant_id) references product_variants (merchant_id, id) on delete cascade
);
create index price_history_time_idx on price_history (merchant_id, recorded_at desc);

create table cost_history (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  variant_id uuid not null,
  unit_cost numeric(14,4) not null,
  valid_from timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, source, external_id),
  foreign key (merchant_id, variant_id) references product_variants (merchant_id, id) on delete cascade
);
create index cost_history_time_idx on cost_history (merchant_id, valid_from desc);

create table customers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  city text, province text, country text,
  orders_count integer, total_spent numeric(14,4),
  first_order_at timestamptz,
  created_at_platform timestamptz, updated_at_platform timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id)
);
create index customers_time_idx on customers (merchant_id, created_at_platform desc);

create table orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  customer_id uuid,
  ordered_at timestamptz not null,
  financial_status text, fulfillment_status text,
  total numeric(14,4), discounts numeric(14,4), shipping numeric(14,4), currency text,
  source_name text, landing_site text, referring_site text,
  utm_source text, utm_medium text, utm_campaign text,
  ship_city text, ship_province text, ship_country text,
  cancelled_at timestamptz,
  created_at_platform timestamptz, updated_at_platform timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, customer_id) references customers (merchant_id, id)
);
create index orders_time_idx on orders (merchant_id, ordered_at desc);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  order_id uuid not null,
  product_id uuid, variant_id uuid, location_id uuid,
  quantity integer not null, price numeric(14,4), discount numeric(14,4),
  ordered_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, order_id) references orders (merchant_id, id) on delete cascade,
  foreign key (merchant_id, product_id) references products (merchant_id, id),
  foreign key (merchant_id, variant_id) references product_variants (merchant_id, id),
  foreign key (merchant_id, location_id) references locations (merchant_id, id)
);
create index order_lines_time_idx on order_lines (merchant_id, ordered_at desc);
create index order_lines_product_time_idx on order_lines (merchant_id, product_id, ordered_at desc);

create table fulfillments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  order_id uuid not null, location_id uuid,
  status text, tracking_company text, tracking_number text,
  in_transit_at timestamptz, delivered_at timestamptz,
  ship_city text, ship_province text, ship_country text,
  created_at_platform timestamptz, updated_at_platform timestamptz,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, id), unique (merchant_id, source, external_id),
  foreign key (merchant_id, order_id) references orders (merchant_id, id) on delete cascade,
  foreign key (merchant_id, location_id) references locations (merchant_id, id)
);
create index fulfillments_time_idx on fulfillments (merchant_id, created_at_platform desc);

create table fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  source text not null, external_id text not null,
  fulfillment_id uuid not null,
  status text, happened_at timestamptz not null,
  city text, country text, lat double precision, lng double precision,
  ingested_at timestamptz not null default now(),
  unique (merchant_id, source, external_id),
  foreign key (merchant_id, fulfillment_id) references fulfillments (merchant_id, id) on delete cascade
);
create index fulfillment_events_time_idx on fulfillment_events (merchant_id, happened_at desc);
