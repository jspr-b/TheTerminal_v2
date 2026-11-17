---
fest_type: task
fest_id: 03_customers_page.md
fest_name: customers_page
fest_parent: 02_ux_mockups
fest_order: 3
fest_status: completed
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.616086+01:00
fest_updated: 2026-11-17T00:52:17.60201+01:00
fest_tracking: true
---


# Task: customers page

## Objective

Customer predictions without showing who the customer is.

## Requirements

- [x] Region or city level only, no names, emails or addresses
- [x] Counts per likelihood band (low/medium/high), not a list of people
- [x] Open question for the owner: link to the customer in Shopify admin, yes or no

## Implementation

Covers #9, #10, #12 and, if decided, #7 and #11.

## Done When

- [x] All requirements met
- [ ] Owner has clicked through it and answered the open question

## Findings (2026-11-17)

Built docs/mockups/customers.html. Opened in a browser at 1440x900.

- #10 first-time buyers and #12 discount-only: counts per band per region, with a region filter.
  #12 is shown stale with its date.
- #11 abandoned checkouts shows "Not connected" (no checkout sync yet). #7 shows "Hidden" with the reason.
- #9 is one ordered list of products per region, no scores.
- No names, emails, addresses or percents on the page. Regions under 5 customers go into "Other regions".
- Bands here use one colour in three strengths, not red/amber/green: a high chance of ordering again is not bad news.
- The open question is on the page. It is not answered: that part of "Done When" stays open for 07_owner_approval.