// src/utils/currency.js
// All monetary values are stored as INTEGER minor units (paisa / cents) to avoid
// floating point drift. Display uses Intl.NumberFormat from the settings currency.

export const CURRENCIES = [
  { code: 'PKR', label: 'Pakistani Rupee (PKR)', symbol: 'Rs' },
  { code: 'USD', label: 'US Dollar (USD)', symbol: '$' },
  { code: 'EUR', label: 'Euro (EUR)', symbol: '€' },
  { code: 'GBP', label: 'British Pound (GBP)', symbol: '£' },
  { code: 'AED', label: 'UAE Dirham (AED)', symbol: 'AED' },
  { code: 'INR', label: 'Indian Rupee (INR)', symbol: '₹' },
  { code: 'SAR', label: 'Saudi Riyal (SAR)', symbol: 'SAR' },
];

export function symbolFor(currency) {
  const c = CURRENCIES.find((c) => c.code === currency);
  return c ? c.symbol : currency;
}

/** Format minor units as a localized currency string. */
export function formatMoney(minorUnits, currency = 'PKR') {
  const major = (Number(minorUnits) || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${symbolFor(currency)} ${major.toLocaleString()}`;
  }
}

/** Compact formatting for stat cards: "Rs 1.25L", "$1.2M" style. */
export function formatMoneyCompact(minorUnits, currency = 'PKR') {
  const major = (Number(minorUnits) || 0) / 100;
  const sym = symbolFor(currency);
  const abs = Math.abs(major);
  const sign = major < 0 ? '-' : '';
  const fmt = (v) => {
    const s = v >= 100 ? v.toFixed(0) : v.toFixed(2).replace(/\.00$/, '');
    return s;
  };
  if (abs >= 1e7) return `${sign}${sym} ${fmt(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}${sym} ${fmt(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}${sym} ${fmt(abs / 1e3)}K`;
  return `${sign}${sym} ${fmt(abs)}`;
}

/** Parse a user-entered money string ("1,234.50" or "1234") into minor units. */
export function parseMoneyInput(text) {
  if (text === null || text === undefined || text === '') return NaN;
  const cleaned = String(text).replace(/[,\s]/g, '').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

/** Minor units -> editable major-unit string ("1234.50"). */
export function minorToInput(minorUnits) {
  const major = (Number(minorUnits) || 0) / 100;
  return major % 1 === 0 ? String(major) : major.toFixed(2);
}

export function isValidMinor(n) {
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n);
}
