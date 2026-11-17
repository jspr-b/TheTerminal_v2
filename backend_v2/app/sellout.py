"""Sell-out risk: our own math on a Kumo 14-day range (idea #3).

Kumo gives one range for all 14 days. Until per-day forecasts exist (KF0001 05_daily_demand), the range
is spread evenly over its 14 days. Stock decisions use the top of the range because Kumo runs low.
Not backtested yet: tested=False, and CLAUDE.md keeps it away from merchants until a backtest passes.
"""
import math

DAYS = 14
TESTED = False  # flips only when the sell-out backtest (KF0001 06_sellout_risk/02) passes


def _day(stock: float, units_14d: float) -> int | None:
    """First day (1..14) on which cumulative sales reach the stock; 0 = already out; None = lasts past day 14."""
    if stock <= 0:
        return 0
    if units_14d <= 0:
        return None
    day = math.ceil(stock / (units_14d / DAYS) - 1e-9)
    return day if day <= DAYS else None


def sellout(stock: float, forecast: dict) -> dict:
    band = "high" if forecast["value"] >= stock else "medium" if forecast["upper"] >= stock else "low"
    return {"band": band, "earliest_day": _day(stock, forecast["upper"]), "likely_day": _day(stock, forecast["value"]),
            "latest_day": _day(stock, forecast["lower"]), "tested": TESTED}
