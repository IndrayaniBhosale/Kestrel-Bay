"""Endpoint tests. They run against the real CSVs in /data with the database swapped for
an in-memory stand-in, so they never touch Neon or the live site."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test@localhost/test")

import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.cleaning import load_all


@pytest.fixture()
def client(monkeypatch):
    marks = {}
    monkeypatch.setattr(db, "read_tables", load_all)
    monkeypatch.setattr(db, "read_handled", lambda: dict(marks))
    monkeypatch.setattr(db, "set_handled", lambda c, n, h, u: marks.__setitem__(
        c, {"item_code": c, "note": n, "handled_on": h, "hide_until": u}))
    monkeypatch.setattr(db, "clear_handled", lambda c: marks.pop(c, None))
    monkeypatch.setattr(main, "_engine", None)
    return TestClient(main.app)


def counts(client):
    orders = client.get("/api/dashboard").json()["orders"]
    open_ = [o for o in orders if not o["handled"]]
    return [sum(o["status"] == s for o in open_) for s in ("too_late", "order_now", "order_soon")]


def test_dashboard_counts(client):
    assert counts(client) == [8, 5, 6]


def test_item_detail_and_404(client):
    r = client.get("/api/items/shr-1620")          # lower case works too
    assert r.status_code == 200
    body = r.json()
    assert body["sellable_now"] == 480 and body["runout_date"] == "2026-12-10"
    assert client.get("/api/items/NOPE").status_code == 404


def test_mark_and_undo_already_ordered(client):
    assert client.post("/api/items/CAL-RING/handled", json={"note": "Phone order Tue", "days": 14}).status_code == 200
    assert counts(client) == [8, 4, 6]             # leaves the "this week" count
    assert client.delete("/api/items/CAL-RING/handled").status_code == 200
    assert counts(client) == [8, 5, 6]


@pytest.mark.parametrize("payload", [{"days": 0}, {"days": -3}, {"days": 365}, {"note": "x" * 201}])
def test_mark_rejects_bad_input(client, payload):
    assert client.post("/api/items/CAL-RING/handled", json=payload).status_code == 422


def test_order_history_and_suggestion_working(client):
    body = client.get("/api/items/SHR-1620").json()
    hist = body["order_history"]
    assert len(hist) == 7 and hist[0]["order_date"] == "2026-11-02"      # newest first
    assert all(p["status"] != "Cancelled" for p in hist)
    s = body["order_history_summary"]
    assert s["last_order_qty"] == 600 and s["orders"] == 7
    m = body["suggestion_math"]                                            # the number Dana sees adds up
    assert body["suggested_order"] == -(-(m["need"] - m["have_when_it_lands"]) // 1)
