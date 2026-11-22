"""The ordering math: forecast, run-out date, order-by date, and stock Dana is stuck with.

Plain-language version:
1. Forecast: for each future day, look at what this item sold around the same day last year.
2. Start with sellable stock, take away orders already booked, then walk forward day by day:
   add POs when they're expected to land, use up stock oldest-expiry first, and drop any lot
   the day it gets inside six months of expiry (Dana can't sell it at full price after that).
3. The first day demand can't be met is the run-out date.
4. Order-by date = run-out date - lead time - safety stock.
Late POs (past every reasonable arrival date) are NOT counted, per Dana. If an item would be
fine only with a late PO, it gets flagged.
"""
import math
from dataclasses import dataclass, field
from datetime import date, timedelta

import pandas as pd

from . import settings

TODAY = settings.TODAY
LENT_2027 = (date(2027, 2, 3), date(2027, 4, 4))  # a week either side of Ash Wednesday Feb 10 .. Easter Mar 28


def last_year_same_day(d: date) -> date:
    """Same weekday, one year earlier. Lent 2027 starts 8 days earlier than Lent 2026
    (Feb 10 vs Feb 18), so during Lent we go back 51 weeks instead of 52 to line up the surge."""
    if LENT_2027[0] <= d <= LENT_2027[1]:
        return d - timedelta(days=357)
    return d - timedelta(days=364)


@dataclass
class Forecast:
    daily: list[float]          # forecast units per day, index 0 = today
    method: str
    filled_weeks: list = field(default_factory=list)  # history weeks treated as stockouts


HISTORY_START = date(2025, 11, 3)   # first full Monday-to-Sunday week in the sales export
HISTORY_END = date(2026, 11, 15)    # last day in the export


