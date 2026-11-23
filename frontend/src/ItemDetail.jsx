import { useEffect, useState } from "react";
import { getItem, markHandled, unmarkHandled } from "./api";
import { fmtDate, fmtDateYear, money, qty, STATUS } from "./format";
import { SeafoodIcon, UrgencyIcon } from "./Icons";

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
      <div className="drawer-title">
        <SeafoodIcon itemCode={r.item_code} size={40} />
        <h2>{r.item_code}</h2>
      </div>
      <p className="muted">
        {r.description} · {r.vendor_code}, {r.lead_days}-day lead time + {r.safety_days} days safety stock
      </p>
      {r.in_scope && (
        <span className={`badge tone-${st.tone}`}>
          {r.status !== "ok" && <UrgencyIcon kind={r.status} size={13} />} {st.label}
        </span>
      )}
      {r.relies_on_late_po && (
        <span className="badge tone-purple">
          <UrgencyIcon kind="late_po" size={13} /> Relies on a late PO
        </span>
      )}
      {r.discontinued && <span className="badge tone-grey">Discontinued</span>}

      <dl className="facts">
        {facts(r).map(([k, v]) => (
          <div key={k} className={`fact fact-${k.toLowerCase().replace(/[^a-z]/g, "")}`}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {r.in_scope && <HandledBox item={r} onChanged={onChanged} />}

      <h3>Stock left, week by week</h3>
      <StockChart r={r} />
      {r.stockout_weeks_filled.length > 0 && (
        <p className="note small">
          In the sales history, {r.stockout_weeks_filled.map((f) => `the week of ${fmtDateYear(f.week_of)} sold ${f.actual}`).join(" and ")}
          , which looks like being out of stock, not a lack of demand. The forecast uses the surrounding weeks instead (
          {r.stockout_weeks_filled.map((f) => Math.round(f.used)).join(" and ")} a week).
        </p>
      )}
      <details className="weekly">
        <summary>Week-by-week numbers</summary>
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
      </details>
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

const DAY = 86400000;
const toDate = (iso) => new Date(iso + "T00:00:00");
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const addDays = (iso, n) => new Date(toDate(iso).getTime() + n * DAY).toISOString().slice(0, 10);
const n0 = (x) => Math.round(x).toLocaleString("en-US");

// The panel's summary: one short line per question Dana asks.
function facts(r) {
  const u = r.uom;
  const sum = (pred) => r.lots.filter(pred).reduce((t, l) => t + l.qty, 0);
  const notCounted = [
    [sum((l) => !l.counts && l.reason.startsWith("Less than 6 months")), "under 6 months left"],
    [sum((l) => !l.counts && l.reason === "Expired"), "expired"],
    [sum((l) => l.location === "QA-HOLD"), "on QA-HOLD"],
    [sum((l) => l.location === "DAMAGED"), "damaged"],
  ].filter(([q]) => q > 0).map(([q, why]) => `${n0(q)} ${why}`);
  const net = r.sellable_now - r.open_orders_qty;
  const out = [];

  let bottom;
  if (r.discontinued) bottom = "Discontinued. No sales expected; clear what's left.";
  else if (!r.runout_date) bottom = "Covered for the next 6 months.";
  else if (r.status === "too_late" && r.out_until && r.out_until !== r.new_order_arrives && r.gap_days <= 7)
    bottom = `Runs out ${fmtDate(r.runout_date)}, open PO lands ${fmtDate(r.out_until)}. Chase the vendor.`;
  else if (r.status === "too_late")
    bottom = `Runs out ${fmtDate(r.runout_date)}. ${r.out_until === r.new_order_arrives ? "A new order today lands" : "Open PO lands"} ${fmtDate(r.out_until)}: ${r.gap_days} days without stock.`;
  else
    bottom = `Runs out ${fmtDate(r.runout_date)}. Order by ${fmtDate(r.order_by)}${r.order_by < r.today_iso ? " (already past)" : ""}.`;
  out.push(["Bottom line", bottom]);

  const unitWord = u === "LB" ? "lb" : "cases";
  out.push(["Stock", `${n0(r.sellable_now)} sellable − ${n0(r.open_orders_qty)} booked = ${
    net < 0 ? `${n0(-net)} ${u === "LB" ? "lb" : n0(-net) === "1" ? "case" : "cases"} short` : `${n0(net)} ${unitWord} free`}` +
    (notCounted.length ? `. Not counted: ${notCounted.join(", ")}.` : ".")]);
  if (!r.discontinued)
    out.push(["Selling", `About ${n0(r.next_4_weeks_forecast)} in the next 4 weeks (${n0(r.next_4_weeks_forecast / 4)} a week), based on the same weeks last year.`]);
  const coming = r.pos.filter((p) => !p.late);
  out.push(["Coming", coming.length
    ? coming.map((p) => `${n0(p.qty_remaining)} landing ~${fmtDate(p.estimated_arrival)}`).join("; ")
    : "Nothing on order."]);
  if (r.late_po_qty > 0)
    out.push(["Late PO", `${n0(r.late_po_qty)} on the water, date unknown, not counted. If it lands: ${
      r.runout_with_late_pos ? `covered until ${fmtDate(r.runout_with_late_pos)}` : "covered for 6+ months"}.`]);
  if (r.suggested_order)
    out.push(["Suggested order", `About ${qty(r.suggested_order, u)} (${r.vendor_code}: ${r.lead_days}-day lead time + ${r.safety_days} days' cushion). A starting point.`]);
  return out;
}

// Stock left over the next 16 weeks, with the dates that matter marked on it.
function StockChart({ r }) {
  const W = 680, H = 230, L = 46, R = 14, T = 50, B = 28;
  const pw = W - L - R, ph = H - T - B;
  const span = 16 * 7;
  const start = r.today_iso;
  const points = [{ date: start, stock: Math.max(0, r.sellable_now - r.open_orders_qty) }].concat(
    r.weekly.map((w) => ({ date: addDays(w.week_of, 7), stock: Math.max(0, w.projected_stock), w }))
  );
  const peak = Math.max(1, ...points.map((p) => p.stock));
  const step = Math.pow(10, Math.floor(Math.log10(peak)));
  const top = Math.ceil(peak / step) * step;
  const inRange = (iso) => iso && daysBetween(start, iso) >= 0 && daysBetween(start, iso) <= span;
  const x = (iso) => L + (Math.min(span, Math.max(0, daysBetween(start, iso))) / span) * pw;
  const y = (v) => T + ph - (v / top) * ph;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.stock).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points[points.length - 1].date).toFixed(1)},${y(0)} L${x(start)},${y(0)} Z`;

  const markers = [];
  if (inRange(r.runout_date)) markers.push({ date: r.runout_date, label: `Runs out ${fmtDate(r.runout_date)}`, cls: "m-out" });
  r.pos.filter((p) => !p.late && inRange(p.estimated_arrival)).forEach((p) =>
    markers.push({ date: p.estimated_arrival, label: `PO lands ${fmtDate(p.estimated_arrival)}`, cls: "m-po" }));
  if (r.status !== "ok" && r.in_scope && inRange(r.new_order_arrives))
    markers.push({ date: r.new_order_arrives, label: `New order today lands ${fmtDate(r.new_order_arrives)}`, cls: "m-new" });
  markers.sort((a, b) => daysBetween(b.date, a.date));
  let lastX = -999, row = 0;
  markers.forEach((m) => {
    const mx = x(m.date);
    row = mx - lastX < 150 ? (row + 1) % 2 : 0;
    m.row = row; lastX = mx;
    m.anchor = mx > W - 160 ? "end" : "start";
  });
  const ticks = top <= 2 ? [0, top] : [0, top / 2, top];
  if (points.every((p) => p.stock <= 0))
    return (
      <p className="chart-empty">
        No stock to sell for the next 16 weeks{r.late_po_qty > 0 ? " unless the late PO lands" : ""}
        {inRange(r.new_order_arrives) ? `. A new order placed today lands ${fmtDate(r.new_order_arrives)}.` : "."}
      </p>
    );
  const months = [0, 4, 8, 12, 16].map((wk) => addDays(start, wk * 7));

  return (
    <figure className="stock-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`Stock left over the next 16 weeks. ${markers.map((m) => m.label).join(". ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={t === 0 ? "axis" : "grid"} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="tick">{n0(t)}</text>
          </g>
        ))}
        {months.map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="tick">{fmtDate(d)}</text>
        ))}
        <path d={area} className="stock-area" />
        <path d={line} className="stock-line" />
        {markers.map((m) => (
          <g key={m.label + "l"} className={`marker ${m.cls}`}>
            <line x1={x(m.date)} x2={x(m.date)} y1={T - 6 - m.row * 18} y2={y(0)} />
          </g>
        ))}
        {markers.map((m) => (
          <g key={m.label + "t"} className={`marker ${m.cls}`}>
            <text x={x(m.date) + (m.anchor === "start" ? 5 : -5)} y={T - 10 - m.row * 18} textAnchor={m.anchor}>{m.label}</text>
          </g>
        ))}
        {points.slice(1).map((p) => (
          <rect key={p.date} x={x(p.w.week_of)} y={T} width={pw / 16} height={ph} className="hit">
            <title>{`Week of ${fmtDate(p.w.week_of)}: expect to sell ${n0(p.w.forecast)}, sold ${n0(p.w.last_year_same_week)} last year. Left at end of week: ${p.w.projected_stock <= 0 ? "out" : n0(p.w.projected_stock)}.`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="muted small">
        {r.uom === "LB" ? "Pounds" : "Cases"} you can sell, after booked orders. Hover a week for its numbers.
      </figcaption>
    </figure>
  );
}

function explanation(r) {
  const u = r.uom;
  const lines = [];
  lines.push(
    `You can sell ${qty(r.sellable_now, u)}. Customers have already booked ${qty(r.open_orders_qty, u)}` +
      (r.open_orders_qty > r.sellable_now ? ", which is more than you can sell." : ".")
  );
  // Say why stock that's physically there isn't counted.
  const sum = (pred) => r.lots.filter(pred).reduce((t, l) => t + l.qty, 0);
  const inside6 = sum((l) => !l.counts && l.reason.startsWith("Less than 6 months"));
  const expired = sum((l) => !l.counts && l.reason === "Expired");
  const onHold = sum((l) => l.location === "QA-HOLD");
  const damaged = sum((l) => l.location === "DAMAGED");
  if (inside6 > 0)
    lines.push(
      `${qty(inside6, u)} ${inside6 === 1 ? "is" : "are"} within six months of expiry, so they aren't counted. You said customers won't take it, so it gets discounted or dumped.`
    );
  if (expired > 0) lines.push(`${qty(expired, u)} already expired and aren't counted.`);
  if (onHold > 0)
    lines.push(`${qty(onHold, u)} on QA-HOLD (waiting on paperwork or a temperature check) aren't counted until released.`);
  if (damaged > 0) lines.push(`${qty(damaged, u)} marked DAMAGED aren't counted.`);
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
  if (r.runout_date === r.today_iso && r.open_orders_qty > r.sellable_now) {
    // Already said in the first sentence.
  } else if (r.runout_date === r.today_iso) lines.push("You're effectively out of stock now.");
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
