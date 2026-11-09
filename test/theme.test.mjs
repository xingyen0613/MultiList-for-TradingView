import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contrast,
  hexToHsv,
  hsvToHex,
  isDark,
  mix,
  parseHex,
  presetOf,
  PRESETS,
  themeColors,
  validTheme,
} from '../extension/lib/theme.js';

test('parseHex accepts #rgb, #rrggbb and a missing #, and gives lower case', () => {
  assert.equal(parseHex('#FFF'), '#ffffff');
  assert.equal(parseHex('14213D'), '#14213d');
  assert.equal(parseHex(' #a1b2c3 '), '#a1b2c3');
  assert.equal(parseHex('#12345'), null);
  assert.equal(parseHex('red'), null);
  assert.equal(parseHex(undefined), null);
});

test('mix puts the given part of the first color in the result', () => {
  assert.equal(mix('#000000', '#ffffff', 0), '#ffffff');
  assert.equal(mix('#000000', '#ffffff', 1), '#000000');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
});

test('contrast follows WCAG 2', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  // The order of the two colors does not matter.
  assert.equal(contrast('#131722', '#d1d4dc'), contrast('#d1d4dc', '#131722'));
});

test('isDark tells a dark background from a light one', () => {
  assert.equal(isDark('#131722'), true);
  assert.equal(isDark('#14213d'), true);
  assert.equal(isDark('#ffffff'), false);
  assert.equal(isDark('#f5f0e1'), false);
});

test('validTheme needs two colors in the stored #rrggbb form', () => {
  assert.equal(validTheme({ bg: '#14213d', text: '#f5f0e1' }), true);
  assert.equal(validTheme({ bg: '#14213D', text: '#f5f0e1' }), false);
  assert.equal(validTheme({ bg: '#14213d' }), false);
  assert.equal(validTheme(null), false);
});

test('a preset uses the stylesheet colors, with no vars', () => {
  assert.equal(presetOf({ ...PRESETS.dark }), 'dark');
  assert.deepEqual(themeColors(PRESETS.light), { scheme: 'light', vars: {} });
  assert.deepEqual(themeColors(PRESETS.dark), { scheme: 'dark', vars: {} });
});

test('a custom theme sets the list colors from the background and text', () => {
  const { scheme, vars } = themeColors({ bg: '#14213d', text: '#f5f0e1' });
  assert.equal(scheme, 'dark');
  assert.equal(vars['--bg'], '#14213d');
  assert.equal(vars['--text'], '#f5f0e1');
  // The secondary colors are between the two, the muted text nearer the text.
  assert.ok(contrast(vars['--muted'], '#14213d') > contrast(vars['--border'], '#14213d'));
  assert.ok(contrast(vars['--border'], '#14213d') > contrast(vars['--hover'], '#14213d'));
  assert.equal(themeColors({ bg: '#fdf6e3', text: '#333333' }).scheme, 'light');
});

test('hexToHsv and hsvToHex give back the same color', () => {
  for (const hex of ['#14213d', '#f5f0e1', '#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#808080', '#2962ff']) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex);
  }
  assert.deepEqual(hexToHsv('#ff0000'), { h: 0, s: 1, v: 1 });
  assert.equal(hsvToHex({ h: 120, s: 1, v: 1 }), '#00ff00');
});
