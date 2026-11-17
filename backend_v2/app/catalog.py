"""What each page shows, which app and Kumo model it needs, and what state it is in.

One list (FEATURES) drives every page: the API turns it into sections, the app draws each section by
its state. Source of truth for the list: docs/pages.md and docs/kumo-integrations-map.md.
"""
from dataclasses import dataclass, field
from typing import Literal

Page = Literal["command", "products", "product", "customers", "ads", "support", "money", "connections"]
PAGES: tuple[str, ...] = ("command", "products", "product", "customers", "ads", "support", "money", "connections")
GPU_MODELS = frozenset({"forecast", "anomaly"})  # Kumo-TS: run on the GPU worker (gpu_worker/)

APP_NAMES = {"shopify": "Shopify", "ads": "Google, Meta or TikTok Ads", "payments": "Stripe or PayPal", "support": "Gorgias"}
PROVIDER_APP = {
    "shopify": "shopify",
    "google-ads": "ads", "meta-marketing-api": "ads", "tiktok-ads": "ads", "microsoft-ads": "ads", "pinterest": "ads", "snapchat": "ads",
    "stripe": "payments", "paypal": "payments", "recharge": "payments",
    "gorgias": "support",
}
LIVE_STATUSES = frozenset({"connected", "importing", "synced"})


@dataclass(frozen=True)
class Feature:
    key: str
    page: str
    title: str
    needs: frozenset[str]
    shows: str  # exact | range | band | count | list | statement
    model: str | None = None  # Kumo model; None = exact data or our own math
    idea: int | None = None  # number in CLAUDE.md
    built: bool = False
    blocked: str | None = None  # why it may not show yet, in the merchant's words
    math: bool = False  # our own calculation on top of a Kumo result
    extra: dict = field(default_factory=dict, hash=False, compare=False)

    @property
    def source(self) -> str:
        if self.math:
            return "our_math"
        return "kumo" if self.model else "shopify"


S, A, P, G = frozenset({"shopify"}), frozenset({"shopify", "ads"}), frozenset({"shopify", "payments"}), frozenset({"shopify", "support"})
ALL = frozenset({"shopify", "ads", "payments", "support"})
TOTALS_TEST = "Waits on the test of whole-store and city totals"
NOT_PASSED = "Hidden until it passes a backtest"

