type SignInHeroProps = {
  error: string
  isConfigured: boolean
  isGoogleReady: boolean
  isLoading: boolean
  onSignIn: () => void
}

/**
 * Presents the signed-out landing experience and starts Google authorization.
 */
export function SignInHero({ error, isConfigured, isGoogleReady, isLoading, onSignIn }: SignInHeroProps) {
  return (
    <section className="hero" id="top">
      <div className="eyebrow"><span /> Your job search, sorted</div>
      <h1>Turn your inbox<br />into a pipeline.</h1>
      <p className="hero-copy">
        Connect Gmail and Trackr will organize job-search emails into applications,
        interviews, and decisions - without changing anything in your inbox.
      </p>
      <button type="button" className="google-button" onClick={onSignIn}
        disabled={!isConfigured || !isGoogleReady || isLoading}>
        <span className="google-mark" aria-hidden="true">G</span>
        {isLoading ? 'Opening Google…' : 'Continue with Google'}
      </button>
      {!isConfigured && <p className="notice" role="alert">Add VITE_GOOGLE_CLIENT_ID to enable sign-in.</p>}
      {error && <p className="notice notice--error" role="alert">{error}</p>}
      <div className="privacy-note">
        <span className="lock" aria-hidden="true">◆</span>
        <div><strong>Read-only and local</strong><p>Trackr can't change your mail. Email previews remain in this browser tab and are cleared when you disconnect.</p></div>
      </div>
      <div className="orbit" aria-hidden="true" />
      <div className="floating-card floating-card--one" aria-hidden="true"><b>Applied</b><span /><i /><i /></div>
      <div className="floating-card floating-card--two" aria-hidden="true"><b>Interview</b><span /><i /><i /></div>
    </section>
  )
}
