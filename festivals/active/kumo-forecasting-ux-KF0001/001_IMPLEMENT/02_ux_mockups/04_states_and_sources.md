---
fest_type: task
fest_id: 04_states_and_sources.md
fest_name: states_and_sources
fest_parent: 02_ux_mockups
fest_order: 4
fest_status: completed
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.616344+01:00
fest_updated: 2026-11-17T00:52:17.67673+01:00
fest_tracking: true
---


# Task: states and sources

## Objective

One reference sheet for every state a prediction can be in.

## Requirements

- [x] Fresh, stale with date, too few sales, loading, error, not connected
- [x] How a range, a band and an exact Shopify number differ on screen
- [x] Keyboard and screen-reader behaviour for the slider and tables

## Implementation

Reuse the stale tag already built in the product drawer.

## Done When

- [x] All requirements met
- [x] Every later UI task can point at this sheet

## Findings (2026-11-17)

Built docs/mockups/states.html. Opened in a browser at 1440x900, slider tried with arrows, Home and End.

- Seven states: the six required plus "No forecast yet" (Kumo has never answered, so nothing old to show).
- The stale tag is the one from the product drawer. The age that makes a result stale is not set:
  the sheet says so and points to 03_local_kumo/03_scheduled_runs.
- Also covers count per band and ordered lists, the three source chips and where a chip sits.
- Colour rule added: red/amber/green only where high is bad; one colour in three strengths otherwise.
- Not checked with a real screen reader. The spoken text shown is what the markup asks for.