---
fest_autonomy: medium
fest_created: 2026-11-16T23:28:08.765362+01:00
fest_gate_id: rea-audit
fest_id: 03_rea_audit.md
fest_managed: true
fest_name: Shipped Bundle Audit (REA)
fest_order: 3
fest_parent: 03_demand_retest
fest_status: pending
fest_tracking: true
fest_type: gate
fest_version: "1.0"
---

# Gate: Shipped Bundle Audit (REA)

Check what actually ships to browsers, not what the source says. Uses the REA
skill (`rea:reverse-engineer-anything`) on the built Next.js output.

**Not applicable** when this sequence changed nothing under `frontend/`.
Write "N/A: no frontend change" under Findings and close the gate.

## Steps

1. Build with a marker value for every `NEXT_PUBLIC_*` variable the code reads
   (`grep -rho "NEXT_PUBLIC_[A-Z_]*" frontend/src | sort -u`), for example
   `NEXT_PUBLIC_MAPBOX_TOKEN=REA_MARKER_MAPBOX npm run build`.
   Leave `NEXT_PUBLIC_DEV_TOKEN` unset: `next.config.js` refuses to build with it.
2. Run REA `analyze_javascript_application` on `frontend/.next/static`
   with `detail: "summary"`. Record the evidence ID.
3. Find the chunks holding app code (`grep -rl REA_MARKER frontend/.next/static`).
   List their `endpoint` facts with `inspect_analysis_view`.
4. Rebuild without markers so no marker build is left behind.

## Checks

- [ ] Every marker found in the bundle is meant to be public
      (Mapbox `pk.` token, API URL, merchant id). Anything else fails the gate.
- [ ] No login token, secret key or Kumo/Nango/NVIDIA credential is in the bundle.
- [ ] Every network call in the app chunks is expected
      (our API, Mapbox). A new or unknown host fails the gate.
- [ ] No personal data (names, emails, street addresses) is sent from the browser.
- [ ] REA coverage limits are written down. Library chunks REA could not finish
      are listed as unchecked, not as clean.

## Findings

Evidence IDs:

Endpoints in app chunks:

Public values found:

Unchecked (coverage limits):

**Critical Issues:** (must fix)

**Suggestions:** (should consider)