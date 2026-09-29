import type { Tournament } from '../lib/types'

export const ALL = 'all'

export function TournamentSelect({
  tournaments,
  value,
  onChange,
}: {
  tournaments: Tournament[]
  value: string
  onChange(v: string): void
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
      <option value={ALL}>All tournaments</option>
    </select>
  )
}
