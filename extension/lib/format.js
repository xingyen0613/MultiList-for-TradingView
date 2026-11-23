const EMPTY = '—';
const MINUS = '−';

// The price sets the precision, so a change of 0.494 on a 343 stock shows as 0.49.
// digits is the most decimals for a price of 1 or more: 2, or 4 for forex such as 1.1005.
function formatAbsolute(value, price, digits = 2) {
  const maximumFractionDigits = Math.abs(price) >= 1 || price === 0 ? digits : 8;
  return Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits });
}

function signOf(value) {
  if (value > 0) return '+';
  return value < 0 ? MINUS : '';
}

export function formatPrice(value, digits) {
  return value === null || value === undefined ? EMPTY : formatAbsolute(value, value, digits);
}

export function formatChange(value, price, digits) {
  if (value === null || value === undefined) return EMPTY;
  return `${signOf(value)}${formatAbsolute(value, price, digits)}`;
}

export function formatPercent(value) {
  if (value === null || value === undefined) return EMPTY;
  const absolute = Math.abs(value).toFixed(2);
  return `${signOf(value)}${absolute}%`;
}

export function directionOf(value) {
  if (value > 0) return 'up';
  return value < 0 ? 'down' : 'flat';
}

export function formatTime(date) {
  return date.toLocaleTimeString('en-GB');
}

// 2026/11/09 14:05, in local time.
export function formatDateTime(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
