import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directionOf, formatChange, formatPercent, formatPrice } from '../extension/lib/format.js';

test('formatPrice shows two decimals, and more for very small prices', () => {
  assert.equal(formatPrice(2135), '2,135.00');
  assert.equal(formatPrice(75639.28), '75,639.28');
  assert.equal(formatPrice(0.00001234), '0.00001234');
  assert.equal(formatPrice(0), '0.00');
});

test('formats show a dash if the value is missing', () => {
  assert.equal(formatPrice(undefined), '—');
  assert.equal(formatChange(null), '—');
  assert.equal(formatPercent(undefined), '—');
});

test('formatChange and formatPercent show the sign', () => {
  assert.equal(formatChange(2, 568), '+2.00');
  assert.equal(formatChange(-105, 2135), '−105.00');
  assert.equal(formatChange(0, 100), '0.00');
  assert.equal(formatPercent(0.35), '+0.35%');
  assert.equal(formatPercent(-4.6875), '−4.69%');
  assert.equal(formatPercent(0), '0.00%');
});

test('formatChange takes its precision from the price', () => {
  assert.equal(formatChange(-0.494, 343.68), '−0.49');
  assert.equal(formatChange(-0.00000123, 0.00001234), '−0.00000123');
});

test('directionOf follows the sign', () => {
  assert.equal(directionOf(1), 'up');
  assert.equal(directionOf(-1), 'down');
  assert.equal(directionOf(0), 'flat');
});
