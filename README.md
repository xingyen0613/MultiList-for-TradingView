# MultiList for TradingView

[English](README.md) | [繁體中文](README.zh-TW.md)

A Chrome side panel watchlist for people who chart on TradingView. Create as many groups as you want, and put the same symbol in as many groups as you want. Click a symbol to show it on your TradingView chart.

<p>
  <img src="docs/screenshot-all.png" alt="The side panel with groups of Taiwan, US, European and crypto symbols" width="340">
  <img src="docs/screenshot-europe-dark.png" alt="The European stocks tab in dark mode" width="340">
</p>

This is an independent personal project. It is not affiliated with TradingView.

The interface is in Traditional Chinese.

## Features

- Unlimited groups. A symbol can be in many groups.
- Taiwan stocks (TWSE, TPEx), US stocks, European stocks and Binance pairs.
- Tabs for all symbols, Taiwan stocks, US stocks, European stocks and crypto. Each symbol goes to its market tab automatically.
- Add your own tabs with the **+** at the right end of the tab bar. A new tab holds its own groups. Its groups also show on **All** and on the market tabs.
- Click the pencil at the right end of the tab bar to rename the current tab. Clear the name of a market tab to go back to the default. A custom tab also has a delete button while you edit it. Its groups stay on **All**.
- Drag a group header onto a tab to move the group there. Drop it on a market tab to take it out of its custom tab.
- Drag the lines in the column header to change the column widths. A column cannot get narrower than its widest number. Double-click a line to go back to the default widths. Widths stay on this computer.
- Last price, change and change percent. Open groups on the current tab refresh every 30 seconds.
- Click a row to switch the chart in your TradingView tab.
- Drag to reorder symbols and groups, or to move a symbol to another group.
- Groups and tabs sync through your Chrome account. No server is needed.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**, then select the `extension` folder.
5. Pin the extension, then click its icon to open the side panel.

The extension needs Chrome 117 or later.

## Use

1. Click **+** at the top of the panel to create a group.
2. Type symbols and press Enter. You can type several at once, for example `2330 AAPL IFX BTCUSDT`.
3. Click a row to open it on the chart.
4. Press Esc to close the input box.

Numeric codes are looked up as Taiwan stocks. Other tickers are looked up as US stocks first, then as European stocks. You can also type the full form, for example `NYSE:TSM` or `XETR:IFX`. Indices, futures and forex are not supported.

For a European stock that has the same ticker as a US stock, type the exchange. Use the TradingView form, for example `XETR:SAP`, or the Yahoo form, for example `SAP.DE`.

Supported European exchanges:

| Exchange | TradingView | Yahoo |
| --- | --- | --- |
| Xetra | `XETR:IFX` | `IFX.DE` |
| London | `LSE:IQE` | `IQE.L` |
| Euronext (Paris, Amsterdam, Brussels, Lisbon, Dublin) | `EURONEXT:ASML` | `ASML.AS` |
| Milan | `MIL:ENEL` | `ENEL.MI` |
| Madrid | `BME:SAN` | `SAN.MC` |
| SIX Swiss | `SIX:NESN` | `NESN.SW` |
| Stockholm | `OMXSTO:SIVE` | `SIVE.ST` |
| Copenhagen | `OMXCOP:NOVO_B` | `NOVO-B.CO` |
| Helsinki | `OMXHEX:NOKIA` | `NOKIA.HE` |
| Oslo | `OSL:EQNR` | `EQNR.OL` |
| Vienna | `VIE:OMV` | `OMV.VI` |
| Warsaw | `GPW:PKO` | `PKO.WA` |

## Data sources

| Market | Used if you add a key | Used without a key |
| --- | --- | --- |
| Taiwan stocks | [Fugle](https://developer.fugle.tw/docs/pricing) | TWSE MIS |
| US stocks | [Alpaca](https://docs.alpaca.markets/docs/about-market-data-api) (IEX only) | Yahoo Finance |
| European stocks | Not available | Yahoo Finance |
| Crypto | Not needed | Binance |

Add keys under **API key settings** at the bottom of the panel. Keys stay on your computer and do not sync. If a keyed source fails, the panel uses the source without a key and shows the error.

TWSE MIS and Yahoo Finance are not documented public APIs. They can change or block requests at any time, and the Yahoo terms restrict automated access. Add keys if you want documented sources. Adding a new US, European or Taiwan symbol always uses Yahoo or TWSE MIS to find its exchange and name.

## Limits

- A symbol change uses the symbol search on the TradingView page. The page does not reload, so unsaved chart changes stay.
- If TradingView changes that page, the extension reloads the page with the new symbol and shows a notice in the panel. A reload can lose unsaved chart changes.
- A free TradingView account still allows 2 indicators per chart.
- The extension does not call internal TradingView endpoints, because the TradingView terms prohibit this.
- The extension controls the TradingView page when you click a symbol. Section 12 of the TradingView terms restricts automated access and browser extensions. This project is for personal use. Read the terms before you share it.
- It works only in desktop browsers based on Chromium.
- Prices are for reference. Sources can be delayed or wrong.

## Develop

There is no build step. Reload the extension in `chrome://extensions` after a change.

```bash
npm test
```

The tests use the built-in Node.js test runner and need Node.js 22 or later.
