import { t } from './i18n.js';
import { EXCHANGE_MARKETS, europeIdOf, marketOf, parseInput, splitPair, tickerOf, toYahooTicker } from './symbols.js';

const TIMEOUT_MS = 10_000;
const MIS_CHUNK = 100; // Tested: one request returns 100 symbols.
const YAHOO_CHUNK = 20; // Tested: 21 symbols returns HTTP 400.
const YAHOO = 'https://query1.finance.yahoo.com';
const ALPACA_CHUNK = 100; // The Alpaca docs do not state a limit.
const FUGLE_PER_CYCLE = 25; // Free plan: 60 calls per minute, and a cycle is 30 seconds.

// Yahoo exchange codes mapped to TradingView exchange names.
const YAHOO_EXCHANGES = {
  NMS: 'NASDAQ',
  NGM: 'NASDAQ',
  NCM: 'NASDAQ',
  NYQ: 'NYSE',
  ASE: 'AMEX',
  PCX: 'AMEX',
  BTS: 'CBOE',
};

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers,
    credentials: 'omit',
    // A redirect keeps custom headers, so a request with an API key must not follow one.
    redirect: Object.keys(headers).length > 0 ? 'error' : 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quoteFromPrevious(price, previous) {
  if (previous === null || previous === 0) return { price, change: null, changePercent: null };
  const change = price - previous;
  return { price, change, changePercent: (change / previous) * 100 };
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Parsers return a Map of bare ticker to { price, change, changePercent }.

export function parseMis(json) {
  const quotes = new Map();
  for (const row of json.msgArray ?? []) {
    if (!row.c) continue; // MIS returns an empty row for an unknown code.
    const previous = toNumber(row.y);
    // z is "-" when the snapshot has no trade. Then use the best bid.
    const price = toNumber(row.z) ?? toNumber(row.b?.split('_')[0]) ?? previous;
    if (price !== null) quotes.set(row.c, quoteFromPrevious(price, previous));
  }
  return quotes;
}

// The last close of the regular-session bars is the price: the live price during the session, and
// the official close after it. The change is from the close of the session before. fulldayPrice is
// not used, because for US stocks it also counts the pre-market, after-hours and overnight trades,
// which the second line shows. Tested on 2026-11-12: before the open, the bars are those of the day
// before, and the last close is the official close (AAPL 355.63, while fulldayPrice was 357.10).
// The keys stay in the Yahoo form, for example BRK-B and VOLV-B.ST.
export function parseYahooSpark(json) {
  const quotes = new Map();
  for (const [yahooTicker, row] of Object.entries(json)) {
    const price = toNumber((row.close ?? []).findLast((value) => toNumber(value) !== null));
    if (price === null) continue;
    quotes.set(yahooTicker, quoteFromPrevious(price, toNumber(row.previousClose)));
  }
  return quotes;
}

// TradingView writes KOSPI and KOSDAQ stocks both as KRX:005930. Yahoo writes 005930.KS for KOSPI
// and 005930.KQ for KOSDAQ, and also answers the wrong suffix with an old price.
// Tested on 2026-11-09 with 005930 (KOSPI) and 247540 (KOSDAQ).
const KOREA_SUFFIXES = ['KS', 'KQ'];
const koreaTickers = (ticker) => KOREA_SUFFIXES.map((suffix) => `${ticker}.${suffix}`);

// The wrong suffix has no bars, so only rows with bars are kept. The keys become bare tickers, for example 005930.
export function parseKoreaSpark(json) {
  const live = Object.fromEntries(Object.entries(json).filter(([, row]) => row.timestamp?.length > 0));
  const quotes = [...parseYahooSpark(live)];
  return new Map(quotes.map(([yahooTicker, quote]) => [yahooTicker.split('.')[0], quote]));
}

export function parseBinance(json) {
  const quotes = new Map();
  for (const row of json) {
    quotes.set(row.symbol, {
      price: toNumber(row.lastPrice),
      change: toNumber(row.priceChange),
      changePercent: toNumber(row.priceChangePercent),
    });
  }
  return quotes;
}

export function parseFugle(json) {
  const previous = toNumber(json.referencePrice) ?? toNumber(json.previousClose);
  const price = toNumber(json.lastPrice) ?? previous;
  if (price === null) return new Map();
  const change = toNumber(json.change);
  const quote =
    change === null
      ? quoteFromPrevious(price, previous)
      : { price, change, changePercent: toNumber(json.changePercent) };
  return new Map([[json.symbol, quote]]);
}

export function parseAlpaca(json) {
  const quotes = new Map();
  for (const [ticker, row] of Object.entries(json)) {
    const price = toNumber(row.latestTrade?.p) ?? toNumber(row.dailyBar?.c);
    if (price !== null) quotes.set(ticker, quoteFromPrevious(price, toNumber(row.prevDailyBar?.c)));
  }
  return quotes;
}

// The cursor moves through the list, so all symbols get a turn over several cycles.
export function takeBatch(items, cursor, limit) {
  if (items.length <= limit) return items;
  return Array.from({ length: limit }, (_, i) => items[(cursor + i) % items.length]);
}

async function fetchChunks(tickers, size, buildRequest, parse) {
  const responses = await Promise.all(
    chunk(tickers, size).map((part) => {
      const { url, headers } = buildRequest(part);
      return fetchJson(url, headers);
    }),
  );
  return new Map(responses.flatMap((json) => [...parse(json)]));
}

function misChannel(symbolId) {
  const prefix = symbolId.startsWith('TPEX:') ? 'otc' : 'tse';
  return `${prefix}_${tickerOf(symbolId)}.tw`;
}

function misUrl(channels) {
  const query = encodeURIComponent(channels.join('|'));
  return `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${query}`;
}

const fetchMis = (symbolIds) =>
  fetchChunks(symbolIds, MIS_CHUNK, (part) => ({ url: misUrl(part.map(misChannel)) }), parseMis);

const sparkRequest = (part) => ({
  url: `${YAHOO}/v8/finance/spark?symbols=${encodeURIComponent(part.join(','))}&range=1d&interval=1h`,
});

const fetchYahoo = (symbolIds, keys, yahooOf) =>
  fetchChunks(symbolIds.map(yahooOf), YAHOO_CHUNK, sparkRequest, parseYahooSpark);

const fetchKorea = (symbolIds) =>
  fetchChunks(symbolIds.flatMap((id) => koreaTickers(tickerOf(id))), YAHOO_CHUNK, sparkRequest, parseKoreaSpark);

const yahooSource = { label: 'Yahoo', enabled: () => true, fetch: fetchYahoo, keyOf: (id, yahooOf) => yahooOf(id) };

function binanceUrl(tickers) {
  const query = encodeURIComponent(JSON.stringify(tickers));
  return `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${query}`;
}

const fetchBinance = async (symbolIds) => {
  const tickers = symbolIds.map(tickerOf);
  try {
    return parseBinance(await fetchJson(binanceUrl(tickers)));
  } catch (error) {
    if (error.status !== 400 || tickers.length === 1) throw error;
  }
  // Tested: one unknown pair makes Binance reject the whole batch with HTTP 400.
  const results = await Promise.allSettled(tickers.map((ticker) => fetchJson(binanceUrl([ticker]))));
  return parseBinance(results.flatMap((result) => result.value ?? []));
};

const fetchAlpaca = (symbolIds, keys) =>
  fetchChunks(
    symbolIds.map(tickerOf),
    ALPACA_CHUNK,
    (part) => ({
      url: `https://data.alpaca.markets/v2/stocks/snapshots?feed=iex&symbols=${encodeURIComponent(part.join(','))}`,
      headers: { 'APCA-API-KEY-ID': keys.alpacaId, 'APCA-API-SECRET-KEY': keys.alpacaSecret },
    }),
    parseAlpaca,
  );

let fugleCursor = 0;

const fetchFugle = async (symbolIds, keys) => {
  const batch = takeBatch(symbolIds, fugleCursor, FUGLE_PER_CYCLE);
  const responses = await Promise.all(
    batch.map((id) =>
      fetchJson(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${tickerOf(id)}`, {
        'X-API-KEY': keys.fugle,
      }),
    ),
  );
  fugleCursor = (fugleCursor + batch.length) % symbolIds.length;
  return new Map(responses.flatMap((json) => [...parseFugle(json)]));
};

// Binance has no request for many perpetual contracts, so each contract is one request.
const perpTicker = (symbolId) => tickerOf(symbolId).replace(/\.P$/, '');

const fetchBinancePerp = async (symbolIds) => {
  const results = await Promise.allSettled(
    symbolIds.map((id) => fetchJson(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${perpTicker(id)}`)),
  );
  const rows = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  if (rows.length === 0) throw results[0].reason;
  return parseBinance(rows);
};

// Other crypto exchanges. The keys are the markets from marketOf.
// Each symbol is one request, because a request for all pairs returns 120 KB to 1.5 MB,
// and MEXC ignores a list of symbols. Each function gets a pair without .P, and returns its quote,
// or null if the exchange does not have the pair. marketOf gives these markets only pairs with a known
// quote currency, and only USDT perpetual contracts for Bitget and Gate.
// The change is for the last 24 hours, like Binance.
// Tested on 2026-11-12: Bybit, OKX and MEXC futures answer an unknown pair with HTTP 200 and an error code,
// Bitget, Gate and MEXC spot answer with HTTP 400, and KuCoin answers with empty fields.
const EXCHANGE_PER_SECOND = 10; // Tested: 40 requests at once got HTTP 429 for 10 at OKX and 16 at Bitget.

// Returns null if the price is missing.
function quoteOf(price, previous) {
  const number = toNumber(price);
  return number === null ? null : quoteFromPrevious(number, toNumber(previous));
}

// The price before a change, or null if the change is missing.
function priceBefore(price, change) {
  const [now, amount] = [toNumber(price), toNumber(change)];
  return now === null || amount === null ? null : now - amount;
}

async function fetchOrNull(url) {
  try {
    return await fetchJson(url);
  } catch (error) {
    if (error.status === 400) return null;
    throw error;
  }
}

async function bybitQuote(category, symbol) {
  const json = await fetchJson(`https://api.bybit.com/v5/market/tickers?category=${category}&symbol=${symbol}`);
  const row = json.result?.list?.[0];
  return row ? quoteOf(row.lastPrice, row.prevPrice24h) : null;
}

async function okxQuote(instId) {
  const json = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
  const row = json.data?.[0];
  return row ? quoteOf(row.last, row.open24h) : null;
}

// Spot rows have open, and futures rows have open24h. Both are the price 24 hours ago.
async function bitgetQuote(path) {
  const row = (await fetchOrNull(`https://api.bitget.com/api/v2/${path}`))?.data?.[0];
  return row ? quoteOf(row.lastPr, row.open ?? row.open24h) : null;
}

async function mexcPerpQuote(contract) {
  const base = 'https://contract.mexc.com/api/v1/contract';
  const start = Math.floor(Date.now() / 1000) - 86_400;
  // The ticker change counts from 00:00 UTC+8, so the previous price is the open of the first 1-minute bar
  // in the hour after 24 hours ago. A minute with no trade has no bar. Without a bar in that hour,
  // the quote has a price and no change. Tested: a contract with no trade in 24 hours has no bars.
  const [ticker, bars] = await Promise.all([
    fetchJson(`${base}/ticker?symbol=${contract}`),
    fetchJson(`${base}/kline/${contract}?interval=Min1&start=${start}&end=${start + 3600}`).catch(() => null),
  ]);
  return ticker.success ? quoteOf(ticker.data?.lastPrice, bars?.data?.open?.[0]) : null;
}

const pairWith = (ticker, separator) => splitPair(ticker).join(separator);

// Gate spot gives only a percentage. The change keeps the decimals of the last price.
function gateSpotQuote(row) {
  const price = toNumber(row.last);
  const percent = toNumber(row.change_percentage);
  if (price === null) return null;
  if (percent === null) return { price, change: null, changePercent: null };
  const decimals = (String(row.last).split('.')[1] ?? '').length;
  const change = Number((price - price / (1 + percent / 100)).toFixed(decimals));
  return { price, change, changePercent: percent };
}

const EXCHANGE_QUOTES = {
  bybit: (ticker) => bybitQuote('spot', ticker),
  'bybit-perp': (ticker) => bybitQuote(splitPair(ticker)[1] === 'USD' ? 'inverse' : 'linear', ticker),
  okx: (ticker) => okxQuote(pairWith(ticker, '-')),
  'okx-perp': (ticker) => okxQuote(`${pairWith(ticker, '-')}-SWAP`),
  bitget: (ticker) => bitgetQuote(`spot/market/tickers?symbol=${ticker}`),
  'bitget-perp': (ticker) => bitgetQuote(`mix/market/ticker?productType=USDT-FUTURES&symbol=${ticker}`),
  gate: async (ticker) => {
    const url = `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pairWith(ticker, '_')}`;
    const row = (await fetchOrNull(url))?.[0];
    return row ? gateSpotQuote(row) : null;
  },
  'gate-perp': async (ticker) => {
    const url = `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${pairWith(ticker, '_')}`;
    const row = (await fetchOrNull(url))?.[0];
    return row ? quoteOf(row.last, priceBefore(row.last, row.change_price)) : null;
  },
  kucoin: async (ticker) => {
    const row = (await fetchJson(`https://api.kucoin.com/api/v1/market/stats?symbol=${pairWith(ticker, '-')}`)).data;
    return row ? quoteOf(row.last, priceBefore(row.last, row.changePrice)) : null;
  },
  mexc: async (ticker) => {
    const row = await fetchOrNull(`https://api.mexc.com/api/v3/ticker/24hr?symbol=${ticker}`);
    return row ? quoteOf(row.lastPrice, row.openPrice) : null;
  },
  'mexc-perp': (ticker) => mexcPerpQuote(pairWith(ticker, '_')),
};

const exchangeMarket = (market) => EXCHANGE_MARKETS.find((item) => item.market === market);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// The ticker keeps .P for a perpetual contract. It goes into URLs, so it is encoded.
const exchangeQuote = (market, ticker) => EXCHANGE_QUOTES[market](encodeURIComponent(ticker.replace(/\.P$/, '')));

// Sends at most EXCHANGE_PER_SECOND requests each second. A failed request skips its symbol.
// The source reports an error only if every request fails.
async function fetchEachSymbol(market, symbolIds) {
  const tickers = symbolIds.map(tickerOf);
  const results = [];
  for (const [i, part] of chunk(tickers, EXCHANGE_PER_SECOND).entries()) {
    if (i > 0) await sleep(1000);
    results.push(...(await Promise.allSettled(part.map(async (ticker) => exchangeQuote(market, ticker)))));
  }
  if (results.every((result) => result.status === 'rejected')) throw results[0].reason;
  return new Map(tickers.map((ticker, i) => [ticker, results[i].value]).filter(([, quote]) => quote));
}

const EXCHANGE_SOURCES = Object.fromEntries(
  Object.keys(EXCHANGE_QUOTES).map((market) => [
    market,
    [{ label: exchangeMarket(market).name, enabled: () => true, fetch: (ids) => fetchEachSymbol(market, ids) }],
  ]),
);

// Each market tries its enabled sources in order, and uses the first that works.
const SOURCES = {
  tw: [
    { label: 'Fugle', enabled: (keys) => Boolean(keys.fugle), fetch: fetchFugle },
    { label: 'TWSE MIS', enabled: () => true, fetch: fetchMis },
  ],
  us: [
    { label: 'Alpaca', enabled: (keys) => Boolean(keys.alpacaId && keys.alpacaSecret), fetch: fetchAlpaca },
    yahooSource,
  ],
  eu: [yahooSource],
  kr: [{ label: 'Yahoo', enabled: () => true, fetch: fetchKorea }],
  crypto: [{ label: 'Binance', enabled: () => true, fetch: fetchBinance }],
  perp: [{ label: 'Binance', enabled: () => true, fetch: fetchBinancePerp, keyOf: perpTicker }],
  ...EXCHANGE_SOURCES,
};

async function fetchMarket(market, symbolIds, keys, yahooOf) {
  const errors = [];
  for (const source of SOURCES[market].filter((item) => item.enabled(keys))) {
    try {
      const byTicker = await source.fetch(symbolIds, keys, yahooOf);
      const keyOf = source.keyOf ? (id) => source.keyOf(id, yahooOf) : tickerOf;
      const quotes = symbolIds
        .filter((id) => byTicker.has(keyOf(id)))
        .map((id) => [id, byTicker.get(keyOf(id))]);
      return { market, quotes, source: source.label, errors };
    } catch (error) {
      errors.push(`${source.label}: ${error.message}`);
    }
  }
  return { market, quotes: [], source: null, errors };
}

// European symbols keep their Yahoo ticker, because EURONEXT:MC can be MC.PA or MC.AS.
// yahooTickers maps those symbol ids to their Yahoo tickers.
// A symbol with no market gets no quote. So does a European symbol without its Yahoo ticker,
// because the bare ticker can be a US stock.
export async function fetchQuotes(symbolIds, keys, yahooTickers = new Map()) {
  const yahooOf = (id) => yahooTickers.get(id) ?? toYahooTicker(tickerOf(id));
  const quotable = (id) => {
    const market = marketOf(id);
    return market !== null && (market !== 'eu' || yahooTickers.has(id));
  };
  const byMarket = Map.groupBy(symbolIds.filter(quotable), marketOf);
  const results = await Promise.all(
    [...byMarket].map(([market, ids]) => fetchMarket(market, ids, keys, yahooOf)),
  );
  return {
    quotes: new Map(results.flatMap((result) => result.quotes)),
    status: results.map(({ market, source, errors }) => ({ market, source, errors })),
  };
}

// US pre-market and after-hours prices. Only the Yahoo chart has them: spark answers HTTP 400 with
// includePrePost, and v7/finance/quote answers 401. Tested on 2026-11-12: only US stocks have
// hasPrePostMarketData, and the chart has no overnight trades (20:00 to 04:00 New York time).
const EXTENDED_CHUNK = 20;

export const hasExtendedHours = (symbolId) => marketOf(symbolId) === 'us';

// Reads the last bar of the day. Returns { session: 'pre' or 'post', price, change, changePercent,
// time } if that bar is in the pre-market or after-hours session, or null if it is in the regular
// session. The change is from the last regular close, which the last price column shows outside
// the regular session. The last after-hours bar can start at 20:00:00, the end of the session.
export function parseExtendedHours(json) {
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta?.hasPrePostMarketData) return null;
  const times = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  let index = closes.length - 1;
  while (index >= 0 && toNumber(closes[index]) === null) index -= 1;
  if (index < 0 || !Number.isFinite(times[index])) return null;
  const time = times[index];
  const periods = (name) => (meta.tradingPeriods?.[name] ?? []).flat();
  const pre = periods('pre').some((period) => time >= period.start && time < period.end);
  const post = periods('post').some((period) => time >= period.start && time <= period.end);
  if (!pre && !post) return null;
  const quote = quoteFromPrevious(toNumber(closes[index]), toNumber(meta.regularMarketPrice));
  return { session: pre ? 'pre' : 'post', ...quote, time: time * 1000 };
}

