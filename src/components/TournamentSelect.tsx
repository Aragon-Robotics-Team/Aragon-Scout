import type { Tournament } from '../lib/types'

export const ALL = 'all'

export function TournamentSelect({
  tournaments,
  value,
  onChange,
  allowAll = true,
}: {
  tournaments: Tournament[]
  value: string
  onChange(v: string): void
  /** Offer "All tournaments" at the end. */
  allowAll?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Tournament"
      className="h-11 min-w-0 max-w-[45%] shrink rounded-full border border-line bg-surface-2 px-4 text-sm text-ink focus:outline-none"
    >
      {tournaments.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
      {allowAll && <option value={ALL}>All tournaments</option>}
    </select>
  )
}
