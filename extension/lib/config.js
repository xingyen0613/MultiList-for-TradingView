// The MultiList server that receives shared data. Empty means sharing is off, so nothing is sent.
export const SERVER_URL = 'https://multilist-server.xingyen0613.workers.dev';

// The privacy policy shown in the consent dialog and in the settings, in each panel language.
export const PRIVACY_URLS = {
  'zh-TW': 'https://xingyen0613.github.io/MultiList-for-TradingView/privacy.zh-TW.html',
  en: 'https://xingyen0613.github.io/MultiList-for-TradingView/privacy.html',
};

// Google sign-in is optional. It needs both this client ID (a Web application OAuth client whose
// secret stays on the server) and SERVER_URL; while either is empty, every sign-in screen stays hidden.
export const GOOGLE_CLIENT_ID = '709521853163-74plg14aqs02076j36obr1485jb22ovk.apps.googleusercontent.com';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
