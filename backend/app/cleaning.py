"""Turns the raw BlueTide CSV exports into clean tables.

Every rule here comes from the kickoff call, Dana's email, or a problem found in the data.
Each function returns (clean_dataframe, list_of_notes); the notes record what was
excluded and why, so the app can show Dana what was filtered out.
"""
import re
from pathlib import Path

import pandas as pd

from . import settings

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def norm_code(s: pd.Series) -> pd.Series:
    """Item codes appear as 'shr-1620 ', 'Sal-Por6', 'COD-LOIN '. Trim and uppercase everywhere."""
    return s.astype(str).str.strip().str.upper()


def parse_lb_per_case(pack_size) -> float | None:
    """Pack size is free text. Return pounds per case, or None if it can't be read.

    '6x2.2lb' -> 13.2, '10/2#' -> 20, '5 x 2 lb' -> 10, '10 lb cs' -> 10, '5kg' -> 11.02,
    'catch wt' / 'per lb' / blank -> None (those items are sold by the pound anyway).
    """
    if not isinstance(pack_size, str):
        return None
    text = pack_size.lower().replace("#", "lb")
    multi = re.search(r"(\d+(?:\.\d+)?)\s*[x/]\s*(\d+(?:\.\d+)?)\s*(lb|kg)?", text)
    if multi:
        lbs = round(float(multi.group(1)) * float(multi.group(2)), 3)
        return round(lbs * 2.20462, 3) if multi.group(3) == "kg" else lbs
    single = re.search(r"(\d+(?:\.\d+)?)\s*(lb|kg)", text)
    if single:
        lbs = float(single.group(1))
        return round(lbs * 2.20462, 3) if single.group(2) == "kg" else lbs
    return None


def clean_items():
    raw = pd.read_csv(DATA_DIR / "items.csv", dtype=str)
    notes = []
    df = raw.copy()
    df["item_code"] = norm_code(df["item_code"])

    # Duplicate item rows ('COD-LOIN ', 'Sal-Por6', 'shr-1620 ') are second copies with blank
    # UPC and bin. Keep the first, complete row.
    dupes = df.duplicated("item_code", keep="first")
    notes.append(("Duplicate item records merged", int(dupes.sum()),
                  "Same item code typed differently (spaces, lower case)"))
    df = df[~dupes]

    df["status_raw"] = df["status"].fillna("")
    status = df["status_raw"].str.strip().str.upper()
    df["is_old_system"] = df["item_code"].str.startswith("ZZ")
    df["is_fresh"] = df["storage"].str.upper().eq("FRESH")
    df["is_discontinued"] = (status.isin(["DISC", "DISCONTINUED"])
                             | df["is_old_system"]
                             | df["item_code"].isin(settings.DISCONTINUED_BY_DANA))
    # In scope = frozen items Dana still buys. Fresh is a separate daily process (out of scope).
    df["in_scope"] = ~df["is_fresh"] & ~df["is_discontinued"]
    df["lb_per_case"] = df["pack_size"].map(parse_lb_per_case)
    df["category"] = df["category"].str.strip().str.title()

    notes.append(("Old-system items (ZZ)", int(df["is_old_system"].sum()), "Dead items from the old system"))
    notes.append(("Fresh items", int(df["is_fresh"].sum()), "Out of scope: bought daily off the boats"))
    cols = ["item_code", "description", "category", "vendor_code", "sell_uom", "pack_size",
            "lb_per_case", "status_raw", "is_discontinued", "is_old_system", "is_fresh", "in_scope"]
    return df[cols].reset_index(drop=True), notes


def to_sell_uom(qty, uom, sell_uom, lb_per_case):
    """Convert a quantity to the item's selling unit (CS or LB) using the pack size."""
    if uom == sell_uom:
        return qty
    if lb_per_case is None or pd.isna(lb_per_case):
        return None  # can't convert; flagged in notes
    if uom == "LB" and sell_uom == "CS":
        return qty / lb_per_case
    if uom == "CS" and sell_uom == "LB":
        return qty * lb_per_case
    return None


def cost_per_sell_uom(cost, uom, sell_uom, lb_per_case):
    """Unit cost in the item's selling unit. The opposite direction of to_sell_uom."""
    if pd.isna(cost) or uom == sell_uom:
        return cost
    if uom == "LB" and sell_uom == "CS":
        return round(cost * lb_per_case, 4)
    if uom == "CS" and sell_uom == "LB":
        return round(cost / lb_per_case, 4)
    return cost


