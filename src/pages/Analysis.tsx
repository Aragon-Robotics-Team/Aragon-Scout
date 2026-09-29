import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../app/data'
import { ALL, TournamentSelect } from '../components/TournamentSelect'
import { Empty, Page, SearchInput, Segmented } from '../components/ui'
import { summarizeTeams, type TeamSummary } from '../lib/grouping'
import { formatNum, formatPct } from '../lib/scoring'

type Sort = 'points' | 'accuracy' | 'matches' | 'team'

const SORTS: Record<Sort, (a: TeamSummary, b: TeamSummary) => number> = {
  points: (a, b) => (b.avgEstPoints ?? -1) - (a.avgEstPoints ?? -1),
  accuracy: (a, b) => (b.overallAccuracy ?? -1) - (a.overallAccuracy ?? -1),
  matches: (a, b) => b.matchesPlayed - a.matchesPlayed,
  team: (a, b) => a.teamNumber - b.teamNumber,
}

export function AnalysisPage() {
  const { reports, tournaments, currentTournamentId, base, loaded } = useData()
  const [picked, setScope] = useState<string | null>(null)
  const scope = picked ?? currentTournamentId ?? ALL
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('points')

  const teams = useMemo(() => {
    const inScope = scope === ALL ? reports : reports.filter((r) => r.tournamentId === scope)
    const q = query.trim().toLowerCase()
    return summarizeTeams(inScope, tournaments)
      .filter((t) => !q || String(t.teamNumber).includes(q) || t.teamName.toLowerCase().includes(q))
      .sort((a, b) => SORTS[sort](a, b) || a.teamNumber - b.teamNumber)
  }, [reports, tournaments, scope, query, sort])

  return (
    <Page title="Tournament analysis">
      <div className="mb-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput value={query} onChange={setQuery} placeholder="Search team # or name" />
        </div>
        <TournamentSelect tournaments={tournaments} value={scope} onChange={setScope} />
      </div>
      <div className="mb-4 flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-xs text-ink-3">Sort</span>
        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'points', label: 'Est. pts' },
            { value: 'accuracy', label: 'Accuracy' },
            { value: 'matches', label: 'Matches' },
            { value: 'team', label: 'Team #' },
          ]}
        />
      </div>

      <h2 className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium">
          {scope === ALL ? 'All tournaments' : (tournaments.find((t) => t.id === scope)?.name ?? 'No tournament')}
        </span>
        <span className="tnum shrink-0 text-xs text-ink-3">
          {teams.length} team{teams.length === 1 ? '' : 's'}
        </span>
      </h2>

      {loaded && teams.length === 0 ? (
        <Empty title={query ? 'No teams found' : 'No teams scouted yet'} />
      ) : (
        <>
          <div className="mb-1.5 grid grid-cols-[1fr_4rem_4rem_4rem] px-4 text-[11px] text-ink-3">
            <span>Team</span>
            <span className="text-right">Matches</span>
            <span className="text-right">Acc.</span>
            <span className="text-right">Est. pts</span>
          </div>
          <ul className="space-y-2">
            {teams.map((t) => (
              <li key={t.teamNumber}>
                <Link
                  to={`${base}/analysis/${t.teamNumber}${scope !== ALL ? `?t=${scope}` : ''}`}
                  className="grid grid-cols-[1fr_4rem_4rem_4rem] items-center rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-ink-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.teamName || `Team ${t.teamNumber}`}</span>
                    <span className="tnum block text-xs text-ink-3">{t.teamNumber}</span>
                  </span>
                  <span className="tnum text-right text-ink-2">{t.matchesPlayed}</span>
                  <span className="tnum text-right text-ink-2">{formatPct(t.overallAccuracy)}</span>
                  <span className="tnum text-right font-semibold">{formatNum(t.avgEstPoints)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  )
}
