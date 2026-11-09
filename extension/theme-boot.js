// Puts the saved colors on the page before it is drawn, so a custom theme does not flash.
// sidepanel.js saves them here each time it applies a theme.
try {
  const colors = JSON.parse(localStorage.getItem('themeColors'));
  if (colors) {
    document.documentElement.dataset.scheme = colors.scheme;
    for (const [name, value] of Object.entries(colors.vars)) document.documentElement.style.setProperty(name, value);
  }
} catch {
  // No saved colors, or storage is off: the page uses the system colors.
}
