import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../app/data'
import { ALL, TournamentSelect } from '../components/TournamentSelect'
import { Empty, Page, SearchInput, Segmented } from '../components/ui'
import { useOfficialResults } from '../app/officialResults'
import { summarizeTeams, type TeamSummary } from '../lib/grouping'
import { MIN_MATCHES_PER_TEAM, latestOpr, tournamentOpr, type OprResult } from '../lib/opr'
import { ESTIMATE_NOTE, formatNum, formatPct } from '../lib/scoring'
import { teamNameIndex } from '../lib/teams'

type Sort = 'opr' | 'points' | 'accuracy' | 'matches' | 'team'

/** A team in the list: scouted (with a summary), rated by OPR, or both. */
interface Row {
  teamNumber: number
  teamName: string
  summary?: TeamSummary
  opr?: number
}

const desc = (a: number | null | undefined, b: number | null | undefined) => (b ?? -Infinity) - (a ?? -Infinity)
const SORTS: Record<Sort, (a: Row, b: Row) => number> = {
  opr: (a, b) => desc(a.opr, b.opr),
  points: (a, b) => desc(a.summary?.avgEstPoints, b.summary?.avgEstPoints),
  accuracy: (a, b) => desc(a.summary?.overallAccuracy, b.summary?.overallAccuracy),
  matches: (a, b) => desc(a.summary?.matchesPlayed, b.summary?.matchesPlayed),
  team: (a, b) => a.teamNumber - b.teamNumber,
}

export function AnalysisPage() {
  const { reports, tournaments, currentTournamentId, base, loaded } = useData()
  const [picked, setScope] = useState<string | null>(null)
  const scope = picked ?? currentTournamentId ?? ALL
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('opr')
  const tournament = scope === ALL ? undefined : tournaments.find((t) => t.id === scope)
  const official = useOfficialResults(tournament)

  const opr = useMemo(
    () => (tournament ? tournamentOpr(tournament, reports, tournaments, official.results) : null),
    [tournament, reports, tournaments, official.results],
  )
  const teams = useMemo(() => {
    const inScope = scope === ALL ? reports : reports.filter((r) => r.tournamentId === scope)
    const ratings = opr ? opr.opr : latestOpr(reports, tournaments)
    const names = teamNameIndex(tournaments, reports)
    const rows = new Map<number, Row>()
    for (const summary of summarizeTeams(inScope, tournaments, reports)) {
      rows.set(summary.teamNumber, { teamNumber: summary.teamNumber, teamName: summary.teamName, summary })
    }
    for (const [n, v] of ratings) {
      const row = rows.get(n) ?? { teamNumber: n, teamName: names.get(n) ?? '' }
      rows.set(n, { ...row, opr: v })
    }
    const q = query.trim().toLowerCase()
    return [...rows.values()]
      .filter((t) => !q || String(t.teamNumber).includes(q) || t.teamName.toLowerCase().includes(q))
      .sort((a, b) => SORTS[sort](a, b) || a.teamNumber - b.teamNumber)
  }, [reports, tournaments, scope, query, sort, opr])

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
          className="shrink-0 [&>button]:whitespace-nowrap"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'opr', label: 'OPR' },
            { value: 'points', label: 'Est. pts' },
            { value: 'accuracy', label: 'Accuracy' },
            { value: 'matches', label: 'Matches' },
            { value: 'team', label: 'Team #' },
          ]}
        />
      </div>

      <h2 className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium">{scope === ALL ? 'All tournaments' : (tournament?.name ?? 'No tournament')}</span>
        <span className="tnum shrink-0 text-xs text-ink-3">
          {teams.length} team{teams.length === 1 ? '' : 's'}
        </span>
      </h2>
      <OprStatus opr={opr} official={official} allScope={scope === ALL} />

      {loaded && teams.length === 0 ? (
        <Empty title={query ? 'No teams found' : 'No teams scouted yet'} />
      ) : (
        <>
          <div className="mb-1.5 grid grid-cols-[1fr_3.25rem_3.25rem_3.25rem_3.25rem] px-4 text-[11px] text-ink-3">
            <span>Team</span>
            <span className="text-right">Matches</span>
            <span className="text-right">Acc.</span>
            <span className="text-right">OPR</span>
            <span className="text-right" title={ESTIMATE_NOTE}>Est.*</span>
          </div>
          <ul className="space-y-2">
            {teams.map((t) => (
              <li key={t.teamNumber}>
                <Link
                  to={`${base}/analysis/${t.teamNumber}${scope !== ALL ? `?t=${scope}` : ''}`}
                  className="grid grid-cols-[1fr_3.25rem_3.25rem_3.25rem_3.25rem] items-center rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-ink-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.teamName || `Team ${t.teamNumber}`}</span>
                    <span className="tnum block text-xs text-ink-3">{t.teamNumber}</span>
                  </span>
                  <span className="tnum text-right text-ink-2">{t.summary?.matchesPlayed ?? '—'}</span>
                  <span className="tnum text-right text-ink-2">{t.summary ? formatPct(t.summary.overallAccuracy) : '—'}</span>
                  <span className="tnum text-right font-semibold">{t.opr != null ? formatNum(t.opr) : '—'}</span>
                  <span className="tnum text-right text-ink-2">{t.summary ? formatNum(t.summary.avgEstPoints) : '—'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {teams.length > 0 && <p className="mt-3 text-[11px] text-ink-3">* Est. robot pts. {ESTIMATE_NOTE}</p>}
    </Page>
  )
}

/** Where the OPR numbers come from, and why some are missing. */
function OprStatus({ opr, official, allScope }: { opr: OprResult | null; official: ReturnType<typeof useOfficialResults>; allScope: boolean }) {
  if (allScope) return <p className="mb-3 text-xs text-ink-3">OPR is from each team's latest rated tournament.</p>
  const at = official.fetchedAt ? new Date(official.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
  return (
    <div className="mb-3 space-y-0.5 text-xs text-ink-3">
      <p>
        {!official.hasCode
          ? 'OPR from your recordings only — add the event code to the tournament to use official FTCScout results.'
          : official.results.length > 0
            ? `FTCScout: ${official.results.length} official matches · updated ${at}`
            : official.status === 'error'
              ? "Couldn't reach FTCScout — OPR from your recordings."
              : 'No official results yet — OPR from your recordings.'}
        {official.hasCode && (
          <button type="button" onClick={() => void official.refresh()} disabled={official.status === 'loading'} className="ml-2 text-ink-2 underline underline-offset-2 disabled:opacity-40">
            {official.status === 'loading' ? 'Updating…' : 'Refresh'}
          </button>
        )}
      </p>
      {opr && !opr.enough && <p>Not enough matches for OPR yet ({opr.rows} alliance score{opr.rows === 1 ? '' : 's'}).</p>}
      {opr?.enough && opr.tooFew.size > 0 && <p>{opr.tooFew.size} teams need {MIN_MATCHES_PER_TEAM}+ matches before they're rated.</p>}
    </div>
  )
}
