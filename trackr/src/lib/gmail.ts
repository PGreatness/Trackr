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

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function findHtmlBody(part?: GmailMessagePart): { content: string; isHtml: true } | null {
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

function findBody(part?: GmailMessagePart): { content: string; isHtml: boolean } | null {
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

function toParagraphs(message: GmailMessage) {
  const body = findBody(message.payload)
  let content = body?.content ?? message.snippet ?? 'This message has no readable text content.'
  if (body?.isHtml) {
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

function getHeader(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function formatSender(sender: string) {
  const nameMatch = sender.match(/^([^<]+)</)
  return nameMatch?.[1].trim().replace(/^"|"$/g, '') || sender || 'Unknown sender'
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function hasDefinitiveDenial(text: string) {
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

function hasDefinitiveInterview(text: string) {
  return text
    .split(/[.!?\n]+/)
    .some((sentence) =>
      includesAny(sentence, INTERVIEW_TERMS)
      && !includesAny(sentence, CONDITIONAL_INTERVIEW_MARKERS),
    )
}

function classifyEmail(subject: string, sender: string, paragraphs: string[]): JobStatus | null {
  const text = `${subject}\n${sender}\n${paragraphs.slice(0, 18).join(' ')}`.toLowerCase().slice(0, 30000)
  const hasJobContext = includesAny(text, JOB_CONTEXT_TERMS)
  if (hasDefinitiveDenial(text) && hasJobContext) return 'denied'
  if (hasDefinitiveInterview(text) && hasJobContext) return 'interview'
  if (includesAny(text, APPLIED_TERMS)) return 'applied'
  return null
}

function formatGmailDate(value: string) {
  return value.replaceAll('-', '/')
}

function dayAfter(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + 1))
  return date.toISOString().slice(0, 10)
}

function buildSearchQuery(range: RangeKey, customRange: CustomDateRange) {
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

export async function gmailFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(payload?.error?.message || `Gmail returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export async function listCandidateIds(token: string, range: RangeKey, customRange: CustomDateRange) {
  const ids: string[] = []
  let pageToken = ''
  do {
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

export function formatEmail(message: GmailMessage): Email | null {
  const paragraphs = toParagraphs(message)
  const subject = getHeader(message, 'Subject') || '(No subject)'
  const sender = formatSender(getHeader(message, 'From'))
  const autoStatus = classifyEmail(subject, sender, paragraphs)
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
