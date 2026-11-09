---
fest_type: task
fest_id: 01_command_endpoint.md
fest_name: command endpoint
fest_parent: 08_command_api
fest_order: 1
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-09T20:32:46.606149+01:00
fest_tracking: true
---

# Task: command endpoint

## Objective

Serve the Command map.

## Requirements

- [ ] Login required
- [ ] Each number says if it is Shopify, Kumo or our math
- [ ] Sell-out risk uses the top of the range
- [ ] No recommendations about reordering or money
- [ ] No store total added from product forecasts

## Implementation

Pydantic response through OntologyService. Slider needs no request per day.

## Done When

- [ ] All requirements met
- [ ] Test proves merchant A cannot reach merchant B
