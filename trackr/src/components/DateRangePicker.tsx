import type { CustomDateRange } from '../types'

type DateRangePickerProps = {
  disabled: boolean
  onApply: () => Promise<void>
  onChange: (range: CustomDateRange) => void
  value: CustomDateRange
}

/** Returns today's local calendar date in the format required by date inputs. */
function today() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Collects and validates an inclusive custom date range before requesting a scan.
 */
export function DateRangePicker({ disabled, onApply, onChange, value }: DateRangePickerProps) {
  const isInvalid = !value.start || !value.end || value.start > value.end

  return (
    <div className="date-range-picker" aria-label="Custom email date range">
      <label>
        <span>From</span>
        <input
          type="date"
          value={value.start}
          max={value.end || today()}
          onChange={(event) => onChange({ ...value, start: event.target.value })}
          disabled={disabled}
        />
      </label>
      <span className="date-separator" aria-hidden="true">to</span>
      <label>
        <span>Until</span>
        <input
          type="date"
          value={value.end}
          min={value.start}
          max={today()}
          onChange={(event) => onChange({ ...value, end: event.target.value })}
          disabled={disabled}
        />
      </label>
      <button type="button" onClick={() => void onApply()} disabled={disabled || isInvalid}>
        Apply range
      </button>
    </div>
  )
}
