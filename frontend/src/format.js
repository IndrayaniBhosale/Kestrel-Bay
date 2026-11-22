// Small helpers so numbers and dates read the way Dana talks.
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtDateYear(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function unit(uom, qty) {
  if (uom === "LB") return "lb";
  return qty === 1 ? "case" : "cases";
}

export function qty(n, uom) {
  if (n === null || n === undefined) return "—";
  const rounded = Math.round(n);
  return `${rounded.toLocaleString("en-US")} ${unit(uom, rounded)}`;
}

export function money(n) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export const STATUS = {
  too_late: { label: "Will run out before a new order arrives", short: "Too late", tone: "red" },
  order_now: { label: "Order this week", short: "Order this week", tone: "amber" },
  order_soon: { label: "Order in the next 4 weeks", short: "Order soon", tone: "blue" },
  ok: { label: "Covered", short: "OK", tone: "green" },
};

export const STUCK_KIND = {
  expired: "Expired",
  inside_6_months: "Under 6 months left",
  will_cross_6_months: "Will hit 6-month line unsold",
  discontinued: "Discontinued item",
};
