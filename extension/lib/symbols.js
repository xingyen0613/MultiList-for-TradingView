// A symbol id is the TradingView form, for example TWSE:2330 or NASDAQ:AAPL.

const TAIWAN_EXCHANGES = new Set(['TWSE', 'TPEX']);
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'CBOE']);
const CRYPTO_PAIR = /^[A-Z0-9]{2,}(USDT|USDC|FDUSD|BTC|ETH|BNB)$/;
const DEFAULT_CHART_URL = 'https://www.tradingview.com/chart/';

// Indices by Yahoo ticker, with a name and the TradingView ids. One index has several ids, for example
// TVC:VIX and CBOE:VIX, so the list has the ids that the TradingView search shows first. Tested on
// 2026-11-20: the TradingView search has each id, and Yahoo has a price for each ticker. The names are
// here because Yahoo names are cut off or wrong, for example "Northern Trust iBoxx 5-Year Tar" for ^MOVE.
// TWSE:IX0001 (TAIEX) and TPEX:IX0043 (OTC) are not here, because TWSE MIS has them, like Taiwan stocks.
// Yahoo has no OTC index.
const INDICES = {
  // Volatility
  '^VIX': { name: 'CBOE Volatility Index', ids: ['TVC:VIX', 'CBOE:VIX'] },
  '^VIX9D': { name: 'CBOE S&P 500 9-Day Volatility Index', ids: ['CBOE:VIX9D'] },
  '^VIX3M': { name: 'CBOE S&P 500 3-Month Volatility Index', ids: ['CBOE:VIX3M'] },
  '^VVIX': { name: 'CBOE VIX Volatility Index', ids: ['CBOE:VVIX'] },
  '^VXN': { name: 'CBOE NASDAQ 100 Volatility Index', ids: ['CBOE:VXN'] },
  '^OVX': { name: 'CBOE Crude Oil Volatility Index', ids: ['CBOE:OVX'] },
  '^GVZ': { name: 'CBOE Gold Volatility Index', ids: ['CBOE:GVZ'] },
  '^MOVE': { name: 'ICE BofAML MOVE Index', ids: ['TVC:MOVE', 'ICE:MOVE'] },
  // United States
  '^GSPC': { name: 'S&P 500', ids: ['SP:SPX', 'TVC:SPX'] },
  '^NDX': { name: 'NASDAQ-100', ids: ['NASDAQ:NDX'] },
  '^IXIC': { name: 'NASDAQ Composite', ids: ['NASDAQ:IXIC', 'TVC:IXIC'] },
  '^DJI': { name: 'Dow Jones Industrial Average', ids: ['DJ:DJI', 'TVC:DJI'] },
  '^RUT': { name: 'Russell 2000', ids: ['TVC:RUT', 'CBOEFTSE:RUT', 'FTSE:RUT'] },
  '^SOX': { name: 'PHLX Semiconductor', ids: ['NASDAQ:SOX', 'TVC:SOX'] },
  'DX-Y.NYB': { name: 'U.S. Dollar Index', ids: ['TVC:DXY', 'ICEUS:DXY', 'INDEX:DXY'] },
  '^FVX': { name: 'US 5-Year Treasury Yield', ids: ['TVC:US05Y'] },
  '^TNX': { name: 'US 10-Year Treasury Yield', ids: ['TVC:US10Y'] },
  '^TYX': { name: 'US 30-Year Treasury Yield', ids: ['TVC:US30Y'] },
  // Asia
  '^TWII': { name: 'TAIEX', ids: ['INDEX:TAIEX'] },
  '^N225': { name: 'Nikkei 225', ids: ['TVC:NI225', 'INDEX:NKY'] },
  '^KS11': { name: 'KOSPI Composite Index', ids: ['KRX:KOSPI', 'TVC:KOSPI'] },
  '^HSI': { name: 'Hang Seng Index', ids: ['HSI:HSI', 'TVC:HSI', 'INDEX:HSI'] },
  '000001.SS': { name: 'SSE Composite Index', ids: ['SSE:000001', 'INDEX:000001'] },
  '^NSEI': { name: 'NIFTY 50', ids: ['NSE:NIFTY'] },
  // Europe
  '^GDAXI': { name: 'DAX', ids: ['XETR:DAX', 'TVC:DEU40'] },
  '^FTSE': { name: 'FTSE 100', ids: ['TVC:UKX', 'FTSE:UKX'] },
  '^STOXX50E': { name: 'EURO STOXX 50', ids: ['TVC:SX5E', 'STOXX:SX5E'] },
  '^FCHI': { name: 'CAC 40', ids: ['TVC:CAC40', 'EURONEXT:PX1'] },
};
const INDEX_BY_ID = new Map(
  Object.entries(INDICES).flatMap(([yahoo, { name, ids }]) => ids.map((id) => [id, { yahoo, name }])),
);

// { yahoo, name } of an index, or undefined if the symbol is not in the list.
export const indexOf = (symbolId) => INDEX_BY_ID.get(symbolId);

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

