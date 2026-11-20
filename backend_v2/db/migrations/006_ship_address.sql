-- Shipping address on orders, for the per-customer dots on Command (owner decision, 20 Nov 2026).
-- Shown to the merchant only. Never sent to NVIDIA: Kumo reads sales_history, which selects no order columns.
-- Names, emails and phones are still never imported.
alter table orders
  add column ship_address1 text,
  add column ship_address2 text,
  add column ship_zip text,
  add column ship_lat double precision,
  add column ship_lng double precision;