// Returns a Map of symbol id to the parsed price or null. Only US symbols are asked. A failed
// request leaves its symbol out, so the panel keeps the price it has.
export async function fetchExtendedHours(symbolIds) {
  const quotes = new Map();
  for (const part of chunk(symbolIds.filter(hasExtendedHours), EXTENDED_CHUNK)) {
    const results = await Promise.allSettled(
      part.map((id) =>
        fetchJson(
          `${YAHOO}/v8/finance/chart/${encodeURIComponent(toYahooTicker(tickerOf(id)))}?range=1d&interval=60m&includePrePost=true`,
        ),
      ),
    );
    part.forEach((id, i) => {
      if (results[i].status === 'fulfilled') quotes.set(id, parseExtendedHours(results[i].value));
    });
  }
  return quotes;
}

// The time in New York decides how often the prices can change. During the pre-market and
// after-hours sessions they change each cycle. During the regular session they are asked slowly,
// only to find a holiday or an early close. At night and at weekends the last after-hours price stays.
export const EXTENDED_INTERVALS = { extended: 0, regular: 5 * 60_000, closed: 30 * 60_000 };

// The US symbols to ask for again. Each answer keeps the time and the phase it was asked in, so a
// symbol on another tab is asked again when its answer is from an earlier phase or is too old.
export function extendedHoursDue(symbolIds, known, phase, now) {
  return symbolIds.filter((id) => {
    if (!hasExtendedHours(id)) return false;
    const answer = known.get(id);
    return !answer || answer.phase !== phase || now - answer.at >= EXTENDED_INTERVALS[phase];
  });
}

