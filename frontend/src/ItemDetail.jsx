import { useEffect, useState } from "react";
import { getItem, markHandled, unmarkHandled } from "./api";
import { fmtDate, fmtDateYear, money, qty, STATUS } from "./format";

// The "why" view: everything behind an item's number, in plain language.
export default function ItemDetail({ code, onClose, onChanged }) {
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);

  const load = () => getItem(code).then(setItem).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [code]);

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {error && <p className="error">{error}</p>}
        {!item && !error && <p className="muted">Loading…</p>}
        {item && (
          <Detail
            item={item}
            onChanged={() => {
              load();
              onChanged();
            }}
          />
        )}
      </aside>
    </div>
  );
}

function Detail({ item: r, onChanged }) {
  const u = r.uom;
  const st = STATUS[r.status];
  const maxStock = Math.max(1, ...r.weekly.map((w) => w.projected_stock));

  return (
    <>
      <h2>{r.item_code}</h2>
      <p className="muted">
        {r.description} · {r.vendor_code}, {r.lead_days}-day lead time + {r.safety_days} days safety stock
      </p>
      {r.in_scope && <span className={`badge tone-${st.tone}`}>{st.label}</span>}
      {r.relies_on_late_po && <span className="badge tone-purple">Relies on a late PO</span>}
      {r.discontinued && <span className="badge tone-grey">Discontinued</span>}

      <div className="explain">
        {explanation(r).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      <div className="numbers">
        <Num label="Sellable now" value={qty(r.sellable_now, u)} />
        <Num label="Booked, not shipped" value={qty(r.open_orders_qty, u)} />
        <Num label="On hold / damaged" value={qty(r.on_hold_qty, u)} note="not counted" />
        <Num label="On order (counted)" value={qty(r.incoming_qty, u)} />
        <Num label="On late POs" value={qty(r.late_po_qty, u)} note="not counted" />
        <Num label="Forecast, next 4 weeks" value={qty(r.next_4_weeks_forecast, u)} />
      </div>

      {r.in_scope && <HandledBox item={r} onChanged={onChanged} />}

      <h3>Week by week</h3>
      <p className="muted small">
        Forecast = what this item sold in the same weeks last year (3-week average). Stock shown at the end of each week.
      </p>
      <div className="table-wrap">
        <table className="compact">
          <thead>
            <tr>
              <th>Week of</th>
              <th className="num">Forecast</th>
              <th className="num">Sold same week last year</th>
              <th>Stock at end of week</th>
            </tr>
          </thead>
          <tbody>
            {r.weekly.map((w) => (
              <tr key={w.week_of}>
                <td>{fmtDate(w.week_of)}</td>
                <td className="num">{Math.round(w.forecast)}</td>
                <td className="num">{Math.round(w.last_year_same_week)}</td>
                <td>
                  <div className="bar-row">
                    <div
                      className={`bar ${w.projected_stock <= 0 ? "empty" : ""}`}
                      style={{ width: `${(w.projected_stock / maxStock) * 100}%` }}
                    />
                    <span className="small">{w.projected_stock <= 0 ? "OUT" : Math.round(w.projected_stock)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.stockout_weeks_filled.length > 0 && (
        <p className="note small">
          Last year {r.stockout_weeks_filled.map((f) => `the week of ${fmtDateYear(f.week_of)} sold ${f.actual}`).join(" and ")}
          , which looks like being out of stock, not a lack of demand. The forecast uses the surrounding weeks instead (
          {r.stockout_weeks_filled.map((f) => Math.round(f.used)).join(" and ")} a week).
        </p>
      )}
      <p className="muted small">
        Sanity check: the last 2 weeks sold {qty(r.recent_2_weeks, u)}; the same 2 weeks last year sold{" "}
        {qty(r.same_2_weeks_last_year, u)}. (Orders booked but not yet shipped aren't in this number.)
      </p>

      <h3>Stock by lot</h3>
      <div className="table-wrap">
        <table className="compact">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Where</th>
              <th className="num">Qty</th>
              <th>Expires</th>
              <th>Counted?</th>
            </tr>
          </thead>
          <tbody>
            {r.lots.map((l) => (
              <tr key={l.lot_no + l.location} className={l.counts ? "" : "dim"}>
                <td>{l.lot_no}</td>
                <td>{l.location}</td>
                <td className="num">
                  {qty(l.qty, u)}
                  {l.uom_raw !== u && <div className="muted small">received as {l.qty_raw} {l.uom_raw}</div>}
                </td>
                <td>{l.expiry_date ? fmtDateYear(l.expiry_date) : "—"}</td>
                <td className="small">{l.counts ? "Yes" : "No"}: {l.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.pos.length > 0 && (
        <>
          <h3>Open purchase orders</h3>
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Ordered</th>
                  <th>Vendor said</th>
                  <th>We expect</th>
                  <th className="num">Still to come</th>
                </tr>
              </thead>
              <tbody>
                {r.pos.map((p) => (
                  <tr key={p.po_no}>
                    <td>{p.po_no}</td>
                    <td>{fmtDate(p.order_date)}</td>
                    <td>{fmtDate(p.vendor_expected_date)}</td>
                    <td>{p.late ? <span className="badge tone-purple">Late, date unknown</span> : fmtDate(p.estimated_arrival)}</td>
                    <td className="num">{qty(p.qty_remaining, u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            "We expect" = the later of the vendor's date and order date + {r.lead_days} days. A PO past both dates is late and
            not counted.
          </p>
        </>
      )}

      {r.open_orders.length > 0 && (
        <details>
          <summary>{r.open_orders.length} customer orders booked, not shipped ({qty(r.open_orders_qty, u)})</summary>
          <ul className="small">
            {r.open_orders.map((o) => (
              <li key={o.order_no}>
                {fmtDate(o.order_date)} · {o.customer_name} · {qty(o.qty, u)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function explanation(r) {
  const u = r.uom;
  const lines = [];
  lines.push(
    `You can sell ${qty(r.sellable_now, u)}. Customers have already booked ${qty(r.open_orders_qty, u)} of it.` +
      (r.on_hold_qty > 0 ? ` A further ${qty(r.on_hold_qty, u)} on hold or damaged isn't counted.` : "")
  );
  if (r.discontinued) {
    lines.push("This item is discontinued, so no future sales are forecast. Anything left is stock to clear.");
    return lines;
  }
  lines.push(`Based on the same weeks last year, you'll sell about ${qty(r.next_4_weeks_forecast, u)} in the next 4 weeks.`);
  if (r.incoming_qty > 0) lines.push(`On order: ${qty(r.incoming_qty, u)}, counted on the date we expect it to arrive.`);
  if (r.late_po_qty > 0)
    lines.push(
      `A late PO for ${qty(r.late_po_qty, u)} has no reliable arrival date, so it isn't counted. ` +
        (r.runout_with_late_pos
          ? `If it lands now, you'd run out ${fmtDateYear(r.runout_with_late_pos)} instead.`
          : "If it lands now, you're covered for the next 6 months.")
    );
  if (!r.runout_date) {
    lines.push("You're covered for the next 6 months.");
    return lines;
  }
  if (r.runout_date === r.today_iso && r.open_orders_qty > r.sellable_now)
    lines.push(
      `You're already short: customers have booked ${qty(r.open_orders_qty, u)} but you can only sell ${qty(r.sellable_now, u)}.`
    );
  else if (r.runout_date === r.today_iso) lines.push("You're effectively out of stock now.");
  else lines.push(`At that rate you run out around ${fmtDateYear(r.runout_date)}.`);
  if (r.status === "too_late") {
    lines.push(
      `A new order placed today arrives around ${fmtDateYear(r.new_order_arrives)}, too late. ` +
        (r.out_until
          ? `Expect to be out from ${fmtDate(r.runout_date)} until about ${fmtDate(r.out_until)} (${r.gap_days} ${r.gap_days === 1 ? "day" : "days"})` +
            (r.out_until === r.new_order_arrives ? ", and only if you order today." : ", when the open PO lands.")
          : "")
    );
  } else if (r.order_by) {
    const late = r.order_by < r.today_iso;
    lines.push(
      `${r.vendor_code} takes ${r.lead_days} days and you keep ${r.safety_days} days of extra stock, so ` +
        (late ? `this should have been ordered by ${fmtDateYear(r.order_by)}. Order now.` : `order by ${fmtDateYear(r.order_by)}.`)
    );
  }
  if (r.suggested_order)
    lines.push(
      `Suggested order: about ${qty(r.suggested_order, u)}, enough for the weeks after it lands. It's a starting point; check it against your own numbers.`
    );
  return lines;
}

function Num({ label, value, note }) {
  return (
    <div className="num-box">
      <div className="num-value">{value}</div>
      <div className="num-label">
        {label}
        {note && <span className="muted"> · {note}</span>}
      </div>
    </div>
  );
}

function HandledBox({ item, onChanged }) {
  const [note, setNote] = useState("");
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const h = item.handled;

  const save = async () => {
    setBusy(true);
    await markHandled(item.item_code, note, days);
    setBusy(false);
    onChanged();
  };
  const undo = async () => {
    setBusy(true);
    await unmarkHandled(item.item_code);
    setBusy(false);
    onChanged();
  };

  if (h)
    return (
      <div className="handled-box">
        <strong>Marked as handled</strong> on {fmtDate(h.handled_on)}
        {h.note && <> · "{h.note}"</>}. Hidden from the list until {fmtDate(h.hide_until)} or until the new PO shows up in
        BlueTide.{" "}
        <button className="link" onClick={undo} disabled={busy}>
          Undo
        </button>
      </div>
    );

  return (
    <div className="handled-box">
      <strong>Already ordered this?</strong>
      <div className="handled-form">
        <input
          placeholder="Note, e.g. ordered by phone Tue, 400 cs"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>for 1 week</option>
          <option value={14}>for 2 weeks</option>
          <option value={28}>for 4 weeks</option>
        </select>
        <button onClick={save} disabled={busy}>
          Mark as handled
        </button>
      </div>
    </div>
  );
}
