"""One-time load: read the BlueTide CSVs in /data, clean them, and write them to Postgres.

Run from the backend folder:  python -m scripts.load_data
Safe to run again: it replaces the data tables but keeps Dana's 'handled' notes.
"""
from app.cleaning import load_all
from app.db import write_tables


def main():
    tables = load_all()
    write_tables(tables)
    print("Loaded tables:")
    for name, df in tables.items():
        print(f"  {name:12} {len(df):6} rows")
    print("\nWhat was cleaned or excluded:")
    for _, n in tables["data_notes"].iterrows():
        print(f"  {n['rows']:5}  {n['rule']}")

    # Quick check against the raw files: sellable stock for three items you can verify by hand.
    lots = tables["lots"]
    sellable = lots[lots["is_sellable_location"]].groupby("item_code")["qty"].sum()
    print("\nSpot check (sellable on hand, before the six-month rule):")
    for code in ["SHR-1620", "SAL-POR6", "CRAB-SNW5"]:
        print(f"  {code:10} {sellable.get(code, 0):8.1f}")


if __name__ == "__main__":
    main()
