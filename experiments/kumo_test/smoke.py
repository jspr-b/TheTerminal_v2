"""Smallest possible call to the hosted Kumo Relational endpoint."""
import json, os, pathlib, requests
for l in pathlib.Path(__file__).resolve().parents[2].joinpath("backend_v2/.env").read_text().splitlines():
    if l.startswith("NVIDIA_API_KEY="): key = l.split("=",1)[1].strip()
c = lambda d, s, n=None: {"dtype": d, "stype": s, **({"nullable": n} if n is not None else {})}
payload = {"model": "kumo-relational",
 "task": {"kind": "binary_classification", "target": {"column_name": "label", "dtype": "bool", "classes": ["false", "true"], "positive_class": "true"}, "entity_table_names": ["accounts"], "anchor_time_column": "anchor_time"},
 "schema": {"instance_table": {"columns": {"instance_id": c("int64","ID",False), "anchor_time": c("timestamp[us]","timestamp",False), "account_id": c("int64","ID",False), "label": c("bool","categorical")}, "primary_key": "instance_id"},
  "related_tables": {"accounts": {"columns": {"instance_id": c("int64","ID",False), "account_id": c("int64","ID",False), "amount": c("float64","numerical"), "segment": c("string","categorical")}, "primary_key": ["instance_id","account_id"]}},
  "relationships": [{"source_columns": ["instance_id","account_id"], "target_table": "accounts", "target_columns": ["instance_id","account_id"]}]},
 "context": {"instance_table": {"format":"arrays","columns":["instance_id","anchor_time","account_id","label"],"rows":[[0,"2025-01-01T00:00:00Z",100,False],[1,"2025-01-01T00:00:00Z",101,True],[2,"2025-01-02T00:00:00Z",102,False],[3,"2025-01-02T00:00:00Z",103,True]]},
  "related_tables":{"accounts":{"format":"arrays","columns":["instance_id","account_id","amount","segment"],"rows":[[0,100,10.5,"small"],[1,101,250.0,"enterprise"],[2,102,12.0,"small"],[3,103,300.0,"enterprise"]]}}},
 "predict": {"instance_table":{"format":"arrays","columns":["instance_id","anchor_time","account_id"],"rows":[[4,"2025-02-01T00:00:00Z",104]]},"related_tables":{"accounts":{"format":"arrays","columns":["instance_id","account_id","amount","segment"],"rows":[[4,104,275.0,"enterprise"]]}}},
 "output": {"fields": ["prediction","probabilities"]}}
r = requests.post("https://ai.api.nvidia.com/v1/structured-data/nvidia/kumo-relational/predictions", headers={"Accept":"application/json","Authorization":f"Bearer {key}"}, json=payload, timeout=180)
print(r.status_code, {k:v for k,v in r.headers.items() if "limit" in k.lower() or k.lower()=="x-request-id"})
print(json.dumps(r.json(), indent=1)[:1500])
