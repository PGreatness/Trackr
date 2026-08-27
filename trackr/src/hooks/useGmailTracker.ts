import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GMAIL_SCOPE, GOOGLE_CLIENT_ID, STATUS_CONFIG } from '../config'
import { formatEmail, gmailFetch, listCandidateIds } from '../lib/gmail'
import type {
  Email,
  CustomDateRange,
  GmailMessage,
  JobStatus,
  RangeKey,
  ScanProgress,
  TokenClient,
} from '../types'

const SESSION_KEY = 'trackr:gmail-session'
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000
const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000

type PersistedSession = {
  accountEmail: string
  accessToken: string | null
  accessTokenExpiresAt: number
  sessionExpiresAt: number
  emails: Email[]
  dateRange: RangeKey
  customDateRange: CustomDateRange
  isTruncated: boolean
}

/** Formats a local date as the `YYYY-MM-DD` value used by HTML date inputs. */
function formatInputDate(date: Date) {
  // Read local fields instead of `toISOString` to avoid timezone-driven day changes.
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Creates the initial custom range spanning the previous three months. */
function getDefaultCustomRange(): CustomDateRange {
  // Compute at hook initialization so long-running builds do not bake in stale dates.
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 3)
  return { start: formatInputDate(start), end: formatInputDate(end) }
}

/** Validates that both custom dates exist and are in chronological order. */
function isValidCustomRange(range: CustomDateRange) {
  // Lexicographic comparison is valid because both values use zero-padded ISO dates.
  return Boolean(range.start && range.end && range.start <= range.end)
}

/**
 * Restores valid manual status corrections for one account from this tab.
 * Malformed or unavailable browser storage is treated as an empty collection.
 */
function readSavedOverrides(accountEmail: string) {
  try {
    // Namespace corrections by account so switching Google identities cannot mix statuses.
    const saved = sessionStorage.getItem(`trackr-status:${accountEmail}`)
    if (!saved) return {}
    const parsed = JSON.parse(saved) as Record<string, unknown>
    // Ignore unknown values written by stale builds or malformed browser extensions.
    return Object.fromEntries(Object.entries(parsed).filter(([, status]) =>
      status === 'applied' || status === 'interview' || status === 'denied',
    )) as Record<string, JobStatus>
  } catch {
    return {}
  }
}

/**
 * Restores an unexpired tab session and discards expired or malformed state.
 * An expired access token is removed without discarding cached email previews.
 */
