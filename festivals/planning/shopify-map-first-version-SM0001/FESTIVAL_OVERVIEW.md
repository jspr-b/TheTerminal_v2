# Shopify and map, first version

## Problem

backend_v2 is only a schema and isolation tests. There is no API, no import and no new frontend.

## Target

The first version in festivals/PLAN.md, steps 3 to 5.

## Scope

Backend service, login, OntologyService, Shopify import through Nango, #1 retest, map mockup.

## Not included

Real map build (waits for mockup approval), other apps, the hosted database.

## Phases

### 001_IMPLEMENT

Four sequences: backend foundation, shopify import, demand retest, map mockup.

## Notes

No Nango key yet, so the import is built against a stand-in and tested with it. The Shopify field mapping must be checked against real Nango records once connected.
