# MultiList for TradingView

[English](README.md) | [繁體中文](README.zh-TW.md)

這是給 TradingView 使用者的 Chrome 側邊欄觀察清單。你可以建立任意數量的分組，同一個代碼也可以放進多個分組。點選代碼，TradingView 圖表就會切換到該代碼。

<p>
  <img src="docs/screenshot-all.png" alt="側邊欄：台股、美股、歐股、加密貨幣、ETF 的分組" width="340">
  <img src="docs/screenshot-search-dark.png" alt="深色模式下，用加密貨幣篩選搜尋 sui 的結果" width="340">
</p>

這是獨立的個人專案，與 TradingView 沒有關係。

## 功能

- 分組數量沒有限制，同一個代碼可以放進多個分組，也可以不放進分組。
- 可以用代碼或公司名稱（中文或英文）搜尋。結果來自 TradingView 搜尋，包含所有交易所、現貨、永續合約、期貨。
- 一鍵匯入 TradingView 觀察清單。每個清單變成一個分頁，每個區段變成一個分組。
- 有報價的市場：台股（上市、上櫃）、美股、歐股、韓股（KOSPI、KOSDAQ）、幣安現貨、幣安永續合約。其他標的也可以加入，例如其他交易所、期貨、指數、外匯。這些標的沒有價格，但點選後一樣會切換圖表。
- 「全部」分頁顯示所有分組。新安裝時另外有一個自訂分頁「分頁一」。按分頁列右端的 **+** 可以新增分頁，每個分頁放哪些分組由你決定。自訂分頁只顯示自己的分組，這些分組也會出現在「全部」。不在分組裡的代碼顯示在分組上方。在「全部」，自訂分頁中不在分組裡的代碼會列在該分頁的名稱下。
- 按分頁列右端的鉛筆，可以重新命名目前的分頁。「全部」清空名稱就會還原預設。
- 按自訂分頁上的 ×，可以刪除分頁。× 會顯示在目前的分頁上，滑鼠移到其他分頁時也會顯示。刪除前會跳出確認視窗。分頁裡的分組和不在分組裡的代碼會留在「全部」。
- 把分組標題拖到分頁上，可以把分組移到該分頁。拖到「全部」，就會移出自訂分頁。
- 拖曳欄位標題上的分隔線可以調整欄寬。欄位不能窄於其中最寬的數字。在分隔線上按兩下會還原預設欄寬。欄寬只存在這台電腦。
- 顯示最新價、漲跌、漲跌幅。目前分頁中打開的分組每 30 秒更新一次。
- 點選一列，切換 TradingView 分頁的圖表。
- 拖曳可以調整代碼和分組的順序，也可以把代碼移到其他分組。
- 分組和分頁透過 Chrome 帳號同步。不登入時，不需要伺服器。
- 可選的 Google 登入。登入後，清單也會經過 MultiList 的伺服器同步到其他瀏覽器，例如 Chrome 和 Edge。不登入時，清單照舊只透過 Chrome 同步。
- 兩台電腦都改了清單時，會自動合併。只有第一次登入、兩邊清單不同時，才會詢問要保留哪一份；詢問時可以先匯出這台的清單。
- 匯出與匯入（設定裡的「備份與分享」）。可匯出整份清單或目前分頁，產生 JSON 檔（`multilist-YYYYMMDD.json`）。匯入只會加在現有清單後面，不會蓋掉任何東西。用途是備份、搬到其他電腦、分享給別人。
- 設定裡可以「刪除帳號」。伺服器上的清單和帳號資料會刪除，這台電腦上的清單保留。

## 安裝

1. 下載或 clone 這個 repo。
2. 在 Chrome 打開 `chrome://extensions`。
3. 開啟「開發人員模式」。
4. 按「載入未封裝項目」，選擇 `extension` 資料夾。
5. 把插件釘選到工具列，按圖示打開側邊欄。

插件需要 Chrome 117 以上。

## 使用