def fill_stockout_weeks(daily_sales: dict) -> tuple[dict, list]:
    """A week with almost no sales for an item that normally sells is most likely a stockout,
    not a lack of demand (e.g. 16/20 shrimp ran out before Christmas 2025). Copying those zeros
    into the forecast would repeat the stockout. Replace such weeks with the average of the
    two good weeks before and after."""
    weeks = []
    d = HISTORY_START
    while d + timedelta(days=6) <= HISTORY_END:
        weeks.append((d, sum(daily_sales.get(d + timedelta(days=k), 0.0) for k in range(7))))
        d += timedelta(days=7)
    totals = sorted(t for _, t in weeks)
    median = totals[len(totals) // 2] if totals else 0
    if median <= 3:
        return daily_sales, []
    bad = {i for i, (_, t) in enumerate(weeks) if t < 0.15 * median}
    filled, notes = dict(daily_sales), []
    for i in sorted(bad):
        neighbours = [weeks[j][1] for j in range(i - 2, i + 3)
                      if 0 <= j < len(weeks) and j not in bad]
        est = sum(neighbours) / len(neighbours) if neighbours else median
        for k in range(7):
            filled[weeks[i][0] + timedelta(days=k)] = est / 7
        notes.append({"week_of": weeks[i][0], "actual": round(weeks[i][1], 1), "used": round(est, 1)})
    return filled, notes


def build_forecasts(sales: pd.DataFrame, item_codes) -> dict[str, Forecast]:
    """Daily forecast for each item = average daily sales in a 3-week window centred on
    the same day last year. Smoothing stops one big order from creating a fake spike."""
    by_item = {code: g.groupby("order_date")["qty"].sum().to_dict()
               for code, g in sales.groupby("item_code")}
    out = {}
    for code in item_codes:
        daily_sales, filled = fill_stockout_weeks(by_item.get(code, {}))
        values = []
        for i in range(settings.HORIZON_DAYS + 7):
            ly = last_year_same_day(TODAY + timedelta(days=i))
            window = [daily_sales.get(ly + timedelta(days=k), 0.0) for k in range(-10, 11)]
            values.append(sum(window) / 21)
        out[code] = Forecast(values, "Same weeks last year (3-week average)", filled)
    return out


@dataclass
class Batch:
    """A pile of stock that gets used up: an on-hand lot or an arriving PO."""
    label: str
    qty: float
    usable_until: date | None   # None = no expiry known (adjustments, new arrivals)
    location: str = ""
    unit_cost: float = 0.0


@dataclass
class Projection:
    runout: date | None
    end_stock: list[float]                       # usable stock at end of each day
    crossings: list[dict] = field(default_factory=list)  # lots that hit the six-month line with stock left


def project(start_batches, arrivals, open_orders_qty, forecast: Forecast) -> Projection:
    batches = [Batch(**vars(b)) for b in start_batches]
    arrivals = sorted(arrivals, key=lambda a: a[0])

    def use(qty):
        """Use stock oldest-expiry first. Returns how much demand could NOT be met."""
        batches.sort(key=lambda b: (b.usable_until or date.max))
        for b in batches:
            take = min(b.qty, qty)
            b.qty -= take
            qty -= take
            if qty <= 1e-9:
                return 0.0
        return qty

    runout = None
    end_stock, crossings = [], []
    for i in range(settings.HORIZON_DAYS):
        day = TODAY + timedelta(days=i)
        for arrive_day, b in [a for a in arrivals if a[0] == day]:
            batches.append(Batch(**vars(b)))
        # A lot that gets inside six months today can't be sold at full price any more.
        for b in batches:
            if b.usable_until and b.usable_until <= day and b.qty > 1e-6:
                crossings.append({"lot": b.label, "location": b.location, "date": day,
                                  "qty": round(b.qty, 1), "value": round(b.qty * b.unit_cost, 2)})
                b.qty = 0
        # Day 0 also ships the orders already booked (they're spoken for).
        demand = forecast.daily[i] + (open_orders_qty if i == 0 else 0)
        short = use(demand)
        if short > 1e-6 and runout is None:
            runout = day
        end_stock.append(sum(b.qty for b in batches))
    return Projection(runout, end_stock, crossings)


def po_arrival(po, lead_days) -> date:
    """BlueTide's expected dates are the vendor's old quote. Use the later of that date and
    order date + Dana's real lead time."""
    return max(po["vendor_expected_date"], po["order_date"] + timedelta(days=lead_days))


def harbor_monthly_cost(cases: float) -> float:
    """$30 per pallet per month, ~50 cases per pallet, a part-full pallet still takes a slot."""
    if cases <= 0:
        return 0.0
    return math.ceil(cases / settings.HARBOR_CASES_PER_PALLET) * settings.HARBOR_COST_PER_PALLET


def round_order(qty, uom):
    if qty <= 0:
        return 0
    return math.ceil(qty) if uom == "CS" else int(math.ceil(qty / 10) * 10)


class Engine:
    """Runs every calculation once from the clean tables and keeps the results."""

    def __init__(self, t: dict[str, pd.DataFrame]):
        self.t = t
        items = t["items"]
        self.items = items.set_index("item_code")
        self.vendors = t["vendors"].set_index("vendor_code")
        frozen = items[~items["is_fresh"]]
        self.forecasts = build_forecasts(t["sales"], frozen["item_code"])
        self.results = {code: self._analyze(code) for code in frozen["item_code"]}

    # ---------- per item ----------
    def _vendor(self, code):
        vc = self.items.at[code, "vendor_code"]
        if vc in self.vendors.index:
            v = self.vendors.loc[vc]
            return vc, int(v["lead_days"]), int(v["safety_days"]), int(v["cover_days"])
        return vc, 28, 7, 28

    def _analyze(self, code):
        item = self.items.loc[code]
        uom = item["sell_uom"]
        vendor, lead, safety, cover = self._vendor(code)
        lots = self.t["lots"][self.t["lots"]["item_code"] == code]
        pos = self.t["open_pos"][self.t["open_pos"]["item_code"] == code]
        oo = self.t["open_orders"][self.t["open_orders"]["item_code"] == code]
        fc = self.forecasts[code]
        if item["is_discontinued"]:
            fc = Forecast([0.0] * len(fc.daily), "Discontinued: no future demand")

        # Classify every lot so the detail page can say why it does or doesn't count.
        lot_rows, start = [], []
        for _, l in lots.iterrows():
            row = {"lot_no": l["lot_no"], "location": l["location"], "qty": round(float(l["qty"]), 1),
                   "qty_raw": float(l["qty_raw"]), "uom_raw": l["uom_raw"], "uom": uom,
                   "expiry_date": l["expiry_date"], "usable_until": l["usable_until"],
                   "unit_cost": None if pd.isna(l["unit_cost"]) else float(l["unit_cost"])}
            if not l["is_sellable_location"]:
                row["counts"], row["reason"] = False, f"On {l['location']}: not sellable"
            elif l["is_adjustment"]:
                row["counts"], row["reason"] = True, "Stock count correction"
                start.append(Batch(l["lot_no"], float(l["qty"]), None, l["location"]))
            elif l["expiry_date"] <= TODAY:
                row["counts"], row["reason"] = False, "Expired"
            elif l["usable_until"] <= TODAY:
                row["counts"], row["reason"] = False, "Less than 6 months left: discount or dump"
            else:
                row["counts"], row["reason"] = True, f"Sellable until {l['usable_until']:%b %d, %Y}"
                start.append(Batch(l["lot_no"], float(l["qty"]), l["usable_until"], l["location"],
                                   row["unit_cost"] or 0.0))
            lot_rows.append(row)

        # Negative adjustments reduce the total; take them out of the oldest stock.
        adj = [b for b in start if b.usable_until is None and b.qty < 0]
        start = [b for b in start if b not in adj]
        open_orders_qty = float(oo["qty"].sum()) + sum(-b.qty for b in adj)

        po_rows, on_time, late = [], [], []
        for _, p in pos.iterrows():
            arrive = po_arrival(p, lead)
            is_late = arrive <= TODAY
            po_rows.append({"po_no": p["po_no"], "order_date": p["order_date"],
                            "vendor_expected_date": p["vendor_expected_date"],
                            "estimated_arrival": None if is_late else arrive,
                            "qty_remaining": float(p["qty_remaining"]), "late": is_late})
            b = Batch(p["po_no"], float(p["qty_remaining"]), None, "incoming")
            (late if is_late else on_time).append((TODAY if is_late else arrive, b))

        proj = project(start, on_time, open_orders_qty, fc)
        proj_with_late = project(start, on_time + late, open_orders_qty, fc) if late else proj

        sellable_now = sum(b.qty for b in start)
        status, order_by, gap_days, suggested = "ok", None, None, None
        new_order_arrives = TODAY + timedelta(days=lead)
        if proj.runout and item["in_scope"]:
            order_by = proj.runout - timedelta(days=lead + safety)
            if proj.runout < new_order_arrives:
                status = "too_late"
            elif order_by <= TODAY + timedelta(days=7):
                status = "order_now"
            elif order_by <= TODAY + timedelta(days=28):
                status = "order_soon"
            # Suggestion: cover the weeks after a new order lands, minus what we'll still have then.
            i0 = (new_order_arrives - TODAY).days
            need = sum(fc.daily[i0:i0 + cover + safety])
            have = proj.end_stock[i0 - 1] if i0 > 0 else sellable_now
            if status != "ok":
                suggested = round_order(need - have, uom)
        # If we run out, until when? The next PO already on the way, or a new order placed today.
        out_until = None
        if proj.runout:
            later_pos = [d for d, _ in on_time if d > proj.runout]
            out_until = min(later_pos + [new_order_arrives]) if status == "too_late" else (min(later_pos) if later_pos else None)
            if out_until:
                gap_days = (out_until - proj.runout).days
        relies_on_late = bool(late) and status != "ok" and (
            proj_with_late.runout is None or proj_with_late.runout > proj.runout)

        weekly = []
        for w in range(16):
            s = w * 7
            ly_start = last_year_same_day(TODAY + timedelta(days=s))
            weekly.append({"week_of": TODAY + timedelta(days=s),
                           "forecast": round(sum(fc.daily[s:s + 7]), 1),
                           "last_year_same_week": self._actual(code, ly_start, 7),
                           "projected_stock": round(proj.end_stock[min(s + 6, len(proj.end_stock) - 1)], 1)})
        avg_week_26 = sum(fc.daily[:182]) / 26

        stock_at_harbor = sum(r["qty"] for r in lot_rows if r["location"] == settings.HARBOR)
        return {
            "item_code": code, "today_iso": TODAY.isoformat(), "description": item["description"], "category": item["category"],
            "uom": uom, "vendor_code": vendor, "lead_days": lead, "safety_days": safety,
            "in_scope": bool(item["in_scope"]), "discontinued": bool(item["is_discontinued"]),
            "sellable_now": round(sellable_now, 1),
            "open_orders_qty": round(float(oo["qty"].sum()), 1),
            "on_hold_qty": round(sum(r["qty"] for r in lot_rows if r["location"] not in settings.SELLABLE_LOCATIONS), 1),
            "incoming_qty": round(sum(b.qty for _, b in on_time), 1),
            "late_po_qty": round(sum(b.qty for _, b in late), 1),
            "avg_weekly_forecast": round(avg_week_26, 1),
            "next_4_weeks_forecast": round(sum(fc.daily[:28]), 1),
            "runout_date": proj.runout, "runout_with_late_pos": proj_with_late.runout,
            "order_by": order_by, "status": status, "gap_days": gap_days, "out_until": out_until,
            "relies_on_late_po": relies_on_late, "suggested_order": suggested,
            "new_order_arrives": new_order_arrives,
            "harbor_qty": round(stock_at_harbor, 1), "harbor_monthly_cost": harbor_monthly_cost(stock_at_harbor),
            "lots": lot_rows, "pos": po_rows,
            "open_orders": oo[["order_no", "order_date", "customer_name", "qty"]].to_dict("records"),
            "weekly": weekly, "crossings": proj.crossings,
            # Sales history only starts Oct 29, 2025, so compare the last 2 weeks (both years have data).
            "recent_2_weeks": self._actual(code, TODAY - timedelta(days=14), 14),
            "same_2_weeks_last_year": self._actual(code, TODAY - timedelta(days=14 + 364), 14),
            "forecast_method": fc.method, "stockout_weeks_filled": fc.filled_weeks,
        }

    def _actual(self, code, start: date, days: int) -> float:
        s = self.t["sales"]
        m = (s["item_code"] == code) & (s["order_date"] >= start) & (s["order_date"] < start + timedelta(days=days))
        return round(float(s.loc[m, "qty"].sum()), 1)

    # ---------- screens ----------
    def order_list(self):
        rank = {"too_late": 0, "order_now": 1, "order_soon": 2}
        rows = [r for r in self.results.values() if r["in_scope"] and r["status"] in rank]
        return sorted(rows, key=lambda r: (rank[r["status"]], r["order_by"] or TODAY))

    def stuck_list(self):
        """Stock Dana is stuck with: expired, inside six months now, will cross the line
        before it sells, too many weeks at Harbor, or discontinued items still in stock."""
        out = []
        for code, r in self.results.items():
            reasons = []
            for l in r["lots"]:
                if l["location"] not in settings.SELLABLE_LOCATIONS or l["lot_no"].startswith("ADJ"):
                    continue
                value = round(l["qty"] * (l["unit_cost"] or 0), 2)
                if l["reason"] == "Expired":
                    reasons.append({"kind": "expired", "lot_no": l["lot_no"], "location": l["location"],
                                    "qty": l["qty"], "date": l["expiry_date"], "value": value})
                elif l["reason"].startswith("Less than 6 months"):
                    reasons.append({"kind": "inside_6_months", "lot_no": l["lot_no"], "location": l["location"],
                                    "qty": l["qty"], "date": l["usable_until"], "value": value})
                elif r["discontinued"]:
                    reasons.append({"kind": "discontinued", "lot_no": l["lot_no"], "location": l["location"],
                                    "qty": l["qty"], "date": None, "value": value})
            for c in ([] if r["discontinued"] else r["crossings"]):
                if c["qty"] >= 1:
                    reasons.append({"kind": "will_cross_6_months", "lot_no": c["lot"], "location": c["location"],
                                    "qty": c["qty"], "date": c["date"], "value": c["value"]})
            weeks_cover = (r["sellable_now"] / r["avg_weekly_forecast"]) if r["avg_weekly_forecast"] > 0 else None
            too_long = r["harbor_qty"] > 0 and r["in_scope"] and (
                weeks_cover is None or weeks_cover > settings.HARBOR_TOO_MANY_WEEKS)
            if not reasons and not too_long:
                continue
            out.append({"item_code": code, "description": r["description"], "uom": r["uom"],
                        "reasons": reasons, "long_at_harbor": too_long,
                        "weeks_of_cover": None if weeks_cover is None else round(weeks_cover, 1),
                        "stuck_qty": round(sum(x["qty"] for x in reasons), 1),
                        "stuck_value": round(sum(x["value"] for x in reasons), 2),
                        "harbor_qty": r["harbor_qty"], "harbor_monthly_cost": r["harbor_monthly_cost"],
                        "in_scope": r["in_scope"]})
        return sorted(out, key=lambda x: -(x["stuck_value"] + 12 * x["harbor_monthly_cost"]))

    def harbor_list(self):
        """Everything at Harbor Cold Storage and what it costs per month."""
        rows = []
        for code, r in self.results.items():
            if r["harbor_qty"] <= 0:
                continue
            wk = r["avg_weekly_forecast"]
            rows.append({"item_code": code, "description": r["description"], "uom": r["uom"],
                         "harbor_qty": r["harbor_qty"], "harbor_monthly_cost": r["harbor_monthly_cost"],
                         "weeks_of_cover": round(r["sellable_now"] / wk, 1) if wk > 0 else None,
                         "sellable_at_harbor": round(sum(l["qty"] for l in r["lots"]
                                                         if l["location"] == settings.HARBOR and l["counts"]), 1)})
        return sorted(rows, key=lambda x: -x["harbor_monthly_cost"])

    def summary(self):
        orders = self.order_list()
        stuck = self.stuck_list()
        harbor = sum(r["harbor_monthly_cost"] for r in self.results.values())
        return {"today": TODAY,
                "too_late": sum(r["status"] == "too_late" for r in orders),
                "order_now": sum(r["status"] == "order_now" for r in orders),
                "order_soon": sum(r["status"] == "order_soon" for r in orders),
                "stuck_value": round(sum(s["stuck_value"] for s in stuck), 2),
                "harbor_monthly_cost": harbor}
