import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  columnsTemplate,
  DEFAULT_WIDTHS,
  MAX_WIDTH,
  MIN_SYMBOL_WIDTH,
  MIN_WIDTH,
  resizeColumns,
  validWidths,
} from '../extension/lib/columns.js';

test('the first border changes only the price column, and the symbol column takes the rest', () => {
  assert.deepEqual(resizeColumns([76, 58, 60], 0, -20, 150), [96, 58, 60]);
  assert.deepEqual(resizeColumns([76, 58, 60], 0, 20, 150), [56, 58, 60]);
});

test('a border between two number columns moves width from one to the other', () => {
  assert.deepEqual(resizeColumns([76, 58, 60], 1, 10, 150), [86, 48, 60]);
  assert.deepEqual(resizeColumns([76, 58, 60], 2, -10, 150), [76, 48, 70]);
});

test('no column gets narrower than the minimum or wider than the maximum', () => {
  assert.deepEqual(resizeColumns([76, 58, 60], 1, 100, 150), [76 + 58 - MIN_WIDTH, MIN_WIDTH, 60]);
  assert.deepEqual(resizeColumns([76, 58, 60], 0, 500, 500), [MIN_WIDTH, 58, 60]);
  assert.deepEqual(resizeColumns([190, 180, 60], 1, 50, 150), [MAX_WIDTH, 170, 60]);
  assert.deepEqual(resizeColumns([76, 58, 60], 0, -500, 1000), [MAX_WIDTH, 58, 60]);
});

test('the symbol column keeps its minimum width', () => {
  assert.deepEqual(resizeColumns([76, 58, 60], 0, -100, 100), [76 + 100 - MIN_SYMBOL_WIDTH, 58, 60]);
  // A panel that got narrower after the save: the column can get narrower, but not wider.
  assert.deepEqual(resizeColumns([76, 58, 60], 0, -10, 30), [76, 58, 60]);
  assert.deepEqual(resizeColumns([76, 58, 60], 0, 10, 30), [66, 58, 60]);
});

test('a column does not get narrower than its widest number', () => {
  const mins = [56, 50, 45];
  assert.deepEqual(resizeColumns([76, 58, 60], 0, 50, 150, mins), [56, 58, 60]);
  assert.deepEqual(resizeColumns([76, 58, 60], 1, 50, 150, mins), [84, 50, 60]);
  assert.deepEqual(resizeColumns([76, 58, 60], 2, -50, 150, mins), [76, 50, 68]);
  // Numbers got wider after the save: the column can get wider, and it does not jump.
  assert.deepEqual(resizeColumns([40, 58, 60], 0, 0, 150, mins), [40, 58, 60]);
  assert.deepEqual(resizeColumns([40, 58, 60], 0, 10, 150, mins), [40, 58, 60]);
  assert.deepEqual(resizeColumns([40, 58, 60], 0, -10, 150, mins), [50, 58, 60]);
});

test('validWidths accepts only three widths inside the limits', () => {
  assert.equal(validWidths(DEFAULT_WIDTHS), true);
  assert.equal(validWidths(null), false);
  assert.equal(validWidths([76, 58]), false);
  assert.equal(validWidths([76, 58, 10]), false);
  assert.equal(validWidths([76, 58, 'x']), false);
});

test('columnsTemplate lets the number columns shrink in a narrow panel', () => {
  assert.equal(columnsTemplate([76, 58, 60]), 'minmax(48px, 1fr) minmax(0, 76px) minmax(0, 58px) minmax(0, 60px)');
});