1. 按列表最上方的 **新增代碼**。代碼不用先放進分組。要分組時，按 **新增分組**，或分組標題上的 **+**。
2. 輸入代碼或名稱，例如 `2330`、`台積電`、`AAPL`、`BTC`。輸入框下方會列出 TradingView 的搜尋結果。用篩選按鈕可以只看一種，例如加密貨幣。
3. 點選一筆結果，或用 ↑ ↓ 選好後按 Enter。標示「無報價」的結果沒有報價來源，但仍然可以加入。
4. 點選一列，在圖表上打開該代碼。
5. 按 Esc 關閉輸入框。

要登入時，按側邊欄上方的雲朵按鈕，或到設定的「帳號」段落。登入前會先顯示說明，告訴你哪些資料會存到伺服器。匯出與匯入在設定的「備份與分享」。

搜尋需要在 Chrome 開著一個 TradingView 分頁。沒有開時，請輸入完整代碼後按 Enter。可以一次輸入多個，例如 `2330 AAPL IFX BTCUSDT`。純數字代碼會當成台股查詢。其他代碼先查美股，查不到再查歐股。你也可以輸入完整格式，例如 `NYSE:TSM`、`XETR:IFX`、`KRX:005930`、`BINANCE:SUIUSDT.P`。韓股請輸入完整格式，因為純數字代碼會當成台股查詢。

如果歐股和美股的代碼相同，請加上交易所。可以用 TradingView 格式，例如 `XETR:SAP`，或 Yahoo 格式，例如 `SAP.DE`。

以下歐洲交易所有報價：

| 交易所 | TradingView | Yahoo |
| --- | --- | --- |
| Xetra（德國） | `XETR:IFX` | `IFX.DE` |
| 倫敦 | `LSE:IQE` | `IQE.L` |
| Euronext（巴黎、阿姆斯特丹、布魯塞爾、里斯本、都柏林） | `EURONEXT:ASML` | `ASML.AS` |
| 米蘭 | `MIL:ENEL` | `ENEL.MI` |
| 馬德里 | `BME:SAN` | `SAN.MC` |
| 瑞士 SIX | `SIX:NESN` | `NESN.SW` |
| 斯德哥爾摩 | `OMXSTO:SIVE` | `SIVE.ST` |
| 哥本哈根 | `OMXCOP:NOVO_B` | `NOVO-B.CO` |
| 赫爾辛基 | `OMXHEX:NOKIA` | `NOKIA.HE` |
| 奧斯陸 | `OSL:EQNR` | `EQNR.OL` |
| 維也納 | `VIE:OMV` | `OMV.VI` |
| 華沙 | `GPW:PKO` | `PKO.WA` |

## 匯入 TradingView 觀察清單

1. 在 Chrome 打開 TradingView 並登入。
2. 按側邊欄上方的下載箭頭。
3. 勾選要匯入的清單，按「匯入」。

每個清單會變成一個新分頁。清單裡每個 `###` 區段會變成該分頁裡的一個分組。第一個區段之前的代碼，會放進和清單同名的分組。匯入時會查詢台股、美股、歐股、韓股的名稱，所以清單很長時需要幾秒鐘。

Chrome 同步的上限是每個分組 8 KB（約 150 個代碼），全部 100 KB。如果放不下，匯入會在儲存前停止並說明原因，不會只存一半。匯入一律新增分頁，不會更新之前匯入的分頁。

## 資料來源

