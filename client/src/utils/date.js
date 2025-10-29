// src/utils/date.js

// Turn "yyyy-MM-dd" into "27 Oct 2025"
export function formatDisplayDate(isoStr) {
  if (!isoStr || typeof isoStr !== "string") return "";
  // Expect "yyyy-MM-dd"
  const [y, m, d] = isoStr.split("-");
  if (!y || !m || !d) return isoStr;
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthIdx = parseInt(m, 10) - 1;
  const month = monthNames[monthIdx] ?? m;
  // Remove leading zero from day for nicer display
  const dayNum = String(parseInt(d, 10));
  return `${dayNum} ${month} ${y}`;
}

// Format a date range from plan start/end ("yyyy-MM-dd" each)
export function formatPlanRange(startIso, endIso) {
  const s = formatDisplayDate(startIso);
  const e = formatDisplayDate(endIso);
  if (!s && !e) return "";
  if (s && !e) return s;
  if (!s && e) return e;
  return `${s} - ${e}`;
}
