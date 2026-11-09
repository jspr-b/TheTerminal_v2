"""Does the hosted endpoint accept regression / forecasting task kinds? Prints status and body only."""
import json, pathlib, requests
for l in pathlib.Path(__file__).resolve().parents[2].joinpath("backend_v2/.env").read_text().splitlines():
    if l.startswith("NVIDIA_API_KEY="): key = l.split("=",1)[1].strip()
c = lambda d, s, n=None: {"dtype": d, "stype": s, **({"nullable": n} if n is not None else {})}
def body(kind, extra=None):
    t = {"kind": kind, "target": {"column_name": "label", "dtype": "float64"}, "entity_table_names": ["products"], "anchor_time_column": "anchor_time"}
    t.update(extra or {})
    return {"model": "kumo-relational", "task": t,
     "schema": {"instance_table": {"columns": {"instance_id": c("int64","ID",False), "anchor_time": c("timestamp[us]","timestamp",False), "product_id": c("int64","ID",False), "label": c("float64","numerical")}, "primary_key": "instance_id"},
      "related_tables": {"products": {"columns": {"instance_id": c("int64","ID",False), "product_id": c("int64","ID",False), "units_prior": c("float64","numerical")}, "primary_key": ["instance_id","product_id"]}},
      "relationships": [{"source_columns": ["instance_id","product_id"], "target_table": "products", "target_columns": ["instance_id","product_id"]}]},
     "context": {"instance_table": {"format":"arrays","columns":["instance_id","anchor_time","product_id","label"],"rows":[[i,f"2025-01-{i+1:02d}T00:00:00Z",100+i,float(10+5*i)] for i in range(6)]},
      "related_tables":{"products":{"format":"arrays","columns":["instance_id","product_id","units_prior"],"rows":[[i,100+i,float(9+5*i)] for i in range(6)]}}},
     "predict": {"instance_table":{"format":"arrays","columns":["instance_id","anchor_time","product_id"],"rows":[[6,"2025-02-01T00:00:00Z",106]]},"related_tables":{"products":{"format":"arrays","columns":["instance_id","product_id","units_prior"],"rows":[[6,106,39.0]]}}},
     "output": {"fields": ["prediction","quantiles"]}}
U="https://ai.api.nvidia.com/v1/structured-data/nvidia/kumo-relational/predictions"
for name, p in [("regression", body("regression")), ("forecasting", body("forecasting"))]:
    r = requests.post(U, headers={"Accept":"application/json","Authorization":f"Bearer {key}"}, json=p, timeout=180)
    print("==", name, r.status_code, r.headers.get("content-type"))
    print(r.text[:1200])
