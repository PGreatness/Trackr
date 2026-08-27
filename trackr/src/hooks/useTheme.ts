import { useEffect, useState } from 'react'

export function useTheme() {
  const [darkMode, setDarkMode] = useState(
    () => document.documentElement.dataset.theme === 'dark',
  )

  useEffect(() => {
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
