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

function formatInputDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDefaultCustomRange(): CustomDateRange {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 3)
  return { start: formatInputDate(start), end: formatInputDate(end) }
}

function isValidCustomRange(range: CustomDateRange) {
  return Boolean(range.start && range.end && range.start <= range.end)
}

function readSavedOverrides(accountEmail: string) {
  try {
    const saved = sessionStorage.getItem(`trackr-status:${accountEmail}`)
    if (!saved) return {}
    const parsed = JSON.parse(saved) as Record<string, unknown>
    return Object.fromEntries(Object.entries(parsed).filter(([, status]) =>
      status === 'applied' || status === 'interview' || status === 'denied',
    )) as Record<string, JobStatus>
  } catch {
    return {}
  }
}

function readPersistedSession(): PersistedSession | null {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (!saved) return null
    const session = JSON.parse(saved) as PersistedSession
    if (!session.accountEmail || !session.sessionExpiresAt || session.sessionExpiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return {
      ...session,
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

export function useGmailTracker() {
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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedEmail(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedEmail])

  const loadInbox = useCallback(async (
    token: string,
    range: RangeKey,
    customRange: CustomDateRange,
  ) => {
    const version = ++requestVersion.current
    setIsLoading(true)
    setError('')
    setScanProgress({ loaded: 0, total: 0 })

    try {
      const profile = await gmailFetch<{ emailAddress: string }>('/profile', token)
      if (version !== requestVersion.current) return
      setAccountEmail(profile.emailAddress)
      setOverrides(readSavedOverrides(profile.emailAddress))

      const candidateList = await listCandidateIds(token, range, customRange)
      if (version !== requestVersion.current) return
      setIsTruncated(candidateList.isTruncated)
      setScanProgress({ loaded: 0, total: candidateList.ids.length })

      const relevant: Email[] = []
      const batchSize = 15
      for (let index = 0; index < candidateList.ids.length; index += batchSize) {
        const batchIds = candidateList.ids.slice(index, index + batchSize)
        const messages = await Promise.all(batchIds.map((id) =>
          gmailFetch<GmailMessage>(`/messages/${id}?format=full`, token),
        ))
        if (version !== requestVersion.current) return
        relevant.push(...messages.map(formatEmail).filter((email): email is Email => Boolean(email)))
        setScanProgress({
          loaded: Math.min(index + batchSize, candidateList.ids.length),
          total: candidateList.ids.length,
        })
      }

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
    const initializeGoogle = () => {
      if (!window.google) return false
      tokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_SCOPE,
        callback: async (response) => {
          if (response.error || !response.access_token) {
            setError(response.error_description || 'Google sign-in was not completed.')
            setIsLoading(false)
            return
          }
          accessToken.current = response.access_token
          accessTokenExpiresAt.current = Date.now() + (response.expires_in ?? 3600) * 1000
          if (!sessionExpiresAt.current || sessionExpiresAt.current <= Date.now()) {
            sessionExpiresAt.current = Date.now() + SESSION_LIFETIME_MS
          }
          const requestedScan = pendingScan.current
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
    const interval = window.setInterval(() => {
      if (
        !isLoading
        && accessToken.current
        && accessTokenExpiresAt.current > Date.now()
      ) {
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

  const signIn = () => {
    setError('')
    setIsLoading(true)
    tokenClient.current?.requestAccessToken({ prompt: accountEmail ? '' : 'consent' })
  }

  const getUsableAccessToken = () => {
    if (accessToken.current && accessTokenExpiresAt.current > Date.now()) {
      return accessToken.current
    }
    accessToken.current = null
    return null
  }

  const refreshInbox = async () => {
    if (dateRange === 'custom' && !isValidCustomRange(customDateRange)) {
      setError('Choose a valid start and end date before refreshing.')
      return
    }
    const token = getUsableAccessToken()
    if (token) await loadInbox(token, dateRange, customDateRange)
    else signIn()
  }

  const changeRange = async (range: RangeKey) => {
    setDateRange(range)
    const token = getUsableAccessToken()
    if (range !== 'custom' && token) {
      await loadInbox(token, range, customDateRange)
    } else if (range !== 'custom') {
      pendingScan.current = { range, customRange: customDateRange }
      signIn()
    }
  }

  const applyCustomDateRange = async () => {
    if (!isValidCustomRange(customDateRange)) {
      setError('Choose a valid start and end date.')
      return
    }
    const token = getUsableAccessToken()
    if (token) await loadInbox(token, 'custom', customDateRange)
    else {
      pendingScan.current = { range: 'custom', customRange: customDateRange }
      signIn()
    }
  }

  const moveEmail = (id: string, status: JobStatus) => {
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

  const disconnect = () => {
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
