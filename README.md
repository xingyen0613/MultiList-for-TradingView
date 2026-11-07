# Multi-Group Watchlist

[English](README.md) | [繁體中文](README.zh-TW.md)

A Chrome side panel watchlist for people who chart on TradingView. Create as many groups as you want, and put the same symbol in as many groups as you want. Click a symbol to show it on your TradingView chart.

This is an independent personal project. It is not affiliated with TradingView.

## Features

- Unlimited groups. A symbol can be in many groups.
- Taiwan stocks (TWSE, TPEx), US stocks and Binance pairs.
- Last price, change and change percent. Open groups refresh every 30 seconds.
- Click a row to switch the chart in your TradingView tab.
- Drag to reorder symbols and groups, or to move a symbol to another group.
- Groups sync through your Chrome account. No server is needed.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**, then select the `extension` folder.
5. Pin the extension, then click its icon to open the side panel.

The extension needs Chrome 117 or later.

## Use

1. Click **+** at the top of the panel to create a group.
2. Type symbols and press Enter. You can type several at once, for example `2330 AAPL BTCUSDT`.
3. Click a row to open it on the chart.
4. Press Esc to close the input box.

Numeric codes are looked up as Taiwan stocks. You can also type the full form, for example `NYSE:TSM`. Indices, futures and forex are not supported.

## Data sources

| Market | Used if you add a key | Used without a key |
| --- | --- | --- |
| Taiwan stocks | [Fugle](https://developer.fugle.tw/docs/pricing) | TWSE MIS |
| US stocks | [Alpaca](https://docs.alpaca.markets/docs/about-market-data-api) (IEX only) | Yahoo Finance |
| Crypto | Not needed | Binance |

Add keys under **API key settings** at the bottom of the panel. Keys stay on your computer and do not sync. If a keyed source fails, the panel uses the source without a key and shows the error.

TWSE MIS and Yahoo Finance are not documented public APIs. They can change or block requests at any time, and the Yahoo terms restrict automated access. Add keys if you want documented sources. Adding a new US or Taiwan symbol always uses Yahoo or TWSE MIS to find its exchange and name.

## Limits

- Each symbol change reloads the TradingView page.
- A free TradingView account still allows 2 indicators per chart.
- The extension does not call internal TradingView endpoints, because the TradingView terms prohibit this.
- It works only in desktop browsers based on Chromium.
- Prices are for reference. Sources can be delayed or wrong.

## Develop

There is no build step. Reload the extension in `chrome://extensions` after a change.

```bash
npm test
```

The tests use the built-in Node.js test runner and need Node.js 22 or later.
