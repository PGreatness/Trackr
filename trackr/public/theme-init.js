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