FEATURES: tuple[Feature, ...] = (
    # Command: the globe.
    Feature("stock_map", "command", "Stock per location", S, "exact", built=True),
    Feature("timeline", "command", "Stock over the next 14 days", S, "range", "relational", 1, math=True),
    Feature("sellout_map", "command", "Locations that could run out", S, "band", "relational", 3, math=True, built=True, blocked=NOT_PASSED),
    Feature("deliveries", "command", "Deliveries to customers", S, "band", "relational", 4),
    Feature("heatmap_orders", "command", "Heatmap: orders, last 14 days", S, "exact", built=True),
    Feature("heatmap_demand", "command", "Heatmap: demand, next 14 days", S, "range", "relational", 15, blocked=TOTALS_TEST),
    Feature("heatmap_returns", "command", "Heatmap: returns likely", S, "band", "relational", 5),
    Feature("heatmap_delays", "command", "Heatmap: delivery delays likely", S, "band", "relational", 4),
    Feature("heatmap_first_time", "command", "Heatmap: first-time buyers coming back", S, "band", "relational", 10),
    Feature("sellout_while_ads", "command", "Selling out while ads still run", A, "statement", "relational", 35, math=True),
    Feature("anomaly_alerts", "command", "Sudden changes: sales drop, refund spike, orders stopping", S, "statement", "anomaly"),
    # Products: the table, then the product page.
    Feature("demand_14d", "products", "Will sell in 14 days", S, "range", "relational", 1, built=True),
    Feature("sellout_risk", "products", "Sell-out risk", S, "band", "relational", 3, math=True, built=True, blocked=NOT_PASSED),
    Feature("return_rate", "products", "Units likely to come back", S, "range", "relational", 6),
    Feature("complaint_risk", "products", "Complaint risk", G, "band", "relational", 24),
    Feature("profit", "products", "Profit after ads, refunds and disputes", ALL, "range", "relational", 36, math=True),
    Feature("daily_demand", "product", "Sales curve, next 14 days", S, "range", "relational", 1),
    Feature("location_demand", "product", "Will sell per location", S, "range", "relational", 2),
    Feature("runs_out", "product", "When it could run out", S, "statement", "relational", 3, math=True, built=True, blocked=NOT_PASSED),
    Feature("product_returns", "product", "Units likely to come back", S, "range", "relational", 6),
    Feature("bought_next", "product", "What customers usually buy next", S, "list", "relational", 9),
    Feature("best_platform", "product", "Best ad platform", A, "band", "relational", 21),
    Feature("shopping_ads", "product", "Likely to sell from Shopping ads", A, "band", "relational", 20),
    # Customers: groups per region, never names.
    Feature("customers_by_region", "customers", "Customers per region", S, "exact", built=True),
    Feature("first_time_return", "customers", "First-time buyers likely to return", S, "count", "relational", 10),
    Feature("discount_only", "customers", "Customers who only buy with a discount", S, "count", "relational", 12),
    Feature("next_purchase", "customers", "Products customers are likely to buy next", S, "list", "relational", 9),
    Feature("checkouts_back", "customers", "Abandoned checkouts likely to come back", S, "count", "relational", 11),
    Feature("stop_buying", "customers", "Customers likely to stop buying", S, "count", "tabular", 7, blocked=NOT_PASSED),
    Feature("subscribers_cancel", "customers", "Subscribers likely to cancel", P, "count", "relational", 33),
    Feature("value_by_platform", "customers", "Customer value by ad platform", A, "range", "relational", 37),
    # Ads.
    Feature("campaign_revenue", "ads", "Campaign revenue, next 7 days", A, "range", "relational", 13),
    Feature("campaign_spend", "ads", "Campaign spend, next 7 days", A, "range", "relational", 22),
    Feature("missing_target", "ads", "Campaigns likely to miss their return target", A, "band", "relational", 16),
    Feature("ads_fading", "ads", "Ads about to fade", A, "band", "relational", 17),
    Feature("ads_winning", "ads", "New ads likely to win", A, "band", "relational", 18),
    Feature("wasted_terms", "ads", "Search terms likely to waste money", A, "list", "relational", 19),
    Feature("campaign_returns", "ads", "Campaigns bringing returns and disputes", A | P, "range", "relational", 38),
    # Support.
    Feature("tickets_per_day", "support", "Tickets per day, next 14 days", G, "range", "forecast", 23, blocked=TOTALS_TEST),
    Feature("support_surges", "support", "Surges after a campaign or delay", G | A, "range", "forecast", 39, blocked=TOTALS_TEST),
    Feature("ticket_refund", "support", "Tickets likely to end in a refund", G, "count", "tabular", 25),
    Feature("ticket_low_score", "support", "Tickets likely to get a low score", G, "count", "tabular", 26),
    Feature("complaint_products", "support", "Products causing the most complaints", G, "list", "relational", 24),
    # Money.
    Feature("money_in", "money", "Money coming in, next 14 days", P, "range", "forecast", 31, blocked=TOTALS_TEST),
    Feature("refund_amounts", "money", "Refunds, next 14 days", P, "range", "forecast", 30, blocked=TOTALS_TEST),
    Feature("dispute_count", "money", "Disputes, next 14 days", P, "range", "forecast", 28, blocked=TOTALS_TEST),
    Feature("renewals", "money", "Renewal revenue, next 14 days", P, "range", "forecast", 34, blocked=TOTALS_TEST),
    Feature("chargeback_risk", "money", "Open orders at risk of a chargeback", P, "count", "tabular", 27),
    Feature("disputes_won", "money", "Disputes likely to be won", P, "band", "tabular", 29),
    Feature("failed_payments", "money", "Subscription payments likely to fail", P, "count", "tabular", 32),
    Feature("risky_orders", "money", "Riskiest orders, all history", P | G, "count", "relational", 41),
    # Connections.
    Feature("apps", "connections", "Connected apps and last sync", S, "exact", built=True),
    Feature("kumo_runs", "connections", "Last Kumo run", S, "exact", built=True),
)


def connected_apps(integrations: list[dict]) -> set[str]:
    """Apps with a live connection. A failed or revoked connection does not count."""
    return {PROVIDER_APP[i["provider"]] for i in integrations if i["status"] in LIVE_STATUSES and i["provider"] in PROVIDER_APP}


def section_state(f: Feature, connected: set[str], gpu_ready: bool) -> dict:
    """In order: a missing app, then a missing GPU, then a reason to hold it back, then not built yet."""
    missing = sorted(f.needs - connected, key=list(APP_NAMES).index)
    if missing:
        state, message = "not_connected", "Connect " + " and ".join(APP_NAMES[a] for a in missing)
    elif f.model in GPU_MODELS and not gpu_ready:
        state, message = "needs_gpu", "Runs on a GPU server, which is not set up yet"
    elif f.blocked:
        state, message = "blocked", f.blocked
    elif not f.built:
        state, message = "not_built", "Coming later"
    else:
        state, message = "ready", ""
    return {"key": f.key, "idea": f.idea, "title": f.title, "shows": f.shows, "source": f.source, "model": f.model,
            "needs": sorted(f.needs, key=list(APP_NAMES).index), "state": state, "message": message}


def page_sections(page: str, connected: set[str], gpu_ready: bool) -> list[dict]:
    return [section_state(f, connected, gpu_ready) for f in FEATURES if f.page == page]
