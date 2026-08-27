import { STATUS_CONFIG } from '../config'
import type { Email, JobStatus } from '../types'

type EmailPreviewModalProps = {
  email: Email
  onClose: () => void
  onMoveEmail: (id: string, status: JobStatus) => void
  status: JobStatus
}

/**
 * Displays a read-only email body and lets the user correct its job status.
 */
export function EmailPreviewModal({ email, onClose, onMoveEmail, status }: EmailPreviewModalProps) {
  // Paragraphs are rendered as React text nodes; raw email HTML is never injected.
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="email-modal" role="dialog" aria-modal="true" aria-labelledby="email-preview-title">
        <header className="modal-header">
          <div>
            <span className="modal-kicker">Email preview</span>
            <h2 id="email-preview-title">{email.subject}</h2>
            <p>{email.sender} · {email.date}</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Close email preview">×</button>
        </header>
        <div className="modal-toolbar">
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => onMoveEmail(email.id, event.target.value as JobStatus)}>
              {STATUS_CONFIG.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <span>Read-only preview</span>
        </div>
        <div className="modal-body">
          {email.paragraphs.map((paragraph, index) => <p key={`${email.id}-${index}`}>{paragraph}</p>)}
        </div>
      </section>
    </div>
  )
}
