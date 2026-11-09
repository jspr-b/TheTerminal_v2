"""Clean Online Retail II into repeatable tables. Deterministic and re-runnable."""
import hashlib, json, pathlib
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent
XLSX = ROOT / "data/extracted/online_retail_II.xlsx"
OUT = ROOT / "data/clean"
RAW_CACHE = ROOT / "data/cache_raw.csv"
# Four weeks apart, so the windows do not overlap. Ends 2011-12-08: the last day in the file is partial.
CUTOFFS = ["2011-09-30", "2011-10-28", "2011-11-25"]
HORIZON = 14

def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

def load():
    if RAW_CACHE.exists():
        return pd.read_csv(RAW_CACHE, dtype={"Invoice": str, "StockCode": str, "Customer ID": str}, parse_dates=["InvoiceDate"])
    a = pd.read_excel(XLSX, sheet_name="Year 2009-2010", dtype={"Invoice": str, "StockCode": str})
    b = pd.read_excel(XLSX, sheet_name="Year 2010-2011", dtype={"Invoice": str, "StockCode": str})
    # The two sheets overlap in December 2010. Keep the later sheet for the overlap.
    df = pd.concat([a[a.InvoiceDate < b.InvoiceDate.min()], b], ignore_index=True)
    df["Customer ID"] = df["Customer ID"].map(lambda x: "" if pd.isna(x) else str(int(x)))
    df.to_csv(RAW_CACHE, index=False)
    return pd.read_csv(RAW_CACHE, dtype={"Invoice": str, "StockCode": str, "Customer ID": str}, parse_dates=["InvoiceDate"])

raw = load()
n_raw = len(raw)
df = raw.rename(columns={"Invoice": "invoice", "StockCode": "product_id", "Description": "description", "Quantity": "qty", "InvoiceDate": "ts", "Price": "price", "Customer ID": "customer_id", "Country": "country"})
df["customer_id"] = df.customer_id.fillna("")
df["product_id"] = df.product_id.astype(str).str.strip().str.upper()
is_cancel = df.invoice.str.startswith("C", na=False)
is_product = df.product_id.str.fullmatch(r"\d{5}[A-Z]{0,2}")
valid_num = (df.qty > 0) & (df.price > 0)
counts = {"raw_rows": n_raw, "cancellation_rows": int(is_cancel.sum()), "non_product_rows": int((~is_product).sum()), "non_positive_qty_or_price": int((~valid_num).sum())}
df = df[~is_cancel & is_product & valid_num].copy()
df = df.sort_values(["ts", "invoice", "product_id", "qty", "price"], kind="mergesort").reset_index(drop=True)
df["date"] = df.ts.dt.strftime("%Y-%m-%d")

OUT.mkdir(parents=True, exist_ok=True)
df[["invoice", "product_id", "customer_id", "country", "ts", "date", "qty", "price"]].to_csv(OUT / "sales.csv", index=False)
desc = df.assign(description=df.description.fillna("").astype(str).str.strip()).groupby(["product_id", "description"]).size().rename("n").reset_index().sort_values(["product_id", "n", "description"], ascending=[True, False, True]).drop_duplicates("product_id")
desc[["product_id", "description"]].to_csv(OUT / "products.csv", index=False)
cust = df[df.customer_id != ""].groupby("customer_id", as_index=False).agg(country=("country", "first"), first_order=("date", "min")).sort_values("customer_id")
cust.to_csv(OUT / "customers.csv", index=False)
daily = df.assign(revenue=(df.qty * df.price).round(2)).groupby(["date", "product_id"], as_index=False).agg(units=("qty", "sum"), revenue=("revenue", "sum"), orders=("invoice", "nunique")).sort_values(["date", "product_id"])
daily["revenue"] = daily.revenue.round(2)
daily.to_csv(OUT / "daily.csv", index=False)
(OUT / "folds.json").write_text(json.dumps({"cutoffs": CUTOFFS, "horizon_days": HORIZON}, indent=1) + "\n")

no_cust = df[df.customer_id == ""]
card = f"""# Data card: Online Retail II

- Source: UCI Machine Learning Repository, dataset 502 (https://archive.ics.uci.edu/dataset/502/online+retail+ii)
- Licence: CC BY 4.0, as stated on the UCI page. Cite: Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D
- Raw file sha256: {sha(XLSX)}
- Date range after cleaning: {df.date.min()} to {df.date.max()}
- Raw rows (overlap between sheets removed): {counts['raw_rows']:,}
- Removed, may overlap: cancellation rows {counts['cancellation_rows']:,}; non-product rows {counts['non_product_rows']:,}; zero or negative quantity or price {counts['non_positive_qty_or_price']:,}
- Rows kept: {len(df):,}
- Products: {df.product_id.nunique():,}; invoices: {df.invoice.nunique():,}; customers: {cust.shape[0]:,}
- Share of order lines without a customer: {len(no_cust)/len(df):.1%}; share of invoices: {no_cust.invoice.nunique()/df.invoice.nunique():.1%}
- Test cut-offs (14 days from each): {', '.join(CUTOFFS)}

Known limits: one UK gift wholesaler, many customers are wholesalers. Cancellation lines are removed but the original order lines they reverse stay in, so a few very large cancelled orders remain in the history. No prices shown to shoppers over time, no stock levels, so stock-outs look like low demand.
"""
(OUT / "DATA_CARD.md").write_text(card)
print(card)
print({p.name: sha(p)[:12] for p in sorted(OUT.iterdir())})
