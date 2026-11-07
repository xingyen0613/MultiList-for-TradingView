import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import {
  fetchQuotes,
  parseAlpaca,
  parseBinance,
  parseFugle,
  parseMis,
  parseYahooSpark,
  resolveSymbol,
  takeBatch,
} from '../extension/lib/quotes.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

test('parseMis reads a real response for listed and OTC stocks', () => {
  const quotes = parseMis(fixture('mis'));
  const tsmc = quotes.get('2330');
  assert.ok(tsmc.price > 0);
  assert.ok(Math.abs(tsmc.change - (tsmc.price - tsmc.price / (1 + tsmc.changePercent / 100))) < 0.01);
  assert.ok(quotes.get('6488').price > 0);
});

test('parseMis uses the best bid if the snapshot has no trade', () => {
  const quotes = parseMis({ msgArray: [{ c: '2330', z: '-', y: '100.0000', b: '101.0000_100.5000_' }] });
  assert.deepEqual(quotes.get('2330'), { price: 101, change: 1, changePercent: 1 });
});

test('parseMis uses the previous close if there is no trade and no bid', () => {
  const quotes = parseMis({ msgArray: [{ c: '2330', z: '-', y: '100.0000', b: '-' }] });
  assert.deepEqual(quotes.get('2330'), { price: 100, change: 0, changePercent: 0 });
});

test('parseMis ignores the empty row for an unknown code', () => {
  assert.equal(parseMis({ msgArray: [{ c: '', z: '-' }] }).size, 0);
});

test('parseYahooSpark reads a real response and restores the share class form', () => {
  const quotes = parseYahooSpark(fixture('yahoo-spark'));
  assert.ok(quotes.get('AAPL').price > 0);
  assert.equal(typeof quotes.get('AAPL').changePercent, 'number');
  assert.ok(quotes.get('BRK.B').price > 0);
});

test('parseBinance reads a real response', () => {
  const quotes = parseBinance(fixture('binance'));
  assert.ok(quotes.get('BTCUSDT').price > 0);
  assert.equal(typeof quotes.get('ETHUSDT').changePercent, 'number');
});

test('parseFugle reads the sample from the Fugle docs', () => {
  const quotes = parseFugle({
    symbol: '2330',
    name: '台積電',
    referencePrice: 566,
    previousClose: 566,
    lastPrice: 568,
    change: 2,
    changePercent: 0.35,
  });
  assert.deepEqual(quotes.get('2330'), { price: 568, change: 2, changePercent: 0.35 });
});

test('parseFugle uses the reference price before the first trade', () => {
  const quotes = parseFugle({ symbol: '2330', referencePrice: 566 });
  assert.deepEqual(quotes.get('2330'), { price: 566, change: 0, changePercent: 0 });
});

test('parseAlpaca reads the sample from the Alpaca docs', () => {
  const quotes = parseAlpaca({
    AAPL: {
      latestTrade: { p: 172.61 },
      dailyBar: { c: 173.03 },
      prevDailyBar: { c: 173.19 },
    },
  });
  const quote = quotes.get('AAPL');
  assert.equal(quote.price, 172.61);
  assert.ok(Math.abs(quote.change - -0.58) < 0.001);
});

test('takeBatch moves through a long list and returns short lists whole', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(takeBatch(items, 0, 2), ['a', 'b']);
  assert.deepEqual(takeBatch(items, 4, 2), ['e', 'a']);
  assert.deepEqual(takeBatch(['a'], 3, 2), ['a']);
});

test('fetchQuotes splits Yahoo requests into chunks of 20', async () => {
  const requested = [];
  globalThis.fetch = async (url) => {
    const symbols = new URL(url).searchParams.get('symbols').split(',');
    requested.push(symbols.length);
    return jsonResponse(Object.fromEntries(symbols.map((s) => [s, { fulldayPrice: 1 }])));
  };
  const ids = Array.from({ length: 45 }, (_, i) => `NYSE:T${i}`);
  const { quotes } = await fetchQuotes(ids, {});
  assert.deepEqual(requested, [20, 20, 5]);
  assert.equal(quotes.size, 45);
});

test('fetchQuotes uses the keyed source first if the user has a key', async () => {
  const hosts = [];
  globalThis.fetch = async (url, options) => {
    hosts.push(new URL(url).hostname);
    assert.equal(options.headers['X-API-KEY'], 'test-key');
    return jsonResponse({ symbol: '2330', lastPrice: 568, change: 2, changePercent: 0.35 });
  };
  const { quotes, status } = await fetchQuotes(['TWSE:2330'], { fugle: 'test-key' });
  assert.deepEqual(hosts, ['api.fugle.tw']);
  assert.equal(quotes.get('TWSE:2330').price, 568);
  assert.equal(status[0].source, 'Fugle');
});

test('fetchQuotes falls back to the backup source and reports the error', async () => {
  globalThis.fetch = async (url) => {
    if (new URL(url).hostname === 'api.fugle.tw') return jsonResponse({}, 429);
    return jsonResponse({ msgArray: [{ c: '2330', z: '100', y: '100' }] });
  };
  const { quotes, status } = await fetchQuotes(['TWSE:2330'], { fugle: 'test-key' });
  assert.equal(quotes.get('TWSE:2330').price, 100);
  assert.equal(status[0].source, 'TWSE MIS');
  assert.deepEqual(status[0].errors, ['Fugle: HTTP 429']);
});

