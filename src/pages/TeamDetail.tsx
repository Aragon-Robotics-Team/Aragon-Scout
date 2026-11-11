import { useMemo, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useData } from '../app/data'
import { PerMatchChart } from '../components/PerMatchChart'
import { StartPositionButton } from '../components/StartPosition'
import { Card, Empty, IncompleteBadge, Page, Segmented, Stat, cx } from '../components/ui'
import { formatSeconds } from '../lib/cycles'
import { buildTeamDatabase, teamMatches, type MatchRole, type TeamMatch } from '../lib/database'
import { summarizeTeams, type TeamSummary } from '../lib/grouping'
import { latestOpr, savedOfficial, tournamentOpr } from '../lib/opr'
import { AIMING_LABELS, PIT_ALLIANCE, SIZE_LABELS, launcherLabel } from '../lib/pit'
import { matchLabel, matchPath, matchTypeOf } from '../lib/matches'
import { ESTIMATE_NOTE, average, formatNum, formatPct, pointsFor, robotStats, thresholdsFor } from '../lib/scoring'
import type { Answer, PitReport, Tournament } from '../lib/types'

/** Team pages used to live under /analysis/:team; old links and bookmarks land on the new one. */
export function LegacyTeamRedirect() {
  const { team } = useParams()
  const { search } = useLocation()
  const { base } = useData()
  return <Navigate to={`${base}/teams/${team}${search}`} replace />
}

/**
 * Everything scouted about one team: lifetime (or one tournament's) stats, its
 * pit reports, OPR at each tournament, and every recorded match it played in.
 */
