import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useData } from '../app/data'
import { ConflictPanel } from '../components/Conflicts'
import { FlowerMap, FlowerSummary } from '../components/Flowers'
import { StartPositionButton } from '../components/StartPosition'
import { Timeline } from '../components/Timeline'
import { Button, Card, Empty, IncompleteBadge, Page, TeamChip, cx } from '../components/ui'
import { tipTimesLabel, withResolution, type Fact } from '../lib/consensus'
import { FLOWER_NAMES } from '../lib/flowers'
import { deleteReport, saveTournament } from '../lib/db'
import { buildExport, downloadJson } from '../lib/exportData'
import { allianceEstimate, groupMatches } from '../lib/grouping'
import { matchLabel, matchTitle, matchTypeOf, parseMatchParam } from '../lib/matches'
import { ESTIMATE_NOTE, alliancePostPoints, formatPct, pointsFor, robotStats, winnerOf } from '../lib/scoring'
import type { Report, Resolution, Tournament } from '../lib/types'

export function MatchDetailPage() {
  const { tid, match } = useParams()
  const [params, setParams] = useSearchParams()
  const { reports, tournaments, base, loaded, readOnly, db } = useData()
  const tournamentId = tid === 'none' ? null : (tid ?? null)
  const parsed = parseMatchParam(match)
  const matchType = parsed?.type ?? 'qual'
  const matchNumber = parsed?.number ?? NaN
  const tournament = tournaments.find((t) => t.id === tournamentId)

  const group = useMemo(
    () =>
      groupMatches(
        reports.filter((r) => r.tournamentId === tournamentId && matchTypeOf(r.pre) === matchType && r.pre.matchNumber === matchNumber),
        tournaments,
      )[0],
    [reports, tournaments, tournamentId, matchType, matchNumber],
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
  const points = pointsFor(tournament)
  const score = (key: 'redScore' | 'blueScore') => {
    const v = group[key]
    if (v != null) return Number.isInteger(v) ? v : v.toFixed(1)
    return group.facts.some((f) => f.key === key) ? '?' : '–'
  }
  const resolve =
    !readOnly && db && tournament
      ? (f: Fact, r: Resolution | null) => saveTournament(db, withResolution(tournament, group.matchType, group.matchNumber, f.key, r))
      : undefined

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
          <span className={cx(winner === 'red' ? 'text-red' : 'text-ink-2')}>{score('redScore')}</span>
          <span className="px-1.5 text-ink-3">–</span>
          <span className={cx(winner === 'blue' ? 'text-blue' : 'text-ink-2')}>{score('blueScore')}</span>
          <div className="text-xs font-normal text-ink-3">
            {winner === 'tie'
              ? 'Tie'
              : winner
                ? `${winner === 'red' ? 'Red' : 'Blue'} wins`
                : score('redScore') === '?' || score('blueScore') === '?'
                  ? 'Scores disagree'
                  : 'Score not entered'}
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
            <AllianceLine
              estimate={allianceEstimate(group, a, points)}
              entered={group[a === 'red' ? 'redScore' : 'blueScore']}
              tips={tipTimesLabel(group.facts.find((f) => f.key === `${a}.tips`))}
            />
          </div>
        ))}
      </div>

      <ConflictPanel facts={group.facts} lineupIssues={group.lineupIssues} onResolve={resolve} />

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
              {r.incomplete && <span className="ml-1 text-warn" title="Incomplete recording">·</span>}
            </button>
          ))}
        </div>
      )}

      <ReportView report={selected} tournament={tournament} />
    </Page>
  )
}

function AllianceLine({ estimate, entered, tips }: { estimate: number | null; entered: number | null; tips: string | null }) {
  if (estimate == null && tips == null) return null
  return (
    <div className="mt-1.5 text-[11px] text-ink-3">
      {estimate != null && (
        <div className="tnum" title={ESTIMATE_NOTE}>
          Est. {estimate} pts*{entered != null && ` · entered ${Number.isInteger(entered) ? entered : entered.toFixed(1)}`}
        </div>
      )}
      {tips && <div className="tnum truncate">Tips at {tips}</div>}
    </div>
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
              {report.incomplete && <IncompleteBadge className="ml-2 align-middle" />}
            </div>
            <div className="text-sm text-ink-2">
              {report.pre.alliance === 'blue' ? 'Blue' : 'Red'} alliance
              {report.pre.startingPosition && <> · starts {report.pre.startingPosition}</>}
            </div>
          </div>
          {report.pre.start && (
            <div className="w-28 shrink-0 self-center">
              <StartPositionButton value={report.pre.start} alliance={report.pre.alliance} />
            </div>
          )}
          <div className="text-right" title={ESTIMATE_NOTE}>
            <div className="tnum text-2xl font-semibold">{s.estPoints}</div>
            <div className="text-[11px] text-ink-3">est. robot pts*</div>
          </div>
        </div>
        {report.pre.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2">{report.pre.notes}</p>}
        <p className="mt-2 text-[11px] text-ink-3">* {ESTIMATE_NOTE}</p>
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
            <Row label={report.allianceTips ? 'Alliance tips' : 'Hive tips'} auto={a.tips} teleop={t.tips} total={tot.tips} />
            {/* Per-robot flower taps only exist on recordings from before the flower screen. */}
            {t.flowerNectar + t.flowerPollen > 0 && (
              <Row label="Into flower" auto="—" teleop={`${t.flowerNectar} N · ${t.flowerPollen} P`} total={t.flowerNectar + t.flowerPollen} />
            )}
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
        {post.flowers && (
          <div className="mt-3 grid grid-cols-[8rem_1fr] items-center gap-3 border-t border-line pt-3">
            <FlowerMap flowers={post.flowers} />
            <ul className="space-y-1 text-xs">
              {post.flowers.map((stack, i) => (
                <li key={i}>
                  <span className="text-ink-3">{FLOWER_NAMES[i]}: </span>
                  <FlowerSummary stack={stack} points={points} />
                </li>
              ))}
            </ul>
          </div>
        )}
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
