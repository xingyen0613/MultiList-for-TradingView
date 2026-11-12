# MultiList for TradingView

[English](README.md) | [繁體中文](README.zh-TW.md)

A Chrome side panel watchlist for people who chart on TradingView. Create as many groups as you want, and put the same symbol in as many groups as you want. Click a symbol to show it on your TradingView chart.

<p>
  <img src="docs/screenshot-all.png" alt="The side panel with groups of Taiwan, US and European stocks, crypto and ETFs" width="340">
  <img src="docs/screenshot-search-dark.png" alt="Search results for sui with the crypto filter, in dark mode" width="340">
</p>

This is an independent personal project. It is not affiliated with TradingView.

The interface is in English and Traditional Chinese. It follows your browser language, and you can switch it in the **⋯** menu.

## Features

- Unlimited groups. A symbol can be in many groups, or in no group.
- Search by code or by company name, in English or Chinese. The results come from TradingView search, with all exchanges, spot pairs, perpetual contracts and futures.
- Import your TradingView watchlists with one click. Each list becomes a tab, and each section becomes a group.
- Prices for Taiwan stocks (TWSE, TPEx), US stocks, European stocks, Korean stocks (KOSPI, KOSDAQ), crypto spot pairs and perpetual contracts on Binance, Bybit, OKX, Bitget, Gate and MEXC, and KuCoin spot pairs. You can also add other symbols, for example other exchanges, futures, indices or forex. They show no price, but a click still opens the chart.
- The **All** tab shows every group. A new install also has one custom tab, **Tab 1**. Add more tabs with the **+** at the right end of the tab bar. You decide which groups go in each tab. A custom tab shows only its own groups, and these groups also show on **All**. Symbols that are not in a group show above the groups. On **All**, the symbols of a custom tab that are not in a group show under the name of that tab.
- Click the pencil at the right end of the tab bar to rename the current tab. Clear the name of **All** to go back to the default.
- Click the × on a custom tab to delete it. The × shows on the current tab, and on another tab when you point at it. A popup asks before the delete. The groups of the tab, and its symbols that are not in a group, stay on **All**.
- Drag a group header onto a tab to move the group there. Drop it on **All** to take it out of its custom tab.
- Drag the lines in the column header to change the column widths. A column cannot get narrower than its widest number. Double-click a line to go back to the default widths. Widths stay on this computer.
- Last price, change and change percent. Open groups on the current tab refresh every 30 seconds.
- Click the column button at the right end of the column header to choose the columns. Hidden columns keep their widths. The choice syncs through your Chrome account.
- US stocks get a second line with the pre-market or after-hours price, under the same columns. The change is from the last regular close. The first line shows the regular session only: the live price during the session, and the official close after it. The line shows only outside the regular session, and you can turn it off in the column menu. Overnight trades (20:00 to 04:00 New York time) are not included.
- Click a row to switch the chart in your TradingView tab.
- Drag to reorder symbols and groups, or to move a symbol to another group.
- Groups and tabs sync through your Chrome account. Without sign-in, no server is needed.
- Optional Google sign-in. When signed in, your lists also sync through the MultiList server to other browsers, for example Chrome and Edge. Without it, lists sync only through Chrome, as before.
- If two computers both changed the lists, they merge automatically. You are asked which copy to keep only at the first sign-in, when the two lists differ. You can export this computer's list first.
- Export and import (**Export to file…** and **Import from file…** in the **⋯** menu at the top right). Export the whole list or the current tab to a JSON file (`multilist-YYYYMMDD.json`). An import adds to your lists and never overwrites anything. Use it to back up, to move to another computer, or to share a list.
- Pick the background and text colors (**Background and text colors…** in the **⋯** menu). Light Mode and Dark Mode are one click away, or you can follow the system. The colors sync through your Chrome account.
- English and Traditional Chinese interface. The panel follows the browser language: Traditional Chinese for a Chinese browser, English for any other language. To switch, pick **English** or **繁體中文** under **Language** in the **⋯** menu. The panel changes at once, and the choice syncs through your Chrome account. Names that you type, and names from TradingView or a quote source, stay as they are.
- Delete your account (**Delete account…** in the **⋯** menu). Your lists and account data on the server are deleted. The lists on this computer stay.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**, then select the `extension` folder.
5. Pin the extension, then click its icon to open the side panel.

The extension needs Chrome 117 or later.

## Use

1. Click **Add symbol** at the top of the list. A symbol does not need a group. To sort symbols into groups, click **New group**, or the **+** on a group header.
2. Type a code or a name, for example `2330`, `台積電`, `AAPL` or `BTC`. Results from TradingView show below the box. Use the filter buttons to show one kind only, for example crypto.
3. Click a result, or press ↑ or ↓ to mark one and press Enter. A result marked **No quote** has no price source, but you can still add it.
4. Click a row to open it on the chart.
5. Press Esc to close the input box.

The first time you open the panel, it offers Google sign-in once. Later, click the cloud at the top right (it shows only when you are not signed in), or **Sign in with Google** in the **⋯** menu. The **⋯** menu also has the TradingView import, export and import, API keys, colors, anonymous sharing, sign-out and account deletion.

