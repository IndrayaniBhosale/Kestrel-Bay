import { useEffect, useState } from "react";
import { getDataNotes } from "./api";

// Explains the rules and shows exactly what was filtered out of the BlueTide exports.
export default function HowItWorks({ settings, onClose }) {
  const [notes, setNotes] = useState([]);
  useEffect(() => {
    getDataNotes().then(setNotes);
  }, []);

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>How these numbers work</h2>
        <ol className="rules">
          <li>Only sellable stock counts: New Bedford, Providence and Harbor. QA-HOLD and DAMAGED don't.</li>
          <li>A lot stops counting {settings.six_month_rule} months before it expires. After that it's stock to discount or dump.</li>
          <li>Orders booked but not shipped are taken out first; that stock is spoken for.</li>
          <li>
            Demand = what each item sold in the same weeks last year. Transfers, samples, credits, cancelled orders and
            the one-off cruise order are left out. Weeks where an item clearly ran out are filled from the weeks around
            them. Lent is lined up with next year's dates.
          </li>
          <li>
            POs arrive on the later of the vendor's date and order date + real lead time. A PO past both is late and not
            counted.
          </li>
          <li>Order-by date = run-out date − lead time − safety stock.</li>
          <li>
            Harbor cost = ${settings.harbor_cost_per_pallet} per pallet per month, {settings.harbor_cases_per_pallet} cases
            per pallet, part-full pallets rounded up.
          </li>
        </ol>

        <h3>Lead times used</h3>
        <table className="compact">
          <thead>
            <tr>
              <th>Vendor</th>
              <th className="num">Lead time</th>
              <th className="num">Safety stock</th>
              <th className="num">BlueTide says</th>
            </tr>
          </thead>
          <tbody>
            {settings.lead_and_safety.map((v) => (
              <tr key={v.vendor_code}>
                <td>{v.vendor_name}</td>
                <td className="num">{v.lead_days} days</td>
                <td className="num">{v.safety_days} days</td>
                <td className="num">{v.bluetide_lead_time ?? "blank"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>What was cleaned out of the exports</h3>
        <table className="compact">
          <tbody>
            {notes.map((n) => (
              <tr key={n.rule}>
                <td className="num">{n.rows}</td>
                <td>
                  <strong>{n.rule}</strong>
                  <div className="muted small">{n.explanation}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </div>
  );
}