def clean_lots(items: pd.DataFrame):
    raw = pd.read_csv(DATA_DIR / "inventory_on_hand.csv", dtype={"lot_no": str})
    notes = []
    df = raw.copy()
    df["item_code"] = norm_code(df["item_code"])

    # The nightly export sometimes contains two nights. Use only the latest snapshot.
    latest = df["snapshot_date"].max()
    old = df["snapshot_date"] != latest
    notes.append(("Older snapshot rows dropped", int(old.sum()),
                  f"File contained more than one night; kept {latest} only"))
    df = df[~old]

    # Empty split lots ('...B' lots with qty 0) carry no stock.
    empty = df["qty"] == 0
    notes.append(("Empty lots dropped", int(empty.sum()), "Lots with zero quantity"))
    df = df[~empty]

    df = df.merge(items[["item_code", "sell_uom", "lb_per_case", "in_scope", "is_old_system", "is_fresh"]],
                  on="item_code", how="left")
    df["qty_raw"] = df["qty"]
    df["uom_raw"] = df["uom"]
    df["qty"] = [to_sell_uom(q, u, s, l) for q, u, s, l in
                 zip(df["qty"], df["uom"], df["sell_uom"], df["lb_per_case"])]
    # The cost is per the lot's own unit, so convert it the same way: a lot received in pounds at
    # $2.71/lb is worth $2.71 x pounds-per-case for each case.
    df["unit_cost"] = [cost_per_sell_uom(c, u, s, l) for c, u, s, l in
                       zip(df["unit_cost"], df["uom_raw"], df["sell_uom"], df["lb_per_case"])]
    converted = (df["uom_raw"] != df["sell_uom"]).sum()
    notes.append(("Lots converted between pounds and cases", int(converted),
                  "Received in a different unit than the item is sold in; converted using pack size"))
    if df["qty"].isna().any():
        raise ValueError(f"Could not convert units for: {df[df['qty'].isna()]['item_code'].tolist()}")

    for col in ["pack_date", "expiry_date", "received_date"]:
        df[col] = pd.to_datetime(df[col]).dt.date
    # A lot stops being sellable six months before it expires (Dana).
    df["usable_until"] = (pd.to_datetime(df["expiry_date"])
                          - pd.DateOffset(months=settings.MIN_MONTHS_LEFT)).dt.date

    df["is_adjustment"] = df["lot_no"].str.startswith("ADJ")
    df["is_sellable_location"] = df["location"].isin(settings.SELLABLE_LOCATIONS)
    held = ~df["is_sellable_location"] & df["in_scope"].fillna(False)
    notes.append(("Lots on hold or damaged", int(held.sum()),
                  "QA-HOLD and DAMAGED are not sellable; shown on the item but not counted"))
    notes.append(("Stock adjustments without a lot", int(df["is_adjustment"].sum()),
                  "Count corrections (negative); counted in the item total, no expiry date"))

    cols = ["item_code", "location", "lot_no", "qty", "qty_raw", "uom_raw", "pack_date", "expiry_date",
            "usable_until", "received_date", "unit_cost", "is_adjustment", "is_sellable_location"]
    return df[cols].reset_index(drop=True), notes


def clean_open_pos(items: pd.DataFrame):
    raw = pd.read_csv(DATA_DIR / "purchase_orders.csv")
    notes = []
    df = raw.copy()
    df["item_code"] = norm_code(df["item_code"])

    # The report includes received and cancelled POs. Only Open lines are still coming.
    not_open = df["status"] != "Open"
    notes.append(("Closed, received or cancelled PO lines", int(not_open.sum()), "Not coming anymore"))
    df = df[~not_open]

    # Two PO lines appear twice in the export. Dana confirmed: one order each.
    dupes = df.duplicated(["po_no", "line_no"], keep="first")
    notes.append(("Duplicate PO lines dropped", int(dupes.sum()), "PO-260439 and PO-260445 listed twice"))
    df = df[~dupes]

    # Partly received POs stay open for the rest (e.g. 600 of 1,000 arrived).
    df = df.merge(items[["item_code", "sell_uom", "lb_per_case"]], on="item_code", how="left")
    df["qty_remaining"] = [to_sell_uom(o - r, u, s, l) for o, r, u, s, l in
                           zip(df["qty_ordered"], df["qty_received"], df["uom"], df["sell_uom"], df["lb_per_case"])]
    df = df[df["qty_remaining"] > 0]
    df["order_date"] = pd.to_datetime(df["order_date"]).dt.date
    df["vendor_expected_date"] = pd.to_datetime(df["expected_date"]).dt.date
    cols = ["po_no", "line_no", "vendor_code", "item_code", "order_date", "vendor_expected_date",
            "qty_ordered", "qty_received", "qty_remaining", "unit_cost"]
    return df[cols].reset_index(drop=True), notes


