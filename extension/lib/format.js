const EMPTY = '—';
const MINUS = '−';

// The price sets the precision, so a change of 0.494 on a 343 stock shows as 0.49.
function formatAbsolute(value, price) {
  const maximumFractionDigits = Math.abs(price) >= 1 || price === 0 ? 2 : 8;
  return Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits });
}

function signOf(value) {
  if (value > 0) return '+';
  return value < 0 ? MINUS : '';
}

export function formatPrice(value) {
  return value === null || value === undefined ? EMPTY : formatAbsolute(value, value);
}

export function formatChange(value, price) {
  if (value === null || value === undefined) return EMPTY;
  return `${signOf(value)}${formatAbsolute(value, price)}`;
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
