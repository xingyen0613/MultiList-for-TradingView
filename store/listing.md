# Chrome Web Store listing draft (0.2.0)

Draft text for the Developer Dashboard. Field names follow the dashboard tabs. Check each field against the dashboard before submitting: the dashboard can change its field names.

## Store listing

The store has two languages: `zh_TW` (Traditional Chinese) and `en` (English). The manifest gives the name and summary for each language from `extension/_locales/<lang>/messages.json`. In the dashboard, fill a detailed description and screenshots for each language.

Rules for the descriptions (Chrome Web Store keyword spam policy and spam FAQ):

- Each keyword, "TradingView" included, appears fewer than 5 times in each description. The zh_TW description has it 4 times, and the en description 4 times. Count again after any change.
- No lists of brands, websites or regions. No anonymous testimonials. No superlatives or competitor names.
- About TradingView limits, say only that MultiList keeps its own lists, so they do not count against TradingView watchlist limits. Do not say that it unlocks, bypasses or hacks a TradingView plan.
- The first sentence does not repeat the summary, because the store shows the summary above the description.
- Say "browser extension" (瀏覽器擴充功能), not "Chrome extension": it also runs in Edge and Brave.

**Name** (from `_locales`, at most 75 characters)

| Language | Name | Length |
|---|---|---|
| zh_TW | MultiList for TradingView：分組不限的觀察清單 | 35 |
| en | MultiList for TradingView | 25 |

**Summary** (from `_locales`, at most 132 characters)

| Language | Summary | Length |
|---|---|---|
| zh_TW | 瀏覽器側邊欄觀察清單：分組數量不限，不受 TradingView 觀察清單的數量限制；同一檔可放進多個板塊觀察資金輪動，點一下就切換圖表。 | 69 |
| en | A side panel watchlist with unlimited groups, free of TradingView watchlist limits. One symbol in many sectors; click to chart it. | 130 |

**Category**: Tools (or the closest productivity category in the dashboard)

**Homepage URL**: https://xingyen0613.github.io/MultiList-for-TradingView/

**Support URL**: https://github.com/xingyen0613/MultiList-for-TradingView/issues

**Description, zh_TW**:

```
看盤時，把常看的標的依板塊、策略或市場分組，放在瀏覽器側邊欄。點一下，TradingView 圖表就切換過去，不用在搜尋框一個一個輸入。

主要功能
• 不受數量限制：分組數量不限，想開幾個就開幾個。清單由 MultiList 保存，不佔 TradingView 觀察清單的數量和檔數。
• 同一檔放進多個板塊：例如台積電同時在「半導體」「AI 概念」「權值股」。比較各板塊個股的漲跌，更容易看出類股輪動與資金流向。
• 一鍵切換圖表：頁面不重新載入，未儲存的變更會保留。
• 用代碼或公司名稱搜尋，中文、英文都可以，例如「台積電」或「Apple」。
• 一鍵匯入現有的觀察清單：每個清單變成一個分頁，每個區段變成一個分組。
• 報價：台股（上市、上櫃）、美股、歐股、韓股（KOSPI、KOSDAQ）、幣安、Bybit、OKX、Bitget、Gate、KuCoin、MEXC 加密貨幣的最新價、漲跌、漲跌幅。
• 用分頁整理，拖曳就能調整順序。
• 同步：在 Chrome 裡透過 Chrome 帳號同步；也可以用 Google 登入，在不同電腦、不同瀏覽器之間同步。
• 匯出、匯入 JSON 檔，用來備份、搬到新電腦或分享給朋友。
• 亮色、暗色，也可以自訂背景與文字顏色。

適用 Chrome、Edge、Brave 等以 Chromium 為核心的桌面瀏覽器。

怎麼使用
1. 按工具列上的 MultiList 圖示，打開側邊欄。
2. 打開 TradingView 圖表頁並登入。
3. 按「一鍵匯入」帶入現有的清單，或按「新增代碼」自己加入。
4. 點一下側邊欄裡的標的，圖表就會切換。

隱私
• 不登入、也不開啟匿名分享時，不會有資料送到我們的伺服器。
• 匿名分享預設關閉，只送代碼和雜湊後的 ID，不含任何名稱。
• 隨時可以在右上角「⋯」選單刪除帳號。

這是獨立的個人專案，與 TradingView 沒有關係，也未獲其授權或背書。
```