test('one failing market does not stop the other markets', async () => {
  globalThis.fetch = async (url) => {
    if (new URL(url).hostname === 'query1.finance.yahoo.com') return jsonResponse({}, 500);
    return jsonResponse({ msgArray: [{ c: '2330', z: '100', y: '100' }] });
  };
  const { quotes, status } = await fetchQuotes(['TWSE:2330', 'NASDAQ:AAPL'], {});
  assert.equal(quotes.size, 1);
  const us = status.find((item) => item.market === 'us');
  assert.equal(us.source, null);
  assert.deepEqual(us.errors, ['Yahoo: HTTP 500']);
});

test('one unknown Binance pair does not stop the other pairs', async () => {
  const pairs = ['BTCUSDT', 'GONEUSDT', 'ETHUSDT'];
  globalThis.fetch = async (url) => {
    const asked = JSON.parse(new URL(url).searchParams.get('symbols'));
    if (asked.includes('GONEUSDT')) return jsonResponse({ code: -1121, msg: 'Invalid symbol.' }, 400);
    return jsonResponse(
      asked.map((symbol) => ({ symbol, lastPrice: '1', priceChange: '0', priceChangePercent: '0' })),
    );
  };
  const { quotes, status } = await fetchQuotes(pairs.map((pair) => `BINANCE:${pair}`), {});
  assert.deepEqual([...quotes.keys()], ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT']);
  assert.deepEqual(status[0].errors, []);
});

test('Binance reports the error if the only pair is unknown', async () => {
  globalThis.fetch = async () => jsonResponse({ code: -1121 }, 400);
  const { quotes, status } = await fetchQuotes(['BINANCE:GONEUSDT'], {});
  assert.equal(quotes.size, 0);
  assert.deepEqual(status[0].errors, ['Binance: HTTP 400']);
});

test('a failed Fugle batch does not use up the turn of its symbols', async () => {
  const ids = Array.from({ length: 30 }, (_, i) => `TWSE:${1000 + i}`);
  const firstCode = [];
  let failNext = true;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.hostname !== 'api.fugle.tw') return jsonResponse({ msgArray: [] });
    const code = parsed.pathname.split('/').at(-1);
    if (failNext) return jsonResponse({}, 429);
    firstCode.push(code);
    return jsonResponse({ symbol: code, lastPrice: 1, change: 0, changePercent: 0 });
  };

  await fetchQuotes(ids, { fugle: 'test-key' });
  failNext = false;
  await fetchQuotes(ids, { fugle: 'test-key' });
  await fetchQuotes(ids, { fugle: 'test-key' });

  assert.equal(firstCode[0], '1000');
  assert.equal(firstCode[25], '1025');
});

test('requests with an API key refuse redirects, and others follow them', async () => {
  const modes = {};
  globalThis.fetch = async (url, options) => {
    modes[new URL(url).hostname] = options.redirect;
    return jsonResponse({ symbol: '2330', lastPrice: 1, change: 0, changePercent: 0, msgArray: [] });
  };
  await fetchQuotes(['TWSE:2330'], { fugle: 'test-key' });
  await fetchQuotes(['TWSE:2330'], {});
  assert.equal(modes['api.fugle.tw'], 'error');
  assert.equal(modes['mis.twse.com.tw'], 'follow');
});

test('resolveSymbol finds the right Taiwan exchange', async () => {
  globalThis.fetch = async () =>
    jsonResponse({ msgArray: [{ c: '', z: '-' }, { c: '6488', n: '環球晶', ex: 'otc' }] });
  assert.deepEqual(await resolveSymbol('6488'), { id: 'TPEX:6488', name: '環球晶' });
});

test('resolveSymbol maps the Yahoo exchange to the TradingView exchange', async () => {
  globalThis.fetch = async () =>
    jsonResponse({ chart: { result: [{ meta: { exchangeName: 'PCX', shortName: 'SPDR' } }] } });
  assert.deepEqual(await resolveSymbol('SPY'), { id: 'AMEX:SPY', name: 'SPDR' });
});

test('resolveSymbol tries the US market if Binance has no such pair', async () => {
  globalThis.fetch = async (url) => {
    if (new URL(url).hostname === 'data-api.binance.vision') return jsonResponse({}, 400);
    return jsonResponse({ chart: { result: [{ meta: { exchangeName: 'NYQ', shortName: 'X' } }] } });
  };
  assert.deepEqual(await resolveSymbol('ABCBTC'), { id: 'NYSE:ABCBTC', name: 'X' });
});

test('resolveSymbol explains each failure', async () => {
  globalThis.fetch = async () => jsonResponse({}, 404);
  await assert.rejects(resolveSymbol('ZZZZZ'), /找不到 ZZZZZ/);
  await assert.rejects(resolveSymbol('台積電'), /不支援/);

  globalThis.fetch = async () => jsonResponse({}, 429);
  await assert.rejects(resolveSymbol('AAPL'), /查詢 AAPL 失敗（HTTP 429）/);
});
