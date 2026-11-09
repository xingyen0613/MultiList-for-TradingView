// The words and the page layouts of the store and website images. build.mjs fills them with side
// panel screenshots and takes a screenshot of each page at its exact size.
// Colors come from extension/sidepanel.css; the logo is extension/icons/icon-128.png drawn again
// as SVG, so it stays sharp at large sizes.

export const C = {
  accent: '#2962ff',
  accentDeep: '#1e3fc0',
  text: '#131722',
  muted: '#6a6d78',
  border: '#e0e3eb',
  darkBg: '#131722',
  darkText: '#d1d4dc',
  up: '#089981',
  down: '#f23645',
};

// Same geometry and colors as icon-128.png, on its 128 x 128 grid.
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="48" y="16" width="64" height="64" rx="14" fill="#c9ccd3"/>
  <rect x="32" y="32" width="64" height="64" rx="14" fill="#6a6d78"/>
  <rect x="16" y="48" width="64" height="64" rx="14" fill="#131722"/>
  <rect x="28" y="62" width="40" height="9" rx="4.5" fill="#ffffff"/>
  <rect x="28" y="76" width="26" height="9" rx="4.5" fill="#ffffff"/>
  <rect x="28" y="90" width="34" height="9" rx="4.5" fill="#ffffff"/>
</svg>`;

const logoImg = (size) => `<img class="logo" width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString('base64')}" alt="">`;

// The store screenshots: one headline and one supporting line per image. The side panel itself is
// only in Traditional Chinese, so the English set changes only these words.
export const COPY = {
  'zh-TW': {
    lang: 'zh-Hant',
    shots: [
      { title: '分組無限擴充', sub: '<strong>分組想開幾個就開幾個，沒有上限。</strong><br>台股、美股、歐股、韓股、幣安報價，<br>同一個側邊欄看完。' },
      { title: '同一個代碼，<br>放進多個分組', sub: 'NVDA 可以同時在「半導體」和「AI 概念」。<br><strong>同一檔標的放進不同板塊，<br>更容易看出資金在板塊間輪動。</strong>', mark: 'NVDA 在兩個分組' },
      { title: '深色模式', sub: '用分頁把分組歸類，<br>拖曳就能調整順序。' },
      { title: '一鍵匯入<br>TradingView 清單', sub: '每個清單變成一個分頁，區段變成分組。<br>也能匯出成檔案備份。' },
      { title: '背景與文字顏色<br>自己挑', sub: '選了馬上套用，<br>對比不夠時會提醒你。' },
    ],
    tagline: '不限分組數量的側邊欄觀察清單',
    tagline2: '同一個代碼可以放進多個分組',
    markets: ['台股', '美股', '歐股', '韓股', '幣安'],
  },
  en: {
    lang: 'en',
    shots: [
      { title: 'Unlimited groups', sub: '<strong>Add as many groups as you want. No cap.</strong><br>Quotes for Taiwan, US, European and<br>Korean stocks and Binance in one side panel.' },
      { title: 'One symbol,<br>many groups', sub: 'Keep NVDA in both “Semiconductors” and “AI”.<br><strong>Group symbols by sector and<br>follow money rotating between sectors.</strong>', mark: 'NVDA in two groups' },
      { title: 'Dark mode', sub: 'Sort groups into tabs and<br>reorder them by drag and drop.' },
      { title: 'Import your<br>TradingView watchlists', sub: 'Each list becomes a tab and each section a group.<br>Export to a file for backup.' },
      { title: 'Choose background<br>and text colors', sub: 'Changes apply at once,<br>with a contrast check.' },
    ],
    tagline: 'A side panel watchlist with unlimited groups',
    tagline2: 'The same symbol can sit in many groups',
    markets: ['Taiwan', 'US', 'Europe', 'Korea', 'Binance'],
  },
};

const fontStack = (lang) =>
  lang === 'en'
    ? '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", sans-serif'
    : '"PingFang TC", -apple-system, BlinkMacSystemFont, "Microsoft JhengHei", sans-serif';

function page({ lang, width, height, css, body }) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
    body { font-family: ${fontStack(lang)}; -webkit-font-smoothing: antialiased; position: relative; }
    .panel { position: absolute; display: block; border-radius: 14px; }
    ${css}
  </style></head><body>${body}</body></html>`;
}

const brandRow = (dark) => `<div class="brand">
  <span class="tile">${logoImg(30)}</span>
  <span class="brand-name">MultiList <span class="for">for TradingView</span></span>
