import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useData } from '../app/data'
import { PerMatchChart } from '../components/PerMatchChart'
import { Card, Empty, Page, Segmented, Stat } from '../components/ui'
import { summarizeTeams } from '../lib/grouping'
import { average, formatNum, formatPct, thresholdsFor } from '../lib/scoring'

export function TeamDetailPage() {
  const { team } = useParams()
  const [params, setParams] = useSearchParams()
  const { reports, tournaments, base, loaded } = useData()
  const teamNumber = Number(team)
  const tid = params.get('t')
  const selected = tournaments.find((t) => t.id === tid)
  const scope = selected && params.get('scope') !== 'all' ? 'tournament' : 'all'
  const tournament = scope === 'tournament' ? selected : undefined

  const summary = useMemo(() => {
    const inScope = reports.filter((r) => r.pre.teamNumber === teamNumber && (!tournament || r.tournamentId === tournament.id))
    return summarizeTeams(inScope, tournaments)[0]
  }, [reports, tournaments, teamNumber, tournament])

  const setScope = (s: 'tournament' | 'all') => {
    if (!tid) return
    setParams(s === 'all' ? { t: tid, scope: 'all' } : { t: tid }, { replace: true })
  }

  if (!loaded) return <Page>{null}</Page>

  const header = (
    <>
      <Link to={`${base}/analysis`} className="text-sm text-ink-3 hover:text-ink">
        ← Analysis
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{summary?.teamName || `Team ${teamNumber}`}</h1>
          <p className="tnum text-sm text-ink-2">{teamNumber}</p>
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
    </>
  )

  if (!summary) return <Page>{header}<Empty title="No recordings for this team" /></Page>

  const st = summary.stats
  const avg = (f: (s: (typeof st)[number]) => number) => formatNum(average(st.map(f)))
  const thresholds = thresholdsFor(tournament)
  const notes = summary.reports.flatMap((r) =>
    [r.pre.notes, r.post.strategyNotes].filter((n) => n.trim()).map((n, i) => ({ key: `${r.id}-${i}`, match: r.pre.matchNumber, text: n })),
  )

  return (
    <Page>
      {header}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Est. robot pts" value={formatNum(summary.avgEstPoints)} sub="avg per match" />
        <Stat label="Hive tips" value={formatNum(summary.avgTips)} sub={`avg · RP at ${thresholds.pollinator1Tips} & ${thresholds.pollinator2Tips}`} />
        <Stat label="Nectar accuracy" value={formatPct(summary.nectarAccuracy)} sub={`${st.reduce((n, s) => n + s.total.nectarScored, 0)} scored`} />
        <Stat label="Pollen accuracy" value={formatPct(summary.pollenAccuracy)} sub={`${st.reduce((n, s) => n + s.total.pollenScored, 0)} scored`} />
        <Stat label="Leave" value={formatPct(summary.leaveRate)} sub="of matches" />
        <Stat label="Auto park" value={formatPct(summary.autoParkRate)} sub="of matches" />
        <Stat label="Teleop park" value={formatPct(summary.teleopParkRate)} sub="of matches" />
        <Stat label="Leave + park" value={formatNum(summary.avgSwarmPoints)} sub={`avg pts · Swarm RP at ${thresholds.swarmPoints}`} />
      </div>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-medium">Estimated robot points per match</h2>
        <PerMatchChart
          bars={summary.reports.map((r, i) => ({
            key: r.id,
            label: String(r.pre.matchNumber ?? '?'),
            value: st[i].estPoints,
            tips: st[i].total.tips,
            accuracy: st[i].overallAccuracy,
          }))}
        />
      </Card>

      <Card className="mt-4 p-4">
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
              ['Hive tips', avg((s) => s.auto.tips), avg((s) => s.teleop.tips)],
              ['Into flower', '—', avg((s) => s.teleop.flowerNectar + s.teleop.flowerPollen)],
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

      <Card className="mt-4 p-4">
        <h2 className="mb-2 text-sm font-medium">Matches</h2>
        <ul className="divide-y divide-line text-sm">
          {summary.reports.map((r, i) => (
            <li key={r.id}>
              <Link
                to={`${base}/matches/${r.tournamentId ?? 'none'}/${r.pre.matchNumber}?r=${r.id}`}
                className="flex items-center justify-between py-2.5 hover:text-ink"
              >
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${r.pre.alliance === 'blue' ? 'bg-blue' : 'bg-red'}`} />
                  <span className="tnum">Match {r.pre.matchNumber}</span>
                </span>
                <span className="tnum text-ink-2">
                  {st[i].total.tips} tips · {formatPct(st[i].overallAccuracy)} · <span className="text-ink">{st[i].estPoints} pts</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {notes.length > 0 && (
        <Card className="mt-4 p-4">
          <h2 className="mb-2 text-sm font-medium">Notes</h2>
          <ul className="space-y-3 text-sm">
            {notes.map((n) => (
              <li key={n.key}>
                <span className="tnum text-xs text-ink-3">Match {n.match}</span>
                <p className="whitespace-pre-wrap text-ink-2">{n.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  )
}
