---
fest_type: task
fest_id: 05_command_heatmaps.md
fest_name: command heatmaps
fest_parent: 11_ux_build
fest_order: 5
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-17T00:44:31.011816+01:00
fest_tracking: true
---

# Task: command heatmaps

## Objective

Build the approved heatmap filters into GlobeMap.tsx.

## Requirements

- [ ] Same filters, colours, legend and panel as the approved mockup
- [ ] Mapbox heatmap layer from one city-level source; no request per filter switch
- [ ] Orders heatmap first (real Shopify data); each Kumo filter appears only once its prediction
      sequence has shipped, otherwise "not available yet"
- [ ] Stale and too-few-sales states shown in the panel and tooltip
- [ ] Cities under 5 orders never sent to the browser (test on the API, with a sabotage check)

## Done When

- [ ] All requirements met
- [ ] Opened in a browser on real dev-store data