export function extendedHoursPhase(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return 'closed';
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return 'regular';
  if (minutes >= 4 * 60 && minutes < 20 * 60) return 'extended';
  return 'closed';
}

// Resolvers return { id, name }, or null if the ticker does not exist.
// A European symbol also has its Yahoo ticker, for example { id: 'XETR:IFX', name, yahoo: 'IFX.DE' }.

async function resolveTaiwan(ticker) {
  const json = await fetchJson(misUrl([`tse_${ticker}.tw`, `otc_${ticker}.tw`]));
  const row = (json.msgArray ?? []).find((item) => item.c);
  if (!row) return null;
  return { id: `${row.ex === 'otc' ? 'TPEX' : 'TWSE'}:${row.c}`, name: row.n ?? '' };
}

async function resolvePerp(ticker) {
  try {
    const json = await fetchJson(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${ticker.replace(/\.P$/, '')}`);
    return { id: `BINANCE:${json.symbol}.P`, name: '' };
  } catch (error) {
    if (error.status === 400) return null;
    throw error;
  }
}

async function resolveCrypto(ticker) {
  try {
    const json = await fetchJson(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${ticker}`);
    return { id: `BINANCE:${json.symbol}`, name: '' };
  } catch (error) {
    if (error.status === 400) return null;
    throw error;
  }
}

