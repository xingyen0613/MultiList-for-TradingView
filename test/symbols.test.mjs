import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartUrl, europeIdOf, isChartUrl, marketOf, parseInput, tickerOf } from '../extension/lib/symbols.js';

test('parseInput routes each input form to the right markets', () => {
  assert.deepEqual(parseInput('2330'), { ticker: '2330', markets: ['tw'] });
  assert.deepEqual(parseInput('00631l'), { ticker: '00631L', markets: ['tw'] });
  assert.deepEqual(parseInput(' aapl '), { ticker: 'AAPL', markets: ['us', 'eu'] });
  assert.deepEqual(parseInput('BRK-B'), { ticker: 'BRK.B', markets: ['us', 'eu'] });
  assert.deepEqual(parseInput('BRK.B'), { ticker: 'BRK.B', markets: ['us', 'eu'] });
  assert.deepEqual(parseInput('btcusdt'), { ticker: 'BTCUSDT', markets: ['crypto', 'us'] });
  assert.deepEqual(parseInput('TWSE:2330'), { ticker: '2330', markets: ['tw'] });
  assert.deepEqual(parseInput('NYSE:TSM'), { ticker: 'TSM', markets: ['us'] });
  assert.deepEqual(parseInput('BINANCE:ETHUSDT'), { ticker: 'ETHUSDT', markets: ['crypto'] });
});

test('parseInput reads the European forms', () => {
  assert.deepEqual(parseInput('ifx'), { ticker: 'IFX', markets: ['us', 'eu'] });
  assert.deepEqual(parseInput('IFX.DE'), { ticker: 'IFX.DE', markets: ['eu'], yahoo: ['IFX.DE'] });
  assert.deepEqual(parseInput('volv-b.st'), { ticker: 'VOLV-B.ST', markets: ['eu'], yahoo: ['VOLV-B.ST'] });
  assert.deepEqual(parseInput('1COV.DE'), { ticker: '1COV.DE', markets: ['eu'], yahoo: ['1COV.DE'] });
  assert.deepEqual(parseInput('XETR:IFX'), { ticker: 'IFX', markets: ['eu'], yahoo: ['IFX.DE'] });
  assert.deepEqual(parseInput('OMXSTO:VOLV_B'), { ticker: 'VOLV_B', markets: ['eu'], yahoo: ['VOLV-B.ST'] });
  assert.deepEqual(parseInput('LSE:BT.A'), { ticker: 'BT.A', markets: ['eu'], yahoo: ['BT-A.L'] });
  assert.deepEqual(parseInput('EURONEXT:MC'), {
    ticker: 'MC',
    markets: ['eu'],
    yahoo: ['MC.PA', 'MC.AS', 'MC.BR', 'MC.LS', 'MC.IR'],
  });
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
  assert.equal(marketOf('XETR:IFX'), 'eu');
  assert.equal(marketOf('EURONEXT:ASML'), 'eu');
  assert.equal(marketOf('OMXSTO:SIVE'), 'eu');
  assert.equal(tickerOf('NYSE:BRK.B'), 'BRK.B');
});

test('marketOf gives Binance perpetual contracts their own market, and null for exchanges with no quotes', () => {
  assert.equal(marketOf('BINANCE:SUIUSDT.P'), 'perp');
  assert.equal(marketOf('CBOE:VIX'), 'us');
  for (const id of ['BYBIT:SUIUSDT', 'COINBASE:SUIUSD', 'CME:SUI1!', 'TVC:DXY', 'FX:EURUSD', 'HKEX:700']) {
    assert.equal(marketOf(id), null, id);
  }
  assert.deepEqual(parseInput('binance:suiusdt.p'), { ticker: 'SUIUSDT.P', markets: ['perp'] });
  assert.equal(parseInput('BYBIT:SUIUSDT'), null);
});

test('europeIdOf turns a Yahoo ticker into the TradingView form', () => {
  assert.equal(europeIdOf('IFX.DE'), 'XETR:IFX');
  assert.equal(europeIdOf('IQE.L'), 'LSE:IQE');
  assert.equal(europeIdOf('SIVE.ST'), 'OMXSTO:SIVE');
  assert.equal(europeIdOf('ASML.AS'), 'EURONEXT:ASML');
  assert.equal(europeIdOf('RYA.IR'), 'EURONEXT:RYA');
  // Share classes: tested on TradingView, OMXSTO:VOLV.B and LSE:BT_A have no data.
  assert.equal(europeIdOf('VOLV-B.ST'), 'OMXSTO:VOLV_B');
  assert.equal(europeIdOf('NOVO-B.CO'), 'OMXCOP:NOVO_B');
  assert.equal(europeIdOf('BT-A.L'), 'LSE:BT.A');
  assert.equal(europeIdOf('IFX.F'), null);
  assert.equal(europeIdOf('IFXY'), null);
  assert.equal(europeIdOf('.DE'), null);
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