export function TeamDetailPage() {
  const { team } = useParams()
  const [params, setParams] = useSearchParams()
  const { reports, tournaments, pitReports, currentTournamentId, base, readOnly, loaded } = useData()
  const teamNumber = Number(team)
  const tid = params.get('t')
  const selected = tournaments.find((t) => t.id === tid)
  const scope = selected && params.get('scope') !== 'all' ? 'tournament' : 'all'
  const tournament = scope === 'tournament' ? selected : undefined

  const entry = useMemo(
    () => buildTeamDatabase(reports, tournaments, pitReports).find((t) => t.teamNumber === teamNumber),
    [reports, tournaments, pitReports, teamNumber],
  )
  const summary = useMemo(() => {
    const inScope = reports.filter((r) => r.pre.teamNumber === teamNumber && (!tournament || r.tournamentId === tournament.id))
    return summarizeTeams(inScope, tournaments, reports)[0]
  }, [reports, tournaments, teamNumber, tournament])
  const matches = useMemo(
    () => teamMatches(teamNumber, tournament ? reports.filter((r) => r.tournamentId === tournament.id) : reports, tournaments),
    [reports, tournaments, teamNumber, tournament],
  )
  const opr = useMemo(
    () => (tournament ? tournamentOpr(tournament, reports, tournaments, savedOfficial(tournament.id)).opr : latestOpr(reports, tournaments)).get(teamNumber),
    [reports, tournaments, tournament, teamNumber],
  )
  const oprByTournament = useMemo(
    () =>
      (entry?.tournamentIds ?? [])
        .map((id) => tournaments.find((t) => t.id === id))
        .filter((t): t is Tournament => !!t)
        .map((t) => ({ tournament: t, opr: tournamentOpr(t, reports, tournaments, savedOfficial(t.id)).opr.get(teamNumber) })),
    [entry, reports, tournaments, teamNumber],
  )

  const setScope = (s: 'tournament' | 'all') => {
    if (!tid) return
    setParams(s === 'all' ? { t: tid, scope: 'all' } : { t: tid }, { replace: true })
  }

  if (!loaded) return <Page>{null}</Page>
  if (!Number.isInteger(teamNumber) || teamNumber <= 0) {
    return (
      <Page title="Team">
        <Empty title="Team not found" />
      </Page>
    )
  }

  const tById = new Map(tournaments.map((t) => [t.id, t]))
  const name = entry?.teamName || summary?.teamName || ''
  // In one tournament's view, that tournament's pit report leads; otherwise the newest.
  const pit = entry?.pit ?? []
  const latestPit = tournament ? pit.find((p) => p.tournamentId === tournament.id) : pit[0]
  const olderPit = pit.filter((p) => p !== latestPit)
  // The pit report to add or edit: the open tournament's, else the current one's.
  const pitTournament = tournament ?? tournaments.find((t) => t.id === currentTournamentId)
  const pitHere = pitTournament && pit.some((p) => p.tournamentId === pitTournament.id)

  return (
    <Page>
      <Link to={`${base}/teams`} className="text-sm text-ink-3 hover:text-ink">
        ← Team database
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{name || `Team ${teamNumber}`}</h1>
          <p className="tnum text-sm text-ink-2">{teamNumber}</p>
          {entry && entry.tournamentIds.length > 0 && (
            <p className="mt-1 text-xs text-ink-3">Scouted at {entry.tournamentIds.map((id) => tById.get(id)?.name).join(' · ')}</p>
          )}
        </div>
        {selected && (
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'tournament', label: selected.name },
              { value: 'all', label: 'All' },
            ]}
          />
        )}
      </div>

      {!readOnly && pitTournament && (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <Link
            to={`/pit/${pitTournament.id}/${teamNumber}`}
            className="inline-flex h-11 min-w-0 items-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium text-ink hover:border-ink-3"
          >
            <span className="truncate">
              {pitHere ? 'Edit' : 'Add'} pit report · {pitTournament.name}
            </span>
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {summary ? (
          <Stats summary={summary} opr={opr} tournament={tournament} />
        ) : (
          <Empty title={tournament ? 'Not recorded in a match at this tournament' : 'Not recorded in a match yet'} />
        )}

        {latestPit && (
          <PitReportCard report={latestPit} title={tournament ? 'Pit report' : 'Latest pit report'} tournamentName={tById.get(latestPit.tournamentId)?.name} />
        )}
        {olderPit.length > 0 && (
          <details className="rounded-2xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {tournament ? 'Other pit reports' : 'Previous pit reports'} <span className="font-normal text-ink-3">({olderPit.length})</span>
            </summary>
            <div className="mt-3 space-y-3">
              {olderPit.map((p) => (
                <PitReportCard key={p.id} report={p} tournamentName={tById.get(p.tournamentId)?.name} nested />
              ))}
            </div>
          </details>
        )}

        {oprByTournament.length > 0 && (
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-medium">OPR by tournament</h2>
            <ul className="divide-y divide-line text-sm">
              {oprByTournament.map(({ tournament: t, opr: v }) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-ink-2">{t.name}</span>
                  <span className={cx('tnum shrink-0', v != null ? 'font-semibold' : 'text-ink-3')}>{v != null ? formatNum(v) : 'not rated'}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <MatchList matches={matches} teamNumber={teamNumber} showTournament={!tournament} tById={tById} />

        {summary && <RecordingNotes summary={summary} />}
      </div>
    </Page>
  )
}

function Stats({ summary, opr, tournament }: { summary: TeamSummary; opr: number | undefined; tournament: Tournament | undefined }) {
  const st = summary.stats
  const full = st.filter((_, i) => !summary.reports[i].incomplete)
  const avg = (f: (s: (typeof st)[number]) => number) => formatNum(average(full.map(f)))
  const thresholds = thresholdsFor(tournament)
  return (
    <>
      <div>
        <h2 className="mb-2 text-sm font-medium text-ink-2">{tournament ? `At ${tournament.name}` : 'Lifetime'}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="OPR" value={opr != null ? formatNum(opr) : '—'} sub={tournament ? 'this tournament' : 'latest tournament'} />
          <Stat label="Est. robot pts*" value={formatNum(summary.avgEstPoints)} sub="avg per match" />
          <Stat label="Cycle time" value={formatSeconds(summary.cycle.median)} sub={`median teleop · ${summary.cycle.count} cycle${summary.cycle.count === 1 ? '' : 's'}`} />
          <Stat label="Alliance tips*" value={formatNum(summary.avgTips)} sub={`avg in their matches · RP at ${thresholds.pollinator1Tips} & ${thresholds.pollinator2Tips}`} />
          <Stat label="Nectar accuracy" value={formatPct(summary.nectarAccuracy)} sub={`${st.reduce((n, s) => n + s.total.nectarScored, 0)} scored`} />
          <Stat label="Pollen accuracy" value={formatPct(summary.pollenAccuracy)} sub={`${st.reduce((n, s) => n + s.total.pollenScored, 0)} scored`} />
          <Stat label="Leave" value={formatPct(summary.leaveRate)} sub="of matches" />
          <Stat label="Parked (auto)" value={formatPct(summary.autoParkRate)} sub="of matches" />
          <Stat label="Parked (teleop)" value={formatPct(summary.teleopParkRate)} sub="of matches" />
          <Stat label="Leave + park" value={formatNum(summary.avgSwarmPoints)} sub={`avg pts · Swarm RP at ${thresholds.swarmPoints}`} />
          <Stat label="Matches scouted" value={summary.matchesPlayed} />
        </div>
        <p className="mt-2 text-[11px] text-ink-3">* {ESTIMATE_NOTE}</p>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">Estimated robot points per match*</h2>
        <PerMatchChart
          bars={summary.reports.map((r, i) => ({
            key: r.id,
            label: matchLabel(matchTypeOf(r.pre), r.pre.matchNumber),
            value: st[i].estPoints,
            tips: st[i].total.tips,
            accuracy: st[i].overallAccuracy,
          }))}
        />
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-medium">Average per match</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-3">
              <th className="pb-1 text-left font-normal" />
              <th className="pb-1 text-right font-normal">Auto</th>
              <th className="pb-1 text-right font-normal">Teleop</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Nectar scored', avg((s) => s.auto.nectarScored), avg((s) => s.teleop.nectarScored)],
              ['Nectar missed', avg((s) => s.auto.nectarMissed), avg((s) => s.teleop.nectarMissed)],
              ['Pollen scored', avg((s) => s.auto.pollenScored), avg((s) => s.teleop.pollenScored)],
              ['Pollen missed', avg((s) => s.auto.pollenMissed), avg((s) => s.teleop.pollenMissed)],
              ['Alliance tips', avg((s) => s.auto.tips), avg((s) => s.teleop.tips)],
            ].map(([label, a, t]) => (
              <tr key={label} className="border-t border-line">
                <th scope="row" className="py-2 text-left font-normal text-ink-2">
                  {label}
                </th>
                <td className="tnum py-2 text-right">{a}</td>
                <td className="tnum py-2 text-right">{t}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function AnswerText({ value }: { value: Answer }) {
  if (value == null) return <span className="text-ink-3">Not asked</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cx('flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white', value ? 'bg-good' : 'bg-red')}>
        {value ? '✓' : '✗'}
      </span>
      {value ? 'Yes' : 'No'}
    </span>
  )
}

function PitRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tnum min-w-0 text-right">{children}</dd>
    </div>
  )
}

const dash = <span className="text-ink-3">—</span>

function PitReportCard({ report: r, title, tournamentName, nested }: { report: PitReport; title?: string; tournamentName?: string; nested?: boolean }) {
  const { readOnly } = useData()
  const notes = (
    [
      ['Strengths and weaknesses', r.strengths],
      ['Improvements from prior competitions', r.improvements],
      ['Extra info', r.extra],
    ] as const
  ).filter(([, text]) => text.trim())
  const body = (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          {title && <h2 className="text-sm font-medium">{title}</h2>}
          <p className={cx('truncate', title ? 'text-xs text-ink-3' : 'text-sm text-ink-2')}>
            {tournamentName ?? 'Unknown tournament'}
            {r.editedBy && <> · by @{r.editedBy.username}</>}
          </p>
        </div>
        {!readOnly && (
          <Link to={`/pit/${r.tournamentId}/${r.teamNumber}`} className="shrink-0 text-xs text-ink-2 underline underline-offset-2 hover:text-ink">
            Edit
          </Link>
        )}
      </div>
      <dl className="divide-y divide-line text-sm">
        <PitRow label="Auto leave">
          <AnswerText value={r.autoLeave} />
        </PitRow>
        <PitRow label="Auto park">
          <AnswerText value={r.autoPark} />
        </PitRow>
        <PitRow label="Starting positions">
          {r.starts.length ? (
            <span className="flex justify-end gap-1.5">
              {r.starts.map((s, i) => (
                <StartPositionButton key={i} value={s} alliance={PIT_ALLIANCE} compact />
              ))}
            </span>
          ) : (
            dash
          )}
        </PitRow>
        <PitRow label="Expected auto balls">{r.expectedBalls ?? dash}</PitRow>
        <PitRow label="Expected auto tips">{r.expectedTips ?? dash}</PitRow>
        <PitRow label="Aiming">{r.aiming ? AIMING_LABELS[r.aiming] : dash}</PitRow>
        <PitRow label="Launcher">{launcherLabel(r) ?? dash}</PitRow>
        <PitRow label="Flower intake">
          <AnswerText value={r.flowerIntake} />
        </PitRow>
        <PitRow label="Size">{r.size ? SIZE_LABELS[r.size] : dash}</PitRow>
      </dl>
      {notes.length > 0 && (
        <div className="mt-2 space-y-2 border-t border-line pt-3 text-sm">
          {notes.map(([label, text]) => (
            <div key={label}>
              <div className="text-xs text-ink-3">{label}</div>
              <p className="whitespace-pre-wrap text-ink-2">{text}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
  return nested ? <div className="rounded-xl border border-line p-3">{body}</div> : <Card className="p-4">{body}</Card>
}

const ROLE_LABELS: Record<MatchRole, string> = { scouted: 'Scouted', partner: 'Partner', opponent: 'Opponent' }

function MatchList({
  matches,
  teamNumber,
  showTournament,
  tById,
}: {
  matches: TeamMatch[]
  teamNumber: number
  showTournament: boolean
  tById: Map<string, Tournament>
}) {
  const { base } = useData()
  if (matches.length === 0) return null
  return (
    <Card className="p-4">
      <h2 className="mb-1 text-sm font-medium">Matches</h2>
      <p className="mb-2 text-xs text-ink-3">Stats above only count matches where this team was the scouted robot.</p>
      <ul className="divide-y divide-line text-sm">
        {matches.map(({ group: g, alliance, role, report }) => {
          const t = tById.get(g.tournamentId ?? '')
          const st = report ? robotStats(report, pointsFor(t)) : undefined
          const own = (alliance === 'red' ? g.red : g.blue).filter((x) => x.number !== teamNumber).map((x) => x.number)
          const other = (alliance === 'red' ? g.blue : g.red).map((x) => x.number)
          return (
            <li key={g.key}>
              <Link
                to={matchPath(base, g.tournamentId, { matchType: g.matchType, matchNumber: g.matchNumber }, report?.id)}
                className="flex items-center justify-between gap-3 py-2.5 hover:text-ink"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', alliance === 'blue' ? 'bg-blue' : 'bg-red')} />
                  <span className="tnum shrink-0">{matchLabel(g.matchType, g.matchNumber)}</span>
                  <span
                    className={cx(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
                      role === 'scouted' ? 'border-ink-3 text-ink' : 'border-line text-ink-3',
                    )}
                  >
                    {ROLE_LABELS[role]}
                  </span>
                  {report?.incomplete && <IncompleteBadge />}
                  {showTournament && <span className="truncate text-xs text-ink-3">{t?.name ?? 'No tournament'}</span>}
                </span>
                <span className="tnum shrink-0 text-right text-ink-2">
                  {st ? (
                    <>
                      {st.total.tips} tips · {formatPct(st.overallAccuracy)} · <span className="text-ink">{st.estPoints} pts</span>
                    </>
                  ) : (
                    <span className="text-xs">
                      {own.length > 0 && <>with {own.join(', ')} </>}
                      {other.length > 0 && <>vs {other.join(', ')}</>}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function RecordingNotes({ summary }: { summary: TeamSummary }) {
  const notes = summary.reports.flatMap((r) =>
    [r.pre.notes, r.post.strategyNotes]
      .filter((n) => n.trim())
      .map((n, i) => ({ key: `${r.id}-${i}`, match: matchLabel(matchTypeOf(r.pre), r.pre.matchNumber), text: n })),
  )
  if (notes.length === 0) return null
  return (
    <Card className="p-4">
      <h2 className="mb-2 text-sm font-medium">Notes from recordings</h2>
      <ul className="space-y-3 text-sm">
        {notes.map((n) => (
          <li key={n.key}>
            <span className="tnum text-xs text-ink-3">{n.match}</span>
            <p className="whitespace-pre-wrap text-ink-2">{n.text}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
