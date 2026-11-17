"""The feature catalog: which page shows what, which app and Kumo model it needs, and what state it is in."""
import pytest

from app.catalog import FEATURES, PAGES, connected_apps, page_sections, section_state


def by_key(key):
    return next(f for f in FEATURES if f.key == key)


def test_keys_are_unique_and_every_page_has_features():
    assert len({f.key for f in FEATURES}) == len(FEATURES)
    for page in PAGES:
        assert any(f.page == page for f in FEATURES), page


def test_every_feature_names_a_known_page_app_and_display():
    for f in FEATURES:
        assert f.page in PAGES
        assert f.needs <= {"shopify", "ads", "payments", "support"} and f.needs, f.key
        assert f.shows in {"exact", "range", "band", "count", "list", "statement"}, f.key
        assert f.model in {None, "relational", "tabular", "forecast", "anomaly"}, f.key


def test_kumo_numbers_are_never_shown_as_exact():
    """CLAUDE.md: a prediction is a range or a band, never an exact number or percent."""
    for f in FEATURES:
        if f.model is not None:
            assert f.shows != "exact", f.key


def test_providers_map_to_apps_and_only_live_connections_count():
    rows = [{"provider": "shopify", "status": "synced"}, {"provider": "google-ads", "status": "connected"},
            {"provider": "stripe", "status": "error"}, {"provider": "gorgias", "status": "revoked"}]
    assert connected_apps(rows) == {"shopify", "ads"}


def test_missing_app_wins_over_everything_else():
    assert section_state(by_key("campaign_revenue"), connected={"shopify"}, gpu_ready=False)["state"] == "not_connected"


def test_not_connected_says_which_app_to_connect():
    s = section_state(by_key("campaign_revenue"), connected={"shopify"}, gpu_ready=False)
    assert "Google, Meta or TikTok" in s["message"]


def test_gpu_models_need_the_gpu_worker():
    f = by_key("money_in")
    assert f.model == "forecast"
    assert section_state(f, connected={"shopify", "payments"}, gpu_ready=False)["state"] == "needs_gpu"
    assert section_state(f, connected={"shopify", "payments"}, gpu_ready=True)["state"] != "needs_gpu"


def test_demand_forecast_is_ready_with_shopify():
    assert section_state(by_key("demand_14d"), connected={"shopify"}, gpu_ready=False)["state"] == "ready"


def test_unbuilt_feature_says_so():
    assert section_state(by_key("return_rate"), connected={"shopify"}, gpu_ready=True)["state"] == "not_built"


def test_sellout_is_built_but_held_back_until_its_backtest():
    s = section_state(by_key("sellout_risk"), connected={"shopify"}, gpu_ready=True)
    assert s["state"] == "blocked" and "backtest" in s["message"]


def test_stop_buying_stays_hidden_until_a_backtest_passes():
    s = section_state(by_key("stop_buying"), connected={"shopify"}, gpu_ready=True)
    assert s["state"] == "blocked" and "backtest" in s["message"]


def test_nothing_is_ready_without_shopify():
    for page in PAGES:
        assert all(s["state"] != "ready" for s in page_sections(page, connected=set(), gpu_ready=True)), page


@pytest.mark.parametrize("page", ["ads", "support", "money"])
def test_later_app_pages_with_shopify_only_ask_for_their_app(page):
    states = {s["state"] for s in page_sections(page, connected={"shopify"}, gpu_ready=False)}
    assert states == {"not_connected"}


def test_section_carries_what_the_page_needs_to_draw_it():
    s = section_state(by_key("demand_14d"), connected={"shopify"}, gpu_ready=False)
    assert {"key", "idea", "title", "shows", "source", "model", "needs", "state", "message"} <= set(s)
    assert s["source"] == "kumo" and s["model"] == "relational"
    assert section_state(by_key("heatmap_orders"), connected={"shopify"}, gpu_ready=False)["source"] == "shopify"