| 市場 | 有 key 時使用 | 沒有 key 時使用 |
| --- | --- | --- |
| 台股 | [Fugle](https://developer.fugle.tw/docs/pricing) | TWSE MIS |
| 美股 | [Alpaca](https://docs.alpaca.markets/docs/about-market-data-api)（只有 IEX） | Yahoo Finance |
| 歐股 | 無 | Yahoo Finance |
| 韓股 | 無 | Yahoo Finance |
| 加密貨幣 | 不需要 | Binance |
| 幣安永續合約 | 不需要 | Binance 合約 API |

在側邊欄底部的「API key 設定」輸入 key。Key 只存在這台電腦，不會同步。如果有 key 的來源失敗，側邊欄會改用沒有 key 的來源，並顯示錯誤訊息。

TWSE MIS 和 Yahoo Finance 不是有公開文件的 API。它們隨時可能變更或封鎖請求，Yahoo 條款也限制自動化存取。如果你要用有文件的來源，請加上 key。直接輸入的代碼和匯入的代碼，會透過 TWSE MIS 或 Yahoo 查詢交易所和名稱。從搜尋結果加入的歐股，會透過 Yahoo 查詢 Yahoo 代碼。

搜尋和匯入使用 TradingView，請看下面的限制。

## 隱私

- 不登入、也不同意分享時，不會有任何資料送到 MultiList 的伺服器。
- 登入時，伺服器會存你的 Google 帳號編號、Google 信箱、清單（含分組和分頁名稱）、首次使用日期、帳號建立日期。用途是同步清單，資料保留到你刪除帳號為止。
- 「匿名分享觀察清單」是另一個獨立的選項，預設關閉。它送出代碼、加鹽雜湊後的分組和分頁 ID、隨機的分析 ID、插件版本，不含任何名稱，也不會和帳號資料比對或合併。

詳情請看[隱私權政策](docs/privacy.zh-TW.md)。

## 限制

- 雲端同步的清單上限是 600 個分組、每個分組 2000 個代碼、整份 256 KB。實際上會先碰到 Chrome 同步的上限（每項 8 KB、總共 100 KB）。
- 換代碼時，插件使用 TradingView 頁面上的代碼搜尋。頁面不會重新載入，所以未儲存的圖表變更會保留。
- 如果 TradingView 改版這個頁面，插件會改用新代碼重新載入頁面，並在側邊欄顯示提示。重新載入可能遺失未儲存的圖表變更。
- TradingView 免費帳號每張圖仍然只有 2 個指標。
- 搜尋和匯入會從你的 TradingView 分頁呼叫 TradingView 的內部端點。這些端點沒有公開文件，TradingView 隨時可能變更或封鎖。
- TradingView 條款第 12 條禁止透過內部或未公開的端點存取，也禁止散布這樣做的瀏覽器插件。點代碼時，插件也會操作 TradingView 頁面。使用這個專案的風險由你自行承擔。這個專案供個人使用，使用或分享之前請先閱讀條款。
- 匯入在你的 TradingView 分頁裡執行，使用你自己的登入狀態。插件不會讀取你的密碼或 cookie。
- 只能用在 Chromium 系列的電腦版瀏覽器。
- 價格僅供參考，來源可能延遲或有誤。

## 開發

這個專案不需要 build。改完後到 `chrome://extensions` 重新載入插件。

```bash
npm test
```

測試使用 Node.js 內建的 test runner，需要 Node.js 22 以上。

真實瀏覽器測試放在 `e2e/`（`flow`、`cors`、`transfer`、`account`、`sync`、`delete`），用 `node e2e/<名稱>.mjs` 執行。需要有 Chromium 的 `playwright-core`，以及放在 `../MultiList-server` 的 MultiList 後端 repo（也可以用環境變數 `MULTILIST_SERVER_DIR` 指定路徑）。後端是另一個私有 repo，沒有權限的開發者跑不了需要伺服器的測試。

`extension/lib/config.js` 裡的 `SERVER_URL` 和 `GOOGLE_CLIENT_ID` 指向 MultiList 的伺服器和它的 Google OAuth client。E2E 測試會把兩者換成本機的測試值。如果要一個不連任何伺服器的版本，把兩者改成空字串：`SERVER_URL` 是空的時候，不會有任何資料送到 MultiList 的伺服器。只要其中一個是空的，登入畫面就會隱藏。`manifest.json` 裡的 `key` 用來固定插件 ID，因為 OAuth redirect URI 需要固定的 ID。

`npm run package` 會產生上架用的 `dist/multilist-<版本>.zip`。zip 裡的 manifest 沒有 `key`，因為商店會給插件自己的 key。
