// Builds the Chrome Web Store images and the website images from the real side panel.
// Run: node scripts/graphics/build.mjs
//
// It loads extension/ in Chromium through e2e/harness.mjs (playwright-core from the npx cache, and the
// server repo next to this one; the harness swaps the real server for a local in-memory one).
// A sample list goes into chrome.storage.sync. Quotes and the TradingView watchlist answer are fixed
// answers served by Playwright, so no request reaches Yahoo, TWSE, Binance or TradingView, and every
// run draws the same prices. Each side panel screenshot is then placed on a page from layout.mjs, and
// that page is captured at the exact store size.
//
// Writes:
//   store/graphics/zh-TW/screenshot-1..5.png, store/graphics/en/screenshot-1..5.png  (1280 x 800)
//   store/graphics/promo-small-440x280.png, store/graphics/promo-marquee-1400x560.png
//   docs/images/sidepanel-light.png, docs/images/sidepanel-dark.png  (380 x 700 CSS at 2x)
//   docs/images/og.png, docs/images/og-en.png  (1200 x 630)

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, sleep, startStack, waitFor } from '../../e2e/harness.mjs';
import { COPY, heroPage, promoSmallPage, screenshotPage } from './layout.mjs';

const PANEL = { width: 380, height: 700 };
// The footer shows the time of the last quote, so every run shows the same afternoon.
const CLOCK = new Date('2026-11-10T13:24:36+08:00');

const LIGHT = { bg: '#ffffff', text: '#131722' };
const DARK = { bg: '#131722', text: '#d1d4dc' };
const PAPER = { bg: '#f6efe1', text: '#3b3024' };

// price and the previous close. The levels follow the recorded answers in test/fixtures.
const QUOTES = {
  'TWSE:2330': { name: '台積電', price: 2135, previous: 2100 },
  'TWSE:2454': { name: '聯發科', price: 1735, previous: 1760 },
  'TWSE:2382': { name: '廣達', price: 318.5, previous: 312 },
  'TWSE:2317': { name: '鴻海', price: 238.5, previous: 236 },
  'TWSE:0050': { name: '元大台灣50', price: 74.35, previous: 73.9 },
  'TWSE:2881': { name: '富邦金', price: 92.4, previous: 92.9 },
  'TWSE:2882': { name: '國泰金', price: 66.8, previous: 66.5 },
  'NASDAQ:NVDA': { name: 'NVIDIA Corporation', price: 201.5, previous: 198.3 },
  'NASDAQ:AAPL': { name: 'Apple Inc.', price: 344.04, previous: 344.17 },
  'NASDAQ:MSFT': { name: 'Microsoft Corporation', price: 518.2, previous: 513.85 },
  'NASDAQ:TSLA': { name: 'Tesla, Inc.', price: 452.8, previous: 462.4 },
  'KRX:005930': { name: 'Samsung Electronics Co., Ltd.', price: 189900, previous: 188700 },
  'BINANCE:BTCUSDT': { name: '', price: 75639.28, previous: 76012.01 },
  'BINANCE:ETHUSDT': { name: '', price: 2222.17, previous: 2255.75 },
  'BINANCE:SOLUSDT': { name: '', price: 168.42, previous: 163.57 },
};

const symbols = (...ids) => ids.map((id) => ({ id, name: QUOTES[id].name }));

const TABS = [
  { id: 'tw', name: '台股' },
  { id: 'us', name: '美股' },
  { id: 'crypto', name: '幣圈' },
];

const GROUPS = [
  { id: 'semi', name: '半導體', tabId: 'tw', symbols: symbols('TWSE:2330', 'TWSE:2454', 'NASDAQ:NVDA', 'KRX:005930') },
  { id: 'ai', name: 'AI 概念', tabId: 'tw', symbols: symbols('NASDAQ:NVDA', 'TWSE:2330', 'TWSE:2382') },
  { id: 'coin', name: '加密貨幣', tabId: 'crypto', symbols: symbols('BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT') },
  { id: 'ustech', name: '美股科技', tabId: 'us', symbols: symbols('NASDAQ:AAPL', 'NASDAQ:MSFT', 'NASDAQ:TSLA') },
  { id: 'hold', name: '長期存股', tabId: 'tw', symbols: symbols('TWSE:0050', 'TWSE:2317') },
  { id: 'fin', name: '金融', tabId: 'tw', symbols: symbols('TWSE:2881', 'TWSE:2882') },
].map((group) => ({ collapsed: false, ...group }));

