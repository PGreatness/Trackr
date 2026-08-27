import { useMemo, useState } from 'react'
import { MAX_CANDIDATE_EMAILS, RANGE_OPTIONS, STATUS_CONFIG } from '../config'
import type { CustomDateRange, Email, JobStatus, RangeKey, ScanProgress } from '../types'
import { DateRangePicker } from './DateRangePicker'
import { EmailFilterBar } from './EmailFilterBar'

/** Builds a Gmail web URL for the supplied message thread and account. */
function getGmailUrl(accountEmail: string, email: Email) {
  // Prefer the thread so a user responding from Gmail sees the complete conversation.
  const conversationId = email.threadId || email.id
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(accountEmail)}#all/${encodeURIComponent(conversationId)}`
}

type TrackerBoardProps = {
  accountEmail: string
  customDateRange: CustomDateRange
  dateRange: RangeKey
  error: string
  groupedEmails: Record<JobStatus, Email[]>
  isLoading: boolean
  isTruncated: boolean
  onChangeRange: (range: RangeKey) => Promise<void>
  onApplyCustomDateRange: () => Promise<void>
  onChangeCustomDateRange: (range: CustomDateRange) => void
  onMoveEmail: (id: string, status: JobStatus) => void
  onPreviewEmail: (email: Email) => void
  onRefresh: () => Promise<void>
  overrides: Record<string, JobStatus>
  scanProgress: ScanProgress
}

/**
 * Renders range controls, visual filtering, and the three job-status columns.
 * Filtering is local and never causes a Gmail request or page refresh.
 */
export function TrackerBoard({
  accountEmail,
  customDateRange,
  dateRange,
  error,
  groupedEmails,
  isLoading,
  isTruncated,
  onChangeRange,
  onApplyCustomDateRange,
  onChangeCustomDateRange,
  onMoveEmail,
  onPreviewEmail,
  onRefresh,
  overrides,
  scanProgress,
}: TrackerBoardProps) {
  // Filtering is derived from immutable scan results; the original grouped arrays remain intact.
  const [filterQuery, setFilterQuery] = useState('')
  const normalizedQuery = filterQuery.trim().toLocaleLowerCase()
  const filteredEmails = useMemo(() => Object.fromEntries(
    STATUS_CONFIG.map(({ id }) => [
      id,
      groupedEmails[id].filter((email) => {
        if (!normalizedQuery) return true
        const searchableText = [
          email.sender,
          email.subject,
          ...email.paragraphs.slice(0, 30),
        ].join(' ').toLocaleLowerCase()
        return searchableText.includes(normalizedQuery)
      }),
    ]),
  ) as Record<JobStatus, Email[]>, [groupedEmails, normalizedQuery])
  const totalCount = STATUS_CONFIG.reduce((total, { id }) => total + groupedEmails[id].length, 0)
  const visibleCount = STATUS_CONFIG.reduce((total, { id }) => total + filteredEmails[id].length, 0)

  return (
    <section className="tracker" id="top">
      <div className="tracker-heading">
        <div>
          <div className="eyebrow"><span /> Connected to Gmail</div>
          <h1>Your job search</h1>
          <p>Relevant emails are auto-sorted. Preview any message or move it when we get it wrong.</p>
        </div>
        <div className="tracker-controls">
          <label>
            <span>Look back</span>
            <select
              value={dateRange}
              onChange={(event) => void onChangeRange(event.target.value as RangeKey)}
              disabled={isLoading}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button className="refresh-button" type="button" onClick={() => void onRefresh()} disabled={isLoading}>
            {isLoading ? 'Scanning…' : 'Refresh'}
          </button>
        </div>
      </div>

      {dateRange === 'custom' && (
        <DateRangePicker
          disabled={isLoading}
          onApply={onApplyCustomDateRange}
          onChange={onChangeCustomDateRange}
          value={customDateRange}
        />
      )}

      {isLoading && (
        <div className="scan-status" role="status">
          <span className="spinner" aria-hidden="true" />
          <div>
            <strong>Scanning job-search mail</strong>
            <p>
              {scanProgress.total
                ? `${scanProgress.loaded} of ${scanProgress.total} possible matches checked`
                : 'Finding possible matches…'}
            </p>
          </div>
        </div>
      )}
      {error && <p className="notice notice--error board-notice" role="alert">{error}</p>}
      {isTruncated && !isLoading && (
        <p className="board-note">
          Showing results from the newest {MAX_CANDIDATE_EMAILS} possible matches in this time range.
        </p>
      )}

      <EmailFilterBar
        onChange={setFilterQuery}
        totalCount={totalCount}
        value={filterQuery}
        visibleCount={visibleCount}
      />

      <div className="status-board" aria-label="Job application email statuses">
        {STATUS_CONFIG.map((status) => (
          <section className={`status-column status-column--${status.id}`} key={status.id}>
            <header className="column-header">
              <div><span className="status-dot" aria-hidden="true" /><h2>{status.label}</h2></div>
              <span className="count" aria-label={`${filteredEmails[status.id].length} emails`}>
                {filteredEmails[status.id].length}
              </span>
              <p>{status.description}</p>
            </header>
            <div className="column-list">
              {filteredEmails[status.id].map((email) => (
                <article className="job-card" key={email.id}>
                  <button className="card-preview" type="button" onClick={() => onPreviewEmail(email)}>
                    <span className="card-sender">{email.sender}</span>
                    <strong>{email.subject}</strong>
                    <span className="card-snippet">{email.paragraphs[0]}</span>
                    <span className="card-date">{email.date}</span>
                  </button>
                  <div className="card-actions">
                    <label className="move-control">
                      <span>Move to</span>
                      <select
                        value={overrides[email.id] ?? email.autoStatus}
                        onChange={(event) => onMoveEmail(email.id, event.target.value as JobStatus)}
                        aria-label={`Move ${email.subject} to another status`}
                      >
                        {STATUS_CONFIG.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    {status.id === 'interview' && (
                      <a
                        className="gmail-link"
                        href={getGmailUrl(accountEmail, email)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${email.subject} in Gmail`}
                      >
                        Open in Gmail <span aria-hidden="true">↗</span>
                      </a>
                    )}
                  </div>
                </article>
              ))}
              {!isLoading && filteredEmails[status.id].length === 0 && (
                <div className="empty-column">
                  <span aria-hidden="true">+</span>
                  <p>{normalizedQuery ? 'No emails match this search' : 'No matching emails yet'}</p>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
