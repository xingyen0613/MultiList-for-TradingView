// Widths of the three number columns: last price, change, change percent.
// The symbol column takes the rest of the row. The user can hide any number column, and the
// widths of hidden columns stay saved.

export const COLUMNS = ['price', 'change', 'percent'];
export const DEFAULT_WIDTHS = [76, 58, 60];
// The last column holds the column button in the header and the remove button in each row.
export const BUTTON_WIDTH = 18;
export const MIN_WIDTH = 36;
export const MAX_WIDTH = 200;
export const MIN_SYMBOL_WIDTH = 48;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

// Moves the border on the left of number column `index` by `delta` pixels.
// Only the two columns beside the border change, so no other border moves.
// At border 0 the symbol column is on the left. It gets narrower or wider by itself.
// `mins` holds the width of the widest number in each column, so a drag never hides part of a number.
export function resizeColumns(widths, index, delta, symbolWidth, mins = []) {
  // A column that is already narrower than its numbers can get wider, but not narrower.
  const low = (i) => Math.min(widths[i], Math.max(MIN_WIDTH, mins[i] ?? 0));
  const next = [...widths];
  if (index === 0) {
    // The panel can be narrower now than when the widths were saved. Then the column can only get narrower.
    const room = Math.max(0, symbolWidth - MIN_SYMBOL_WIDTH);
    next[0] = widths[0] + clamp(-delta, low(0) - widths[0], Math.min(MAX_WIDTH - widths[0], room));
    return next;
  }
  const left = widths[index - 1];
  const right = widths[index];
  const move = clamp(delta, Math.max(low(index - 1) - left, right - MAX_WIDTH), Math.min(MAX_WIDTH - left, right - low(index)));
  next[index - 1] = left + move;
  next[index] = right - move;
  return next;
}

// Saved widths can come from an older version, or be changed by hand.
export function validWidths(widths) {
  return Array.isArray(widths) &&
    widths.length === DEFAULT_WIDTHS.length &&
    widths.every((width) => Number.isFinite(width) && width >= MIN_WIDTH && width <= MAX_WIDTH);
}

// A narrow panel makes the number columns narrower, so the row never gets wider than the panel.
export function columnsTemplate(widths, visible = COLUMNS) {
  const numbers = visibleWidths(widths, visible).map((width) => `minmax(0, ${width}px)`);
  return [`minmax(${MIN_SYMBOL_WIDTH}px, 1fr)`, ...numbers, `${BUTTON_WIDTH}px`].join(' ');
}

// resizeColumns works on the visible columns. These two convert between them and all the columns.
export const visibleWidths = (widths, visible) => visible.map((id) => widths[COLUMNS.indexOf(id)]);

export function withVisibleWidths(widths, visible, part) {
  const next = [...widths];
  visible.forEach((id, i) => {
    next[COLUMNS.indexOf(id)] = part[i];
  });
  return next;
}

// The saved choice is { hidden: [...], extendedHours: false }. Nothing saved means the defaults:
// every column, and the US pre-market and after-hours line.
export const DEFAULT_COLUMNS = { visible: COLUMNS, extendedHours: true };

export function readColumnSettings(saved) {
  const hidden = Array.isArray(saved?.hidden) ? saved.hidden : [];
  return { visible: COLUMNS.filter((id) => !hidden.includes(id)), extendedHours: saved?.extendedHours !== false };
}

// Returns null for the defaults, so the saved item can be removed.
export function columnSettingsToSave({ visible, extendedHours }) {
  const hidden = COLUMNS.filter((id) => !visible.includes(id));
  return hidden.length === 0 && extendedHours ? null : { hidden, extendedHours };
}
