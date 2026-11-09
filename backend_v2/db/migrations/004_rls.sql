-- Merchant separation. Signed-in users read only their own merchants' rows.
-- All writes go through the service (service_role), never straight from the browser.

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

alter table merchants enable row level security;
alter table merchant_users enable row level security;
grant select on merchants, merchant_users to authenticated;

create policy merchant_users_own on merchant_users for select to authenticated
  using (user_id = (select auth.uid()));
create policy merchants_member on merchants for select to authenticated
  using (id in (select mu.merchant_id from merchant_users mu where mu.user_id = (select auth.uid())));

do $$
declare t text;
begin
  foreach t in array array[
    'merchant_integrations','import_jobs','locations','products','product_variants',
    'inventory_levels','inventory_snapshots','price_history','cost_history','customers',
    'orders','order_lines','fulfillments','fulfillment_events','kumo_runs','predictions','actions'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select on %I to authenticated', t);
    execute format($p$create policy %I on %I for select to authenticated
      using (merchant_id in (select mu.merchant_id from merchant_users mu where mu.user_id = (select auth.uid())))$p$, t || '_member', t);
  end loop;
end $$;

-- raw_records: RLS on, no policy and no grant. Only the service can read raw payloads.
alter table raw_records enable row level security;