// Forex pairs are two of these currencies, for example FX:USDTWD or OANDA:EURUSD. Many brokers on TradingView
// have the same pair, and all get the Yahoo spot rate, for example USDTWD=X. Tested on 2026-11-23: Yahoo has
// USDxxx=X for each currency, and also crosses such as EURTWD=X. Metals such as XAUUSD and crypto pairs such as
// BTCUSD are not forex here.
const CURRENCIES = new Set(
  ('USD EUR JPY GBP AUD NZD CAD CHF CNY CNH HKD TWD KRW SGD INR THB MYR IDR PHP VND ' +
    'SEK NOK DKK PLN CZK HUF TRY ZAR MXN BRL RUB ILS SAR AED').split(' '),
);
function isForexPair(ticker) {
  const [, base, quote] = ticker.match(/^([A-Z]{3})([A-Z]{3})$/) ?? [];
  return base !== quote && CURRENCIES.has(base) && CURRENCIES.has(quote);
}
export const forexYahooTicker = (ticker) => `${ticker}=X`;

// FX futures by the root of the continuous contract, for example CME:6E1!, with the TradingView names.
// Yahoo has the CME front month as 6E=F. SGX has an API with all months of TWD. Tested on 2026-11-23:
// the TradingView search has each id, and the source has a price for each.
const CME_FUTURES = {
  '6E': 'Euro FX Futures',
  '6J': 'Japanese Yen Futures',
  '6B': 'British Pound Futures',
  '6A': 'Australian Dollar Futures',
  '6C': 'Canadian Dollar Futures',
  '6S': 'Swiss Franc Futures',
  '6N': 'New Zealand Dollar Futures',
};
const SGX_FUTURES = { TWD: 'TWD/USD (Full-Sized) FX Futures' };
const FUTURES = { CME: CME_FUTURES, SGX: SGX_FUTURES };

// 6E1! gives 6E. Returns null for a dated contract such as 6EZ2026, or for the second month 6E2!.
export const futuresRoot = (ticker) => ticker.match(/^([A-Z0-9]+)1!$/)?.[1] ?? null;
export const cmeYahooTicker = (ticker) => `${futuresRoot(ticker)}=F`;

// The name of a listed futures contract, or undefined.
export function futuresName(symbolId) {
  const [exchange, ticker = ''] = symbolId.split(':');
  return FUTURES[exchange]?.[futuresRoot(ticker)];
}

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
// An index comes first, because XETR:DAX and KRX:KOSPI are on stock exchanges.
export function marketOf(symbolId) {
  if (INDEX_BY_ID.has(symbolId)) return 'index';
  const [exchange, ticker = ''] = symbolId.split(':');
  const perp = ticker.endsWith('.P');
  if (TAIWAN_EXCHANGES.has(exchange)) return 'tw';
  if (US_EXCHANGES.has(exchange)) return 'us';
  if (EUROPE_EXCHANGES.has(exchange)) return 'eu';
  if (exchange === 'KRX') return 'kr';
  if (exchange === 'TSE') return 'jp';
  if (exchange === 'BINANCE') return perp ? 'perp' : 'crypto';
  if (futuresName(symbolId)) return exchange.toLowerCase();
  if (!CRYPTO_EXCHANGES[exchange] && isForexPair(ticker)) return 'fx';
  return exchangeMarketOf(exchange, ticker, perp);
}

// Forex and FX futures move in the third or fourth decimal, for example EURUSD 1.1005 and SGX:TWD1! 30.425.
const PRECISE_MARKETS = new Set(['fx', 'cme', 'sgx']);
export const priceDigits = (symbolId) => (PRECISE_MARKETS.has(marketOf(symbolId)) ? 4 : 2);

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

// Tokyo stocks are TSE:7203 on TradingView and 7203.T on Yahoo. A code has 4 characters. Newer codes
// can have a letter in the second or fourth place, for example 130A. Tested on 2026-11-22 with 7203,
// 130A and the ETF 1306: the TradingView search has TSE:7203 and TSE:130A, and Yahoo has a price for each.
const JAPAN_YAHOO_FORM = /^(\d[0-9A-Z]\d[0-9A-Z])\.T$/;
export const japanYahooTicker = (ticker) => `${ticker}.T`;

export function tickerOf(symbolId) {
  return symbolId.split(':')[1];
}

// Yahoo writes share classes as BRK-B. TradingView and Alpaca write BRK.B.
export const toYahooTicker = (ticker) => ticker.replaceAll('.', '-');
const fromYahooTicker = (ticker) => ticker.replaceAll('-', '.');

// Returns the ticker and the markets to look it up in, or null if unsupported.
// A European symbol also gets the Yahoo tickers to try. Without them, the lookup searches all of Europe.
// An index keeps the full id as its ticker, because VIX alone does not tell TVC:VIX from CBOE:VIX.
// So do forex and futures, because USDTWD is on many exchanges.
const FULL_ID_MARKETS = new Set(['index', 'fx', 'cme', 'sgx']);

export function parseInput(raw) {
  const text = raw.trim().toUpperCase();

  const fullForm = text.match(/^([A-Z_]+):([A-Z0-9._!-]+)$/);
  if (fullForm) {
    const [, exchange, ticker] = fullForm;
    if (FULL_ID_MARKETS.has(marketOf(text))) return { ticker: text, markets: [marketOf(text)] };
    if (EUROPE_EXCHANGES.has(exchange)) return { ticker, markets: ['eu'], yahoo: europeTickersOf(exchange, ticker) };
    const market = marketOf(text);
    return market ? { ticker, markets: [market] } : null;
  }

  const japanForm = text.match(JAPAN_YAHOO_FORM);
  if (japanForm) return { ticker: japanForm[1], markets: ['jp'] };
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