def parse_mixed_dates(s: pd.Series) -> pd.Series:
    """Most dates are 2026-01-04, but 51 January rows are 01/04/2026 (month first:
    the ship dates follow 1-3 days later and the order numbers fit January)."""
    iso = pd.to_datetime(s, format="%Y-%m-%d", errors="coerce")
    us = pd.to_datetime(s, format="%m/%d/%Y", errors="coerce")
    out = iso.fillna(us)
    if out.isna().any():
        raise ValueError(f"Unparseable dates: {s[out.isna()].unique()[:5]}")
    return out.dt.date


def clean_sales(items: pd.DataFrame):
    raw = pd.read_csv(DATA_DIR / "sales_lines.csv")
    notes = []
    df = raw.copy()
    df["item_code"] = norm_code(df["item_code"])
    df["order_date"] = parse_mixed_dates(df["order_date"])
    notes.append(("Sales dates in MM/DD/YYYY format fixed",
                  int((~raw["order_date"].str.match(r"^\d{4}-")).sum()), "Mixed date formats in export"))

    in_scope = df["item_code"].isin(items.loc[items["in_scope"], "item_code"])
    is_transfer = df["customer_code"] == settings.TRANSFER_CUSTOMER
    is_one_off = df["customer_code"].isin(settings.ONE_OFF_CUSTOMERS)
    is_credit = df["qty"] < 0
    is_sample = df["unit_price"] == 0

    # Booked but not shipped: already spoken for, so it reduces available stock (Dana).
    open_orders = df[(df["status"] == "OPEN") & in_scope & ~is_transfer & (df["qty"] > 0)]

    # Real demand history: invoiced sales to real customers.
    keep = (df["status"] == "INVOICED") & in_scope & ~is_transfer & ~is_one_off & ~is_credit & ~is_sample
    notes += [
        ("Transfers between buildings", int(is_transfer.sum()), "'TRANSFER - PVD' is not a sale"),
        ("One-off cruise line order", int(is_one_off.sum()), "Six weeks of shrimp in one order, never repeated"),
        ("Credits / returns", int(is_credit.sum()), "Negative sales entered by accounting"),
        ("Free samples", int(is_sample.sum()), "Zero-dollar orders"),
        ("Cancelled sales lines", int((df["status"] == "CANCELLED").sum()), "Never shipped"),
        ("Open sales orders (spoken for)", int(len(open_orders)), "Booked, not shipped yet: subtracted from stock"),
    ]
    cols = ["order_no", "order_date", "customer_code", "customer_name", "item_code", "qty"]
    return df.loc[keep, cols].reset_index(drop=True), open_orders[cols].reset_index(drop=True), notes


def clean_vendors():
    raw = pd.read_csv(DATA_DIR / "vendors.csv", dtype=str)
    rows = []
    for _, v in raw.iterrows():
        d = settings.VENDOR_DEFAULTS.get(v["vendor_code"])
        if not d:
            continue  # BBD = fresh day boats (out of scope), HCS = the cold storage warehouse
        rows.append({"vendor_code": v["vendor_code"], "vendor_name": v["vendor_name"], "country": v["country"],
                     "bluetide_lead_time": v["lead_time_days"], **d})
    return pd.DataFrame(rows)


def load_all():
    items, n1 = clean_items()
    lots, n2 = clean_lots(items)
    pos, n3 = clean_open_pos(items)
    sales, open_orders, n4 = clean_sales(items)
    vendors = clean_vendors()
    notes = pd.DataFrame(n1 + n2 + n3 + n4, columns=["rule", "rows", "explanation"])
    return {"items": items, "lots": lots, "open_pos": pos, "sales": sales,
            "open_orders": open_orders, "vendors": vendors, "data_notes": notes}
