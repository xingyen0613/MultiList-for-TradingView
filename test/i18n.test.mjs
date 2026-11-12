import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getLanguage, LANGUAGE_NAMES, LANGUAGES, MESSAGES, pickLanguage, setLanguage, t } from '../extension/lib/i18n.js';

const read = (path) => readFileSync(new URL(`../extension/${path}`, import.meta.url), 'utf8');
// Han characters, and the full-width punctuation of Chinese text.
const HAN = /[㐀-鿿]/;
const CHINESE = /[　-〿㐀-鿿＀-￯]/;
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

// The files whose visible text comes from the dictionary.
const SOURCES = ['sidepanel.js', 'lib/quotes.js', 'lib/transfer.js', 'lib/tradingview.js'];
// Keys that the code builds from a variable.
const BUILT_KEYS = [
  ...['tw', 'us', 'eu', 'kr', 'crypto', 'perp'].map((market) => `market.${market}`),
  ...['stock', 'fund', 'dr', 'structured', 'futures', 'swap', 'spot', 'index', 'forex', 'bond', 'economic'].map((kind) => `kind.${kind}`),
];

function usedKeys() {
  const used = new Set(BUILT_KEYS);
  for (const file of SOURCES) {
    const code = read(file);
    for (const [, key] of code.matchAll(/'([a-z][A-Za-z]*(?:\.[A-Za-z]+)+)'/g)) used.add(key);
    for (const [, key] of code.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(key);
  }
  for (const [, key] of read('sidepanel.html').matchAll(/data-i18n(?:-label|-title)?="([^"]+)"/g)) used.add(key);
  return used;
}

test('every message has a Chinese and an English text with the same placeholders', () => {
  for (const [key, entry] of Object.entries(MESSAGES)) {
    assert.equal(entry.length, 2, key);
    const [zh, en] = entry;
    assert.equal(typeof zh, 'string', key);
    assert.ok(zh.trim(), key);
    if (typeof en === 'function') continue;
    assert.equal(typeof en, 'string', key);
    assert.ok(en.trim(), key);
    assert.deepEqual(placeholders(en), placeholders(zh), key);
  }
});

test('the English texts have no Chinese and no empty placeholder, for one and for many', () => {
  setLanguage('en');
  try {
    for (const [key, [zh]] of Object.entries(MESSAGES)) {
      for (const n of [1, 2]) {
        const text = t(key, Object.fromEntries(placeholders(zh).map((name) => [name, n])));
        assert.doesNotMatch(text, CHINESE, key);
        assert.doesNotMatch(text, /[{}]|undefined/, key);
      }
    }
  } finally {
    setLanguage('zh-TW');
  }
});

test('an English count uses the singular for one', () => {
  setLanguage('en');
  try {
    assert.equal(t('import.done', { tabs: 1, groups: 2, symbols: 1 }), 'Imported 1 tab, 2 groups and 1 symbol');
    assert.equal(t('choice.count', { groups: 0, symbols: 1 }), '0 groups, 1 symbol');
    assert.equal(t('tab.loose', { count: 3 }), '3 ungrouped symbols');
    assert.equal(t('import.listInfo', { count: 1, groups: 1 }), '1 symbol · 1 group');
  } finally {
    setLanguage('zh-TW');
  }
  assert.equal(t('import.done', { tabs: 1, groups: 2, symbols: 1 }), '已匯入 1 個分頁、2 個分組、1 個代碼');
});

test('t fills the params in the current language', () => {
  assert.equal(getLanguage(), 'zh-TW');
  assert.equal(t('symbol.exists', { ticker: 'AAPL', group: '科技' }), 'AAPL 已經在「科技」');
  setLanguage('en');
  try {
    assert.equal(getLanguage(), 'en');
    assert.equal(t('symbol.exists', { ticker: 'AAPL', group: 'Tech' }), 'AAPL is already in “Tech”');
    assert.equal(t('cancel'), 'Cancel');
    // A missing key or param stays visible instead of throwing.
    assert.equal(t('no.such.key'), 'no.such.key');
    assert.equal(t('status.updated'), 'Updated {time}');
    // A language that the panel does not have falls back to English.
    setLanguage('fr');
    assert.equal(getLanguage(), 'en');
  } finally {
    setLanguage('zh-TW');
  }
  assert.equal(t('cancel'), '取消');
});

test('pickLanguage keeps a saved choice, or else follows the browser, or else uses English', () => {
  assert.equal(pickLanguage('en', 'zh-TW'), 'en');
  assert.equal(pickLanguage('zh-TW', 'en-US'), 'zh-TW');
  for (const ui of ['zh-TW', 'zh-HK', 'zh-CN', 'zh', 'ZH-tw', 'zh_TW']) assert.equal(pickLanguage(undefined, ui), 'zh-TW', ui);
  for (const ui of ['en-US', 'en', 'ja', 'fr-FR', 'zu', '', undefined, null]) assert.equal(pickLanguage(undefined, ui), 'en', String(ui));
  // A stored value that is not one of the languages counts as no choice.
  assert.equal(pickLanguage('fr', 'zh-TW'), 'zh-TW');
  assert.equal(pickLanguage(null, 'en-GB'), 'en');
});

test('each language is named in itself, in the order of LANGUAGES', () => {
  assert.deepEqual(Object.keys(LANGUAGE_NAMES), LANGUAGES);
  assert.deepEqual(LANGUAGE_NAMES, { 'zh-TW': '繁體中文', en: 'English' });
});

test('every message key in the code is in the dictionary, and every message is used', () => {
  const used = usedKeys();
  assert.deepEqual([...used].filter((key) => !Object.hasOwn(MESSAGES, key)), []);
  assert.deepEqual(Object.keys(MESSAGES).filter((key) => !used.has(key)), []);
});

test('the panel code has no Chinese text outside comments', () => {
  for (const file of [...SOURCES, 'lib/chart-page.js', 'sidepanel.html']) {
    const left = read(file)
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && HAN.test(line));
    assert.deepEqual(left, [], file);
  }
});
