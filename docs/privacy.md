[繁體中文](privacy.zh-TW.md) | **English**

# Privacy Policy: MultiList for TradingView

Effective date: [EFFECTIVE_DATE]

MultiList for TradingView ("the extension") is an unofficial tool. It is not affiliated with, endorsed by, or connected to TradingView.

The extension has two optional features that send data to our server: Google sign-in (section 3) and anonymous sharing (section 4). They are separate. If you use neither, no data is sent to our server.

## 1. Data stored in your browser

- Your groups, tabs, and symbols are stored in Chrome's sync storage. They sync with your browser account.
- The date you started using the extension is stored in Chrome's sync storage. It is sent to our server only if you sign in.
- Your sharing choice, the anonymous analytics ID, and the salt for hashing (section 4) are stored in Chrome's sync storage.
- Your API keys are stored only on your device. They are never sent to our servers.
- If you agree to share, the list changes that are not uploaded yet are stored on your device.
- If you sign in, your sign-in session, your email address, and a copy of the list from the last sync are stored on your device. Signing out removes the session and the email address.

## 2. Requests to third-party services

The extension sends these requests directly from your browser. They do not pass through our servers.

Quotes come from:

- TWSE MIS (mis.twse.com.tw)
- Yahoo Finance
- Binance
- Fugle
- Alpaca

These services receive the symbols being looked up. Fugle and Alpaca also receive the API key you entered, because their services require it.

The TradingView website, in your open TradingView tab, receives your search text when you search for a symbol, and the symbol when you switch the chart. When you import TradingView watchlists, the extension reads them with your TradingView sign-in. The imported lists are stored only in your browser.

These services handle that data under their own privacy policies.

## 3. Optional Google sign-in

Sign-in is optional. Without it, the extension works as usual, and your list syncs only through Chrome sync. If you sign in, your list also syncs through our server to your other browsers, such as Chrome and Edge. Before you sign in, the extension tells you that your list and email address will be stored on our server, and links to this policy.

From Google, we receive only your Google account ID and your email address. We do not receive your name, profile photo, password, or any other Google data.

Our server stores:

- Your Google account ID and email address
- Your list: groups, tabs, and symbols, including group names, tab names, symbol names, and display settings such as collapsed groups
- The date you started using the extension, the date your account was created, the time of your last sign-in, and the time of your last sync
- Your sign-in sessions, one for each sign-in. We store only a one-way hash of each session, with the times it was created and last used.

A session ends when you sign out. If our server cannot be reached at that time, the session on the server ends after about one year without use.

We use this data to:

- Sync your list between your browsers.
- Keep you signed in, and show which account you are signed in with.
- Know how long you have used the extension. We may use the dates to give early users benefits in the future.

We do not send you marketing email.

The use of information received from Google APIs complies with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## 4. Optional anonymous sharing

Sharing is off until you press "同意" (Agree) in the extension's consent window, or turn on "匿名分享觀察清單" (anonymous sharing) in the extension's Settings. You can turn it off at any time in the Settings. It does not depend on sign-in: you can use either one, both, or neither.

If you agree, the extension sends:

- A randomly generated anonymous analytics ID
- Each event of adding or removing a symbol (time, symbol, group ID)
- With each upload, the current symbol list of each group (symbols, group ID, and tab ID only)
- The extension version
- Technical fields: a random upload ID and the time period that the upload covers

Details:

- Before upload, group IDs and tab IDs are replaced with a one-way salted hash. The salt is stored in Chrome's sync storage and is never sent to our server.
- Shared data never includes group names, tab names, symbol names, your email address, or your account. Uploads never carry your sign-in session.
- Upload frequency: once when you agree, then about once every 7 days while your browser is open.
- We do not match or merge shared data with account data.

## 5. What we do not collect

- API keys
- Browsing history
- Your name or profile photo
- Passwords
- Without sign-in: your email address, group names, and tab names

We do not store IP addresses.

## 6. How we use the data

- To provide and improve the extension, including aggregated market-trend features, such as popular-symbol statistics, that may be added to the extension later. These statistics use only anonymous shared data.
- We do not sell the data.
- We do not use it for advertising.
- We do not transfer it to third parties, except to our hosting provider (Cloudflare) and where required by law.
- People only look at aggregated, anonymized statistics. People do not read your account data or synced list, except with your permission (for example, to fix a problem you report), for security, or where required by law.

The use of data received from the extension complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## 7. Retention and deletion

**Account data**

- Your account data and synced list are kept until you delete your account.
- Signing out does not delete them.
- To delete them, open Settings (設定), go to Account (帳號), and press "刪除帳號" (Delete account). This deletes your synced list, your sign-in sessions, and your account data at once. It cannot be undone.
- Deleted data can stay in our hosting provider's backups for up to 30 days.
- The list on your device stays. Your other browsers are signed out.
- You can also ask us to delete your account by email (section 11).

**Anonymous shared data**

- Shared data is kept indefinitely.
- Turning sharing off stops future uploads and deletes any records in the extension that have not been sent yet.
- Data that was already sent stays on our side. It is anonymous and not linked to your account, so we cannot find it for a deletion request.

## 8. Where data is stored

Account data, synced lists, and shared data are stored on Cloudflare (Workers and the D1 database). Data is sent over HTTPS. Our server does not log request contents.

## 9. Children

The extension is not directed at children under 13.

## 10. Changes to this policy

When this policy changes, we update the effective date. If we change the types of data we collect, we ask for your consent again before we collect them.

## 11. Contact

xingyen0613@gmail.com
