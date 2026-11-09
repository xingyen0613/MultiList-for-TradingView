import { europeIdOf, marketOf, parseInput, tickerOf, toYahooTicker } from './symbols.js';

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

// The keys stay in the Yahoo form, for example BRK-B and VOLV-B.ST.
export function parseYahooSpark(json) {
  const quotes = new Map();
  for (const [yahooTicker, row] of Object.entries(json)) {
    const price = toNumber(row.fulldayPrice);
    if (price === null) continue;
    quotes.set(yahooTicker, {
      price,
      change: toNumber(row.fulldayChange),
      changePercent: toNumber(row.fulldayChangePercent),
    });
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

const RESOLVERS = {
  tw: resolveTaiwan,
  crypto: resolveCrypto,
  perp: resolvePerp,
  us: resolveUs,
  eu: resolveEurope,
  kr: resolveKorea,
};

export async function resolveSymbol(raw) {
  const parsed = parseInput(raw);
  if (!parsed) throw new Error(`不支援「${raw}」，請用台股、美股、歐股、韓股或幣安代碼`);
  try {
    for (const market of parsed.markets) {
      const symbol = await RESOLVERS[market](parsed.ticker, parsed.yahoo);
      if (symbol) return symbol;
    }
  } catch (error) {
    throw new Error(`查詢 ${parsed.ticker} 失敗（${error.message}）`);
  }
  throw new Error(`找不到 ${parsed.ticker}`);
}
