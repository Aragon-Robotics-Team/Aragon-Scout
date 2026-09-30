import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useData } from '../app/data'
import { Timeline } from '../components/Timeline'
import { Button, Card, Empty, Page, TeamChip, cx } from '../components/ui'
import { deleteReport } from '../lib/db'
import { buildExport, downloadJson } from '../lib/exportData'
import { groupMatches } from '../lib/grouping'
import { matchLabel, matchTitle, matchTypeOf, parseMatchParam } from '../lib/matches'
import { alliancePostPoints, formatPct, pointsFor, robotStats, winnerOf } from '../lib/scoring'
import type { Report, Tournament } from '../lib/types'

export function MatchDetailPage() {
  const { tid, match } = useParams()
  const [params, setParams] = useSearchParams()
  const { reports, tournaments, base, loaded } = useData()
  const tournamentId = tid === 'none' ? null : (tid ?? null)
  const parsed = parseMatchParam(match)
  const matchType = parsed?.type ?? 'qual'
  const matchNumber = parsed?.number ?? NaN
  const tournament = tournaments.find((t) => t.id === tournamentId)

  const group = useMemo(
    () =>
      groupMatches(
        reports.filter((r) => r.tournamentId === tournamentId && matchTypeOf(r.pre) === matchType && r.pre.matchNumber === matchNumber),
      )[0],
    [reports, tournamentId, matchType, matchNumber],
  )

  if (!loaded) return <Page>{null}</Page>
  if (!group) {
    return (
      <Page title={parsed ? matchTitle(parsed.type, parsed.number) : 'Match'}>
        <Empty title="No recordings for this match">
          <Link to={`${base}/matches`} className="underline underline-offset-4">
            Back to matches
          </Link>
        </Empty>
      </Page>
    )
  }

  const selectedId = params.get('r')
  const selected = group.reports.find((r) => r.id === selectedId) ?? group.reports[0]
  const winner = winnerOf(group.redScore, group.blueScore)

  return (
    <Page>
      <Link to={`${base}/matches`} className="text-sm text-ink-3 hover:text-ink">
        ← Matches
      </Link>
      <div className="mt-2 mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{matchTitle(group.matchType, group.matchNumber)}</h1>
          <p className="text-sm text-ink-2">{tournament?.name ?? 'No tournament'}</p>
        </div>
        <div className="tnum text-right text-2xl font-semibold tracking-tight">
          <span className={cx(winner === 'red' ? 'text-red' : 'text-ink-2')}>{group.redScore ?? '–'}</span>
          <span className="px-1.5 text-ink-3">–</span>
          <span className={cx(winner === 'blue' ? 'text-blue' : 'text-ink-2')}>{group.blueScore ?? '–'}</span>
          <div className="text-xs font-normal text-ink-3">
            {winner === 'tie' ? 'Tie' : winner ? `${winner === 'red' ? 'Red' : 'Blue'} wins` : 'Score not entered'}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {(['red', 'blue'] as const).map((a) => (
          <div key={a} className={cx('rounded-xl border-l-2 bg-surface px-3 py-2', a === 'red' ? 'border-red' : 'border-blue')}>
            <div className="text-[10px] uppercase tracking-wider text-ink-3">{a}</div>
            <div className="flex flex-wrap gap-1">
              {(a === 'red' ? group.red : group.blue).map((t) => (
                <TeamChip key={t.number} number={t.number} alliance={a} highlight={t.scouted} />
              ))}
              {(a === 'red' ? group.red : group.blue).length === 0 && <span className="text-sm text-ink-3">—</span>}
            </div>
          </div>
        ))}
      </div>

      {group.conflicts.length > 0 && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          <div className="font-medium text-warn">⚠ Recordings disagree</div>
          <ul className="mt-1 list-disc pl-5 text-ink-2">
            {group.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {group.reports.length > 1 && (
        <div role="tablist" className="mb-4 flex gap-2 overflow-x-auto">
          {group.reports.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={r.id === selected.id}
              onClick={() => setParams({ r: r.id }, { replace: true })}
              className={cx(
                'tnum h-9 shrink-0 rounded-full border px-4 text-sm',
                r.id === selected.id ? 'border-ink bg-surface-2 text-ink' : 'border-line text-ink-2',
              )}
            >
              <span className={cx('mr-1.5 inline-block h-2 w-2 rounded-full', r.pre.alliance === 'blue' ? 'bg-blue' : 'bg-red')} />
              {r.pre.teamNumber}
            </button>
          ))}
        </div>
      )}

      <ReportView report={selected} tournament={tournament} />
    </Page>
  )
}

function Row({ label, auto, teleop, total }: { label: string; auto: string | number; teleop: string | number; total: string | number }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-2 text-left font-normal text-ink-2">
        {label}
      </th>
      <td className="tnum py-2 text-right">{auto}</td>
      <td className="tnum py-2 text-right">{teleop}</td>
      <td className="tnum py-2 text-right font-medium">{total}</td>
    </tr>
  )
}

