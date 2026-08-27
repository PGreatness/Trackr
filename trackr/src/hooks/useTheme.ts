import { useEffect, useState } from 'react'

/**
 * Manages light/dark mode, updates browser chrome, and persists only the theme
 * preference in local storage. The early `theme-init.js` script prevents flash.
 */
export function useTheme() {
  // The head script sets this attribute before React mounts, preventing a light-mode flash.
  const [darkMode, setDarkMode] = useState(
    () => document.documentElement.dataset.theme === 'dark',
  )

  useEffect(() => {
    // Keep CSS variables, browser chrome, and the durable preference synchronized.
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', darkMode ? '#111713' : '#f5f7f3')
    try {
      localStorage.setItem('trackr-theme', darkMode ? 'dark' : 'light')
    } catch {
      // The active theme still works when browser preference storage is blocked.
    }
  }, [darkMode])

  return { darkMode, toggleTheme: () => setDarkMode((current) => !current) }
}