// Returns null for an unknown ticker. Yahoo also keeps old tickers with no price, for example IQE on NASDAQ.
async function yahooMeta(yahooTicker) {
  try {
    const json = await fetchJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=1d&interval=1d`);
    const meta = json.chart.result[0].meta;
    return toNumber(meta.regularMarketPrice) === null ? null : meta;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

// Yahoo pads some names, for example "INFINEON TECHNOLOGIES AG      N".
const cleanName = (name) => (name ?? '').replace(/\s+/g, ' ').trim();

async function resolveUs(ticker) {
  const meta = await yahooMeta(toYahooTicker(ticker));
  const exchange = YAHOO_EXCHANGES[meta?.exchangeName];
  if (!exchange) return null;
  return { id: `${exchange}:${ticker}`, name: meta.shortName ?? meta.longName ?? '' };
}

// Tries the given Yahoo tickers in order. Without them, takes the first European match of a Yahoo search.
// Tested: the search lists the main exchange first, for example IFX.DE before IFX.F.
async function resolveEurope(ticker, yahoo) {
  for (const yahooTicker of yahoo ?? []) {
    const meta = await yahooMeta(yahooTicker);
    if (meta) return { id: europeIdOf(yahooTicker), name: cleanName(meta.longName ?? meta.shortName), yahoo: yahooTicker };
  }
  if (yahoo) return null;

  const json = await fetchJson(`${YAHOO}/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=10&newsCount=0`);
  const base = toYahooTicker(ticker);
  const match = (json.quotes ?? []).find(
    (quote) =>
      ['EQUITY', 'ETF'].includes(quote.quoteType) &&
      europeIdOf(quote.symbol ?? '') &&
      quote.symbol.slice(0, quote.symbol.lastIndexOf('.')) === base,
  );
  if (!match) return null;
  return { id: europeIdOf(match.symbol), name: cleanName(match.longname ?? match.shortname), yahoo: match.symbol };
}

// Both suffixes answer, so the one with the latest trade is the real one.
async function resolveKorea(ticker) {
  const metas = await Promise.all(koreaTickers(ticker).map(yahooMeta));
  const [meta] = metas.filter(Boolean).sort((a, b) => b.regularMarketTime - a.regularMarketTime);
  return meta ? { id: `KRX:${ticker}`, name: cleanName(meta.longName ?? meta.shortName) } : null;
}

// Finds a pair on another crypto exchange. A perpetual contract keeps .P in its id.
const resolveOnExchange = (market) => async (ticker) => {
  const quote = await exchangeQuote(market, ticker);
  return quote ? { id: `${exchangeMarket(market).exchange}:${ticker}`, name: '' } : null;
};

const RESOLVERS = {
  tw: resolveTaiwan,
  crypto: resolveCrypto,
  perp: resolvePerp,
  us: resolveUs,
  eu: resolveEurope,
  kr: resolveKorea,
  ...Object.fromEntries(Object.keys(EXCHANGE_QUOTES).map((market) => [market, resolveOnExchange(market)])),
};

export async function resolveSymbol(raw) {
  const parsed = parseInput(raw);
  if (!parsed) throw new Error(t('resolve.unsupported', { raw }));
  // A failed market does not stop the others, because a typed pair is looked up on up to 7 exchanges.
  let failure = null;
  for (const market of parsed.markets) {
    try {
      const symbol = await RESOLVERS[market](parsed.ticker, parsed.yahoo);
      if (symbol) return symbol;
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw new Error(t('resolve.failed', { ticker: parsed.ticker, message: failure.message }));
  throw new Error(t('resolve.notFound', { ticker: parsed.ticker }));
}
