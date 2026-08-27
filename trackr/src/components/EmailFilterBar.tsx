type EmailFilterBarProps = {
  onChange: (value: string) => void
  totalCount: number
  value: string
  visibleCount: number
}

/**
 * Renders the client-side email search control and the current match count.
 */
export function EmailFilterBar({ onChange, totalCount, value, visibleCount }: EmailFilterBarProps) {
  // This controlled input changes only local board visibility and never triggers Gmail traffic.
  return (
    <div className="filter-bar" role="search">
      <label htmlFor="email-filter">
        <span>Filter emails</span>
        <input
          id="email-filter"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search sender, subject, or content"
          autoComplete="off"
        />
      </label>
      <div className="filter-meta" aria-live="polite">
        <span>{value ? `${visibleCount} of ${totalCount} shown` : `${totalCount} emails`}</span>
        {value && <button type="button" onClick={() => onChange('')}>Clear</button>}
      </div>
    </div>
  )
}
