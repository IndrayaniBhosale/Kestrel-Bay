# Decisions and assumptions

"Today" is Monday, Nov 16, 2026. The data is the Nov 15 snapshot.

## Confirmed by Dana (email, Nov 20)

| Question | Answer | Where it's used |
|---|---|---|
| Lead times | Bien Xanh (Vietnam) 84 days, Austral Frío (Chile) 42, Maritime Northern (Canada) 14, Downeast Lobster 21, Aleutian Shore 28 | `settings.VENDOR_DEFAULTS` |
| Safety stock | 14 days on imports, 7 days for Canada and domestic | `settings.VENDOR_DEFAULTS` |
| Late Vietnam POs | Still coming, but no reliable date. **Don't assume they arrive.** Show items that only a late PO would cover. | `calc.po_arrival`, "Relies on late PO" badge |
| Duplicate PO lines (PO-260439, PO-260445) | One order each | `cleaning.clean_open_pos` |
| 18,000 lb pollock PO | Correct | no change |
| Known changes in demand | None | forecast uses last year as-is |
| Order quantity | What to order and by when is the core. A suggested amount is nice to have; Dana will check it. | `suggested_order`, labelled as a suggestion |
| Harbor cost | $30 per pallet per month, about 50 cases per pallet | `calc.harbor_monthly_cost` |
| "Too much" at Harbor | 26 weeks of stock | `settings.HARBOR_TOO_MANY_WEEKS` |
| Lots inside six months | Don't count them toward future sales; they get discounted or dumped | lot is dropped on expiry − 6 months |
| Tilapia, 61/70 shrimp, 10-12oz pangasius | Discontinued | `settings.DISCONTINUED_BY_DANA` |
| "Handled" mark | Hide until a date (default 2 weeks) or until the PO shows up in BlueTide, whichever comes first | `main.active_handled` |

## From the kickoff call

- QA-HOLD and DAMAGED are not inventory ("If I can't sell it, it isn't inventory").
- ZZ items are dead items from the old system.
- Fresh is out of scope.
- Location doesn't matter for ordering; Harbor matters only because of its cost.
- Not demand: transfers to "TRANSFER - PVD", $0 samples, credits (negative sales), and the one-off cruise line order.
- Orders booked but not shipped are spoken for.
- POs: quantities are right, dates aren't. Count only open POs, and only the part not yet received.

## My own assumptions (not confirmed)

1. **Forecast = the same weeks last year**, smoothed over 3 weeks. Last month's sales can't see December or Lent coming. There is only one year of history, so there is no growth adjustment.
2. **Lent is aligned.** In 2027 Lent starts 8 days earlier than in 2026 (Feb 10 vs Feb 18), so Lent weeks look back 51 weeks instead of 52.
3. **Stockout weeks are filled.** A week where a normally selling item sold under 15% of its typical week is treated as a stockout, not a lack of demand. It's replaced with the average of the surrounding weeks. This catches the 16/20 shrimp stockout before Christmas 2025 that Dana described.
4. **Estimated PO arrival** is the later of the vendor's date and order date + real lead time. A PO past both dates counts as late.
5. **Stock is used oldest-expiry first.** This decides which lot is left over when one crosses the six-month line.
6. **Units.** Pound lots of case items are converted using the pack size (for example, 6x2.2lb = 13.2 lb per case).
7. **Negative stock adjustments** (ADJ rows) reduce the item total and have no expiry date.
8. **Credits/returns** are left out of demand. A return reflects a quality problem, not lower demand.
9. **Mixed date formats.** 51 sales lines use MM/DD/YYYY. They're January 2026 dates: the ship dates follow 1–3 days later, and the order numbers fit the January sequence.
10. **Harbor pallets** are rounded up per item, since a part-full pallet still takes a slot.
11. **Suggested order** = forecast demand for the weeks after a new order lands (8 weeks for imports, 4 for others, plus safety stock), minus the stock expected to be left then.

## Open questions for Dana (next conversation)

These are still my assumptions. Each one changes the numbers a little, so I'd confirm them with Dana before relying on the app.

| Question | What the app assumes today | What changes if the answer is different |
|---|---|---|
| When an item sold almost nothing for a week last year, was that because you were out of stock? | Yes, if a week is under 15% of the item's normal week. That week is replaced with the average of the weeks around it. | The forecast for those weeks (16/20 shrimp in late December) would drop, and run-out dates would move later. |
| Does the warehouse always ship the oldest-expiring lot first? | Yes. | Which lot crosses the six-month line unsold, and so the "stuck" quantities. |
| Should returns reduce demand? | No. Returns (credits) are left out. | Demand would be slightly lower for items with many returns. |
| How much should a suggested order cover after it lands? | 8 weeks for imports, 4 weeks for others, plus safety stock. | Suggested quantities only. Run-out and order-by dates don't change. |
| Will the older customer orders still marked open (booked Nov 9–15) still ship? | Yes. They're taken out of stock now. | Items with large open orders would have more stock available. |
| Is the business growing or shrinking compared with last year? | Flat (no adjustment). This November looks about 15% lower than last November so far. | The forecast may run slightly high. A growth factor per item or category would fix it. |
| Does a QA-HOLD lot usually pass? | It's ignored until released. | Items like haddock fillet (300 cases on hold) would look less urgent. |
