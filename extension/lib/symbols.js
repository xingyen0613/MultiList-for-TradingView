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

// Quote currencies of crypto pairs, longest first where one ends another, so BTCUSDT is not BTCU and SDT.
const QUOTE_CURRENCIES = ['FDUSD', 'USDT', 'USDC', 'USDE', 'USD1', 'USD', 'DAI', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'BRL'];

// MNTUSDT gives ['MNT', 'USDT']. Returns null for an unknown quote currency.
export function splitPair(ticker) {
  const quote = QUOTE_CURRENCIES.find((item) => ticker.endsWith(item) && ticker.length > item.length);
  return quote ? [ticker.slice(0, -quote.length), quote] : null;
}

// Crypto exchanges other than Binance, in the order that a typed pair such as MNTUSDT is looked up.
// perp is true for all perpetual contracts, 'USDT' for only the USDT ones, and false for none.
// The TradingView search shows no KuCoin perpetual contracts. Tested on 2026-11-12.
const CRYPTO_EXCHANGES = {
  BYBIT: { name: 'Bybit', perp: true },
  OKX: { name: 'OKX', perp: true },
  BITGET: { name: 'Bitget', perp: 'USDT' },
  GATE: { name: 'Gate', perp: 'USDT' },
  KUCOIN: { name: 'KuCoin', perp: false },
  MEXC: { name: 'MEXC', perp: true },
};

// Each of those exchanges has a spot market, for example bybit, and can have a perpetual market, for example bybit-perp.
export const EXCHANGE_MARKETS = Object.entries(CRYPTO_EXCHANGES).flatMap(([exchange, { name, perp }]) => {
  const spot = { market: exchange.toLowerCase(), exchange, name, perp: false, quote: null };
  if (!perp) return [spot];
  return [spot, { ...spot, market: `${spot.market}-perp`, perp: true, quote: perp === true ? null : perp }];
});
const SPOT_MARKETS = EXCHANGE_MARKETS.filter((item) => !item.perp).map((item) => item.market);

// The market of a pair on one of those exchanges, or null.
// A ticker that is not a pair, for example the dated contract BTCUSDH2026, has no market.
function exchangeMarketOf(exchange, ticker, perp) {
  const pair = splitPair(perp ? ticker.slice(0, -2) : ticker);
  const item = EXCHANGE_MARKETS.find((each) => each.exchange === exchange && each.perp === perp);
  if (!pair || !item || (item.quote && item.quote !== pair[1])) return null;
  return item.market;
}

// Returns the market that has a quote source, or null. A symbol of another exchange,
// for example COINBASE:SUIUSD, can be in a group and open the chart, but has no quote.
// TradingView writes every exchange's pairs the same way: MNTUSDT for spot and MNTUSDT.P for a perpetual contract.
export function marketOf(symbolId) {
  const [exchange, ticker = ''] = symbolId.split(':');
  const perp = ticker.endsWith('.P');
  if (TAIWAN_EXCHANGES.has(exchange)) return 'tw';
  if (US_EXCHANGES.has(exchange)) return 'us';
  if (EUROPE_EXCHANGES.has(exchange)) return 'eu';
  if (exchange === 'KRX') return 'kr';
  if (exchange === 'BINANCE') return perp ? 'perp' : 'crypto';
  return exchangeMarketOf(exchange, ticker, perp);
}

export const isCryptoMarket = (market) =>
  market === 'crypto' || market === 'perp' || EXCHANGE_MARKETS.some((item) => item.market === market);

// A symbol shows its exchange in the list if it has no quote, or is on a crypto exchange other than Binance,
// because BYBIT:SUIUSDT and BINANCE:SUIUSDT look the same.
export function showsExchange(symbolId) {
  const market = marketOf(symbolId);
  return market === null || (isCryptoMarket(market) && !symbolId.startsWith('BINANCE:'));
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

// Returns the ticker and the markets to look it up in, or null if unsupported.
// A European symbol also gets the Yahoo tickers to try. Without them, the lookup searches all of Europe.
export function parseInput(raw) {
  const text = raw.trim().toUpperCase();

  const fullForm = text.match(/^([A-Z]+):([A-Z0-9._-]+)$/);
  if (fullForm) {
    const [, exchange, ticker] = fullForm;
    if (EUROPE_EXCHANGES.has(exchange)) return { ticker, markets: ['eu'], yahoo: europeTickersOf(exchange, ticker) };
    const market = marketOf(text);
    return market ? { ticker, markets: [market] } : null;
  }

  const yahooForm = text.match(/^[A-Z0-9][A-Z0-9-]*\.([A-Z]{1,2})$/);
  if (yahooForm && EUROPE[yahooForm[1]]) return { ticker: text, markets: ['eu'], yahoo: [text] };
  if (/^\d{4,6}[A-Z]?$/.test(text)) return { ticker: text, markets: ['tw'] };
  if (CRYPTO_PAIR.test(text)) return { ticker: text, markets: ['crypto', ...SPOT_MARKETS, 'us'] };
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