function acc(scored: number, missed: number) {
  return scored + missed === 0 ? '—' : formatPct(scored / (scored + missed))
}

export function ReportView({ report, tournament }: { report: Report; tournament: Tournament | undefined }) {
  const { readOnly } = useData()
  const { account } = useAuth()
  const { db } = useData()
  const navigate = useNavigate()
  const points = pointsFor(tournament)
  const s = robotStats(report, points)
  const post = report.post
  const { auto: a, teleop: t, total: tot } = s

  const exportOne = () =>
    downloadJson(
      `match-${matchLabel(matchTypeOf(report.pre), report.pre.matchNumber)}-team-${report.pre.teamNumber}.json`,
      buildExport([report], tournament ? [tournament] : [], account?.teamNumber ?? null),
    )
  const remove = async () => {
    if (!db || !confirm(`Delete the recording of team ${report.pre.teamNumber} in ${matchTitle(matchTypeOf(report.pre), report.pre.matchNumber)}?`)) return
    await deleteReport(db, report)
    navigate('/matches', { replace: true })
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">
              <span className={report.pre.alliance === 'blue' ? 'text-blue' : 'text-red'}>{report.pre.teamNumber}</span>
              {report.pre.teamName && <span className="text-ink"> · {report.pre.teamName}</span>}
            </div>
            <div className="text-sm text-ink-2">
              {report.pre.alliance === 'blue' ? 'Blue' : 'Red'} alliance
              {report.pre.startingPosition && <> · starts {report.pre.startingPosition}</>}
            </div>
          </div>
          <div className="text-right">
            <div className="tnum text-2xl font-semibold">{s.estPoints}</div>
            <div className="text-[11px] text-ink-3">est. robot pts</div>
          </div>
        </div>
        {report.pre.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2">{report.pre.notes}</p>}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">Timeline</h2>
        <Timeline events={report.events} alliance={report.pre.alliance} interactive />
      </Card>

      <Card className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-3">
              <th className="pb-1 text-left font-normal" />
              <th className="pb-1 text-right font-normal">Auto</th>
              <th className="pb-1 text-right font-normal">Teleop</th>
              <th className="pb-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Nectar scored" auto={`${a.nectarScored}/${a.nectarScored + a.nectarMissed}`} teleop={`${t.nectarScored}/${t.nectarScored + t.nectarMissed}`} total={`${tot.nectarScored}/${tot.nectarScored + tot.nectarMissed}`} />
            <Row label="Nectar accuracy" auto={acc(a.nectarScored, a.nectarMissed)} teleop={acc(t.nectarScored, t.nectarMissed)} total={formatPct(s.nectarAccuracy)} />
            <Row label="Pollen scored" auto={`${a.pollenScored}/${a.pollenScored + a.pollenMissed}`} teleop={`${t.pollenScored}/${t.pollenScored + t.pollenMissed}`} total={`${tot.pollenScored}/${tot.pollenScored + tot.pollenMissed}`} />
            <Row label="Pollen accuracy" auto={acc(a.pollenScored, a.pollenMissed)} teleop={acc(t.pollenScored, t.pollenMissed)} total={formatPct(s.pollenAccuracy)} />
            <Row label="Hive tips" auto={a.tips} teleop={t.tips} total={tot.tips} />
            <Row label="Into flower" auto="—" teleop={`${t.flowerNectar} N · ${t.flowerPollen} P`} total={t.flowerNectar + t.flowerPollen} />
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {[
            ['Leave', s.leave],
            ['Auto park', s.autoPark],
            ['Teleop park', s.teleopPark],
          ].map(([label, on]) => (
            <span key={label as string} className={cx('rounded-full border px-3 py-1', on ? 'border-ink-3 text-ink' : 'border-line text-ink-3 line-through')}>
              {label}
            </span>
          ))}
          <span className="px-1 py-1 text-ink-3">Leave + park {s.swarmPoints} pts</span>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-medium">
          {report.pre.alliance === 'blue' ? 'Blue' : 'Red'} alliance at end of match
          <span className="ml-2 font-normal text-ink-3">{alliancePostPoints(report, points)} pts</span>
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {[
            ['Bottom nectar flowers', post.bottomNectarFlowers],
            ['Balls in owned flowers', post.ownedFlowerBalls],
            ['Balls in garden', post.gardenBalls],
            ['Balls left in cell', post.cellBalls],
          ].map(([label, v]) => (
            <div key={label as string} className="flex justify-between gap-2">
              <dt className="text-ink-2">{label}</dt>
              <dd className="tnum">{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {post.strategyNotes && <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm text-ink-2">{post.strategyNotes}</p>}
      </Card>

      {!readOnly && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={() => navigate(`/reports/${report.id}/edit`)}>Edit</Button>
          <Button onClick={exportOne}>Export JSON</Button>
          <Button variant="danger" className="ml-auto" onClick={remove}>
            Delete
          </Button>
        </div>
      )}
    </div>
  )
}
