---
fest_type: task
fest_id: 02_login_and_merchant_access.md
fest_name: login and merchant access
fest_parent: 01_backend_foundation
fest_order: 2
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-09T20:10:33.753581+01:00
fest_tracking: true
---

# Task: login and merchant access

## Objective

Require login and merchant membership on every merchant route.

## Requirements

- [ ] Verify the Supabase JWT
- [ ] Check merchant_users for the merchant in the path

## Implementation

backend_v2/app/auth.py as FastAPI dependencies.

## Done When

- [ ] All requirements met
- [ ] A test with no token gets 401, and a test on another merchant gets 403
