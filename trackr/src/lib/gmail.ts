import { MAX_CANDIDATE_EMAILS } from '../config'
import type { CustomDateRange, Email, GmailMessage, GmailMessagePart, JobStatus, RangeKey } from '../types'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

const DENIAL_TERMS = [
  'unfortunately', 'not moving forward', 'not be moving forward', 'not to move forward',
  'will not move forward', 'cannot move forward', "can't move forward", 'can’t move forward',
  'unable to move forward', 'not proceeding with', 'will not be proceeding', 'other candidates',
  'not selected', 'not been selected', 'regret to inform', 'no longer under consideration',
  'will not proceed', 'position has been filled', 'decided not to proceed', 'unable to offer',
]

const INTERVIEW_TERMS = [
  'interview invitation', 'invite you to interview', 'schedule an interview', 'interview request',
  'phone screen', 'technical screen', 'onsite interview', 'on-site interview', 'your availability',
  'schedule a call', 'next round', 'next step in the interview', 'meet the team',
  'assessment invitation', 'coding assessment', 'would like to speak with you',
]

const APPLIED_TERMS = [
  'thank you for applying', 'thanks for applying', 'application received',
  'received your application', 'application submitted', 'application confirmation',
  'application for', 'your application', 'thanks for your interest', 'candidate application',
]

const JOB_CONTEXT_TERMS = [
  'job', 'role', 'position', 'career', 'candidate', 'recruiter', 'hiring', 'talent acquisition',
  'application', 'interview', 'resume', 'résumé', 'opportunity',
]

const CONDITIONAL_DENIAL_MARKERS = [
  'if you are not selected', 'if you aren’t selected', "if you aren't selected",
  'if you’re not selected', "if you're not selected", 'if you were not selected',
  'if your application is not selected', 'if your application was not selected',
  'if not selected', 'should you not be selected',
  'in the event you are not selected', 'only candidates selected',
  'only selected candidates', 'candidates who are selected',
  'if you see the job moved', 'if the job moves to an inactive state',
  'if the job is moved to an inactive state', 'that means the position is either',
]

const CONDITIONAL_INTERVIEW_MARKERS = [
  'if your experience', 'if your skills', 'if your qualifications',
  'if you meet the requirements', 'if you meet our requirements',
  'if we determine', 'if we decide', 'if you are selected', 'if selected',
  'should your experience', 'should your skills', 'should your qualifications',
  'will contact you to schedule', 'may contact you to schedule',
  'will be contacted for an interview', 'selected candidates will be contacted',
  'candidates selected for an interview',
]

/** Decodes Gmail's URL-safe base64 message-body representation as UTF-8 text. */
function decodeBase64Url(value: string) {
  // Gmail omits standard base64 characters in favor of URL-safe equivalents.
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Recursively returns the first HTML body found in a MIME message tree. */
function findHtmlBody(part?: GmailMessagePart): { content: string; isHtml: true } | null {
  // Multipart messages can nest several levels, so walk the complete MIME tree.
  if (!part) return null
  if (part.mimeType === 'text/html' && part.body?.data) {
    return { content: decodeBase64Url(part.body.data), isHtml: true }
  }
  for (const child of part.parts ?? []) {
    const result = findHtmlBody(child)
    if (result) return result
  }
  return null
}

/**
 * Recursively prefers a plain-text MIME body and falls back to an HTML body.
 */
function findBody(part?: GmailMessagePart): { content: string; isHtml: boolean } | null {
  // Plain text is safer and usually cleaner, so HTML is used only as a final fallback.
  if (!part) return null
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return { content: decodeBase64Url(part.body.data), isHtml: false }
  }
  for (const child of part.parts ?? []) {
    const result = findBody(child)
    if (result && !result.isHtml) return result
  }
  return findHtmlBody(part)
}

/**
 * Converts a Gmail message body into normalized display paragraphs, stripping
 * executable and styling elements when the source is HTML.
 */
