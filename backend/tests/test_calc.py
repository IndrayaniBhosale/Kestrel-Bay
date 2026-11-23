"""Run from the backend folder:  pytest
These test the business rules directly, without a database."""
from datetime import date, timedelta

from app.calc import (Batch, Forecast, fill_stockout_weeks, harbor_monthly_cost,
                      last_year_same_day, project)
from app.cleaning import load_all, parse_lb_per_case
from app.settings import TODAY


def test_pack_sizes():
    assert parse_lb_per_case("6x2.2lb") == 13.2
    assert parse_lb_per_case("10/2#") == 20
    assert parse_lb_per_case("5 x 2 lb") == 10
    assert parse_lb_per_case("10 lb cs") == 10
    assert round(parse_lb_per_case("5kg"), 2) == 11.02
    assert parse_lb_per_case("catch wt") is None


def test_last_year_lines_up_weekday_and_lent():
    d = date(2026, 12, 14)
    assert last_year_same_day(d).weekday() == d.weekday()
    # Ash Wednesday 2027 (Feb 10) maps to Ash Wednesday 2026 (Feb 18)
    assert last_year_same_day(date(2027, 2, 10)) == date(2026, 2, 18)


def test_harbor_cost_rounds_up_to_whole_pallets():
    assert harbor_monthly_cost(0) == 0
    assert harbor_monthly_cost(50) == 30
    assert harbor_monthly_cost(51) == 60


def test_runout_and_arrival():
    fc = Forecast([10.0] * 200, "flat")
    lots = [Batch("L1", 100, None)]
    p = project(lots, [], open_orders_qty=0, forecast=fc)
    assert p.runout == TODAY + timedelta(days=10)
    # A PO landing on day 5 pushes the run-out out
    p2 = project(lots, [(TODAY + timedelta(days=5), Batch("PO", 100, None))], 0, fc)
    assert p2.runout == TODAY + timedelta(days=20)


def test_open_orders_come_out_first():
    fc = Forecast([0.0] * 200, "none")
    p = project([Batch("L1", 50, None)], [], open_orders_qty=60, forecast=fc)
    assert p.runout == TODAY


def test_lot_dropped_at_six_month_line():
    fc = Forecast([1.0] * 200, "flat")
    crosses = TODAY + timedelta(days=5)
    p = project([Batch("OLD", 100, crosses, "HCS", 10.0)], [], 0, fc)
    assert p.runout == crosses                      # nothing sellable after it crosses
    assert p.crossings[0]["qty"] == 95              # 5 sold before, 95 stuck
    assert p.crossings[0]["value"] == 950


def test_stockout_week_is_filled_not_copied():
    start = date(2025, 11, 3)
    sales = {start + timedelta(days=i): 10.0 for i in range(370)}
    for i in range(7):                              # one dead week
        sales[date(2025, 12, 15) + timedelta(days=i)] = 0.0
    filled, notes = fill_stockout_weeks(sales)
    assert notes and notes[0]["week_of"] == date(2025, 12, 15)
    assert filled[date(2025, 12, 17)] == 10.0


def test_cleaning_matches_raw_files():
    t = load_all()
    lots = t["lots"]
    sellable = lots[lots["is_sellable_location"]].groupby("item_code")["qty"].sum()
    assert sellable["SHR-1620"] == 480          # includes the 'shr-1620 ' row at PVD, excludes QA-HOLD
    assert sellable["SAL-POR6"] == 1350
    pos = t["open_pos"]
    assert len(pos[pos["po_no"] == "PO-260439"]) == 1           # duplicate removed
    assert pos.loc[pos["po_no"] == "PO-260376", "qty_remaining"].item() == 400  # 1000 - 600
    sales = t["sales"]
    assert not sales["customer_code"].isin(["INT01", "CRU01"]).any()
    assert (sales["qty"] > 0).all()


def test_cost_converted_with_quantity():
    t = load_all()
    lot = t["lots"][t["lots"]["lot_no"] == "L261005-02"].iloc[0]   # calamari received as 132 lb at $2.71/lb
    assert lot["qty"] == 10                                         # 132 lb / 13.2 lb per case
    assert round(lot["unit_cost"], 2) == round(2.71 * 13.2, 2)     # cost per case, not per lb
    assert round(lot["qty"] * lot["unit_cost"], 2) == round(132 * 2.71, 2)  # value unchanged
