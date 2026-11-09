# Chrome Web Store listing draft (0.2.0)

Draft text for the Developer Dashboard. Field names follow the dashboard tabs. Check each field against the dashboard before submitting: the dashboard can change its field names.

## Store listing

**Name** (from the manifest): MultiList for TradingView

**Summary** (from the manifest, 88 of 132 characters): A side panel watchlist with unlimited groups. The same symbol can appear in many groups.

**Language**: Chinese (Traditional). The interface is in Traditional Chinese.

**Category**: Tools (or the closest finance or productivity category in the dashboard)

**Homepage URL**: https://github.com/xingyen0613/MultiList-for-TradingView

**Support URL**: https://github.com/xingyen0613/MultiList-for-TradingView/issues

**Description** (Traditional Chinese first, English after):

```
TradingView 使用者的 Chrome 側邊欄觀察清單。分組數量沒有限制，同一個代碼可以放進多個分組。點選代碼，TradingView 圖表就會切換到該代碼。

功能
• 分組數量沒有限制，同一個代碼可以放進多個分組。
• 用代碼或公司名稱（中文或英文）搜尋，結果來自 TradingView 搜尋。
• 一鍵匯入 TradingView 觀察清單：每個清單變成一個分頁，每個區段變成一個分組。
• 顯示台股（上市、上櫃）、美股、歐股、幣安現貨與永續合約的最新價、漲跌、漲跌幅。
• 用分頁整理分組；拖曳調整順序。
• 清單透過 Chrome 帳號同步。可選的 Google 登入，能把清單同步到其他瀏覽器，例如 Edge。
• 匯出與匯入 JSON 檔，用來備份、搬家或分享。

隱私
• 不登入、不開啟匿名分享時，不會有資料送到我們的伺服器。
• 匿名分享預設關閉，只送代碼和雜湊後的 ID，不含任何名稱。
• 隨時可以在設定選單（⋯）裡刪除帳號。

這是獨立的個人專案，與 TradingView 沒有關係，也未獲其授權或背書。

---

A Chrome side panel watchlist for TradingView users. Create as many groups as you need, and put the same symbol in many groups. Click a symbol to switch your TradingView chart to it.

Features
• Unlimited groups. The same symbol can be in many groups.
• Search by ticker or company name. Results come from TradingView search.
• Import your TradingView watchlists in one click: each list becomes a tab, and each section becomes a group.
• Last price, change and change % for Taiwan, US and European stocks, and Binance spot and perpetual markets.
• Organize groups in tabs, and drag to reorder.
• Lists sync through your Chrome account. Optional Google sign-in syncs them to other browsers, such as Edge.
• Export and import a JSON file to back up, move or share a list.

Privacy
• Without sign-in and without anonymous sharing, nothing is sent to our server.
• Anonymous sharing is off by default. It sends only symbols and hashed IDs, never names.
• You can delete your account in the ⋯ menu at any time.

This is an independent project. It is not affiliated with, endorsed by, or connected to TradingView.
```

**Graphics** (to prepare):

- Store icon 128×128: `extension/icons/icon-128.png`
- At least 1 screenshot, 1280×800 or 640×400. The current `docs/screenshot-*.png` files are not this size.
- Small promo tile 440×280

## Privacy practices

**Single purpose**:

```
Show the user's own watchlist of market symbols in Chrome's side panel, with quotes, and switch the TradingView chart to the selected symbol.
```

**Permission justifications**:

| Permission | Justification |
|---|---|
| `sidePanel` | The watchlist is shown in Chrome's side panel. |
| `storage` | Saves the user's groups, tabs and settings, and syncs them through the user's Chrome account. |
| `scripting` | Runs TradingView's own symbol search and chart switch in the user's open TradingView tab, and reads the user's TradingView watchlists when the user presses Import. |
| `alarms` | Wakes the background page every 4 hours to sync the list for signed-in users and to send anonymous sharing data once a week when the user agreed. |
| `identity` | Optional Google sign-in (`chrome.identity.launchWebAuthFlow`) to sync the list between the user's browsers. |
| Host `*.tradingview.com` | Symbol search, chart switch and watchlist import in the user's TradingView tab. |
| Host `mis.twse.com.tw`, `query1.finance.yahoo.com`, `data-api.binance.vision`, `fapi.binance.com`, `api.fugle.tw`, `data.alpaca.markets` | Quote requests for the symbols in the user's list. |

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

**Privacy policy URL**: https://xingyen0613.github.io/MultiList-for-TradingView/privacy.html (needs GitHub Pages; the footer of the side panel links to the Traditional Chinese page `privacy.zh-TW.html`).

## Test instructions for the review team

```
No account is needed to review the extension. All list features work without sign-in.

Optional: Google sign-in syncs the list between browsers. The sign-in window opens the first time the side panel opens. It also opens from the cloud button at the top of the side panel, or from the ⋯ menu → 用 Google 登入 (Sign in with Google). In the window, choose 使用 Google 帳戶登入 (Sign in with a Google account). Any Google account works. After sign-in, the ⋯ menu shows the signed-in email, and 刪除帳號… (Delete account) deletes the server data.

Symbol search, chart switching and the TradingView import need an open tab on https://www.tradingview.com/chart/. The import also needs a TradingView account with at least one watchlist.

The interface is in Traditional Chinese.
```

## Distribution

- Visibility: Public
- Regions: All regions
- Price: Free