function toParagraphs(message: GmailMessage) {
  // Gmail snippets keep the preview usable when a body part is missing or unsupported.
  const body = findBody(message.payload)
  let content = body?.content ?? message.snippet ?? 'This message has no readable text content.'
  if (body?.isHtml) {
    // Convert untrusted email markup to text without ever mounting it in the application DOM.
    const document = new DOMParser().parseFromString(content, 'text/html')
    document.querySelectorAll('script, style, noscript').forEach((element) => element.remove())
    content = document.body.textContent ?? ''
  }
  const paragraphs = content
    .replace(/\r/g, '')
    .split(/\n\s*\n|\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return paragraphs.length ? paragraphs : ['This message has no readable text content.']
}

/** Looks up a Gmail header case-insensitively and returns an empty fallback. */
function getHeader(message: GmailMessage, name: string) {
  // Header casing is not guaranteed by MIME, so comparisons must be case-insensitive.
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/** Extracts a readable display name from a standard RFC-style sender header. */
function formatSender(sender: string) {
  // Preserve the full address when no human-readable display name is present.
  const nameMatch = sender.match(/^([^<]+)</)
  return nameMatch?.[1].trim().replace(/^"|"$/g, '') || sender || 'Unknown sender'
}

/** Returns whether normalized text contains at least one configured phrase. */
function includesAny(text: string, terms: string[]) {
  // Callers normalize case once before performing repeated phrase checks.
  return terms.some((term) => text.includes(term))
}

/**
 * Detects an actual rejection while excluding conditional phrases such as
 * "if you are not selected" from application confirmations.
 */
function hasDefinitiveDenial(text: string) {
  // Sentence-level checks prevent a real denial elsewhere from being masked by conditional copy.
  return text
    .split(/[.!?\n]+/)
    .some((sentence) => {
      const normalized = sentence.trim()
      return includesAny(normalized, DENIAL_TERMS)
        && !normalized.startsWith('if ')
        && !normalized.startsWith('should ')
        && !includesAny(normalized, CONDITIONAL_DENIAL_MARKERS)
    })
}

/**
 * Detects a concrete interview request while excluding hypothetical next steps.
 */
function hasDefinitiveInterview(text: string) {
  // A hiring-process description is not an invitation unless its sentence is definitive.
  return text
    .split(/[.!?\n]+/)
    .some((sentence) =>
      includesAny(sentence, INTERVIEW_TERMS)
      && !includesAny(sentence, CONDITIONAL_INTERVIEW_MARKERS),
    )
}

/**
 * Classifies a likely job-search email by priority: denial, interview, applied.
 * Returns `null` when the message lacks sufficient job-search evidence.
 */
function classifyEmail(subject: string, sender: string, paragraphs: string[]): JobStatus | null {
  // Limit inspected content to keep classification predictable on extremely long messages.
  const text = `${subject}\n${sender}\n${paragraphs.slice(0, 18).join(' ')}`.toLowerCase().slice(0, 30000)
  const hasJobContext = includesAny(text, JOB_CONTEXT_TERMS)
  // Specific terminal outcomes take priority over generic application acknowledgements.
  if (hasDefinitiveDenial(text) && hasJobContext) return 'denied'
  if (hasDefinitiveInterview(text) && hasJobContext) return 'interview'
  if (includesAny(text, APPLIED_TERMS)) return 'applied'
  return null
}

/** Converts an HTML date value into the slash form accepted by Gmail search. */
function formatGmailDate(value: string) {
  // Gmail search accepts slash-delimited absolute dates independent of display locale.
  return value.replaceAll('-', '/')
}

/** Returns the next UTC date so Gmail's exclusive `before:` filter is inclusive. */
function dayAfter(value: string) {
  // Gmail's `before:` operator is exclusive, so advance one day for an inclusive UI range.
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + 1))
  return date.toISOString().slice(0, 10)
}

/**
 * Builds the Gmail search expression for job-related signals and a lookback range.
 */
function buildSearchQuery(range: RangeKey, customRange: CustomDateRange) {
  // Search broadly in Gmail, then apply stricter content rules locally.
  const jobSignals = [
    'subject:application', 'subject:interview', 'subject:candidate', 'subject:position',
    'subject:role', 'subject:hiring', 'subject:recruiter', 'subject:assessment',
    '"thank you for applying"', '"application status"', '"not moving forward"',
    '"next steps"', '"phone screen"',
  ].join(' ')
  const dateFilter = range === 'all'
    ? ''
    : range === 'custom'
      ? ` after:${formatGmailDate(customRange.start)} before:${formatGmailDate(dayAfter(customRange.end))}`
      : ` newer_than:${range}`
  return `-from:me {${jobSignals}}${dateFilter}`
}

/**
 * Calls an authenticated Gmail API endpoint and converts API failures to errors.
 * @param path Path relative to `/gmail/v1/users/me`.
 * @param token Short-lived Google OAuth bearer token.
 */
export async function gmailFetch<T>(path: string, token: string): Promise<T> {
  // The bearer token is sent only to Google's fixed Gmail API origin.
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    // Prefer Google's diagnostic while retaining a status-based fallback for non-JSON errors.
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(payload?.error?.message || `Gmail returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

/**
 * Pages through possible job-search messages up to `MAX_CANDIDATE_EMAILS`.
 * Returns message IDs plus a flag indicating that newer matches were truncated.
 */
export async function listCandidateIds(token: string, range: RangeKey, customRange: CustomDateRange) {
  // Retain only IDs during pagination to minimize memory before full-message retrieval.
  const ids: string[] = []
  let pageToken = ''
  do {
    // Gmail permits at most 100 list results per request in this scan path.
    const query = new URLSearchParams({ maxResults: '100', q: buildSearchQuery(range, customRange) })
    if (pageToken) query.set('pageToken', pageToken)
    const page = await gmailFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `/messages?${query.toString()}`,
      token,
    )
    ids.push(...(page.messages ?? []).map((message) => message.id))
    pageToken = page.nextPageToken ?? ''
  } while (pageToken && ids.length < MAX_CANDIDATE_EMAILS)
  return { ids: ids.slice(0, MAX_CANDIDATE_EMAILS), isTruncated: Boolean(pageToken) }
}

/**
 * Normalizes and classifies one Gmail message for the UI, or returns `null` when
 * it is not relevant to the job-search tracker.
 */
export function formatEmail(message: GmailMessage): Email | null {
  // Normalize content once so both classification and presentation use identical text.
  const paragraphs = toParagraphs(message)
  const subject = getHeader(message, 'Subject') || '(No subject)'
  const sender = formatSender(getHeader(message, 'From'))
  const autoStatus = classifyEmail(subject, sender, paragraphs)
  // Irrelevant candidates are discarded before they reach React or session storage.
  if (!autoStatus) return null
  const timestamp = Number(message.internalDate)
  return {
    id: message.id,
    threadId: message.threadId ?? message.id,
    sender,
    subject,
    timestamp,
    date: Number.isFinite(timestamp)
      ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp))
      : 'Date unknown',
    paragraphs,
    autoStatus,
  }
}