// What /api/v1/symbols_list/custom/ answers on the stand-in TradingView page.
const WATCHLISTS = [
  { id: 101, name: '我的自選', symbols: ['###台股', 'TWSE:2330', 'TWSE:2317', 'TWSE:2454', 'TWSE:2308', '###美股', 'NASDAQ:NVDA', 'NASDAQ:AAPL', 'NASDAQ:AMD'] },
  { id: 102, name: '波段觀察', symbols: ['###強勢股', 'TWSE:3231', 'TWSE:2382', 'TWSE:6669', '###落後補漲', 'TWSE:2603', 'TWSE:2609', '###金融', 'TWSE:2881', 'TWSE:2882'] },
  { id: 103, name: '加密貨幣', symbols: ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT', 'BINANCE:BNBUSDT', 'BINANCE:DOGEUSDT'] },
  { id: 104, name: '財報追蹤', symbols: ['###本週', 'NASDAQ:NVDA', 'NYSE:CRM', '###下週', 'NASDAQ:AVGO', 'NYSE:ORCL'] },
];

const ticker = (id) => id.split(':')[1];

function quoteParts(id) {
  const { price, previous } = QUOTES[id];
  const change = price - previous;
  return { price, previous, change, percent: (change / previous) * 100 };
}

// Answers in the shapes that extension/lib/quotes.js parses.
function quoteAnswer(url) {
  const ids = Object.keys(QUOTES);
  if (url.host === 'mis.twse.com.tw') {
    const asked = url.searchParams.get('ex_ch').split('|').map((channel) => channel.split('_')[1].replace('.tw', ''));
    const rows = ids
      .filter((id) => id.startsWith('TWSE:') && asked.includes(ticker(id)))
      .map((id) => ({ c: ticker(id), n: QUOTES[id].name, z: String(QUOTES[id].price), y: String(QUOTES[id].previous), ex: 'tse' }));
    return { msgArray: rows };
  }
  if (url.host === 'query1.finance.yahoo.com') {
    const answer = {};
    for (const yahoo of url.searchParams.get('symbols').split(',')) {
      const id = ids.find((each) => ticker(each) === yahoo.replace(/\.K[SQ]$/, ''));
      if (!id) continue;
      const { price, change, percent } = quoteParts(id);
      // A Korean stock answers on both suffixes; only the real one has bars.
      const live = !yahoo.endsWith('.KQ');
      answer[yahoo] = { timestamp: live ? [Math.floor(CLOCK / 1000)] : [], fulldayPrice: price, fulldayChange: change, fulldayChangePercent: percent };
    }
    return answer;
  }
  const asked = JSON.parse(url.searchParams.get('symbols') ?? '[]');
  return asked
    .map((pair) => `BINANCE:${pair}`)
    .filter((id) => QUOTES[id])
    .map((id) => {
      const { price, change, percent } = quoteParts(id);
      return { symbol: ticker(id), lastPrice: String(price), priceChange: String(change), priceChangePercent: percent.toFixed(3) };
    });
}

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

const QUOTE_HOSTS = /^https:\/\/(mis\.twse\.com\.tw|query1\.finance\.yahoo\.com|data-api\.binance\.vision|fapi\.binance\.com)\//;
const TRADINGVIEW = /^https:\/\/[^/]*tradingview\.com\//;

// Returns the list of requests to any other web host, which the end of the run reports as a failure.
async function serveFixedAnswers(context) {
  const outside = [];
  context.on('request', (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !QUOTE_HOSTS.test(url) && !TRADINGVIEW.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) outside.push(url);
  });
  await context.route(QUOTE_HOSTS, (route) => json(route, quoteAnswer(new URL(route.request().url()))));
  // A blank stand-in for TradingView: the import reads its watchlist answer, and a chart click
  // opens it. Nothing of TradingView itself is loaded or shown.
  await context.route(TRADINGVIEW, (route) => {
    if (new URL(route.request().url()).pathname === '/api/v1/symbols_list/custom/') return json(route, WATCHLISTS);
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stand-in</title>' });
  });
  return outside;
}

