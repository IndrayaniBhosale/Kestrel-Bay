"""The API the React screen talks to."""
import math
import os
from datetime import timedelta

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

from . import db, settings
from .calc import Engine

app = FastAPI(title="Kestrel Bay Ordering")

origins = [o.strip() for o in os.environ.get("FRONTEND_URL", "http://localhost:5173").split(",")]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

_engine: Engine | None = None


def engine() -> Engine:
    """Run the calculations once, the first time they're needed, and keep the result.
    The data only changes when the load script runs."""
    global _engine
    if _engine is None:
        _engine = Engine(db.read_tables())
    return _engine


def active_handled() -> dict[str, dict]:
    """A 'handled' mark hides an item until its date passes, or until a PO placed on/after
    the mark shows up in BlueTide (then the PO is counted, so the mark isn't needed)."""
    pos = engine().t["open_pos"]
    out = {}
    for code, h in db.read_handled().items():
        new_po = ((pos["item_code"] == code) & (pos["order_date"] >= h["handled_on"])).any()
        if h["hide_until"] >= settings.TODAY and not new_po:
            out[code] = h
    return out


def no_nan(x):
    """JSON can't carry NaN (pandas' 'missing'); send null instead."""
    if isinstance(x, float) and math.isnan(x):
        return None
    if isinstance(x, dict):
        return {k: no_nan(v) for k, v in x.items()}
    if isinstance(x, list):
        return [no_nan(v) for v in x]
    return x


LIST_FIELDS = ["item_code", "today_iso", "description", "category", "uom", "vendor_code", "lead_days", "status",
               "runout_date", "order_by", "out_until", "gap_days", "relies_on_late_po", "late_po_qty",
               "suggested_order", "sellable_now", "open_orders_qty", "incoming_qty", "avg_weekly_forecast",
               "new_order_arrives"]


@app.get("/api/health")
def health():
    with db.engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


@app.get("/api/dashboard")
def dashboard():
    e = engine()
    handled = active_handled()
    orders = [{**{k: r[k] for k in LIST_FIELDS}, "handled": handled.get(r["item_code"])}
              for r in e.order_list()]
    return no_nan({"summary": e.summary(), "orders": orders, "stuck": e.stuck_list(),
            "harbor": e.harbor_list(), "settings": {
                "lead_and_safety": e.t["vendors"].to_dict("records"),
                "six_month_rule": settings.MIN_MONTHS_LEFT,
                "harbor_cost_per_pallet": settings.HARBOR_COST_PER_PALLET,
                "harbor_cases_per_pallet": settings.HARBOR_CASES_PER_PALLET}})


@app.get("/api/items/{code}")
def item_detail(code: str):
    r = engine().results.get(code.strip().upper())
    if not r:
        raise HTTPException(404, "Item not found")
    return no_nan({**r, "handled": active_handled().get(r["item_code"])})


@app.get("/api/data-notes")
def data_notes():
    return engine().t["data_notes"].to_dict("records")


class HandledIn(BaseModel):
    note: str = ""
    days: int = 14


@app.post("/api/items/{code}/handled")
def mark_handled(code: str, body: HandledIn):
    code = code.strip().upper()
    if code not in engine().results:
        raise HTTPException(404, "Item not found")
    db.set_handled(code, body.note, settings.TODAY, settings.TODAY + timedelta(days=body.days))
    return {"ok": True}


@app.delete("/api/items/{code}/handled")
def unmark_handled(code: str):
    db.clear_handled(code.strip().upper())
    return {"ok": True}
