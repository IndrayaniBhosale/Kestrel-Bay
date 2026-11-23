// Small line drawings, one per kind of seafood, picked from the item code.
const PATHS = {
  shrimp: (
    <>
      <path d="M23 9C15 6 7 10 8 18c.5 4 4 6.5 8 5.5" />
      <path d="M23 9c-5 1-10 4-9.5 8.5.5 2.5 2 4 2.5 6" />
      <path d="M11 12.5l3.2 2.3M15.6 9.3l1.1 3.6M9 17.2l4.4.2M10.6 21.6l3.5-2" />
      <path d="M16 23.5l-3 4M16 23.5l3 3.6" />
      <path d="M23 9c3-2 5-4 6-6M23 9c3 0 5 1 7 3" />
    </>
  ),
  salmon: (
    <>
      <path d="M4 21c1-7 8-11 23-10 1 4-3 10-14 11-4 .4-7 .2-9-1z" />
      <path d="M10 14.8c1 2 1 4 .4 6.6M15 12.6c1 2.5 1 5.6 0 8.6M20 11.6c1 2.5.8 5-.5 8" />
    </>
  ),
  fish: (
    <>
      <path d="M4 16c4-6 13-8 20 0-7 8-16 6-20 0z" />
      <path d="M24 16l5-4v8z" />
      <path d="M12 12c1.2 2.6 1.2 5.4 0 8" />
      <circle cx="8.6" cy="15.2" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  crab: (
    <>
      <ellipse cx="16" cy="19" rx="7" ry="4.8" />
      <path d="M10 16.5C7 14.5 6 11.5 7 8.5M5 9.5L7 7.3l1.6 2.2" />
      <path d="M22 16.5c3-2 4-5 3-8M27 9.5L25 7.3l-1.6 2.2" />
      <path d="M9.6 20.6l-4 2M10.4 22.8l-3 3.2M22.4 20.6l4 2M21.6 22.8l3 3.2" />
      <path d="M14 14.4v-2.2M18 14.4v-2.2" />
    </>
  ),
  lobster: (
    <>
      <path d="M10 5h12l-1.5 4h-9zM11 9h10l-1.5 4h-7zM12 13h8l-1.5 4h-5z" />
      <path d="M13.5 17h5l3 7-4 3-1.5-2-1.5 2-4-3z" />
    </>
  ),
  scallop: (
    <>
      <path d="M16 24.5L6 13c3-7 17-7 20 0z" />
      <path d="M16 24.5L10.5 9M16 24.5V7.6M16 24.5L21.5 9" />
      <path d="M13 24.5h6v2.5h-6z" />
    </>
  ),
  squid: (
    <>
      <circle cx="12" cy="14" r="5" />
      <circle cx="12" cy="14" r="2.2" />
      <circle cx="21" cy="19.5" r="5" />
      <circle cx="21" cy="19.5" r="2.2" />
    </>
  ),
  crate: (
    <>
      <path d="M6 11l10-5 10 5v11l-10 5-10-5z" />
      <path d="M6 11l10 5 10-5M16 16v11" />
    </>
  ),
};

export function kindOf(itemCode) {
  const code = itemCode.replace(/^ZZ-/, "");
  if (code.startsWith("SHR")) return "shrimp";
  if (code.startsWith("SAL")) return "salmon";
  if (code.startsWith("CRAB")) return "crab";
  if (code.startsWith("LOB")) return "lobster";
  if (code.startsWith("SCL")) return "scallop";
  if (code.startsWith("CAL")) return "squid";
  if (/^(COD|HAD|POL|PAN|TIL)/.test(code)) return "fish";
  return "crate";
}

export function SeafoodIcon({ itemCode, size = 30 }) {
  const kind = kindOf(itemCode);
  return (
    <svg className="seafood-icon" width={size} height={size} viewBox="0 0 32 32" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         role="img" aria-label={kind}>
      {PATHS[kind]}
    </svg>
  );
}

// Urgency symbols: shape as well as colour, so the meaning survives without colour.
const URGENCY = {
  too_late: ( // warning triangle
    <>
      <path d="M12 3.5L22 20.5H2z" fill="currentColor" stroke="currentColor" />
      <path d="M12 9.5v5" stroke="#fff" strokeWidth="2.2" />
      <circle cx="12" cy="17.4" r="1.2" fill="#fff" stroke="none" />
    </>
  ),
  order_now: ( // clock
    <>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="currentColor" />
      <path d="M12 6.5V12l3.6 2.4" stroke="#fff" strokeWidth="2" />
    </>
  ),
  order_soon: ( // calendar
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" fill="none" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  late_po: ( // ship on the water
    <>
      <path d="M4 14h16l-2.5 4.5h-11z" />
      <path d="M8 14V9h6l2 5M11 9V6" />
      <path d="M3 21c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />
    </>
  ),
};

export function UrgencyIcon({ kind, size = 16 }) {
  return (
    <svg className={`urgency-icon urgency-${kind}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {URGENCY[kind]}
    </svg>
  );
}
