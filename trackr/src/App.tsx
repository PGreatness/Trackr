import { EmailPreviewModal } from './components/EmailPreviewModal'
import { Header } from './components/Header'
import { SignInHero } from './components/SignInHero'
import { TrackerBoard } from './components/TrackerBoard'
import { useGmailTracker } from './hooks/useGmailTracker'
import { useTheme } from './hooks/useTheme'
import './App.css'

function App() {
  const theme = useTheme()
  const tracker = useGmailTracker()

  return (
    <main className={tracker.isSignedIn ? 'app app--board' : 'app'}>
      <Header
        accountEmail={tracker.accountEmail}
        darkMode={theme.darkMode}
        onDisconnect={tracker.disconnect}
        onToggleTheme={theme.toggleTheme}
      />

      {tracker.isSignedIn ? (
        <TrackerBoard
          accountEmail={tracker.accountEmail}
          customDateRange={tracker.customDateRange}
          dateRange={tracker.dateRange}
          error={tracker.error}
          groupedEmails={tracker.groupedEmails}
          isLoading={tracker.isLoading}
          isTruncated={tracker.isTruncated}
          onApplyCustomDateRange={tracker.applyCustomDateRange}
          onChangeCustomDateRange={tracker.setCustomDateRange}
          onChangeRange={tracker.changeRange}
          onMoveEmail={tracker.moveEmail}
          onPreviewEmail={tracker.setSelectedEmail}
          onRefresh={tracker.refreshInbox}
          overrides={tracker.overrides}
          scanProgress={tracker.scanProgress}
        />
      ) : (
        <SignInHero
          error={tracker.error}
          isConfigured={tracker.isConfigured}
          isGoogleReady={tracker.isGoogleReady}
          isLoading={tracker.isLoading}
          onSignIn={tracker.signIn}
        />
      )}

      <footer>
        <span>Trackr</span>
        <p>Your messages are processed locally in your browser.</p>
        <nav aria-label="Legal">
          <a href="/privacy.html">Privacy</a>
          <a href="/terms.html">Terms</a>
        </nav>
      </footer>

      {tracker.selectedEmail && (
        <EmailPreviewModal
          email={tracker.selectedEmail}
          onClose={() => tracker.setSelectedEmail(null)}
          onMoveEmail={tracker.moveEmail}
          status={tracker.overrides[tracker.selectedEmail.id] ?? tracker.selectedEmail.autoStatus}
        />
      )}
    </main>
  )
}

export default App
