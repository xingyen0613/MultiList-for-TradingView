// The user picks a background and a text color. The other list colors follow them, except the
// green and red of the price changes. The theme lives in chrome.storage.sync, so it follows the
// Chrome account. No theme means the panel follows the system light or dark mode.

export const THEME_KEY = 'theme';

// The two presets are the light and dark colors of the stylesheet.
export const PRESETS = {
  light: { bg: '#ffffff', text: '#131722' },
  dark: { bg: '#131722', text: '#d1d4dc' },
};

const ACCENTS = { light: '#2962ff', dark: '#5c8aff' };
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Returns the color as #rrggbb in lower case, or null. Accepts #rgb and a missing #.
export function parseHex(text) {
  const match = HEX.exec(String(text ?? '').trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`;
}

const channels = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
const toHex = (values) =>
  `#${values.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`;

// weight is the part of a in the result, from 0 to 1.
export function mix(a, b, weight) {
  const other = channels(b);
  return toHex(channels(a).map((value, index) => value * weight + other[index] * (1 - weight)));
}

// The relative luminance and the contrast ratio of WCAG 2.
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// A color is dark when white text on it has more contrast than black text.
export const isDark = (hex) => contrast(hex, '#ffffff') > contrast(hex, '#000000');

export function validTheme(value) {
  return Boolean(value) && parseHex(value.bg) === value.bg && parseHex(value.text) === value.text;
}

export function presetOf(theme) {
  return Object.keys(PRESETS).find((name) => PRESETS[name].bg === theme?.bg && PRESETS[name].text === theme?.text) ?? null;
}

// scheme picks the light or dark stylesheet colors. vars replace the list colors. A preset needs
// no vars, so it looks the same as the system mode.
export function themeColors(theme) {
  const preset = presetOf(theme);
  if (preset) return { scheme: preset, vars: {} };
  const scheme = isDark(theme.bg) ? 'dark' : 'light';
  return {
    scheme,
    vars: {
      '--bg': theme.bg,
      '--text': theme.text,
      '--muted': mix(theme.text, theme.bg, 0.62),
      '--border': mix(theme.text, theme.bg, 0.13),
      '--hover': mix(theme.text, theme.bg, 0.06),
      '--selected': mix(ACCENTS[scheme], theme.bg, 0.14),
    },
  };
}

// Hue from 0 to 360, saturation and value from 0 to 1.
export function hexToHsv(hex) {
  const [r, g, b] = channels(hex).map((value) => value / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }) {
  const part = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex([part(5), part(3), part(1)].map((value) => value * 255));
}
