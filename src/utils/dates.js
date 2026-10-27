// src/utils/dates.js
// Consistent date handling helpers. All persisted timestamps are ISO strings (UTC).
// "Day keys" are local-calendar keys so charts group by the visitor's local day.

export const MS_DAY = 24 * 60 * 60 * 1000;

export function nowIso() {
  return new Date().toISOString();
}

/** Local calendar day key "YYYY-MM-DD" used for chart grouping. */
export function dayKey(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Whole calendar days from today until the given date (negative = past). */
export function daysUntil(isoOrDate) {
  if (!isoOrDate) return null;
  const target = startOfDay(new Date(isoOrDate));
  const today = startOfToday();
  return Math.round((target.getTime() - today.getTime()) / MS_DAY);
}

/** "2026-02-03" (input[type=date] value) from a Date or ISO string, in local time. */
export function toDateInputValue(d) {
  return dayKey(d instanceof Date ? d : new Date(d));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format an ISO timestamp for display according to settings.dateFormat:
 *  "MMM DD, YYYY" | "DD MMM YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD"
 */
export function formatDate(iso, format = 'MMM DD, YYYY') {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const mm = String(m).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  switch (format) {
    case 'DD MMM YYYY': return `${dd} ${mon} ${y}`;
    case 'MM/DD/YYYY': return `${mm}/${dd}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${mm}-${dd}`;
    case 'MMM DD, YYYY':
    default: return `${mon} ${String(d.getDate()).padStart(2, '0')}, ${y}`;
  }
}

export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

export function formatDateTime(iso, dateFormat) {
  if (!iso) return '—';
  return `${formatDate(iso, dateFormat)} · ${formatTime(iso)}`;
}

/** "just now", "5m ago", "3h ago", "2d ago" or a date for older values. */
export function relativeTime(iso, dateFormat) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
  if (diff < min) return 'just now';
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return formatDate(iso, dateFormat);
}

/** Friendly label for an input[type=date] value / day-key: "Oct 27" (+ year if not current). */
export function dayKeyLabel(key) {
  if (!key || key.length < 10) return key;
  const [y, m, d] = key.split('-').map(Number);
  const label = `${MONTHS[m - 1]} ${String(d).padStart(2, '0')}`;
  return y === new Date().getFullYear() ? label : `${label} ${y}`;
}

/** Returns a Date at 00:00 local for "YYYY-MM-DD" strings (avoids UTC rollovers). */
export function parseDayKey(key) {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Inclusive list of local day keys from..to. */
export function eachDayKey(from, to) {
  const keys = [];
  let cur = startOfDay(parseDayKey(from) || startOfToday());
  const end = startOfDay(parseDayKey(to) || startOfToday());
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard < 500) {
    keys.push(dayKey(cur));
    cur = addDays(cur, 1);
    guard++;
  }
  return keys;
}
