/**
 * Applies the saved or operating-system theme before React and its styles load,
 * preventing a light-theme flash during dark-theme page loads.
 */
(() => {
  let savedTheme = null
  try {
    savedTheme = localStorage.getItem('trackr-theme')
  } catch {
    // Fall back to the operating-system preference when storage is unavailable.
  }
  const isDark = savedTheme
    ? savedTheme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#111713' : '#f5f7f3')
})()
