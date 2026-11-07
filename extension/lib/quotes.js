import { fromYahooTicker, marketOf, parseInput, tickerOf, toYahooTicker } from './symbols.js';

const TIMEOUT_MS = 10_000;
const MIS_CHUNK = 100; // Tested: one request returns 100 symbols.
const YAHOO_CHUNK = 20; // Tested: 21 symbols returns HTTP 400.
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

export function parseYahooSpark(json) {
  const quotes = new Map();
  for (const [yahooTicker, row] of Object.entries(json)) {
    const price = toNumber(row.fulldayPrice);
    if (price === null) continue;
    quotes.set(fromYahooTicker(yahooTicker), {
      price,
      change: toNumber(row.fulldayChange),
      changePercent: toNumber(row.fulldayChangePercent),
    });
  }
  return quotes;
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

const fetchYahoo = (symbolIds) =>
  fetchChunks(
    symbolIds.map((id) => toYahooTicker(tickerOf(id))),
    YAHOO_CHUNK,
    (part) => ({
      url: `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(part.join(','))}&range=1d&interval=1h`,
    }),
    parseYahooSpark,
  );

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

// Each market tries its enabled sources in order, and uses the first that works.
const SOURCES = {
  tw: [
    { label: 'Fugle', enabled: (keys) => Boolean(keys.fugle), fetch: fetchFugle },
    { label: 'TWSE MIS', enabled: () => true, fetch: fetchMis },
  ],
  us: [
    { label: 'Alpaca', enabled: (keys) => Boolean(keys.alpacaId && keys.alpacaSecret), fetch: fetchAlpaca },
    { label: 'Yahoo', enabled: () => true, fetch: fetchYahoo },
  ],
  crypto: [{ label: 'Binance', enabled: () => true, fetch: fetchBinance }],
};

async function fetchMarket(market, symbolIds, keys) {
  const errors = [];
  for (const source of SOURCES[market].filter((item) => item.enabled(keys))) {
    try {
      const byTicker = await source.fetch(symbolIds, keys);
      const quotes = symbolIds
        .filter((id) => byTicker.has(tickerOf(id)))
        .map((id) => [id, byTicker.get(tickerOf(id))]);
      return { market, quotes, source: source.label, errors };
    } catch (error) {
      errors.push(`${source.label}: ${error.message}`);
    }
  }
  return { market, quotes: [], source: null, errors };
}

export async function fetchQuotes(symbolIds, keys) {
  const byMarket = Map.groupBy(symbolIds, marketOf);
  const results = await Promise.all(
    [...byMarket].map(([market, ids]) => fetchMarket(market, ids, keys)),
  );
  return {
    quotes: new Map(results.flatMap((result) => result.quotes)),
    status: results.map(({ market, source, errors }) => ({ market, source, errors })),
  };
}

// Resolvers return { id, name }, or null if the ticker does not exist.

async function resolveTaiwan(ticker) {
  const json = await fetchJson(misUrl([`tse_${ticker}.tw`, `otc_${ticker}.tw`]));
  const row = (json.msgArray ?? []).find((item) => item.c);
  if (!row) return null;
  return { id: `${row.ex === 'otc' ? 'TPEX' : 'TWSE'}:${row.c}`, name: row.n ?? '' };
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

async function resolveUs(ticker) {
  try {
    const yahooTicker = encodeURIComponent(toYahooTicker(ticker));
    const json = await fetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=1d&interval=1d`,
    );
    const meta = json.chart.result[0].meta;
    const exchange = YAHOO_EXCHANGES[meta.exchangeName];
    if (!exchange) return null;
    return { id: `${exchange}:${ticker}`, name: meta.shortName ?? meta.longName ?? '' };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

const RESOLVERS = { tw: resolveTaiwan, crypto: resolveCrypto, us: resolveUs };

export async function resolveSymbol(raw) {
  const parsed = parseInput(raw);
  if (!parsed) throw new Error(`不支援「${raw}」，請用台股、美股或幣安代碼`);
  try {
    for (const market of parsed.markets) {
      const symbol = await RESOLVERS[market](parsed.ticker);
      if (symbol) return symbol;
    }
  } catch (error) {
    throw new Error(`查詢 ${parsed.ticker} 失敗（${error.message}）`);
  }
  throw new Error(`找不到 ${parsed.ticker}`);
}
