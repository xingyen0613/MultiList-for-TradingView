import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartUrl, isChartUrl, marketOf, parseInput, tickerOf } from '../extension/lib/symbols.js';

test('parseInput routes each input form to the right markets', () => {
  assert.deepEqual(parseInput('2330'), { ticker: '2330', markets: ['tw'] });
  assert.deepEqual(parseInput('00631l'), { ticker: '00631L', markets: ['tw'] });
  assert.deepEqual(parseInput(' aapl '), { ticker: 'AAPL', markets: ['us'] });
  assert.deepEqual(parseInput('BRK-B'), { ticker: 'BRK.B', markets: ['us'] });
  assert.deepEqual(parseInput('btcusdt'), { ticker: 'BTCUSDT', markets: ['crypto', 'us'] });
  assert.deepEqual(parseInput('TWSE:2330'), { ticker: '2330', markets: ['tw'] });
  assert.deepEqual(parseInput('NYSE:TSM'), { ticker: 'TSM', markets: ['us'] });
  assert.deepEqual(parseInput('BINANCE:ETHUSDT'), { ticker: 'ETHUSDT', markets: ['crypto'] });
});

test('parseInput rejects unsupported input', () => {
  assert.equal(parseInput('COINBASE:BTCUSD'), null);
  assert.equal(parseInput('台積電'), null);
  assert.equal(parseInput(''), null);
  assert.equal(parseInput('12'), null);
});

test('marketOf and tickerOf read a symbol id', () => {
  assert.equal(marketOf('TWSE:2330'), 'tw');
  assert.equal(marketOf('TPEX:6488'), 'tw');
  assert.equal(marketOf('NASDAQ:AAPL'), 'us');
  assert.equal(marketOf('BINANCE:BTCUSDT'), 'crypto');
  assert.equal(tickerOf('NYSE:BRK.B'), 'BRK.B');
});

test('isChartUrl accepts only TradingView chart pages', () => {
  assert.equal(isChartUrl('https://www.tradingview.com/chart/abc123/'), true);
  assert.equal(isChartUrl('https://tw.tradingview.com/chart/'), true);
  assert.equal(isChartUrl('https://www.tradingview.com/markets/'), false);
  assert.equal(isChartUrl('https://www.tradingview.com.evil.example/chart/'), false);
  assert.equal(isChartUrl(undefined), false);
});

test('chartUrl keeps the saved layout path and replaces the symbol', () => {
  assert.equal(chartUrl('TWSE:2330'), 'https://www.tradingview.com/chart/?symbol=TWSE%3A2330');
  assert.equal(
    chartUrl('NASDAQ:AAPL', 'https://tw.tradingview.com/chart/abc123/?symbol=TWSE%3A2330'),
    'https://tw.tradingview.com/chart/abc123/?symbol=NASDAQ%3AAAPL',
  );
  assert.equal(
    chartUrl('NASDAQ:AAPL', 'https://example.com/'),
    'https://www.tradingview.com/chart/?symbol=NASDAQ%3AAAPL',
  );
});