async function writeList(worker, { theme, tab = 'all' }) {
  await worker.evaluate(
    async ({ groups, tabs, theme, tab }) => {
      await chrome.storage.sync.clear();
      await chrome.storage.sync.set({
        consent: { v: 1, granted: false, at: Date.now() },
        groupOrder: groups.map((group) => group.id),
        ...Object.fromEntries(groups.map((group) => [`group:${group.id}`, group])),
        customTabs: tabs,
        tabNames: {},
        theme,
      });
      await chrome.storage.local.set({ currentTab: tab });
    },
    { groups: GROUPS, tabs: TABS, theme, tab },
  );
}

// Opens the side panel page at the given CSS size and device scale, and waits for every price.
async function openPanel(stack, { theme, tab, height = PANEL.height }) {
  await writeList(stack.worker, { theme, tab });
  const page = await stack.context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: PANEL.width, height });
  const cdp = await stack.context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: PANEL.width, height, deviceScaleFactor: 2, mobile: false });
  await page.goto(`chrome-extension://${stack.extensionId}/sidepanel.html`);
  await page.locator('.row').first().waitFor();
  const priced = await waitFor(() =>
    page.locator('.row .price').evaluateAll((cells) => cells.length > 0 && cells.every((cell) => /\d/.test(cell.textContent))),
  );
  if (!priced) throw new Error('some rows have no price');
  await page.locator('#update-time').filter({ hasText: /\d/ }).waitFor();
  return {
    page,
    errors,
    // No focus ring, and no hover buttons from the last click.
    async capture() {
      await page.evaluate(() => document.activeElement?.blur());
      await page.mouse.move(PANEL.width - 1, 0);
      await page.evaluate(() => document.fonts.ready);
      await sleep(300);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    },
  };
}

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
const panelImage = (png, height = PANEL.height) => ({ src: dataUrl(png), width: PANEL.width, height });

// Fails when a line of words is wider than its column or leaves the image.
async function render(stack, html, width, height) {
  const page = await stack.context.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const problems = await page.evaluate(() => {
    const found = [];
    for (const words of document.querySelectorAll('.words, .wrap')) {
      const box = words.getBoundingClientRect();
      for (const child of words.querySelectorAll('*')) {
        const rect = child.getBoundingClientRect();
        const text = child.textContent.trim().slice(0, 30);
        if (child.scrollWidth > child.clientWidth + 1 && getComputedStyle(child).display !== 'inline') found.push(`too wide: ${text}`);
        if (rect.right > box.right + 1) found.push(`past the column: ${text}`);
        if (rect.top < 0 || rect.bottom > innerHeight || rect.right > innerWidth) found.push(`outside the image: ${text}`);
      }
    }
    return found;
  });
  if (problems.length > 0) throw new Error(problems.join('\n'));
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}

async function save(relative, png) {
  const path = join(root, relative);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, png);
  console.log(`wrote ${relative}`);
}

