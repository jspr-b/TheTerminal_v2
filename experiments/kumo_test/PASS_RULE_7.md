# Pass rule for #7, customers likely to stop buying (written before any score, 2026-11-09)

Data: Online Retail II (UK gift wholesaler, CC BY 4.0). Same data as the #1 test.

- Customers scored: at least one order in the 90 days before the cut-off.
- Label: true if the customer places no order in the next H days.
- H = 90 is the main test, because that is what "stop buying" means.
  H = 14 is the product's maximum horizon. Each is judged separately.
- Cut-offs: 2011-03-13, 2011-06-11, 2011-09-09. They are 90 days apart, so the
  90-day windows do not overlap.

Baselines, all using only data before the cut-off:
1. Recency: days since last order.
2. Low frequency: fewest orders in the last 365 days.
3. Overdue: days since last order, divided by the customer's usual gap.
4. Logistic regression on the same customer numbers Kumo gets, trained on
   earlier dates only.

"Best baseline" is chosen per cut-off and per H, by highest AUC.

Kumo passes for an H if both hold:
1. AUC is at least 0.02 higher than the best baseline in at least 2 of 3 cut-offs.
2. Brier score over all cut-offs pooled is not worse than the logistic regression.

One Kumo configuration, set before reading scores. Fixes for request errors are
allowed. Changes made after seeing a score are reported as a separate,
non-counting run.