**Description, en**:

```
Keep the stocks and coins you follow in your browser's side panel, grouped by sector, strategy or market. Click one, and your TradingView chart switches to it, with no typing in the search box.

Features
• No watchlist limits. Create as many groups as you need. MultiList keeps its own lists, so they do not count against your TradingView watchlist limits.
• One symbol, many sectors. Put TSMC in "Semiconductors", "AI" and "Large caps" at once, and compare sectors to follow sector rotation.
• Click to switch the chart. The page does not reload, so unsaved changes stay.
• Search by ticker or company name, in English or Chinese.
• Import your existing watchlists in one click: each list becomes a tab, and each section becomes a group.
• Last price, change and change % for Taiwan, US, European and Korean stocks (KOSPI, KOSDAQ), and crypto on Binance, Bybit, OKX, Bitget, Gate, KuCoin and MEXC.
• Organize groups in tabs, and drag to reorder.
• Sync through your Chrome account in Chrome. Optional Google sign-in syncs across computers and browsers.
• Export and import a JSON file to back up, move or share a list.
• Light and dark themes, and custom background and text colors.

Works in desktop Chromium browsers, such as Chrome, Edge and Brave.

How to use
1. Click the MultiList icon in the toolbar to open the side panel.
2. Open a TradingView chart and sign in.
3. Press the import button to bring in your lists, or Add symbol to add your own.
4. Click an entry in the side panel to switch the chart.

The interface is in English and Traditional Chinese. It follows your browser language, and you can switch it in the ⋯ menu.

Privacy
• Without sign-in and without anonymous sharing, nothing is sent to our server.
• Anonymous sharing is off by default. It sends only symbols and hashed IDs, never names.
• You can delete your account in the ⋯ menu at any time.

This is an independent project. It is not affiliated with, endorsed by, or connected to TradingView.
```

**Graphics** (made by `node scripts/graphics/build.mjs`):

- Store icon 128×128: `extension/icons/icon-128.png`
- Screenshots 1280×800: `store/graphics/zh-TW/` for zh_TW, `store/graphics/en/` for en
- Small promo tile 440×280: `store/graphics/promo-small-440x280.png`
- Marquee promo tile 1400×560: `store/graphics/promo-marquee-1400x560.png`

## Privacy practices

Each block below is one field on the dashboard's Privacy practices tab. Checked against the code on 2026-11-12 (`background.js`, `sidepanel.js`, `lib/account.js`, `lib/chart-page.js`, `lib/quotes.js`, `lib/store.js`, `lib/upload.js`).

**Single purpose**:

```
MultiList shows the user's own watchlists of market symbols in the browser side panel, with quotes, and switches the open TradingView chart to the symbol the user clicks. Optional Google sign-in keeps the same watchlists in sync between the user's browsers.
```

**alarms**:

```
One repeating alarm (every 4 hours) wakes the background service worker. For a signed-in user, it syncs the watchlists with the user's cloud copy. If the user agreed to anonymous sharing, it sends the anonymous upload when 7 days have passed since the last one. With no sign-in and no consent, the alarm does nothing.
```

**identity**:

```
Used only for the optional Google sign-in. When the user clicks "Sign in with Google", chrome.identity.launchWebAuthFlow opens Google's sign-in page (scopes: openid, email). The sign-in lets MultiList sync the user's watchlists between the user's browsers. All list features work without sign-in, and identity is not used for anything else.
```

**scripting**:

```
Used only on the user's open https://*.tradingview.com/ tabs, and only after a user action:
1. When the user clicks a symbol, it switches the chart through the page's own symbol search, so unsaved indicators on the chart are kept.
2. When the user types in the add-symbol box, it runs TradingView's symbol search from the TradingView tab.
3. When the user presses Import, it reads the user's TradingView watchlists so they can be added to MultiList.
The injected functions are part of the extension package. No remote code is run.
```

**sidePanel**:

```
The whole interface of MultiList is a side panel. The sidePanel permission sets the panel page and opens it when the user clicks the toolbar icon (setPanelBehavior with openPanelOnActionClick).
```

**storage**:

```
chrome.storage.sync keeps the user's watchlists (tabs, groups, symbols) and settings, so they follow the user's browser account. chrome.storage.local keeps data that stays on this device: the sign-in session, the optional Fugle and Alpaca API keys that the user enters, column widths, the last open tab, and the change log for anonymous sharing.
```

**Host permissions** (one field for all sites):

```
- *.tradingview.com: to find the user's open TradingView tabs and run the chart switch, symbol search and watchlist import described under scripting.
- mis.twse.com.tw: quotes for Taiwan stocks.
- api.fugle.tw: Taiwan stock quotes, only if the user enters their own Fugle API key.
- query1.finance.yahoo.com: quotes for US, European and Korean stocks, and US pre-market and after-hours prices.
- data.alpaca.markets: US stock quotes, only if the user enters their own Alpaca API key.
- data-api.binance.vision and fapi.binance.com: quotes for crypto spot pairs and perpetual futures.
- api.bybit.com: Bybit quotes for crypto spot pairs and perpetual futures.
- www.okx.com: OKX quotes for crypto spot pairs and perpetual futures.
- api.bitget.com: Bitget quotes for crypto spot pairs and perpetual futures.
- api.gateio.ws: Gate quotes for crypto spot pairs and perpetual futures.
- api.kucoin.com: KuCoin quotes for crypto spot pairs.
- api.mexc.com and contract.mexc.com: MEXC quotes for crypto spot pairs and perpetual futures.
Quote requests contain only the symbols in the user's list, plus the user's own key for Fugle or Alpaca.
```

**Remote code**: No, I am not using remote code.

**Data usage**: what to check, and why.

| Data type | Check? | Reason |
|---|---|---|
| Personally identifiable information | Yes | Email address, when the user signs in with Google. |
| Authentication information | Yes | The Google sign-in session. The Fugle and Alpaca API keys that the user enters go to those services. |
| User activity | Yes | Symbol add and remove events, only with anonymous sharing. |
| Website content | No | The imported TradingView watchlists stay in the user's list; nothing else from the page is kept. |
| Financial and payment information | No | A watchlist has no transactions, card numbers or account balances. |
| Health, personal communications, location, web history | No | Not collected. |

Certify all three statements: the data is not sold, not used for purposes unrelated to the single purpose, and not used for creditworthiness or lending.

**Privacy policy URL**: https://xingyen0613.github.io/MultiList-for-TradingView/privacy.html (live on GitHub Pages; the footer of the side panel links to this page in English, and to `privacy.zh-TW.html` in Traditional Chinese).

## Test instructions for the review team

```
No account is needed to review the extension. All list features work without sign-in.

Optional: Google sign-in syncs the list between browsers. The sign-in window opens the first time the side panel opens. It also opens from the cloud button at the top of the side panel, or from the ⋯ menu → Sign in with Google. In the window, choose Sign in with Google. Any Google account works. After sign-in, the ⋯ menu shows the signed-in email, and Delete account… deletes the server data.

Symbol search, chart switching and the TradingView import need an open tab on https://www.tradingview.com/chart/. The import also needs a TradingView account with at least one watchlist.

The interface follows the browser language: English, or Traditional Chinese for a Chinese browser. To change it, open the ⋯ menu and pick English or 繁體中文 under Language.
```

## Distribution

- Visibility: Public
- Regions: All regions
- Price: Free