</div>`;

// A 1280 x 800 store screenshot: words on the left, the side panel on the right.
// shot.panel: { src, width, height } at CSS size. shot.marks: boxes in panel CSS pixels to ring.
export function screenshotPage({ lang, title, sub, dark = false, panel, marks = [], mark = '' }) {
  const W = 1280;
  const H = 800;
  const scale = Math.min(1.06, (H - 72) / panel.height);
  const pw = Math.round(panel.width * scale);
  const ph = Math.round(panel.height * scale);
  const px = W - 120 - pw;
  const py = Math.round((H - ph) / 2);
  const rings = marks
    .map((box) => {
      const pad = 3;
      return `<div class="ring" style="left:${px + (box.x - pad) * scale}px;top:${py + (box.y - pad) * scale}px;width:${(box.width + pad * 2) * scale}px;height:${(box.height + pad * 2) * scale}px"></div>`;
    })
    .join('');
  // The label sits left of the first ring, with a line to each ring.
  let label = '';
  if (marks.length > 0 && mark) {
    const centers = marks.map((box) => py + (box.y + box.height / 2) * scale);
    const top = Math.min(...centers);
    const bottom = Math.max(...centers);
    const mid = (top + bottom) / 2;
    const x = px - 36;
    label = `<div class="bracket" style="left:${x}px;top:${top}px;height:${bottom - top}px"></div>
      <div class="mark-label" style="right:${W - x + 14}px;top:${mid}px">${mark}</div>`;
  }
  const fg = dark ? '#eef1f7' : C.text;
  const subColor = dark ? '#a9afbd' : '#4a4f5c';
  const css = `
    body { background: ${dark ? 'linear-gradient(135deg, #0d1018 0%, #1a2133 100%)' : 'linear-gradient(135deg, #f6f8ff 0%, #e4ecff 100%)'}; }
    .glow { position: absolute; border-radius: 50%; filter: blur(10px); }
    .glow.a { width: 720px; height: 720px; right: -160px; top: -200px; background: radial-gradient(circle, ${dark ? 'rgba(92,138,255,0.22)' : 'rgba(41,98,255,0.14)'} 0%, transparent 65%); }
    .glow.b { width: 560px; height: 560px; left: -200px; bottom: -260px; background: radial-gradient(circle, ${dark ? 'rgba(92,138,255,0.12)' : 'rgba(41,98,255,0.10)'} 0%, transparent 65%); }
    .brand { position: absolute; left: 96px; top: 72px; display: flex; align-items: center; gap: 12px; }
    .tile { width: 44px; height: 44px; border-radius: 11px; background: #ffffff; display: grid; place-items: center; box-shadow: 0 2px 8px rgba(19,23,34,0.12); }
    .brand-name { font-size: 20px; font-weight: 700; color: ${fg}; letter-spacing: 0.2px; }
    .brand-name .for { font-weight: 500; color: ${subColor}; }
    .words { position: absolute; left: 96px; top: 0; bottom: 0; width: ${px - 96 - 60}px; display: flex; flex-direction: column; justify-content: center; }
    h1 { white-space: nowrap; font-size: ${lang === 'en' ? 54 : 58}px; line-height: 1.22; font-weight: 800; color: ${fg}; letter-spacing: ${lang === 'en' ? '-0.5px' : '1px'}; }
    .bar { width: 56px; height: 6px; border-radius: 3px; background: ${dark ? '#5c8aff' : C.accent}; margin: 30px 0 26px; }
    p.sub strong { color: ${dark ? '#5c8aff' : C.accent}; font-weight: 700; }
    p.sub { white-space: nowrap; font-size: ${lang === 'en' ? 24 : 25}px; line-height: 1.6; color: ${subColor}; font-weight: 500; }
    .panel { left: ${px}px; top: ${py}px; width: ${pw}px; height: ${ph}px;
      box-shadow: 0 0 0 1px ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(19,23,34,0.08)'}, 0 30px 70px ${dark ? 'rgba(0,0,0,0.55)' : 'rgba(30,63,192,0.22)'}; }
    .ring { position: absolute; border: 3px solid ${C.accent}; border-radius: 9px; box-shadow: 0 0 0 5px rgba(41,98,255,0.18); }
    .bracket { position: absolute; width: 22px; border: 3px solid ${C.accent}; border-right: none; border-radius: 10px 0 0 10px; }
    .mark-label { position: absolute; transform: translateY(-50%); background: ${C.accent}; color: #fff; font-size: 20px; font-weight: 700; padding: 9px 16px; border-radius: 999px; white-space: nowrap; box-shadow: 0 8px 20px rgba(41,98,255,0.30); }
  `;
  const body = `<div class="glow a"></div><div class="glow b"></div>${brandRow(dark)}
    <div class="words"><h1>${title}</h1><div class="bar"></div><p class="sub">${sub}</p></div>
    <img class="panel" src="${panel.src}" alt="">${rings}${label}`;
  return page({ lang, width: W, height: H, css, body });
}

// Blue tiles share these: a saturated background with the logo stack drawn large and faint.
const blueBackground = (width, height) => `
  body { background: linear-gradient(135deg, #3a6dff 0%, ${C.accent} 45%, ${C.accentDeep} 100%); color: #ffffff; }
  .ghost { position: absolute; border-radius: ${Math.round(height * 0.11)}px; background: rgba(255,255,255,0.07); width: ${Math.round(height * 0.62)}px; height: ${Math.round(height * 0.62)}px; }
  .tile { background: #ffffff; display: grid; place-items: center; box-shadow: 0 10px 30px rgba(10,25,90,0.35); }
`;

const ghosts = (width, height) => {
  const s = Math.round(height * 0.62);
  const step = Math.round(s * 0.25);
  const x = width - s - Math.round(height * 0.02);
  const y = Math.round(height * 0.5);
  return [0, 1, 2].map((i) => `<div class="ghost" style="left:${x - (2 - i) * step}px;top:${y - i * step}px"></div>`).join('');
};

// 440 x 280. The store shows it small, so it has only the logo, the name and one line.
export function promoSmallPage() {
  const css = `${blueBackground(440, 280)}
    .wrap { position: absolute; inset: 0; display: flex; align-items: center; gap: 22px; padding-left: 34px; }
    .tile { width: 104px; height: 104px; border-radius: 24px; flex: none; }
    .name { font-size: 44px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .for { font-size: 20px; font-weight: 600; opacity: 0.85; margin-top: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .tag { font-size: 21px; font-weight: 700; margin-top: 16px; letter-spacing: 1px; }
  `;
  const body = `${ghosts(440, 280)}<div class="wrap"><span class="tile">${logoImg(80)}</span>
    <div><div class="name">MultiList</div><div class="for">for TradingView</div><div class="tag">分組不限的觀察清單</div></div></div>`;
  return page({ lang: 'zh-Hant', width: 440, height: 280, css, body });
}

// The marquee and the social preview: words on the left, the light and dark panels on the right,
// cut off by the bottom edge.
// panelWidth is the width of each panel, overlap how much of it the dark panel shows on the left,
// and big scales the words.
export function heroPage({ lang, width, height, light, dark, copy, panelWidth, overlap, big }) {
  const tile = Math.round(112 * big);
  const pw = panelWidth;
  const ph = Math.round(pw * (light.height / light.width));
  const frontX = width - pw - Math.round(width * 0.06);
  const backX = frontX - Math.round(pw * overlap);
  const top = Math.round(height * 0.13);
  const css = `${blueBackground(width, height)}
    .words { position: absolute; left: ${Math.round(width * 0.068)}px; top: 0; bottom: 0; width: ${backX - Math.round(width * 0.068) - 30}px; display: flex; flex-direction: column; justify-content: center; }
    .tile { width: ${tile}px; height: ${tile}px; border-radius: ${Math.round(tile * 0.23)}px; margin-bottom: ${Math.round(28 * big)}px; }
    .name { font-size: ${Math.round(80 * big)}px; font-weight: 800; letter-spacing: -1px; line-height: 1; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .for { font-size: ${Math.round(32 * big)}px; font-weight: 600; opacity: 0.85; margin-top: ${Math.round(12 * big)}px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .tag { font-size: ${Math.round((lang === 'en' ? 30 : 32) * big)}px; font-weight: 700; margin-top: ${Math.round(34 * big)}px; line-height: 1.4; letter-spacing: ${lang === 'en' ? 0 : 1}px; }
    .tag2 { font-size: ${Math.round((lang === 'en' ? 24 : 25) * big)}px; font-weight: 500; opacity: 0.88; margin-top: ${Math.round(10 * big)}px; line-height: 1.4; }
    .chips { display: flex; gap: 10px; margin-top: ${Math.round(28 * big)}px; flex-wrap: wrap; }
    .chip { font-size: ${Math.round(19 * big)}px; font-weight: 600; padding: 7px 16px; border-radius: 999px; background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.28); }
    .panel { width: ${pw}px; height: ${ph}px; border-radius: 16px; box-shadow: 0 0 0 1px rgba(255,255,255,0.18), 0 30px 80px rgba(8,20,80,0.45); }
    .panel.back { left: ${backX}px; top: ${top + Math.round(height * 0.1)}px; }
    .panel.front { left: ${frontX}px; top: ${top}px; }
  `;
  const body = `${ghosts(width, height)}
    <div class="words"><span class="tile">${logoImg(Math.round(tile * 0.78))}</span>
      <div class="name">MultiList</div><div class="for">for TradingView</div>
      <div class="tag">${copy.tagline}</div><div class="tag2">${copy.tagline2}</div>
      <div class="chips">${copy.markets.map((m) => `<span class="chip">${m}</span>`).join('')}</div></div>
    <img class="panel back" src="${dark.src}" alt=""><img class="panel front" src="${light.src}" alt="">`;
  return page({ lang: copy.lang, width, height, css, body });
}