const stack = await startStack();
const pageErrors = [];
let outside = [];
try {
  await stack.context.clock.setFixedTime(CLOCK);
  outside = await serveFixedAnswers(stack.context);
  const shots = {};

  // 1. The whole list, light.
  {
    const panel = await openPanel(stack, { theme: LIGHT });
    shots.light = await panel.capture();
    pageErrors.push(...panel.errors);
    await panel.page.close();
  }

  // 2. A click on NVDA marks it in both groups, the same as in the extension.
  let marks;
  {
    const panel = await openPanel(stack, { theme: LIGHT });
    await panel.page.locator('.row[data-symbol="NASDAQ:NVDA"]').first().click();
    await panel.page.locator('.row.selected').nth(1).waitFor();
    // The click opens the stand-in chart tab; the panel page comes back to the front.
    await panel.page.bringToFront();
    marks = await panel.page
      .locator('.row[data-symbol="NASDAQ:NVDA"]')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().toJSON()));
    shots.shared = await panel.capture();
    pageErrors.push(...panel.errors);
    await panel.page.close();
    for (const page of stack.context.pages()) if (page.url().includes('tradingview.com')) await page.close();
  }

  // 3. Dark, on the 台股 tab. Also the dark website image, on the all tab.
  {
    const panel = await openPanel(stack, { theme: DARK, tab: 'tw' });
    shots.darkTab = await panel.capture();
    pageErrors.push(...panel.errors);
    await panel.page.close();
    const all = await openPanel(stack, { theme: DARK });
    shots.dark = await all.capture();
    pageErrors.push(...all.errors);
    await all.page.close();
  }

  // 4. The import, with the stand-in TradingView tab open. The last list is left out.
  {
    const tv = await stack.context.newPage();
    await tv.goto('https://www.tradingview.com/chart/');
    const panel = await openPanel(stack, { theme: LIGHT });
    await panel.page.bringToFront();
    await panel.page.locator('#menu-button').click();
    await panel.page.getByRole('menuitem', { name: '從 TradingView 一鍵匯入' }).click();
    await panel.page.locator('.import-item').first().waitFor();
    await panel.page.locator('.import-item input').last().uncheck();
    shots.import = await panel.capture();
    pageErrors.push(...panel.errors);
    await panel.page.close();
    await tv.close();
  }

  // 5. The color sheet over a custom color. The panel is taller, so the list shows above the sheet.
  const tallHeight = 800;
  {
    const panel = await openPanel(stack, { theme: PAPER, height: tallHeight });
    await panel.page.locator('#menu-button').click();
    await panel.page.getByRole('menuitem', { name: '背景與文字顏色…' }).click();
    await panel.page.locator('.theme-sheet').waitFor();
    await sleep(400);
    shots.theme = await panel.capture();
    pageErrors.push(...panel.errors);
    // Closing without a change keeps the stored colors the same.
    await panel.page.close();
  }

  const panels = [
    { png: shots.light },
    { png: shots.shared, marks },
    { png: shots.darkTab, dark: true },
    { png: shots.import },
    { png: shots.theme, height: tallHeight },
  ];
  for (const [locale, copy] of Object.entries(COPY)) {
    for (const [index, shot] of copy.shots.entries()) {
      const { png, marks: boxes = [], dark = false, height } = panels[index];
      const html = screenshotPage({ lang: copy.lang, ...shot, dark, panel: panelImage(png, height), marks: boxes });
      await save(`store/graphics/${locale}/screenshot-${index + 1}.png`, await render(stack, html, 1280, 800));
    }
  }

  await save('store/graphics/promo-small-440x280.png', await render(stack, promoSmallPage(), 440, 280));
  const hero = (lang, width, height, look) =>
    heroPage({ lang: COPY[lang].lang, width, height, light: panelImage(shots.light), dark: panelImage(shots.dark), copy: COPY[lang], ...look });
  const MARQUEE = { panelWidth: 372, overlap: 0.42, big: 0.92 };
  const OG = { panelWidth: 360, overlap: 0.3, big: 0.84 };
  await save('store/graphics/promo-marquee-1400x560.png', await render(stack, hero('zh-TW', 1400, 560, MARQUEE), 1400, 560));
  await save('docs/images/og.png', await render(stack, hero('zh-TW', 1200, 630, OG), 1200, 630));
  await save('docs/images/og-en.png', await render(stack, hero('en', 1200, 630, OG), 1200, 630));
  await save('docs/images/sidepanel-light.png', shots.light);
  await save('docs/images/sidepanel-dark.png', shots.dark);
} finally {
  await stack.close();
}

const real = pageErrors.filter((text) => !/Failed to load resource|net::ERR_/.test(text));
if (real.length > 0) {
  console.error(`side panel errors:\n${real.join('\n')}`);
  process.exitCode = 1;
}
if (outside.length > 0) {
  console.error(`requests to other web hosts:\n${outside.join('\n')}`);
  process.exitCode = 1;
}
