import { useEffect, useState } from "react";
import { getDashboard } from "./api";
import { fmtDate, fmtDateYear, money, qty, STATUS, STUCK_KIND } from "./format";
import ItemDetail from "./ItemDetail";
import HowItWorks from "./HowItWorks";

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showHow, setShowHow] = useState(false);

  const load = () =>
    getDashboard()
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  if (error)
    return (
      <div className="page">
        <p className="error">Couldn't load the data: {error}</p>
        <p className="muted">If the app was idle, the server may take up to a minute to wake up. Try refreshing.</p>
      </div>
    );
  if (!data) return <div className="page muted">Loading… (first load can take up to a minute)</div>;

  const s = data.summary;
  const open = data.orders.filter((o) => !o.handled);
  const handled = data.orders.filter((o) => o.handled);

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Monday ordering</h1>
          <p className="muted">
            Kestrel Bay Seafood · frozen items · data as of {fmtDateYear(s.today)}
          </p>
        </div>
        <button className="link" onClick={() => setShowHow(true)}>
          How these numbers work
        </button>
      </header>

      <section className="cards">
        <SummaryCard tone="red" value={s.too_late} label="will run out before a new order can arrive" />
        <SummaryCard tone="amber" value={s.order_now} label="to order this week" />
        <SummaryCard tone="blue" value={s.order_soon} label="to order in the next 4 weeks" />
        <SummaryCard tone="grey" value={money(s.stuck_value)} label="stuck with (at cost): too old, about to be, or discontinued" />
        <SummaryCard tone="grey" value={`${money(s.harbor_monthly_cost)}/mo`} label="paying Harbor Cold Storage" />
      </section>

      <section>
        <h2>1. What to order</h2>
        <p className="muted small">
          Counts only stock you can sell, minus orders already booked, plus POs on the way. Late POs are not counted.
          Click any item to see why.
        </p>
        <OrderTable rows={open} onSelect={setSelected} />
        {handled.length > 0 && (
          <details className="handled">
            <summary>
              Marked as handled ({handled.length})
            </summary>
            <OrderTable rows={handled} onSelect={setSelected} />
          </details>
        )}
      </section>

      <section>
        <h2>2. What you're stuck with</h2>
        <p className="muted small">
          Lots inside six months of expiry (discount or dump), expired lots, lots that will hit the six-month line
          before they sell, and discontinued items still on hand.
        </p>
        <StuckTable rows={data.stuck} onSelect={setSelected} />
      </section>

      <section>
        <h2>Harbor Cold Storage</h2>
        <p className="muted small">
          $30 per pallet per month, about 50 cases per pallet. Total {money(s.harbor_monthly_cost)} a month.
        </p>
        <HarborTable rows={data.harbor} onSelect={setSelected} />
      </section>

      {selected && (
        <ItemDetail
          code={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
      {showHow && <HowItWorks settings={data.settings} onClose={() => setShowHow(false)} />}
    </div>
  );
}

function SummaryCard({ tone, value, label }) {
  return (
    <div className={`card tone-${tone}`}>
      <div className="card-value">{value}</div>
      <div className="card-label">{label}</div>
    </div>
  );
}

function OrderTable({ rows, onSelect }) {
  if (!rows.length) return <p className="muted">Nothing to order right now.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Status</th>
            <th>Runs out</th>
            <th>What to do</th>
            <th className="num">Suggested order</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item_code} onClick={() => onSelect(r.item_code)} className="clickable">
              <td>
                <div className="item-code">{r.item_code}</div>
                <div className="muted small">{r.description}</div>
              </td>
              <td>
                <span className={`badge tone-${STATUS[r.status].tone}`}>{STATUS[r.status].short}</span>
                {r.relies_on_late_po && <span className="badge tone-purple">Relies on late PO</span>}
                {r.handled && <span className="badge tone-grey">Handled</span>}
              </td>
              <td>{fmtDate(r.runout_date)}</td>
              <td className="small">{action(r)}</td>
              <td className="num">{r.suggested_order ? qty(r.suggested_order, r.uom) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function action(r) {
  if (r.status === "too_late" && r.out_until && r.out_until !== r.new_order_arrives && r.gap_days <= 7)
    return `Tight: runs out ~${fmtDate(r.runout_date)}, open PO lands ~${fmtDate(r.out_until)}. Chase the vendor; a new order wouldn't arrive sooner.`;
  if (r.status === "too_late") {
    const until = !r.out_until
      ? ""
      : r.out_until === r.new_order_arrives
        ? ` until ~${fmtDate(r.out_until)} if you order today`
        : ` until the open PO lands ~${fmtDate(r.out_until)}`;
    return `Order now. Expect to be out from ${fmtDate(r.runout_date)}${until}.`;
  }
  if (r.order_by < r.today_iso)
    return `Order now. Should have been ordered by ${fmtDate(r.order_by)} (${r.vendor_code}, ${r.lead_days}-day lead time).`;
  return `Order by ${fmtDate(r.order_by)} (${r.vendor_code}, ${r.lead_days}-day lead time).`;
}

function StuckTable({ rows, onSelect }) {
  if (!rows.length) return <p className="muted">Nothing stuck.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Why</th>
            <th className="num">Quantity</th>
            <th className="num">Cost value</th>
            <th className="num">Harbor / month</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item_code} onClick={() => onSelect(r.item_code)} className="clickable">
              <td>
                <div className="item-code">{r.item_code}</div>
                <div className="muted small">{r.description}</div>
              </td>
              <td className="small">
                {r.reasons.map((x, i) => (
                  <div key={i}>
                    {STUCK_KIND[x.kind]}: {qty(x.qty, r.uom)} at {x.location}
                    {x.kind === "will_cross_6_months" && ` on ${fmtDate(x.date)}`}
                  </div>
                ))}
                {r.long_at_harbor && <div>More than 26 weeks of stock, some at Harbor</div>}
              </td>
              <td className="num">{qty(r.stuck_qty, r.uom)}</td>
              <td className="num">{money(r.stuck_value)}</td>
              <td className="num">{r.harbor_monthly_cost ? money(r.harbor_monthly_cost) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HarborTable({ rows, onSelect }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">At Harbor</th>
            <th className="num">Still sellable</th>
            <th className="num">Weeks of stock (all locations)</th>
            <th className="num">Cost / month</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item_code} onClick={() => onSelect(r.item_code)} className="clickable">
              <td>
                <div className="item-code">{r.item_code}</div>
                <div className="muted small">{r.description}</div>
              </td>
              <td className="num">{qty(r.harbor_qty, r.uom)}</td>
              <td className="num">{qty(r.sellable_at_harbor, r.uom)}</td>
              <td className="num">{r.weeks_of_cover ?? "no sales"}</td>
              <td className="num">{money(r.harbor_monthly_cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
