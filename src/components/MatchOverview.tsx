import { FIELD } from '../lib/field'
import { FLOWER_NAMES } from '../lib/flowers'
import { allianceEstimate, type MatchGroup } from '../lib/grouping'
import { formatPct, robotStats } from '../lib/scoring'
import { phaseAt } from '../lib/timing'
import type { Alliance, PointValues, Report } from '../lib/types'
import { FlowerMap, FlowerSummary } from './Flowers'
import { FieldMap, Robot } from './StartPosition'
import { LaneTimeline, type Lane } from './Timeline'
import { Card, cx } from './ui'

const ALLIANCES = ['red', 'blue'] as const
const color = (a: Alliance | null) => (a === 'blue' ? 'var(--color-blue)' : 'var(--color-red)')

/** One recording per robot: the first one made, so two scouts on one robot don't double up. */
function robotsOf(g: MatchGroup, alliance: Alliance): Report[] {
  const seen = new Set<number | null>()
  return g.reports.filter((r) => {
    if (r.pre.alliance !== alliance || seen.has(r.pre.teamNumber)) return false
    seen.add(r.pre.teamNumber)
    return true
  })
}

/** Every scouted robot's starting position on one field. */
export function StartPositions({ group }: { group: MatchGroup }) {
  const robots = ALLIANCES.flatMap((a) => robotsOf(group, a)).filter((r) => r.pre.start)
  if (robots.length === 0) return null
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-medium">Starting positions</h2>
      <svg viewBox={`-2 -2 ${FIELD + 4} ${FIELD + 4}`} className="mx-auto w-full max-w-sm" role="img" aria-label="Starting positions of the scouted robots">
        <FieldMap alliance={null}>
          {robots.map((r) => {
            const p = r.pre.start!
            return (
              <g key={r.id}>
                <Robot pose={p} color={color(r.pre.alliance)} />
                <text
                  x={p.x}
                  y={p.y > FIELD / 2 ? p.y - 15 : p.y + 19}
                  textAnchor="middle"
                  fontSize={7}
                  fontWeight={600}
                  fill="var(--color-ink)"
                  stroke="var(--color-bg)"
                  strokeWidth={2}
                  paintOrder="stroke"
                >
                  {r.pre.teamNumber}
                </text>
              </g>
            )
          })}
        </FieldMap>
      </svg>
    </Card>
  )
}

/** Shots by every scouted robot plus each alliance's tips, on one time axis. */
export function MatchTimeline({ group }: { group: MatchGroup }) {
  const lanes: Lane[] = []
  for (const a of ALLIANCES) {
    for (const r of robotsOf(group, a)) {
      lanes.push({
        key: r.id,
        label: <span style={{ color: color(a) }}>{r.pre.teamNumber}</span>,
        events: r.events.filter((e) => e.type !== 'tip').map((e) => ({ ...e, color: e.type.includes('pollen') ? 'var(--color-pollen)' : color(a) })),
      })
    }
    const tips = group.facts.find((f) => f.key === `${a}.tips`)
    // Agreed tip times when scouts' tips line up, else one recording's own taps.
    const source = group.reports.find((r) => r.pre.alliance === a && r.allianceTips) ?? group.reports.find((r) => r.pre.alliance === a)
    const times = tips?.tipTimes ?? source?.events.filter((e) => e.type === 'tip').map((e) => e.t) ?? []
    if (source) {
      lanes.push({
        key: `${a}-tips`,
        label: <span style={{ color: color(a) }}>{a === 'red' ? 'Red' : 'Blue'} tips</span>,
        events: times.map((t) => ({ t, type: 'tip', phase: phaseAt(t), color: color(a) })),
      })
    }
  }
  if (lanes.length === 0) return null
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-medium">Timeline</h2>
      <LaneTimeline lanes={lanes} interactive legend labelWidth="w-16" />
    </Card>
  )
}

/** The flowers as the most recently edited recording entered them. */
export function MatchFlowers({ group, points }: { group: MatchGroup; points: PointValues }) {
  const source = [...group.reports].sort((a, b) => b.updatedAt - a.updatedAt).find((r) => r.post.flowers?.some((s) => s.length > 0))
  if (!source) return null
  const flowers = source.post.flowers!
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-medium">
        Flowers
        {group.reports.length > 1 && <span className="ml-2 font-normal text-ink-3">as {source.pre.teamNumber}'s scout entered them</span>}
      </h2>
      <div className="grid grid-cols-[8rem_1fr] items-center gap-3">
        <FlowerMap flowers={flowers} />
        <ul className="space-y-1 text-xs">
          {flowers.map((stack, i) => (
            <li key={i}>
              <span className="text-ink-3">{FLOWER_NAMES[i]}: </span>
              <FlowerSummary stack={stack} points={points} />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

/** Red and blue side by side: tips, leave/park, accuracy and the estimate. */
export function AllianceTotals({ group, points }: { group: MatchGroup; points: PointValues }) {
  const cols = ALLIANCES.map((a) => {
    const robots = robotsOf(group, a)
    const stats = robots.map((r) => robotStats(r, points))
    const shots = stats.reduce(
      (n, s) => ({
        scored: n.scored + s.total.nectarScored + s.total.pollenScored,
        missed: n.missed + s.total.nectarMissed + s.total.pollenMissed,
      }),
      { scored: 0, missed: 0 },
    )
    const tips = group.facts.find((f) => f.key === `${a}.tips`)?.value
    return {
      a,
      scouted: robots.length,
      tips: tips == null ? (robots.length ? '?' : '—') : String(tips),
      leave: robots.length ? `${stats.filter((s) => s.leave).length}/${robots.length}` : '—',
      park: robots.length ? `${stats.filter((s) => s.teleopPark).length}/${robots.length}` : '—',
      accuracy: shots.scored + shots.missed ? formatPct(shots.scored / (shots.scored + shots.missed)) : '—',
      estimate: allianceEstimate(group, a, points),
    }
  })
  const rows: [string, (c: (typeof cols)[number]) => string | number][] = [
    ['Robots scouted', (c) => c.scouted],
    ['Hive tips', (c) => c.tips],
    ['Leave', (c) => c.leave],
    ['Parked (teleop)', (c) => c.park],
    ['Shot accuracy', (c) => c.accuracy],
    ['Est. total*', (c) => c.estimate ?? '—'],
  ]
  return (
    <Card className="p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs">
            <th className="pb-1 text-left font-normal text-ink-3">Alliance totals</th>
            <th className="pb-1 text-right font-medium text-red">Red</th>
            <th className="pb-1 text-right font-medium text-blue">Blue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label} className="border-t border-line">
              <th scope="row" className="py-2 text-left font-normal text-ink-2">
                {label}
              </th>
              {cols.map((c) => (
                <td key={c.a} className={cx('tnum py-2 text-right', label.startsWith('Est.') && 'font-medium')}>
                  {f(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-ink-3">* From the recordings, without penalties. Leave, park and accuracy cover the scouted robots only.</p>
    </Card>
  )
}
