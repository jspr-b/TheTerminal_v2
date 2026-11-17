---
fest_autonomy: medium
fest_created: 2026-11-16T23:27:49.273184+01:00
fest_gate_id: rea-audit
fest_id: 04_rea_audit.md
fest_managed: true
fest_name: Shipped Bundle Audit (REA)
fest_order: 4
fest_parent: 09_command_frontend
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

- [x] Every marker found in the bundle is meant to be public
      (Mapbox `pk.` token, API URL, merchant id). Anything else fails the gate.
- [x] No login token, secret key or Kumo/Nango/NVIDIA credential is in the bundle.
- [x] Every network call in the app chunks is expected
      (our API, Mapbox). A new or unknown host fails the gate.
- [x] No personal data (names, emails, street addresses) is sent from the browser.
- [x] REA coverage limits are written down. Library chunks REA could not finish
      are listed as unchecked, not as clean.

## Findings

Run 2026-11-16 on the uncommitted working tree (Kumo ranges + stale state in the drawer).
Built in a scratch copy with markers for MAPBOX_TOKEN, API_URL, DEV_MERCHANT; DEV_TOKEN unset.

Evidence IDs: `ev_d91e5610895f4a2a358efbc94da45591c05736e71a167e7a7e8729c5ecd63d19` (analysis),
`ev_b25a62373541c2e00af171982caee6c18394f88ac670b1018c504d16ab695385` (endpoint view).
Bundle sha256 `8d324f65d9a3b444d8bf2e97c55ec90c1b07ce41dc6fe4f8dcf57960f867769d`.

Endpoints in app chunks: all app code is in `chunks/94.*.js`. REA found 2 request sites:
- `{API_URL}/merchants/{id}/command` (col 293-438), `Authorization: Bearer` + dev token
- `fetch(n)` (col 688-696): the Mapbox geocode URL `api.mapbox.com/search/geocode/v6/forward`
No other hosts in the chunk (`https://` literals: our API marker and `api.mapbox.com` only).

Public values found: Mapbox token, API URL, merchant id. All expected.
Dev token: compiled as `process.env.NEXT_PUBLIC_DEV_TOKEN ?? ""`, so empty in this build; no JWT-shaped
string anywhere in `.next/static`. Geocode sends location city/province/country (business sites, not people).

Unchecked (coverage limits): REA hit heap/result limits on library chunks
`framework-*`, `7d693025-*`, `525-*`, `main-*`, `polyfills-*` (React, Next.js, Mapbox GL).
Third-party code, not ours; listed as unchecked, not clean. Static analysis only, nothing executed.

**Critical Issues:** (must fix) None.

**Suggestions:** (should consider) Replace the dev token with the planned Supabase login, so the
browser never needs a build-time token at all.