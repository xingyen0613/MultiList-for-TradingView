// Widths of the three number columns: last price, change, change percent.
// The symbol column takes the rest of the row.

export const DEFAULT_WIDTHS = [76, 58, 60];
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
export function columnsTemplate(widths) {
  return [`minmax(${MIN_SYMBOL_WIDTH}px, 1fr)`, ...widths.map((width) => `minmax(0, ${width}px)`)].join(' ');
}