The search needs an open TradingView tab in Chrome. Without one, type full codes and press Enter. You can type several at once, for example `2330 AAPL IFX BTCUSDT`. Numeric codes are looked up as Taiwan stocks. Other tickers are looked up as US stocks first, then as European stocks. You can also type the full form, for example `NYSE:TSM`, `XETR:IFX`, `KRX:005930`, `BINANCE:SUIUSDT.P`, `BYBIT:MNTUSDT` or `OKX:SUIUSDT.P`. A plain crypto pair such as `MNTUSDT` is looked up on Binance first, then on Bybit, OKX, Bitget, Gate, KuCoin and MEXC, in that order. The first match is used. Type Korean stocks in the full form, because a numeric code is looked up as a Taiwan stock.

For a European stock that has the same ticker as a US stock, type the exchange. Use the TradingView form, for example `XETR:SAP`, or the Yahoo form, for example `SAP.DE`.

European stocks have prices on these exchanges:

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

## Import TradingView watchlists

1. Open TradingView in Chrome and sign in.
2. Click the download arrow at the top of the panel.
3. Select the lists to import, then click **Import**.

Each list becomes a new tab. Each `###` section of a list becomes a group in that tab. Symbols before the first section go to a group with the name of the list. The import looks up the names of Taiwan, US, European and Korean stocks, so a long list can take some seconds.

Chrome sync allows 8 KB for each group (about 150 symbols) and 100 KB in total. If the import does not fit, it stops before it saves anything and shows the reason. An import always adds new tabs. It does not update tabs from an earlier import.

## Data sources

| Market | Used if you add a key | Used without a key |
| --- | --- | --- |
| Taiwan stocks | [Fugle](https://developer.fugle.tw/docs/pricing) | TWSE MIS |
| US stocks | [Alpaca](https://docs.alpaca.markets/docs/about-market-data-api) (IEX only) | Yahoo Finance |
| US pre-market and after-hours | Not available | Yahoo Finance |
| European stocks | Not available | Yahoo Finance |
| Korean stocks | Not available | Yahoo Finance |
| Binance spot | Not needed | Binance |
| Binance perpetual contracts | Not needed | Binance futures API |
| Bybit spot and perpetual contracts | Not needed | Bybit API |
| OKX spot and perpetual contracts | Not needed | OKX API |
| Bitget spot and USDT perpetual contracts | Not needed | Bitget API |
| Gate spot and USDT perpetual contracts | Not needed | Gate API |
| KuCoin spot | Not needed | KuCoin API |
| MEXC spot and perpetual contracts | Not needed | MEXC API |

Add keys under **Quote API keys…** in the **⋯** menu at the top right. Keys stay on your computer and do not sync. If a keyed source fails, the panel uses the source without a key and shows the error.

TWSE MIS and Yahoo Finance are not documented public APIs. They can change or block requests at any time, and the Yahoo terms restrict automated access. Add keys if you want documented sources. A code that you type, and an imported symbol, use Yahoo or TWSE MIS to find the exchange and the name. A European search result uses Yahoo to find its Yahoo ticker.

The search and the import use TradingView. See the limits below.

## Privacy

- If you do not sign in and do not agree to share, nothing is sent to the MultiList server.
- If you sign in, the server stores your Google account ID, Google email, lists (with group and tab names), first-use date and account creation date. It is used to sync your lists, and kept until you delete your account.
- Anonymous sharing (**Share watchlist anonymously**) is a separate option and is off by default. It sends symbol codes, salted-hash group and tab IDs, a random analytics ID and the extension version, with no names. It is never matched or merged with account data.

See the [privacy policy](docs/privacy.md) for details.

## Limits

- Cloud sync allows up to 600 groups, 2000 symbols per group and 256 KB in total. You reach the Chrome sync limits (8 KB per item, 100 KB in total) first.
- A symbol change uses the symbol search on the TradingView page. The page does not reload, so unsaved chart changes stay.
- If TradingView changes that page, the extension reloads the page with the new symbol and shows a notice in the panel. A reload can lose unsaved chart changes.
- A free TradingView account still allows 2 indicators per chart.
- The search and the import call internal TradingView endpoints from your TradingView tab. These endpoints are not documented, and TradingView can change or block them at any time.
- Section 12 of the TradingView terms prohibits access through internal or undocumented endpoints, and the distribution of browser extensions that do this. The extension also controls the TradingView page when you click a symbol. Use this project at your own risk. It is for personal use. Read the terms before you use or share it.
- The import runs in your TradingView tab with your own sign-in. The extension never reads your password or your cookies.
- It works only in desktop browsers based on Chromium.
- Prices are for reference. Sources can be delayed or wrong.

## Develop

There is no build step. Reload the extension in `chrome://extensions` after a change.

```bash
npm test
```

The tests use the built-in Node.js test runner and need Node.js 22 or later.

The real-browser checks are in `e2e/` (`flow`, `cors`, `transfer`, `account`, `sync`, `delete`). Run one with `node e2e/<name>.mjs`. They need `playwright-core` with Chromium, and the MultiList server repo in `../MultiList-server` (or the path in `MULTILIST_SERVER_DIR`). The server is a separate private repo, so contributors without access cannot run the checks that need it.

`SERVER_URL` and `GOOGLE_CLIENT_ID` in `extension/lib/config.js` point to the MultiList server and its Google OAuth client. The E2E checks replace both with local test values. For a build that talks to no server, set them to empty strings: while `SERVER_URL` is empty, nothing is sent to the MultiList server. While either one is empty, the sign-in screens are hidden. The `key` in `manifest.json` fixes the extension ID, because the OAuth redirect URI needs a stable ID.

`npm run package` builds `dist/multilist-<version>.zip` for the Chrome Web Store. The zip leaves out the `key`, because the store gives the item its own key.
