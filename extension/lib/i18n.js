// The side panel text in Traditional Chinese and English. chrome.i18n picks its language when
// Chrome starts and cannot change it later, so the panel keeps its own dictionary and switches
// at once. _locales only has the store name and description.
// No chrome API here, so the Node tests use the same code.

export const LANGUAGES = ['zh-TW', 'en'];
// The choice lives in chrome.storage.sync, like the theme. No choice means the browser language.
export const LANGUAGE_KEY = 'language';
// Each language is named in itself, so a reader finds it in either language.
export const LANGUAGE_NAMES = { 'zh-TW': '繁體中文', en: 'English' };

// Until the panel sets a language, the text is Traditional Chinese, the first language of the panel.
let current = 'zh-TW';

// A saved choice wins. Chinese in any script reads Traditional Chinese better than English.
// Any other language, or none, gets English, like default_locale in the manifest.
export function pickLanguage(saved, uiLanguage) {
  if (LANGUAGES.includes(saved)) return saved;
  return /^zh(?:[-_]|$)/i.test(uiLanguage ?? '') ? 'zh-TW' : 'en';
}

export function setLanguage(language) {
  current = LANGUAGES.includes(language) ? language : 'en';
}

export function getLanguage() {
  return current;
}

// "1 group", "2 groups".
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Each entry is [Traditional Chinese, English]. A text fills {name} from the params. An English
// text that changes with a number is a function of the params. An English text that is added after
// another sentence starts with its own space, because Chinese puts no space between sentences.
export const MESSAGES = {
  // The page around the list.
  'app.title': ['觀察清單', 'Watchlist'],
  'topbar.signIn': ['登入以同步觀察清單', 'Sign in to sync your watchlist'],
  'menu.label': ['設定選單', 'Settings menu'],
  'tabs.label': ['分頁', 'Tabs'],
  'column.symbol': ['代碼', 'Symbol'],
  'column.price': ['最新價', 'Last'],
  'column.change': ['漲跌', 'Chg'],
  'column.percent': ['漲跌%', 'Chg%'],
  'column.resize': ['拖曳調整欄寬，按兩下還原預設', 'Drag to resize. Double-click to restore the default.'],
  'columns.button': ['選擇顯示欄位', 'Choose columns'],
  'columns.title': ['顯示欄位', 'Columns'],
  'columns.extended': ['美股盤前盤後', 'US extended hours'],
  'columns.extendedNote': [
    '在美股下方多一行，跟著上面勾選的欄位顯示。其他市場不受影響。',
    'Adds a line under US stocks with the columns above. Other markets stay the same.',
  ],
  'columns.reset': ['還原預設', 'Restore defaults'],
  'columns.failed': ['欄位設定儲存失敗：{message}', 'Could not save the columns: {message}'],
  'session.pre': ['盤前', 'Pre'],
  'session.post': ['盤後', 'Post'],
  'session.lastTrade': ['{session}最後成交 {time}', '{session}: last trade {time}'],
  privacy: ['隱私權政策', 'Privacy policy'],

  // Buttons used in many places.
  cancel: ['取消', 'Cancel'],
  delete: ['刪除', 'Delete'],
  close: ['關閉', 'Close'],
  done: ['完成', 'Done'],
  save: ['儲存', 'Save'],
  import: ['匯入', 'Import'],
  export: ['匯出', 'Export'],
  'message.close': ['關閉訊息', 'Close message'],
  'list.separator': ['、', ', '],
  'list.and': ['、', ' and '],
  'error.separator': ['；', '; '],
  'error.timeout': ['逾時', 'timed out'],

  // Quote sources.
  'market.tw': ['台股', 'Taiwan stocks'],
  'market.us': ['美股', 'US stocks'],
  'market.eu': ['歐股', 'European stocks'],
  'market.kr': ['韓股', 'Korean stocks'],
  'market.crypto': ['幣安現貨', 'Binance Spot'],
  'market.perp': ['幣安合約', 'Binance Perpetual'],
  'market.spot': ['{name} 現貨', '{name} Spot'],
  'market.contract': ['{name} 合約', '{name} Perpetual'],
  'source.title': ['資料來源', 'Data sources'],
  'source.none': ['還沒有報價', 'No quotes yet'],
  'source.error': ['{market}：{errors}', '{market}: {errors}'],
  'status.updated': ['更新於 {time}', 'Updated {time}'],
  'sync.label': ['雲端同步', 'Cloud sync'],
  'sync.ok': ['已同步', 'Synced'],
  'sync.error': ['同步失敗，稍後重試', 'Sync failed. Retrying later.'],
  'save.failed': ['儲存失敗：{message}', 'Could not save: {message}'],

  // Tabs.
  'tab.all': ['全部', 'All'],
  'tab.default': ['分頁一', 'Tab 1'],
  'tab.custom': ['自訂分頁', 'Custom tab'],
  'tab.name': ['分頁名稱', 'Tab name'],
  'tab.newName': ['新分頁名稱', 'New tab name'],
  'tab.saveName': ['儲存名稱', 'Save name'],
  'tab.nameLabel': ['「{tab}」分頁名稱', 'Name of the “{tab}” tab'],
  'tab.nameAllLabel': ['「{tab}」分頁名稱，清空可還原預設', 'Name of the “{tab}” tab. Clear it to restore the default.'],
  'tab.add': ['新增分頁', 'New tab'],
  'tab.rename': ['重新命名「{tab}」分頁', 'Rename the “{tab}” tab'],
  'tab.delete': ['刪除「{tab}」分頁', 'Delete the “{tab}” tab'],
  'tab.deleteConfirm': ['刪除「{tab}」分頁？{keep}', 'Delete the “{tab}” tab?{keep}'],
  'tab.keep': ['裡面的 {parts}會留在「{all}」。', ' Its {parts} will stay in “{all}”.'],
  'tab.groups': ['{count} 個分組', ({ count: n }) => count(n, 'group')],
  'tab.loose': ['{count} 個未分組代碼', ({ count: n }) => count(n, 'ungrouped symbol')],
  'tab.movedTo': ['「{group}」已移到「{tab}」', 'Moved “{group}” to “{tab}”'],
  'tab.movedOut': ['「{group}」已移出「{tab}」', 'Moved “{group}” out of “{tab}”'],

  // Groups and symbols.
  'group.loose': ['未分組', 'Ungrouped'],
  'group.looseInTab': ['{tab} · 未分組', '{tab} · Ungrouped'],
  'group.name': ['分組名稱', 'Group name'],
  'group.newName': ['新分組名稱', 'New group name'],
  'group.newPlaceholder': ['新分組名稱，按 Enter 建立', 'New group name, then press Enter'],
  'group.add': ['新增分組', 'New group'],
  'group.rename': ['重新命名「{name}」', 'Rename “{name}”'],
  'group.delete': ['刪除「{name}」', 'Delete “{name}”'],
  'group.deleteConfirm': ['刪除「{name}」？', 'Delete “{name}”?'],
  'group.empty': ['這個分組還沒有代碼。按 + 新增。', 'No symbols in this group yet. Press + to add one.'],
  'symbol.add': ['新增代碼', 'Add symbol'],
  'symbol.addTo': ['新增代碼到「{group}」', 'Add a symbol to “{group}”'],
  'symbol.remove': ['從「{group}」移除 {ticker}', 'Remove {ticker} from “{group}”'],
  'symbol.exists': ['{ticker} 已經在「{group}」', '{ticker} is already in “{group}”'],

  // Search.
  'search.placeholder': ['代碼或名稱，例如 2330、台積電、AAPL、BTC', 'Symbol or name, e.g. 2330, TSMC, AAPL, BTC'],
  'search.types': ['搜尋類型', 'Search type'],
  'search.all': ['全部', 'All'],
  'search.stocks': ['股票', 'Stocks'],
  'search.funds': ['基金', 'Funds'],
  'search.crypto': ['加密貨幣', 'Crypto'],
  'search.futures': ['期貨', 'Futures'],
  'search.index': ['指數', 'Indices'],
  'search.results': ['搜尋結果', 'Search results'],
  'search.noQuote': ['無報價', 'No quote'],
  'search.none': ['找不到符合的標的', 'No matching symbols'],
  'search.failed': ['搜尋失敗（{error}）', 'Search failed ({error})'],
  'search.noTab': [
    '打開 TradingView 分頁後，就可以用代碼或名稱搜尋。現在可以輸入完整代碼（例如 BINANCE:SUIUSDT）再按 Enter。',
    'Open a TradingView tab to search by symbol or name. For now, type a full symbol (for example BINANCE:SUIUSDT) and press Enter.',
  ],
  'chart.reloaded': [
    '無法在頁面內切換，已改用重新載入，未儲存的圖表變更可能遺失',
    'Could not switch the chart in the page, so the page reloaded. Unsaved chart changes may be lost.',
  ],

  // The kinds of TradingView search results.
  'kind.stock': ['股票', 'Stock'],
  'kind.fund': ['基金', 'Fund'],
  'kind.dr': ['存託憑證', 'DR'],
  'kind.structured': ['結構型商品', 'Structured'],
  'kind.futures': ['期貨', 'Futures'],
  'kind.swap': ['合約', 'Swap'],
  'kind.spot': ['現貨', 'Spot'],
  'kind.index': ['指數', 'Index'],
  'kind.forex': ['外匯', 'Forex'],
  'kind.bond': ['債券', 'Bond'],
  'kind.economic': ['經濟數據', 'Economy'],
  'kind.perpetual': ['永續合約', 'Perpetual'],

  // Looking up a typed symbol.
  'resolve.unsupported': [
    '不支援「{raw}」，請用台股、美股、歐股、韓股或加密貨幣代碼',
    '“{raw}” is not supported. Use a Taiwan, US, European, Korean or crypto symbol.',
  ],
  'resolve.failed': ['查詢 {ticker} 失敗（{message}）', 'Could not look up {ticker} ({message})'],
  'resolve.notFound': ['找不到 {ticker}', '{ticker} not found'],

  // The list is empty.
  'empty.tabTitle': ['「{tab}」還沒有代碼', 'No symbols in “{tab}” yet'],
  'empty.tabText': [
    '按上方的「新增代碼」加入標的，或把其他分頁的分組標題拖到這個分頁上。',
    'Press Add symbol above, or drag a group title from another tab onto this tab.',
  ],
  'empty.title': ['清單還是空的', 'Your watchlist is empty'],
  'empty.textImport': ['從 TradingView 帶入你現有的清單，', 'Bring in your lists from TradingView,'],
  'empty.textAdd': ['或自己加入第一個代碼。', 'or add your first symbol.'],
  'empty.import': ['一鍵匯入 TradingView 清單', 'Import TradingView lists'],
  'empty.add': ['手動新增第一個代碼', 'Add your first symbol'],
  'empty.hint': ['匯入需要先打開並登入 TradingView', 'To import, open TradingView and sign in first'],

  // Import from TradingView.
  'import.title': ['從 TradingView 匯入名單', 'Import lists from TradingView'],
  'import.loading': ['正在讀取 TradingView 名單…', 'Reading your TradingView lists…'],
  'import.progress': ['正在查詢名稱 {done} / {total}…', 'Looking up names {done} / {total}…'],
  'import.hint': ['每個清單會變成一個分頁，清單裡的區段會變成分組。', 'Each list becomes a tab, and its sections become groups.'],
  'import.listInfo': ['{count} 檔 · {groups} 組', ({ count: n, groups }) => `${count(n, 'symbol')} · ${count(groups, 'group')}`],
  'import.done': [
    '已匯入 {tabs} 個分頁、{groups} 個分組、{symbols} 個代碼',
    ({ tabs, groups, symbols }) => `Imported ${count(tabs, 'tab')}, ${count(groups, 'group')} and ${count(symbols, 'symbol')}`,
  ],
  'import.readFailed': ['讀取 TradingView 名單失敗（{error}）', 'Could not read your TradingView lists ({error})'],
  'import.unknown': [
    '看不懂 TradingView 回傳的名單，TradingView 可能已經改版。',
    'TradingView sent the lists in an unknown format. TradingView may have changed.',
  ],
  'import.signedOut': [
    'TradingView 分頁沒有登入。請先登入 TradingView，再按一次匯入。',
    'The TradingView tab is not signed in. Sign in to TradingView, then import again.',
  ],
  'import.empty': ['你的 TradingView 名單都是空的。', 'Your TradingView lists are all empty.'],
  'noTv.title': ['找不到 TradingView 分頁', 'No TradingView tab found'],
  'noTv.body': ['一鍵匯入會從你已登入的 TradingView 分頁讀取清單。', 'The import reads your lists from a TradingView tab where you are signed in.'],
  'noTv.note': ['打開 TradingView 並登入後，再按一次匯入。', 'Open TradingView, sign in, then import again.'],

  // Chrome sync limits.
  'quota.group': [
    '「{group}」有 {count} 個代碼，超過 Chrome 同步的單一分組上限（8 KB）。',
    '“{group}” has {count} symbols, more than the Chrome sync limit for one group (8 KB).',
  ],
  'quota.items': ['匯入後會有 {items} 個同步項目，超過 Chrome 上限 512 個。', 'The import would make {items} sync items, more than the Chrome limit of 512.'],
  'quota.bytes': ['匯入後會用掉 {kb} KB，超過 Chrome 同步上限 100 KB。', 'The import would use {kb} KB, more than the Chrome sync limit of 100 KB.'],
  'advice.tvGroup': ['請在 TradingView 把這個區段拆小，或不要勾選這個清單。', ' Split this section in TradingView, or clear the box of this list.'],
  'advice.tvTotal': ['請少選幾個清單。', ' Select fewer lists.'],
  'advice.fileGroup': ['請先把這個分組拆小再匯出。', ' Split this group before you export it.'],
  'advice.fileTotal': ['請先刪掉一些分組或代碼，或改匯入較小的檔案。', ' Delete some groups or symbols first, or import a smaller file.'],

  // Export and import of a file.
  'export.title': ['匯出觀察清單', 'Export watchlist'],
  'export.scope': ['匯出範圍', 'What to export'],
  'export.all': ['整份清單', 'Whole list'],
  'export.allText': ['所有分頁、分組和代碼', 'All tabs, groups and symbols'],
  'export.tab': ['目前分頁', 'Current tab'],
  'export.tabNamed': ['目前分頁（{tab}）', 'Current tab ({tab})'],
  'export.tabText': ['只有這個分頁裡的分組和代碼', 'Only the groups and symbols in this tab'],
  'export.tabDisabled': ['切到自訂分頁後，才能只匯出一個分頁', 'Switch to a custom tab to export only that tab'],
  'export.note': ['匯出的 JSON 檔可以備份，或分享給別人匯入。', 'Keep the JSON file as a backup, or share it for others to import.'],
  'export.done': ['已匯出 {file}', 'Exported {file}'],
  'importFile.title': ['從檔案匯入', 'Import from file'],
  'importFile.body': ['選一個 MultiList 匯出的 JSON 檔（最大 1 MB）。', 'Choose a JSON file exported from MultiList (1 MB at most).'],
  'importFile.note': ['匯入的內容會加在現有清單後面，不會蓋掉任何東西。', 'The import adds to the end of your list and replaces nothing.'],
  'importFile.choose': ['選擇檔案', 'Choose file'],
  'importFile.nothing': ['檔案裡沒有新的分頁、分組或代碼，清單沒有變動。', 'The file has no new tabs, groups or symbols. Your list did not change.'],
  'importFile.failed': ['匯入失敗：{message}', 'Import failed: {message}'],
  'file.tooLarge': ['檔案超過 1 MB，無法匯入。', 'The file is larger than 1 MB, so it cannot be imported.'],
  'file.notJson': ['這個檔案不是 JSON 格式，無法匯入。', 'This file is not JSON, so it cannot be imported.'],
  'file.notExport': ['這不是 MultiList 匯出的檔案。', 'This file was not exported from MultiList.'],
  'file.version': ['不支援這個檔案的版本（{version}），請先更新 MultiList。', 'This file version ({version}) is not supported. Update MultiList first.'],
  'file.broken': ['檔案內容格式不對（{path}），無法匯入。', 'The file has a wrong format ({path}), so it cannot be imported.'],
  'file.noName': ['有分頁或分組沒有名稱（{path}），無法匯入。', 'A tab or group has no name ({path}), so the file cannot be imported.'],
  'file.longName': ['名稱超過 {max} 個字：「{name}…」，無法匯入。', 'A name is longer than {max} characters: “{name}…”. The file cannot be imported.'],
  'file.badSymbol': ['代碼格式不對：「{id}」，無法匯入。', 'A symbol has a wrong format: “{id}”. The file cannot be imported.'],
  'file.badYahoo': ['代碼「{id}」的 Yahoo 代碼格式不對，無法匯入。', 'The Yahoo ticker of “{id}” has a wrong format. The file cannot be imported.'],
  'file.tooManyTabs': ['檔案裡的分頁超過 {max} 個，無法匯入。', 'The file has more than {max} tabs, so it cannot be imported.'],
  'file.tooManyGroups': ['檔案裡的分組超過 {max} 個，無法匯入。', 'The file has more than {max} groups, so it cannot be imported.'],
  'file.tooManySymbols': ['檔案裡的代碼超過 {max} 個，無法匯入。', 'The file has more than {max} symbols, so it cannot be imported.'],

  // The settings menu.
  'menu.signedIn': ['已登入，清單會自動同步', 'Signed in. Your list syncs automatically.'],
  'menu.expired': ['登入已過期，請重新登入', 'Sign-in expired. Sign in again.'],
  'menu.importTv': ['從 TradingView 一鍵匯入', 'Import from TradingView'],
  'menu.importFile': ['從檔案匯入…', 'Import from file…'],
  'menu.export': ['匯出檔案…', 'Export to file…'],
  'menu.keys': ['報價 API key…', 'Quote API keys…'],
  'menu.colors': ['背景與文字顏色…', 'Background and text colors…'],
  'menu.share': ['匿名分享…', 'Anonymous sharing…'],
  'menu.language': ['語言', 'Language'],
  'menu.signIn': ['用 Google 登入', 'Sign in with Google'],
  'menu.signOut': ['登出', 'Sign out'],
  'menu.deleteAccount': ['刪除帳號…', 'Delete account…'],
  'language.failed': ['語言儲存失敗：{message}', 'Could not save the language: {message}'],

  // Sign-in and the account.
  'signIn.google': ['使用 Google 帳戶登入', 'Sign in with Google'],
  'signIn.close': ['關閉，不登入', 'Close without signing in'],
  'signIn.title': ['同步你的觀察清單', 'Sync your watchlist'],
  'signIn.note': ['登入後可在其他設備或瀏覽器共享觀察清單。', 'Sign in to use your watchlist on other devices and browsers.'],
  'signIn.failed': ['登入失敗，請再試一次', 'Sign-in failed. Try again.'],
  'signInTip.offer': ['登入後你將不會在其他設備或瀏覽器遺失你的觀察清單', 'Sign in to keep your watchlist on your other devices and browsers.'],
  'signInTip.offerNote': ['點一下雲朵就能登入', 'Click the cloud to sign in'],
  'signInTip.expired': ['登入已過期，你的清單暫時不會同步到其他設備或瀏覽器', 'Your sign-in expired. For now, your list does not sync to other devices or browsers.'],
  'signInTip.expiredNote': ['點一下雲朵就能重新登入', 'Click the cloud to sign in again'],
  'deleteAccount.title': ['刪除帳號？', 'Delete your account?'],
  'deleteAccount.body': [
    '雲端上的清單和帳號資料會永久刪除，無法復原。這台電腦上的清單會保留。其他已登入的瀏覽器會被登出。',
    'Your list and account data in the cloud will be deleted permanently. You cannot undo this. The list on this computer stays. Other signed-in browsers will be signed out.',
  ],
  'deleteAccount.confirm': ['刪除帳號', 'Delete account'],
  'deleteAccount.expired': ['登入已過期，請重新登入後再刪除', 'Sign-in expired. Sign in again, then delete.'],
  'deleteAccount.failed': ['刪除失敗，請稍後再試', 'Could not delete. Try again later.'],

  // Two different lists, this computer and the cloud.
  'choice.title': ['這台和雲端的清單不同', 'This computer and the cloud have different lists'],
  'choice.count': ['{groups} 個分組、{symbols} 個代碼', ({ groups, symbols }) => `${count(groups, 'group')}, ${count(symbols, 'symbol')}`],
  'choice.local': ['這台：{count}', 'This computer: {count}'],
  'choice.cloud': ['雲端：{count}{updated}', 'Cloud: {count}{updated}'],
  'choice.updated': ['（更新於 {time}）', ' (updated {time})'],
  'choice.body': [
    '選一份保留，另一份會被取代。用雲端覆蓋這台時，同一個 Chrome 帳號的其他電腦也會跟著改變。',
    'Keep one list. The other one is replaced. If the cloud list replaces this one, other computers on the same Chrome account change too.',
  ],
  'choice.export': ['先匯出這台的清單', 'First export the list on this computer'],
  'choice.useCloud': ['用雲端覆蓋這台', 'Keep the cloud list'],
  'choice.useLocal': ['用這台覆蓋雲端', 'Keep this computer’s list'],

  // Anonymous sharing.
  'consent.title': ['匿名分享觀察清單？', 'Share your watchlist anonymously?'],
  'consent.body': [
    'MultiList 會匿名記錄你的觀察清單，不含任何能認出你的個人資訊。資料只用於 MultiList 的功能開發，例如熱門代碼統計。',
    'MultiList records your watchlist anonymously, with no personal information that can identify you. The data is used only to develop MultiList, for example to count popular symbols.',
  ],
  'consent.note': ['之後可以在右上角「⋯」選單的「匿名分享」更改。', 'You can change this later in Anonymous sharing, in the ⋯ menu at the top right.'],
  'consent.no': ['不同意', 'Decline'],
  'consent.yes': ['同意', 'Agree'],
  'please.title': ['拜託啦～求求了～', 'Pretty please?'],
  'please.no': ['太狠了', 'So cold'],
  'please.noNote': ['還是不要', 'Still no'],
  'please.yes': ['好辣', 'Oh, fine'],
  'please.yesNote': ['同意分享', 'Share'],
  'share.title': ['匿名分享', 'Anonymous sharing'],
  'share.label': ['匿名分享觀察清單', 'Share watchlist anonymously'],
  'share.body': ['MultiList 會匿名記錄你的觀察清單，不含任何能認出你的個人資訊。', 'MultiList records your watchlist anonymously, with no personal information that can identify you.'],
  'share.note': ['關閉後停止上傳，已上傳的資料不會刪除。', 'When it is off, uploads stop. Data already uploaded is not deleted.'],
  'share.failed': ['分享設定儲存失敗：{message}', 'Could not save the sharing setting: {message}'],

  // Quote API keys.
  'keys.title': ['報價 API key', 'Quote API keys'],
  'keys.note': [
    '沒有 key 時，台股用 TWSE MIS，美股用 Yahoo。Key 只存在這台電腦，不會同步。',
    'Without keys, Taiwan stocks use TWSE MIS and US stocks use Yahoo. Keys stay on this computer and do not sync.',
  ],
  'keys.saved': ['已儲存 API key', 'API keys saved'],
  'keys.failed': ['API key 儲存失敗：{message}', 'Could not save the API keys: {message}'],

  // Colors.
  'theme.title': ['背景與文字顏色', 'Background and text colors'],
  'theme.subtitle': ['選了馬上套用，上面的清單就是預覽。', 'A pick applies at once. The list above is the preview.'],
  'theme.presets': ['預設配色', 'Presets'],
  'theme.custom': ['自訂', 'Custom'],
  'theme.customActive': ['自訂（目前使用中）', 'Custom (in use)'],
  'theme.targets': ['要調整的顏色', 'Color to change'],
  'theme.bg': ['背景', 'Background'],
  'theme.text': ['文字', 'Text'],
  'theme.svArea': ['飽和度與亮度', 'Saturation and brightness'],
  'theme.svValue': ['飽和度 {s}%，亮度 {v}%', 'Saturation {s}%, brightness {v}%'],
  'theme.hue': ['色相', 'Hue'],
  'theme.hueValue': ['色相 {h} 度', 'Hue {h} degrees'],
  'theme.hex': ['色碼', 'Hex'],
  'theme.hexLabel': ['{target}色碼', '{target} hex code'],
  'theme.contrast': ['對比 {ratio} : 1，{verdict}', 'Contrast {ratio} : 1, {verdict}'],
  'theme.good': ['看得清楚', 'easy to read'],
  'theme.poor': ['文字可能看不清楚', 'text may be hard to read'],
  'theme.note': ['次要文字和分隔線會跟著自動調整；漲跌的綠色、紅色不變。', 'Secondary text and lines follow automatically. The green and red of price changes stay the same.'],
  'theme.system': ['跟隨系統', 'Use system colors'],
  'theme.failed': ['顏色儲存失敗：{message}', 'Could not save the colors: {message}'],
};

// The text of key in the current language. A missing key shows as itself, and a test checks
// that every key in the code is here.
export function t(key, params = {}) {
  const entry = MESSAGES[key];
  if (!entry) return key;
  const text = entry[current === 'en' ? 1 : 0];
  if (typeof text === 'function') return text(params);
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
