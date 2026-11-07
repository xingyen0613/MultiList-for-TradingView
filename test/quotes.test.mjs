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

test('parseYahooSpark reads a real response and keeps the Yahoo form', () => {
  const quotes = parseYahooSpark(fixture('yahoo-spark'));
  assert.ok(quotes.get('AAPL').price > 0);
  assert.equal(typeof quotes.get('AAPL').changePercent, 'number');
  assert.ok(quotes.get('BRK-B').price > 0);
});

test('parseYahooSpark reads a real response for European stocks', () => {
  const quotes = parseYahooSpark(fixture('yahoo-spark-europe'));
  for (const ticker of ['IFX.DE', 'SIVE.ST', 'IQE.L', 'VOLV-B.ST', 'BT-A.L']) {
    assert.ok(quotes.get(ticker).price > 0, ticker);
    assert.equal(typeof quotes.get(ticker).changePercent, 'number', ticker);
  }
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

test('fetchQuotes asks Yahoo for BRK-B and returns it as NYSE:BRK.B', async () => {
  let asked;
  globalThis.fetch = async (url) => {
    asked = new URL(url).searchParams.get('symbols');
    return jsonResponse(fixture('yahoo-spark'));
  };
  const { quotes } = await fetchQuotes(['NYSE:BRK.B'], {});
  assert.equal(asked, 'BRK-B');
  assert.ok(quotes.get('NYSE:BRK.B').price > 0);
});

test('fetchQuotes gets European quotes from Yahoo with the saved Yahoo tickers', async () => {
  let asked;
  globalThis.fetch = async (url) => {
    asked = new URL(url).searchParams.get('symbols').split(',');
    return jsonResponse(fixture('yahoo-spark-europe'));
  };
  const yahoo = new Map([
    ['XETR:IFX', 'IFX.DE'],
    ['OMXSTO:VOLV_B', 'VOLV-B.ST'],
    ['LSE:BT.A', 'BT-A.L'],
  ]);
  // Alpaca has no European stocks, so a key for it changes nothing here.
  const keys = { alpacaId: 'id', alpacaSecret: 'secret' };
  const { quotes, status } = await fetchQuotes([...yahoo.keys()], keys, yahoo);
  assert.deepEqual(asked, ['IFX.DE', 'VOLV-B.ST', 'BT-A.L']);
  assert.deepEqual([...quotes.keys()], ['XETR:IFX', 'OMXSTO:VOLV_B', 'LSE:BT.A']);
  assert.deepEqual(status, [{ market: 'eu', source: 'Yahoo', errors: [] }]);
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

test('fetchQuotes asks no source for symbols without a market or a European symbol without its Yahoo ticker', async () => {
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(url);
    return jsonResponse({});
  };
  const { quotes, status } = await fetchQuotes(['BYBIT:SUIUSDT', 'CME:SUI1!', 'XETR:IFX'], {});
  assert.deepEqual(asked, []);
  assert.equal(quotes.size, 0);
  assert.deepEqual(status, []);
});

test('fetchQuotes gets Binance perpetual contracts one at a time from the futures API', async () => {
  const asked = [];
  globalThis.fetch = async (url) => {
    const { hostname, pathname, searchParams } = new URL(url);
    asked.push(`${hostname}${pathname}?${searchParams}`);
    const symbol = searchParams.get('symbol');
    if (symbol === 'GONEUSDT') return jsonResponse({ code: -1121, msg: 'Invalid symbol.' }, 400);
    return jsonResponse({ symbol, lastPrice: '2', priceChange: '0.1', priceChangePercent: '5.26' });
  };
  const { quotes, status } = await fetchQuotes(['BINANCE:SUIUSDT.P', 'BINANCE:GONEUSDT.P'], {});
  assert.deepEqual(asked.sort(), [
    'fapi.binance.com/fapi/v1/ticker/24hr?symbol=GONEUSDT',
    'fapi.binance.com/fapi/v1/ticker/24hr?symbol=SUIUSDT',
  ]);
  assert.deepEqual([...quotes], [['BINANCE:SUIUSDT.P', { price: 2, change: 0.1, changePercent: 5.26 }]]);
  assert.deepEqual(status, [{ market: 'perp', source: 'Binance', errors: [] }]);
});

test('Binance perpetual contracts report the error if every request fails', async () => {
  globalThis.fetch = async () => jsonResponse({}, 451);
  const { quotes, status } = await fetchQuotes(['BINANCE:SUIUSDT.P'], {});
  assert.equal(quotes.size, 0);
  assert.deepEqual(status, [{ market: 'perp', source: null, errors: ['Binance: HTTP 451'] }]);
});

test('resolveSymbol finds a Binance perpetual contract, and null for an unknown one', async () => {
  globalThis.fetch = async (url) => {
    const symbol = new URL(url).searchParams.get('symbol');
    assert.equal(new URL(url).hostname, 'fapi.binance.com');
    if (symbol === 'SUIUSDT') return jsonResponse({ symbol, price: '0.86' });
    return jsonResponse({ code: -1121 }, 400);
  };
  assert.deepEqual(await resolveSymbol('BINANCE:SUIUSDT.P'), { id: 'BINANCE:SUIUSDT.P', name: '' });
  await assert.rejects(resolveSymbol('BINANCE:GONEUSDT.P'), /找不到 GONEUSDT\.P/);
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

const usMeta = (exchangeName, shortName) =>
  jsonResponse({ chart: { result: [{ meta: { exchangeName, shortName, regularMarketPrice: 10 } }] } });

test('resolveSymbol maps the Yahoo exchange to the TradingView exchange', async () => {
  globalThis.fetch = async () => usMeta('PCX', 'SPDR');
  assert.deepEqual(await resolveSymbol('SPY'), { id: 'AMEX:SPY', name: 'SPDR' });
});

test('resolveSymbol tries the US market if Binance has no such pair', async () => {
  globalThis.fetch = async (url) => {
    if (new URL(url).hostname === 'data-api.binance.vision') return jsonResponse({}, 400);
    return usMeta('NYQ', 'X');
  };
  assert.deepEqual(await resolveSymbol('ABCBTC'), { id: 'NYSE:ABCBTC', name: 'X' });
});

test('resolveSymbol skips an old US ticker with no price and finds the European stock', async () => {
  const asked = [];
  globalThis.fetch = async (url) => {
    const { pathname } = new URL(url);
    asked.push(pathname);
    return jsonResponse(fixture(pathname.includes('/search') ? 'yahoo-search-iqe' : 'yahoo-chart-ghost'));
  };
  assert.deepEqual(await resolveSymbol('iqe'), { id: 'LSE:IQE', name: 'IQE plc', yahoo: 'IQE.L' });
  assert.deepEqual(asked, ['/v8/finance/chart/IQE', '/v1/finance/search']);
});

test('resolveSymbol keeps a US stock first and does not search Europe', async () => {
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(new URL(url).pathname);
    return usMeta('NYQ', 'SAP SE');
  };
  assert.deepEqual(await resolveSymbol('SAP'), { id: 'NYSE:SAP', name: 'SAP SE' });
  assert.deepEqual(asked, ['/v8/finance/chart/SAP']);
});

test('resolveSymbol takes the first European match of the search', async () => {
  globalThis.fetch = async (url) => {
    if (new URL(url).pathname.includes('/chart/')) return jsonResponse({}, 404);
    return jsonResponse({
      quotes: [
        { symbol: 'IFXY', exchange: 'OID', quoteType: 'EQUITY', longname: 'OTC' },
        { symbol: 'IFX.F', exchange: 'FRA', quoteType: 'EQUITY', longname: 'Frankfurt' },
        { symbol: 'IFXA.HA', exchange: 'HAN', quoteType: 'EQUITY', longname: 'Other ticker' },
        { symbol: 'IFXA.L', exchange: 'LSE', quoteType: 'EQUITY', longname: 'Other ticker' },
        { symbol: 'IFX.PA', exchange: 'PAR', quoteType: 'MUTUALFUND', longname: 'Fund' },
        { symbol: 'IFX.DE', exchange: 'GER', quoteType: 'EQUITY', longname: 'Infineon Technologies AG' },
        { symbol: 'IFX.L', exchange: 'LSE', quoteType: 'EQUITY', longname: 'Later match' },
      ],
    });
  };
  assert.deepEqual(await resolveSymbol('IFX'), {
    id: 'XETR:IFX',
    name: 'Infineon Technologies AG',
    yahoo: 'IFX.DE',
  });
});

test('resolveSymbol reads the Yahoo form directly', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(new URL(url).pathname, '/v8/finance/chart/IFX.DE');
    return jsonResponse(fixture('yahoo-chart-europe'));
  };
  assert.deepEqual(await resolveSymbol('ifx.de'), {
    id: 'XETR:IFX',
    name: 'Infineon Technologies AG',
    yahoo: 'IFX.DE',
  });
});

test('resolveSymbol tries each Euronext exchange for EURONEXT:ASML', async () => {
  const asked = [];
  globalThis.fetch = async (url) => {
    const ticker = new URL(url).pathname.split('/').pop();
    asked.push(ticker);
    if (ticker !== 'ASML.AS') return jsonResponse({}, 404);
    return jsonResponse({ chart: { result: [{ meta: { longName: 'ASML Holding N.V.', regularMarketPrice: 1283.6 } }] } });
  };
  assert.deepEqual(await resolveSymbol('EURONEXT:ASML'), {
    id: 'EURONEXT:ASML',
    name: 'ASML Holding N.V.',
    yahoo: 'ASML.AS',
  });
  assert.deepEqual(asked, ['ASML.PA', 'ASML.AS']);
});

test('resolveSymbol keeps the exchange that the user typed', async () => {
  globalThis.fetch = async (url) => {
    if (new URL(url).pathname.includes('/chart/')) return jsonResponse({}, 404);
    return jsonResponse({ quotes: [{ symbol: 'IFX.L', exchange: 'LSE', quoteType: 'EQUITY', longname: 'Other' }] });
  };
  await assert.rejects(resolveSymbol('XETR:IFX'), /找不到 IFX/);
  await assert.rejects(resolveSymbol('IFX.DE'), /找不到 IFX.DE/);
});

test('resolveSymbol explains each failure', async () => {
  // Tested: Yahoo search answers an unknown ticker with an empty list.
  globalThis.fetch = async (url) =>
    new URL(url).pathname.includes('/search') ? jsonResponse({ quotes: [] }) : jsonResponse({}, 404);
  await assert.rejects(resolveSymbol('ZZZZZ'), /找不到 ZZZZZ/);
  await assert.rejects(resolveSymbol('台積電'), /不支援/);
  await assert.rejects(resolveSymbol('XETR:ZZZQQ'), /找不到 ZZZQQ/);

  globalThis.fetch = async () => jsonResponse({}, 429);
  await assert.rejects(resolveSymbol('AAPL'), /查詢 AAPL 失敗（HTTP 429）/);
});
