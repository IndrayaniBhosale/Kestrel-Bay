"""Database connection and table reads/writes."""
import os

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text

load_dotenv()

engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)

DATA_TABLES = ["items", "lots", "open_pos", "sales", "open_orders", "vendors", "data_notes", "po_history"]
OPTIONAL_TABLES = {"po_history"}  # added later; the app still starts before the first reload
DATE_COLUMNS = {
    "lots": ["pack_date", "expiry_date", "usable_until", "received_date"],
    "open_pos": ["order_date", "vendor_expected_date"],
    "sales": ["order_date"],
    "open_orders": ["order_date"],
    "po_history": ["order_date", "expected_date"],
}

CREATE_HANDLED = """
CREATE TABLE IF NOT EXISTS handled (
    item_code   TEXT PRIMARY KEY,
    note        TEXT,
    handled_on  DATE NOT NULL,
    hide_until  DATE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
)"""


def write_tables(tables: dict[str, pd.DataFrame]):
    """Replace the data tables. Dana's 'handled' notes live in their own table and are kept."""
    with engine.begin() as conn:
        for name in DATA_TABLES:
            tables[name].to_sql(name, conn, if_exists="replace", index=False)
        conn.execute(text(CREATE_HANDLED))


def read_tables() -> dict[str, pd.DataFrame]:
    out = {}
    with engine.connect() as conn:
        existing = set(inspect(conn).get_table_names())
        for name in DATA_TABLES:
            if name in OPTIONAL_TABLES and name not in existing:
                out[name] = pd.DataFrame()
                continue
            df = pd.read_sql_table(name, conn)
            for col in DATE_COLUMNS.get(name, []):
                df[col] = pd.to_datetime(df[col]).dt.date
            out[name] = df
    return out


def read_handled() -> dict[str, dict]:
    with engine.connect() as conn:
        conn.execute(text(CREATE_HANDLED))
        rows = conn.execute(text("SELECT item_code, note, handled_on, hide_until FROM handled")).mappings().all()
    return {r["item_code"]: dict(r) for r in rows}


def set_handled(item_code: str, note: str, handled_on, hide_until):
    with engine.begin() as conn:
        conn.execute(text(CREATE_HANDLED))
        conn.execute(text("""
            INSERT INTO handled (item_code, note, handled_on, hide_until)
            VALUES (:c, :n, :h, :u)
            ON CONFLICT (item_code) DO UPDATE
              SET note = EXCLUDED.note, handled_on = EXCLUDED.handled_on,
                  hide_until = EXCLUDED.hide_until, created_at = now()
        """), {"c": item_code, "n": note, "h": handled_on, "u": hide_until})


def clear_handled(item_code: str):
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM handled WHERE item_code = :c"), {"c": item_code})
