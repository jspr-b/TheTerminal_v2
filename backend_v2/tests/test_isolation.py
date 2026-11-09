"""Merchant A must never see or change merchant B. Runs in the default test run."""
import psycopg
import pytest
from psycopg import errors

from conftest import as_role, ins

READABLE = ["merchants", "merchant_users", "merchant_integrations", "import_jobs", "locations", "products", "product_variants",
            "inventory_levels", "inventory_snapshots", "price_history", "cost_history", "customers", "orders", "order_lines",
            "fulfillments", "fulfillment_events", "kumo_runs", "predictions", "actions"]
ALL_TABLES = READABLE + ["raw_records"]
SOURCED = ["locations", "products", "product_variants", "inventory_levels", "inventory_snapshots", "price_history", "cost_history",
           "customers", "orders", "order_lines", "fulfillments", "fulfillment_events"]
OWN_COLUMN = {"merchants": "id"}
DENIED = errors.InsufficientPrivilege


def owners(conn, table):
    col = OWN_COLUMN.get(table, "merchant_id")
    return {r[0] for r in conn.execute(f"select {col} from {table}").fetchall()}


def test_new_tables_must_be_added_here(conn):
    rows = conn.execute("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'").fetchall()
    assert {r[0] for r in rows} == set(ALL_TABLES)


@pytest.mark.parametrize("table", ALL_TABLES)
def test_rls_is_on(conn, table):
    assert conn.execute("select relrowsecurity from pg_class where oid = %s::regclass", (f"public.{table}",)).fetchone()[0] is True


@pytest.mark.parametrize("table", [t for t in ALL_TABLES if t != "merchants"])
def test_merchant_id_is_required(conn, table):
    r = conn.execute("select is_nullable from information_schema.columns where table_schema='public' and table_name=%s and column_name='merchant_id'", (table,)).fetchone()
    assert r == ("NO",)


@pytest.mark.parametrize("table", SOURCED)
def test_upsert_key_exists(conn, table):
    rows = conn.execute("""select array(select a.attname::text from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k)
                           from pg_constraint c where c.conrelid=%s::regclass and c.contype='u'""", (f"public.{table}",)).fetchall()
    assert any(sorted(r[0]) == ["external_id", "merchant_id", "source"] for r in rows)
    nulls = conn.execute("select column_name, is_nullable from information_schema.columns where table_schema='public' and table_name=%s and column_name in ('source','external_id')", (table,)).fetchall()
    assert {n[1] for n in nulls} == {"NO"} and len(nulls) == 2


@pytest.mark.parametrize("table", [t for t in ALL_TABLES if t not in ("merchants", "merchant_users")])
def test_time_index_exists(conn, table):
    defs = [r[0] for r in conn.execute("select indexdef from pg_indexes where schemaname='public' and tablename=%s", (table,)).fetchall()]
    assert any("(merchant_id, " in d and "_time_idx" in d for d in defs), defs


def test_views_use_invoker_rights(conn):
    rows = conn.execute("""select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
                           where n.nspname='public' and c.relkind='v' and not coalesce(c.reloptions::text[] && array['security_invoker=true','security_invoker=on'], false)""").fetchall()
    assert rows == []


@pytest.mark.parametrize("table", READABLE)
def test_member_sees_only_own_rows(conn, world, table):
    a, b = world
    assert owners(conn, table) >= {a.merchant, b.merchant}  # both merchants really have a row
    with as_role(conn, "authenticated", a.user):
        assert owners(conn, table) == {a.merchant}
    with as_role(conn, "authenticated", b.user):
        assert owners(conn, table) == {b.merchant}


@pytest.mark.parametrize("table", READABLE)
def test_signed_in_stranger_sees_nothing(conn, world, table):
    import uuid
    with as_role(conn, "authenticated", uuid.uuid4()):
        assert owners(conn, table) == set()


@pytest.mark.parametrize("table", ALL_TABLES)
def test_logged_out_is_refused(conn, world, table):
    with as_role(conn, "anon"):
        with pytest.raises(DENIED), conn.transaction():
            conn.execute(f"select 1 from {table}")


def test_members_cannot_read_raw_payloads(conn, world):
    with as_role(conn, "authenticated", world[0].user):
        with pytest.raises(DENIED), conn.transaction():
            conn.execute("select 1 from raw_records")


@pytest.mark.parametrize("table", ALL_TABLES)
@pytest.mark.parametrize("sql", ["delete from {t}", "insert into {t} default values", "update {t} set merchant_id = merchant_id"])
def test_members_cannot_write_directly(conn, world, table, sql):
    if table == "merchants" and "merchant_id" in sql:
        sql = "update {t} set name = name"
    with as_role(conn, "authenticated", world[0].user):
        with pytest.raises(DENIED), conn.transaction():
            conn.execute(sql.format(t=table))


def test_row_cannot_point_at_another_merchant(conn, world):
    a, b = world
    with pytest.raises(errors.ForeignKeyViolation), conn.transaction():
        ins(conn, "order_lines", merchant_id=b.merchant, source="shopify", external_id="x", order_id=a.ids["order"], quantity=1, ordered_at="2026-01-01")
    with pytest.raises(errors.ForeignKeyViolation), conn.transaction():
        ins(conn, "predictions", merchant_id=b.merchant, run_id=a.ids["run"], model="relational", entity_type="product", entity_id=b.ids["prod"], target="t", generated_at="2026-01-01")


def test_same_platform_id_is_allowed_across_merchants_but_not_within(conn, world):
    a, b = world
    ins(conn, "products", merchant_id=a.merchant, source="shopify", external_id="same", title="A")
    ins(conn, "products", merchant_id=b.merchant, source="shopify", external_id="same", title="B")
    with pytest.raises(errors.UniqueViolation), conn.transaction():
        ins(conn, "products", merchant_id=a.merchant, source="shopify", external_id="same", title="again")


@pytest.mark.parametrize("status", ["approved", "executing", "done"])
def test_action_cannot_be_approved_without_a_person(conn, world, status):
    a, _ = world
    with pytest.raises(errors.CheckViolation), conn.transaction():
        ins(conn, "actions", merchant_id=a.merchant, kind="reorder", title="x", status=status)
    ins(conn, "actions", merchant_id=a.merchant, kind="reorder", title="y", status=status, approved_by=a.user, approved_at="2026-01-01")


def test_deleting_a_merchant_removes_only_that_merchant(conn, world):
    a, b = world
    conn.execute("delete from merchants where id = %s", (a.merchant,))
    for table in ALL_TABLES:
        got = owners(conn, table)
        assert a.merchant not in got and b.merchant in got, table