function readPersistedSession(): PersistedSession | null {
  try {
    // Session storage survives reloads in this tab but is cleared when the tab closes.
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (!saved) return null
    const session = JSON.parse(saved) as PersistedSession
    if (!session.accountEmail || !session.sessionExpiresAt || session.sessionExpiresAt <= Date.now()) {
      // Delete expired data immediately rather than allowing a signed-in-looking stale board.
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return {
      ...session,
      // Cached emails remain visible after token expiry, but Gmail calls require renewal.
      accessToken: session.accessTokenExpiresAt > Date.now() ? session.accessToken : null,
      emails: Array.isArray(session.emails) ? session.emails : [],
      dateRange: session.dateRange ?? '1y',
      customDateRange: session.customDateRange ?? getDefaultCustomRange(),
      isTruncated: Boolean(session.isTruncated),
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

/**
 * Owns Google authorization, Gmail scanning, classification state, tab-scoped
 * persistence, automatic refresh, manual corrections, and disconnect behavior.
 */
export function useGmailTracker() {
  // Read persistence once; subsequent state changes are written by the persistence effect.
  const [initialSession] = useState(readPersistedSession)
  const tokenClient = useRef<TokenClient | null>(null)
  const accessToken = useRef<string | null>(initialSession?.accessToken ?? null)
  const accessTokenExpiresAt = useRef(initialSession?.accessTokenExpiresAt ?? 0)
  const sessionExpiresAt = useRef(initialSession?.sessionExpiresAt ?? 0)
  const pendingScan = useRef<{ range: RangeKey; customRange: CustomDateRange } | null>(null)
  const requestVersion = useRef(0)
  const [isGoogleReady, setIsGoogleReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ loaded: 0, total: 0 })
  const [emails, setEmails] = useState<Email[]>(initialSession?.emails ?? [])
  const [overrides, setOverrides] = useState<Record<string, JobStatus>>(() => (
    initialSession ? readSavedOverrides(initialSession.accountEmail) : {}
  ))
  const [accountEmail, setAccountEmail] = useState(initialSession?.accountEmail ?? '')
  const [dateRange, setDateRange] = useState<RangeKey>(initialSession?.dateRange ?? '1y')
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>(
    initialSession?.customDateRange ?? getDefaultCustomRange,
  )
  const [isTruncated, setIsTruncated] = useState(initialSession?.isTruncated ?? false)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accountEmail || !sessionExpiresAt.current) return
    // Store the complete board so a page refresh never performs an immediate rescan.
    const session: PersistedSession = {
      accountEmail,
      accessToken: accessToken.current,
      accessTokenExpiresAt: accessTokenExpiresAt.current,
      sessionExpiresAt: sessionExpiresAt.current,
      emails,
      dateRange,
      customDateRange,
      isTruncated,
    }
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      // Preserve the connection metadata if a large inbox snapshot exceeds
      // the current tab's storage allowance.
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, emails: [] }))
      } catch {
        // The current in-memory session remains usable if storage is unavailable.
      }
    }
  }, [accountEmail, customDateRange, dateRange, emails, isTruncated])

  useEffect(() => {
    if (!selectedEmail) return
    /** Closes the active email preview when the user presses Escape. */
    const closeOnEscape = (event: KeyboardEvent) => {
      // Ignore every other key so normal modal keyboard interaction remains untouched.
      if (event.key === 'Escape') setSelectedEmail(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedEmail])

  /**
   * Scans one Gmail range in cancellable batches, classifies relevant messages,
   * and replaces the visible board only when this request is still current.
   */
  const loadInbox = useCallback(async (
    token: string,
    range: RangeKey,
    customRange: CustomDateRange,
  ) => {
    // Each new scan invalidates asynchronous work started by an older scan.
    const version = ++requestVersion.current
    setIsLoading(true)
    setError('')
    setScanProgress({ loaded: 0, total: 0 })

    try {
      // Fetch the profile first because account identity namespaces manual corrections.
      const profile = await gmailFetch<{ emailAddress: string }>('/profile', token)
      if (version !== requestVersion.current) return
      setAccountEmail(profile.emailAddress)
      setOverrides(readSavedOverrides(profile.emailAddress))

      const candidateList = await listCandidateIds(token, range, customRange)
      // Re-check after every awaited stage because the user may disconnect meanwhile.
      if (version !== requestVersion.current) return
      setIsTruncated(candidateList.isTruncated)
      setScanProgress({ loaded: 0, total: candidateList.ids.length })

      const relevant: Email[] = []
      // Moderate concurrency reduces scan time without flooding Gmail with 1,500 requests.
      const batchSize = 15
      for (let index = 0; index < candidateList.ids.length; index += batchSize) {
        const batchIds = candidateList.ids.slice(index, index + batchSize)
        const messages = await Promise.all(batchIds.map((id) =>
          gmailFetch<GmailMessage>(`/messages/${id}?format=full`, token),
        ))
        if (version !== requestVersion.current) return
        // `formatEmail` also removes candidates that do not pass classification.
        relevant.push(...messages.map(formatEmail).filter((email): email is Email => Boolean(email)))
        setScanProgress({
          loaded: Math.min(index + batchSize, candidateList.ids.length),
          total: candidateList.ids.length,
        })
      }

      // Newest-first ordering is shared by all three columns.
      relevant.sort((first, second) => second.timestamp - first.timestamp)
      setEmails(relevant)
    } catch (requestError) {
      if (version !== requestVersion.current) return
      setError(requestError instanceof Error ? requestError.message : 'We could not scan your inbox.')
    } finally {
      if (version === requestVersion.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    const clientId = GOOGLE_CLIENT_ID
    /** Initializes the Google Identity Services token client once its script loads. */
    const initializeGoogle = () => {
      // The GIS script is loaded asynchronously in `index.html` and may not exist yet.
      if (!window.google) return false
      tokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_SCOPE,
        callback: async (response) => {
          // OAuth errors never clear cached email content; the user can retry explicitly.
          if (response.error || !response.access_token) {
            setError(response.error_description || 'Google sign-in was not completed.')
            setIsLoading(false)
            return
          }
          accessToken.current = response.access_token
          // Respect Google's actual token lifetime rather than assuming the Trackr session lifetime.
          accessTokenExpiresAt.current = Date.now() + (response.expires_in ?? 3600) * 1000
          if (!sessionExpiresAt.current || sessionExpiresAt.current <= Date.now()) {
            sessionExpiresAt.current = Date.now() + SESSION_LIFETIME_MS
          }
          const requestedScan = pendingScan.current
          // A range selected before renewal must win over values captured by the callback closure.
          pendingScan.current = null
          await loadInbox(
            response.access_token,
            requestedScan?.range ?? dateRange,
            requestedScan?.customRange ?? customDateRange,
          )
        },
        error_callback: () => {
          setError('The Google sign-in window was closed or could not open.')
          setIsLoading(false)
        },
      })
      setIsGoogleReady(true)
      return true
    }

    if (initializeGoogle()) return
    // Poll briefly because the third-party script has no React-aware load event.
    const interval = window.setInterval(() => {
      if (initializeGoogle()) window.clearInterval(interval)
    }, 200)
    const timeout = window.setTimeout(() => window.clearInterval(interval), 10000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [customDateRange, dateRange, loadInbox])

  useEffect(() => {
    if (!accountEmail) return
    // The first tick occurs after 15 minutes; restoring a page never triggers a scan.
    const interval = window.setInterval(() => {
      if (
        !isLoading
        && accessToken.current
        && accessTokenExpiresAt.current > Date.now()
      ) {
        // Expired tokens are not renewed in the background because GIS requires user intent.
        void loadInbox(accessToken.current, dateRange, customDateRange)
      }
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [accountEmail, customDateRange, dateRange, isLoading, loadInbox])

  const groupedEmails = useMemo(() => Object.fromEntries(
    STATUS_CONFIG.map(({ id }) => [
      id,
      emails.filter((email) => (overrides[email.id] ?? email.autoStatus) === id),
    ]),
  ) as Record<JobStatus, Email[]>, [emails, overrides])

  /** Starts initial consent or a lightweight token renewal for a cached account. */
  const signIn = () => {
    setError('')
    setIsLoading(true)
    // Existing grants can renew without forcing the full consent prompt every time.
    tokenClient.current?.requestAccessToken({ prompt: accountEmail ? '' : 'consent' })
  }

  /** Returns the current unexpired token and clears stale token state. */
  const getUsableAccessToken = () => {
    // Track token expiry separately from the longer-lived cached Trackr session.
    if (accessToken.current && accessTokenExpiresAt.current > Date.now()) {
      return accessToken.current
    }
    accessToken.current = null
    return null
  }

  /** Manually rescans the selected range, renewing Google access when necessary. */
  const refreshInbox = async () => {
    // Prevent an invalid custom range from starting OAuth or Gmail network activity.
    if (dateRange === 'custom' && !isValidCustomRange(customDateRange)) {
      setError('Choose a valid start and end date before refreshing.')
      return
    }
    const token = getUsableAccessToken()
    if (token) await loadInbox(token, dateRange, customDateRange)
    else signIn()
  }

  /** Applies a preset lookback range and immediately scans when access is valid. */
  const changeRange = async (range: RangeKey) => {
    // Custom ranges are scanned only after the user confirms both date fields.
    setDateRange(range)
    const token = getUsableAccessToken()
    if (range !== 'custom' && token) {
      await loadInbox(token, range, customDateRange)
    } else if (range !== 'custom') {
      // Remember this exact range because React state may not update before OAuth returns.
      pendingScan.current = { range, customRange: customDateRange }
      signIn()
    }
  }

  /** Validates and scans the user-supplied custom date range. */
  const applyCustomDateRange = async () => {
    // Validate again at the state boundary even though the UI disables invalid submissions.
    if (!isValidCustomRange(customDateRange)) {
      setError('Choose a valid start and end date.')
      return
    }
    const token = getUsableAccessToken()
    if (token) await loadInbox(token, 'custom', customDateRange)
    else {
      // Preserve both dates across the asynchronous token-renewal callback.
      pendingScan.current = { range: 'custom', customRange: customDateRange }
      signIn()
    }
  }

  /** Saves a user's manual classification correction for the current tab session. */
  const moveEmail = (id: string, status: JobStatus) => {
    // Functional state prevents rapid successive moves from overwriting each other.
    setOverrides((current) => {
      const updated = { ...current, [id]: status }
      if (accountEmail) {
        try {
          sessionStorage.setItem(`trackr-status:${accountEmail}`, JSON.stringify(updated))
        } catch {
          // Keep the manual move in memory if browser storage is unavailable.
        }
      }
      return updated
    })
  }

  /** Revokes Google access and clears all Gmail-derived state from this tab. */
  const disconnect = () => {
    // Invalidate in-flight work before revoking credentials or clearing UI state.
    requestVersion.current += 1
    if (accessToken.current && window.google) window.google.accounts.oauth2.revoke(accessToken.current)
    if (accountEmail) sessionStorage.removeItem(`trackr-status:${accountEmail}`)
    accessToken.current = null
    accessTokenExpiresAt.current = 0
    sessionExpiresAt.current = 0
    sessionStorage.removeItem(SESSION_KEY)
    setEmails([])
    setOverrides({})
    setAccountEmail('')
    setSelectedEmail(null)
    setError('')
    setIsLoading(false)
  }

  useEffect(() => {
    if (!sessionExpiresAt.current) return
    // Recompute remaining time after every render so restored sessions keep their original deadline.
    const remaining = sessionExpiresAt.current - Date.now()
    if (remaining <= 0) {
      disconnect()
      return
    }
    const timeout = window.setTimeout(disconnect, remaining)
    return () => window.clearTimeout(timeout)
  })

  return {
    accountEmail,
    applyCustomDateRange,
    changeRange,
    customDateRange,
    dateRange,
    disconnect,
    error,
    groupedEmails,
    isConfigured: Boolean(GOOGLE_CLIENT_ID),
    isGoogleReady,
    isLoading,
    isSignedIn: Boolean(accountEmail),
    isTruncated,
    moveEmail,
    overrides,
    refreshInbox,
    scanProgress,
    selectedEmail,
    setSelectedEmail,
    setCustomDateRange,
    signIn,
  }
}
