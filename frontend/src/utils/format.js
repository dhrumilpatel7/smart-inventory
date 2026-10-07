const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-IN');
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

const empty = (v) => v === null || v === undefined || Number.isNaN(v);

export const formatCurrency = (v) => (empty(v) ? '—' : inr.format(v));
export const formatCurrencyCompact = (v) => (empty(v) ? '—' : inrCompact.format(v));
export const formatNumber = (v) => (empty(v) ? '—' : number.format(v));
export const formatCompact = (v) => (empty(v) ? '—' : compact.format(v));
export const formatDecimal = (v, digits = 2) => (empty(v) ? '—' : Number(v).toFixed(digits));
export const formatPercent = (v, digits = 1) => (empty(v) ? 'n/a' : `${Number(v).toFixed(digits)}%`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-06-30" -> "30 Jun 2026".  Dates are plain calendar dates (no time zone maths).
export function formatDate(value) {
  if (!value) return '—';
  const text = typeof value === 'string' ? value.slice(0, 10) : new Date(value).toISOString().slice(0, 10);
  const [y, m, d] = text.split('-').map(Number);
  if (!y || !m || !d) return text;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Short axis labels: "2026-06-30" -> "30 Jun", "2026-06" -> "Jun 2026".
export function formatPeriod(value) {
  if (!value) return '';
  const parts = String(value).split('-').map(Number);
  if (parts.length === 2) return `${MONTHS[parts[1] - 1]} ${parts[0]}`;
  if (parts.length === 3) return `${parts[2]} ${MONTHS[parts[1] - 1]}`;
  return String(value);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Today's date in the user's own time zone, as "YYYY-MM-DD" (for <input type="date">).
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
