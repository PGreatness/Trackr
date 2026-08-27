type HeaderProps = {
  accountEmail: string
  darkMode: boolean
  onDisconnect: () => void
  onToggleTheme: () => void
}

/**
 * Renders Trackr's global navigation, theme control, and connected-account tools.
 */
export function Header({ accountEmail, darkMode, onDisconnect, onToggleTheme }: HeaderProps) {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Trackr home">
        <img className="brand-logo" src="/trackr-logo.png" alt="" width="32" height="32" />
        Trackr
      </a>
      <div className="header-actions">
        <button
          className="theme-toggle"
          type="button"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={darkMode}
          onClick={onToggleTheme}
        >
          <span aria-hidden="true">{darkMode ? '☀' : '☾'}</span>
          {darkMode ? 'Light' : 'Dark'}
        </button>
        {accountEmail && (
          <div className="account">
            <span className="account-dot" aria-hidden="true" />
            <span>{accountEmail}</span>
            <button type="button" onClick={onDisconnect}>Disconnect</button>
          </div>
        )}
      </div>
    </header>
  )
}
