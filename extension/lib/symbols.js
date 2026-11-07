// A symbol id is the TradingView form, for example TWSE:2330 or NASDAQ:AAPL.

const TAIWAN_EXCHANGES = new Set(['TWSE', 'TPEX']);
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'CBOE']);
const CRYPTO_PAIR = /^[A-Z0-9]{2,}(USDT|USDC|FDUSD|BTC|ETH|BNB)$/;
const DEFAULT_CHART_URL = 'https://www.tradingview.com/chart/';

// The Yahoo suffix of each European exchange, and its TradingView exchange.
// Yahoo writes a share class as VOLV-B.ST or BT-A.L. TradingView writes VOLV_B on the Nordic exchanges
// and BT.A on the others. Tested on 2026-11-07 with one stock on each exchange.
const EUROPE = {
  DE: { exchange: 'XETR', classMark: '.' },
  L: { exchange: 'LSE', classMark: '.' },
  PA: { exchange: 'EURONEXT', classMark: '.' },
  AS: { exchange: 'EURONEXT', classMark: '.' },
  BR: { exchange: 'EURONEXT', classMark: '.' },
  LS: { exchange: 'EURONEXT', classMark: '.' },
  IR: { exchange: 'EURONEXT', classMark: '.' },
  MI: { exchange: 'MIL', classMark: '.' },
  MC: { exchange: 'BME', classMark: '.' },
  SW: { exchange: 'SIX', classMark: '.' },
  ST: { exchange: 'OMXSTO', classMark: '_' },
  CO: { exchange: 'OMXCOP', classMark: '_' },
  HE: { exchange: 'OMXHEX', classMark: '_' },
  OL: { exchange: 'OSL', classMark: '.' },
  VI: { exchange: 'VIE', classMark: '.' },
  WA: { exchange: 'GPW', classMark: '.' },
};
const EUROPE_EXCHANGES = new Set(Object.values(EUROPE).map((item) => item.exchange));

export function marketOf(symbolId) {
  const exchange = symbolId.split(':')[0];
  if (TAIWAN_EXCHANGES.has(exchange)) return 'tw';
  if (EUROPE_EXCHANGES.has(exchange)) return 'eu';
  return exchange === 'BINANCE' ? 'crypto' : 'us';
}

// IFX.DE becomes XETR:IFX. Returns null if the exchange is not supported.
export function europeIdOf(yahooTicker) {
  const dot = yahooTicker.lastIndexOf('.');
  const place = EUROPE[yahooTicker.slice(dot + 1)];
  if (dot <= 0 || !place) return null;
  return `${place.exchange}:${yahooTicker.slice(0, dot).replaceAll('-', place.classMark)}`;
}

// XETR:IFX gives IFX.DE. EURONEXT is on five exchanges, so EURONEXT:MC gives five tickers to try.
function europeTickersOf(exchange, ticker) {
  const base = ticker.replaceAll(/[._]/g, '-');
  return Object.entries(EUROPE)
    .filter(([, place]) => place.exchange === exchange)
    .map(([suffix]) => `${base}.${suffix}`);
}

export function tickerOf(symbolId) {
  return symbolId.split(':')[1];
}

// Yahoo writes share classes as BRK-B. TradingView and Alpaca write BRK.B.
export const toYahooTicker = (ticker) => ticker.replaceAll('.', '-');
const fromYahooTicker = (ticker) => ticker.replaceAll('-', '.');

function marketOfExchange(exchange) {
  if (TAIWAN_EXCHANGES.has(exchange)) return 'tw';
  if (US_EXCHANGES.has(exchange)) return 'us';
  return exchange === 'BINANCE' ? 'crypto' : null;
}

// Returns the ticker and the markets to look it up in, or null if unsupported.
// A European symbol also gets the Yahoo tickers to try. Without them, the lookup searches all of Europe.
export function parseInput(raw) {
  const text = raw.trim().toUpperCase();

  const fullForm = text.match(/^([A-Z]+):([A-Z0-9._-]+)$/);
  if (fullForm) {
    const [, exchange, ticker] = fullForm;
    if (EUROPE_EXCHANGES.has(exchange)) return { ticker, markets: ['eu'], yahoo: europeTickersOf(exchange, ticker) };
    const market = marketOfExchange(exchange);
    return market ? { ticker, markets: [market] } : null;
  }

  const yahooForm = text.match(/^[A-Z0-9][A-Z0-9-]*\.([A-Z]{1,2})$/);
  if (yahooForm && EUROPE[yahooForm[1]]) return { ticker: text, markets: ['eu'], yahoo: [text] };
  if (/^\d{4,6}[A-Z]?$/.test(text)) return { ticker: text, markets: ['tw'] };
  if (CRYPTO_PAIR.test(text)) return { ticker: text, markets: ['crypto', 'us'] };
  if (/^[A-Z][A-Z.-]{0,6}$/.test(text)) return { ticker: fromYahooTicker(text), markets: ['us', 'eu'] };
  return null;
}

export function isChartUrl(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const isTradingView = hostname === 'tradingview.com' || hostname.endsWith('.tradingview.com');
    return isTradingView && pathname.startsWith('/chart');
  } catch {
    return false;
  }
}

// Keeps the path of an open chart, because the path holds the saved layout.
export function chartUrl(symbolId, currentUrl) {
  const url = new URL(isChartUrl(currentUrl) ? currentUrl : DEFAULT_CHART_URL);
  url.searchParams.set('symbol', symbolId);
  return url.toString();
}
