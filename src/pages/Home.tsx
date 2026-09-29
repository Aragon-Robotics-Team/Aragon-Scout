import { Link } from 'react-router-dom'
import { useData } from '../app/data'
import { Page } from '../components/ui'

export function HomePage() {
  const { tournaments, currentTournamentId, reports } = useData()
  const current = tournaments.find((t) => t.id === currentTournamentId)
  const recorded = reports.filter((r) => r.tournamentId === currentTournamentId).length

  return (
    <Page>
      <section className="pt-6 pb-8 text-center">
        <p className="mx-auto max-w-xs text-lg leading-snug text-ink-2">
          Real-time match analysis for the FTC <span className="text-ink">BioBuzz</span> season
        </p>
      </section>

      <Link
        to="/record"
        className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-ink text-lg font-semibold text-bg transition-colors hover:bg-white"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M7.25 5.75 L12.25 9 L7.25 12.25 Z" fill="currentColor" />
        </svg>
        Record a match
      </Link>

      <div className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
        {current ? (
          <span className="min-w-0 truncate text-ink-2">
            <span className="text-ink">{current.name}</span> · {recorded} recording{recorded === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-ink-2">Set up a tournament to start recording</span>
        )}
        <Link to="/tournaments" className="shrink-0 pl-3 text-ink-3 hover:text-ink">
          {current ? 'Change' : 'Set up'}
        </Link>
      </div>

      <ol className="mt-12 space-y-0">
        {[
          ['Start a match.', 'Enter the match and team, then start when the field does.'],
          ['Record.', 'Tap scores, misses and hive tips as they happen.'],
          ['Analyze.', 'Compare teams across the tournament.'],
        ].map(([title, body], i) => (
          <li key={title} className="relative flex gap-4 pb-8 last:pb-0">
            {i < 2 && <span className="absolute top-8 left-[15px] h-[calc(100%-2rem)] w-px bg-line" aria-hidden />}
            <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-sm text-ink-2">
              {i + 1}
            </span>
            <span>
              <span className="block text-[17px] font-medium">{title}</span>
              <span className="block text-sm text-ink-3">{body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-12 grid grid-cols-2 gap-2">
        <Link to="/matches" className="rounded-2xl border border-line bg-surface px-4 py-4 text-sm hover:border-ink-3">
          My matches
        </Link>
        <Link to="/analysis" className="rounded-2xl border border-line bg-surface px-4 py-4 text-sm hover:border-ink-3">
          Tournament analysis
        </Link>
      </div>
    </Page>
  )
}
