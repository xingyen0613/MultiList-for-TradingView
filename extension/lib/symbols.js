// A symbol id is the TradingView form, for example TWSE:2330 or NASDAQ:AAPL.

const TAIWAN_EXCHANGES = new Set(['TWSE', 'TPEX']);
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'CBOE']);
const CRYPTO_PAIR = /^[A-Z0-9]{2,}(USDT|USDC|FDUSD|BTC|ETH|BNB)$/;
const DEFAULT_CHART_URL = 'https://www.tradingview.com/chart/';

export function marketOf(symbolId) {
  const exchange = symbolId.split(':')[0];
  if (TAIWAN_EXCHANGES.has(exchange)) return 'tw';
  return exchange === 'BINANCE' ? 'crypto' : 'us';
}

export function tickerOf(symbolId) {
  return symbolId.split(':')[1];
}

// Yahoo writes share classes as BRK-B. TradingView and Alpaca write BRK.B.
export const toYahooTicker = (ticker) => ticker.replaceAll('.', '-');
export const fromYahooTicker = (ticker) => ticker.replaceAll('-', '.');

function marketOfExchange(exchange) {
  if (TAIWAN_EXCHANGES.has(exchange)) return 'tw';
  if (US_EXCHANGES.has(exchange)) return 'us';
  return exchange === 'BINANCE' ? 'crypto' : null;
}

// Returns the ticker and the markets to look it up in, or null if unsupported.
export function parseInput(raw) {
  const text = raw.trim().toUpperCase();

  const fullForm = text.match(/^([A-Z]+):([A-Z0-9.-]+)$/);
  if (fullForm) {
    const market = marketOfExchange(fullForm[1]);
    return market ? { ticker: fullForm[2], markets: [market] } : null;
  }

  if (/^\d{4,6}[A-Z]?$/.test(text)) return { ticker: text, markets: ['tw'] };
  if (CRYPTO_PAIR.test(text)) return { ticker: text, markets: ['crypto', 'us'] };
  if (/^[A-Z][A-Z.-]{0,6}$/.test(text)) return { ticker: fromYahooTicker(text), markets: ['us'] };
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
