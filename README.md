# Kestrel Bay – Monday Ordering

A one-screen inventory tool for Dana Okafor, VP Purchasing at Kestrel Bay Seafood. Every Monday it answers two questions:

1. **What will run out before a new order could get here?** It uses real lead times, counts only stock she can sell, and takes out orders already booked.
2. **What is she stuck with?** That means lots inside six months of expiry, expired lots, lots that will hit the six-month line before they sell, discontinued items, and what Harbor Cold Storage is costing each month.

She can click any item to see why: the stock by lot, what's counted and why, the week-by-week forecast against last year, and the incoming POs. She can also mark an item "already handled" when she has ordered by phone and the PO isn't in BlueTide yet.

**Live app:** _add link_  ·  **API docs:** _add link_/docs

## What it found (Nov 16, 2026)

- **8 items will run out before a new order can arrive.** Examples:
  - 16/20 shrimp runs out around Dec 10, and the next PO lands about Jan 25. That's the same December stockout as last year.
  - 6oz salmon: all 1,350 cases are already inside six months, so there's nothing sellable at full price.
- **About $134k of stock (at cost)** is expired or inside six months. Most of it is Chilean salmon at Harbor.
- **Harbor costs about $1,470 a month**, about $900 of it for salmon that now has to be discounted.

## How it works

**Cleaning** (`backend/app/cleaning.py`) runs once when the data is loaded. Every rule traces back to the kickoff call, Dana's email, or a problem in the data. The app's "How these numbers work" panel lists each rule and how many rows it affected.

**Calculation** (`backend/app/calc.py`):

- **Forecast:** daily demand = average daily sales in a 3-week window around the same day last year. Lent is aligned to 2027 dates. Weeks where an item clearly ran out are filled from the surrounding weeks, so last year's stockout doesn't repeat in the forecast.
- **Projection:** start with sellable stock and ship the booked orders. Then walk forward day by day: add POs on their estimated arrival date, use stock oldest-expiry first, and drop any lot the day it gets inside six months of expiry.
- **Run-out date:** the first day demand can't be met.
- **Order-by date:** run-out − lead time − safety stock.
- **Status:**
  - *Too late:* the run-out comes before an order placed today could arrive.
  - *Order this week:* the order-by date is within 7 days or already past.
  - *Order soon:* the order-by date is within 28 days.
- **Late POs:** POs past both the vendor's date and the real lead time aren't counted. If an item would be fine only with a late PO, it's flagged "Relies on late PO."

Key assumptions and Dana's answers are in [docs/decisions.md](docs/decisions.md).

## Stack

| Part | Tech | Hosting |
|---|---|---|
| Database | Postgres | Neon (free) |
| Backend | FastAPI, pandas, SQLAlchemy | Render (free) |
| Frontend | React + Vite | Vercel (free) |

The data is small (about 16k rows), so the calculation runs in memory once at startup, in under 2 seconds, and is cached. Dana's "handled" marks live in their own table, so reloading the data keeps them.

### API

| Method | Path | What it returns |
|---|---|---|
| GET | `/api/dashboard` | Summary, order list, stuck list, Harbor list, settings |
| GET | `/api/items/{code}` | Everything behind one item's numbers |
| POST | `/api/items/{code}/handled` | Mark handled `{note, days}` |
| DELETE | `/api/items/{code}/handled` | Undo |
| GET | `/api/data-notes` | What the cleaning removed, with counts |

### Data model

The raw CSVs are cleaned and loaded into these tables:

- `items`: normalized codes, pounds per case, in-scope flag
- `lots`: latest snapshot only, in sell units, with `usable_until` (expiry − 6 months)
- `open_pos`: open lines only, de-duplicated, quantity still to come
- `sales`: real demand only
- `open_orders`: booked but not shipped
- `vendors`: real lead times and safety stock
- `data_notes`: what was excluded and why
- `handled`: Dana's notes

## Run it locally

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # then put your Postgres URL in .env
python -m scripts.load_data       # load the CSVs in /data
pytest                            # business-rule tests
uvicorn app.main:app --reload     # http://localhost:8000/docs

# Frontend (second terminal)
cd frontend
npm install
cp .env.example .env
npm run dev                       # http://localhost:5173
```

## Out of scope (on purpose)

- **Fresh fish.** It's bought daily, and Dana doesn't need help with it.
- **Marco's requests:** pricing and the price list, fuel surcharge, route planning, email drafting. Walt: "Dana first."
- **Login and user accounts.** There's one user, and the data is fictional.
- **An ETL pipeline.** The CSVs are loaded once, as the brief allows.
- **Editing lead times in the app.** They're in `settings.py` and the `vendors` table.

## With more time

- Let Dana edit lead times, safety stock and the Harbor rate from the screen.
- Add a trend adjustment once there's more than one year of history, plus a per-item forecast override for known big orders.
- Add pallet sizes per item, instead of one 50-cases-per-pallet estimate.
- Load nightly BlueTide exports automatically and keep a history of on-hand stock. That would show real stockouts directly instead of inferring them from sales.
- Add "Move from Harbor first" suggestions: which Harbor stock to pull into New Bedford to cut storage cost.
- Export the order list to Excel or a PO draft for each vendor.
- Answer Marco's "do we have 40 cases for Thursday?" question with the same data.

## How I used AI

_Write this part in your own words. Cover what you asked Claude to do (data audit, cleaning and calculation code, UI), what you decided yourself, what you checked by hand (e.g. SHR-1620 run-out), and anything it got wrong that you caught or corrected._
