import { useEffect, useState } from "react";
import { getDashboard } from "./api";
import { fmtDate, fmtDateYear, money, qty, STUCK_KIND } from "./format";
import ItemDetail from "./ItemDetail";
import HowItWorks from "./HowItWorks";

// Urgency groups for the order list, most urgent first.
const GROUPS = [
  { status: "too_late", title: "Too late", note: "runs out before a new order could arrive" },
  { status: "order_now", title: "Order this week", note: "order-by date is this week or already past" },
  { status: "order_soon", title: "Order within 4 weeks", note: "order-by date is in the next four weeks" },
];

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
        <p className="muted">If the app was idle, the server takes up to a minute to wake up. Refresh the page to try again.</p>
      </div>
    );
  if (!data) return <div className="page muted">Loading this week's numbers. The first load can take up to a minute.</div>;

  const s = data.summary;
  const open = data.orders.filter((o) => !o.handled);
  const handled = data.orders.filter((o) => o.handled);

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="brand">Kestrel Bay Seafood</p>
          <p className="muted small">Frozen items, stock as of {fmtDateYear(s.today)}</p>
        </div>
        <button className="link" onClick={() => setShowHow(true)}>
          How these numbers work
        </button>
      </header>

      <section className="verdict" aria-label="This week">
        <h1>
          {s.too_late > 0
            ? `${s.too_late} items will run out before a new order can land.`
            : "Nothing runs out before a new order could land."}
        </h1>
        <p className="verdict-sub">
          {s.order_now} more to order this week, {s.order_soon} within four weeks.
        </p>
        <dl className="ledger">
          <div>
            <dt>Stock you're stuck with, at cost</dt>
            <dd>{money(s.stuck_value)}</dd>
          </div>
          <div>
            <dt>Harbor Cold Storage rent</dt>
            <dd>
              {money(s.harbor_monthly_cost)}
              <span className="unit"> a month</span>
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>What to order</h2>
        <p className="lede">
          Counts only stock you can sell, takes out orders already booked, and adds POs that are on their way. Late POs
          aren't counted. Click any item to see the working.
        </p>
        <OrderTable rows={open} onSelect={setSelected} />
        {handled.length > 0 && (
          <details className="handled">
            <summary>Marked as already ordered ({handled.length})</summary>
            <OrderTable rows={handled} onSelect={setSelected} />
          </details>
        )}
      </section>

      <section>
        <h2>What you're stuck with</h2>
        <p className="lede">
          Lots with under six months left (discount or dump), expired lots, lots that will reach the six-month line
          before they sell, and discontinued items still on hand.
        </p>
        <StuckTable rows={data.stuck} onSelect={setSelected} />
      </section>

      <section>
        <h2>Harbor Cold Storage</h2>
        <p className="lede">
          $30 per pallet per month, about 50 cases per pallet, part-full pallets rounded up. {money(s.harbor_monthly_cost)}{" "}
          a month in total.
        </p>
        <HarborTable rows={data.harbor} onSelect={setSelected} />
      </section>

      {selected && <ItemDetail code={selected} onClose={() => setSelected(null)} onChanged={load} />}
      {showHow && <HowItWorks settings={data.settings} onClose={() => setShowHow(false)} />}
    </div>
  );
}

function ItemCell({ r }) {
  return (
    <td className="item">
      <span className="code">{r.item_code}</span>
      {r.relies_on_late_po && <span className="tag tag-late">Relies on late PO</span>}
      <span className="desc">{r.description}</span>
    </td>
  );
}

function OrderTable({ rows, onSelect }) {
  if (!rows.length) return <p className="muted">Nothing to order right now.</p>;
  return (
    <div className="table-wrap">
      <table className="orders">
        <thead>
          <tr>
            <th>Item</th>
            <th>Runs out</th>
            <th>What to do</th>
            <th className="num">Suggested order</th>
          </tr>
        </thead>
        {GROUPS.map((g) => {
          const groupRows = rows.filter((r) => r.status === g.status);
          if (!groupRows.length) return null;
          return (
            <tbody key={g.status} className={`group group-${g.status}`}>
              <tr className="group-head">
                <th colSpan={4} scope="rowgroup">
                  {g.title} <span className="count">{groupRows.length}</span>
                  <span className="group-note">{g.note}</span>
                </th>
              </tr>
              {groupRows.map((r) => (
                <tr key={r.item_code} onClick={() => onSelect(r.item_code)} className="row" tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onSelect(r.item_code)}>
                  <ItemCell r={r} />
                  <td className="date">{fmtDate(r.runout_date)}</td>
                  <td className="action">{action(r)}</td>
                  <td className="num">{r.suggested_order ? qty(r.suggested_order, r.uom) : "–"}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
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
            <th>Why it's stuck</th>
            <th className="num">Quantity</th>
            <th className="num">Cost value</th>
            <th className="num">Harbor a month</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item_code} onClick={() => onSelect(r.item_code)} className="row" tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelect(r.item_code)}>
              <ItemCell r={r} />
              <td className="reasons">
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
              <td className="num">{r.harbor_monthly_cost ? money(r.harbor_monthly_cost) : "–"}</td>
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
            <th className="num">Rent a month</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item_code} onClick={() => onSelect(r.item_code)} className="row" tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelect(r.item_code)}>
              <ItemCell r={r} />
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
