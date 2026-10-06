import { factMessage, factValue, matchFacts, needsFixing, resolutionsFor, tipPhases, type Fact } from './consensus'
import { compareMatches, matchTypeOf } from './matches'
import { average, pointsFor, robotStats, type RobotStats } from './scoring'
import { teamNameIndex } from './teams'
import { findScheduledMatch, slotFill } from './schedule'
import type { Alliance, MatchType, PointValues, PreMatch, Report, Tournament } from './types'

export interface AllianceTeam {
  number: number
  /** True when one of our recordings scouted this robot. */
  scouted: boolean
}

/** One real match, built from every recording that shares (tournament, match #). */
export interface MatchGroup {
  key: string
  tournamentId: string | null
  matchType: MatchType
  matchNumber: number
  reports: Report[]
  red: AllianceTeam[]
  blue: AllianceTeam[]
  /** Agreed (or averaged) final scores; null when unentered or the recordings are too far apart. */
  redScore: number | null
  blueScore: number | null
  /** Human-readable disagreements between recordings; empty when consistent. */
  conflicts: string[]
  /** The lineup part of `conflicts`: teams on both alliances or too many on one. */
  lineupIssues: string[]
  /** Scores, alliance counts and tips compared across recordings. */
  facts: Fact[]
  /** How many facts are too far apart and still need fixing. */
  needsFixing: number
}

export function matchKey(tournamentId: string | null, matchType: MatchType, matchNumber: number): string {
  return `${tournamentId ?? 'none'}:${matchType}:${matchNumber}`
}

/** Pass tournaments so agreed values saved on them are applied. */
export function groupMatches(reports: Report[], tournaments: Tournament[] = []): MatchGroup[] {
  const tById = new Map(tournaments.map((t) => [t.id, t]))
  const byKey = new Map<string, Report[]>()
  for (const r of reports) {
    if (r.deleted || r.pre.matchNumber == null) continue
    const key = matchKey(r.tournamentId, matchTypeOf(r.pre), r.pre.matchNumber)
    const list = byKey.get(key)
    if (list) list.push(r)
    else byKey.set(key, [r])
  }

  const groups: MatchGroup[] = []
  for (const [key, list] of byKey) {
    // Oldest first so tabs stay in a stable order.
    list.sort((a, b) => a.createdAt - b.createdAt)
    const teams = new Map<number, { alliances: Set<Alliance>; scouted: boolean }>()
    const note = (n: number | null, alliance: Alliance | null, scouted: boolean) => {
      if (n == null || alliance == null) return
      const entry = teams.get(n) ?? { alliances: new Set<Alliance>(), scouted: false }
      entry.alliances.add(alliance)
      entry.scouted ||= scouted
      teams.set(n, entry)
    }
    for (const r of list) {
      const own = r.pre.alliance
      const other: Alliance | null = own === 'red' ? 'blue' : own === 'blue' ? 'red' : null
      note(r.pre.teamNumber, own, true)
      note(r.pre.partnerTeam, own, false)
      for (const o of r.pre.opponentTeams) note(o, other, false)
    }

    const conflicts: string[] = []
    const red: AllianceTeam[] = []
    const blue: AllianceTeam[] = []
    for (const [number, { alliances, scouted }] of teams) {
      if (alliances.size > 1) conflicts.push(`Team ${number} is listed on both alliances`)
      if (alliances.has('red')) red.push({ number, scouted })
      if (alliances.has('blue')) blue.push({ number, scouted })
    }
    const byNumber = (a: AllianceTeam, b: AllianceTeam) => a.number - b.number
    red.sort(byNumber)
    blue.sort(byNumber)
    if (red.length > 2) conflicts.push(`Red alliance has ${red.length} teams listed`)
    if (blue.length > 2) conflicts.push(`Blue alliance has ${blue.length} teams listed`)

    const lineupIssues = [...conflicts]
    const matchType = matchTypeOf(list[0].pre)
    const matchNumber = list[0].pre.matchNumber!
    const facts = matchFacts(list, resolutionsFor(tById.get(list[0].tournamentId ?? ''), matchType, matchNumber))
    for (const f of facts) {
      const message = factMessage(f)
      if (message) conflicts.push(message)
    }

    groups.push({
      key,
      tournamentId: list[0].tournamentId,
      matchType,
      matchNumber,
      reports: list,
      red,
      blue,
      redScore: factValue(facts, 'redScore'),
      blueScore: factValue(facts, 'blueScore'),
      conflicts,
      lineupIssues,
      facts,
      needsFixing: facts.filter(needsFixing).length,
    })
  }
  return groups.sort((a, b) =>
    compareMatches({ type: a.matchType, number: a.matchNumber }, { type: b.matchType, number: b.matchNumber }),
  )
}

/**
 * The alliance's estimated total: end-of-match counts, hive tips, and leave/park
 * for each scouted robot. Null when nobody recorded that alliance or a value
 * it depends on still needs fixing.
 */
export function allianceEstimate(g: MatchGroup, alliance: Alliance, points: PointValues): number | null {
  const recs = g.reports.filter((r) => r.pre.alliance === alliance)
  if (recs.length === 0) return null
  const counts = (['bottomNectarFlowers', 'ownedFlowerBalls', 'gardenBalls', 'cellBalls'] as const).map((c) => {
    const f = g.facts.find((f) => f.key === `${alliance}.${c}`)
    return f ? f.value : 0
  })
  const tips = g.facts.find((f) => f.key === `${alliance}.tips`)
  if (counts.some((v) => v == null) || tips?.value == null) return null
  const [bottom, owned, garden, cell] = counts as number[]
  let tipPoints: number
  if (tips.tipTimes && tips.tipTimes.length === tips.value) {
    const { auto, teleop } = tipPhases(tips.tipTimes)
    tipPoints = auto * points.autoTip + teleop * points.teleopTip
  } else if (recs.every((r) => !r.allianceTips) && !tips.resolution) {
    // Older robot-only tips: each robot's own, at the phase it was tapped.
    tipPoints = recs.reduce((n, r) => {
      const s = robotStats(r, points)
      return n + s.auto.tips * points.autoTip + s.teleop.tips * points.teleopTip
    }, 0)
  } else {
    tipPoints = tips.value * points.teleopTip
  }
  const robots = new Map<number | null, Report>()
  for (const r of recs) if (!robots.has(r.pre.teamNumber)) robots.set(r.pre.teamNumber, r)
  const swarm = [...robots.values()].reduce((n, r) => n + robotStats(r, points).swarmPoints, 0)
  return (
    bottom * points.bottomNectar + owned * points.ownedFlowerBall + garden * points.gardenBall + cell * points.cellBall + tipPoints + swarm
  )
}

export interface Lineup {
  partnerTeam: number | null
  opponentTeams: [number | null, number | null]
}

/**
 * The other three robots in the scout's match: from the qual schedule when it
 * lists this team, otherwise from other recordings of the same match.
 */
export function suggestLineup(pre: PreMatch, tournament: Tournament | undefined, reports: Report[], selfId: string): Lineup | null {
  if (pre.matchNumber == null || pre.teamNumber == null || pre.alliance == null) return null
  const type = matchTypeOf(pre)
  const scheduled = type === 'qual' ? findScheduledMatch(tournament, pre.matchNumber) : undefined
  if (scheduled) {
    const own = pre.alliance === 'red' ? scheduled.red : scheduled.blue
    const index = own.indexOf(pre.teamNumber)
    if (index === 0 || index === 1) {
      const fill = slotFill(scheduled, pre.alliance, index)
      return { partnerTeam: fill.partnerTeam, opponentTeams: fill.opponentTeams }
    }
  }
  const others = reports.filter(
    (r) => r.id !== selfId && r.tournamentId === (tournament?.id ?? null) && matchTypeOf(r.pre) === type && r.pre.matchNumber === pre.matchNumber,
  )
  const [g] = groupMatches(others)
  if (!g) return null
  const own = (pre.alliance === 'red' ? g.red : g.blue).map((t) => t.number).filter((n) => n !== pre.teamNumber)
  const opp = (pre.alliance === 'red' ? g.blue : g.red).map((t) => t.number).filter((n) => n !== pre.teamNumber)
  // Too many names on a side means the recordings disagree; don't guess.
  if (own.length > 1 || opp.length > 2) return null
  const lineup: Lineup = { partnerTeam: own[0] ?? null, opponentTeams: [opp[0] ?? null, opp[1] ?? null] }
  return lineup.partnerTeam == null && lineup.opponentTeams.every((n) => n == null) ? null : lineup
}

export interface TeamSummary {
  teamNumber: number
  teamName: string
  reports: Report[]
  stats: RobotStats[]
  matchesPlayed: number
  avgEstPoints: number | null
  avgTips: number | null
  nectarAccuracy: number | null
  pollenAccuracy: number | null
  overallAccuracy: number | null
  leaveRate: number | null
  autoParkRate: number | null
  teleopParkRate: number | null
  avgSwarmPoints: number | null
}

function pooledAccuracy(stats: RobotStats[], kind: 'nectar' | 'pollen' | 'all'): number | null {
  let scored = 0
  let missed = 0
  for (const s of stats) {
    if (kind !== 'pollen') {
      scored += s.total.nectarScored
      missed += s.total.nectarMissed
    }
    if (kind !== 'nectar') {
      scored += s.total.pollenScored
      missed += s.total.pollenMissed
    }
  }
  return scored + missed === 0 ? null : scored / (scored + missed)
}

function rate(values: boolean[]): number | null {
  return values.length === 0 ? null : values.filter(Boolean).length / values.length
}

/**
 * A recording's own tip count, swapped for the match's agreed alliance count
 * when scouts disagreed and someone fixed it. Extra or missing tips are scored
 * at the teleop value, since a fixed count has no times.
 */
function withAgreedTips(s: RobotStats, r: Report, fact: Fact | undefined, points: PointValues): RobotStats {
  if (!r.allianceTips || fact?.value == null || fact.value === s.total.tips) return s
  return { ...s, total: { ...s.total, tips: fact.value }, estPoints: s.estPoints + (fact.value - s.total.tips) * points.teleopTip }
}

/**
 * `allReports` (default: `reports`) supplies the other scouts' recordings of
 * the same matches, which decide the alliance's agreed tip count.
 */
export function summarizeTeams(reports: Report[], tournaments: Tournament[], allReports: Report[] = reports): TeamSummary[] {
  const tById = new Map(tournaments.map((t) => [t.id, t]))
  const tipFacts = new Map<string, Fact>()
  const keyOf = (r: Report) => matchKey(r.tournamentId, matchTypeOf(r.pre), r.pre.matchNumber ?? -1)
  const ours = new Set(reports.map(keyOf))
  for (const g of groupMatches(allReports.filter((r) => ours.has(keyOf(r))), tournaments)) {
    for (const r of g.reports) {
      const f = g.facts.find((f) => f.key === `${r.pre.alliance}.tips`)
      if (f) tipFacts.set(r.id, f)
    }
  }
  const names = teamNameIndex(tournaments, reports)
  const byTeam = new Map<number, Report[]>()
  for (const r of reports) {
    if (r.deleted || r.pre.teamNumber == null) continue
    const list = byTeam.get(r.pre.teamNumber)
    if (list) list.push(r)
    else byTeam.set(r.pre.teamNumber, [r])
  }
  const out: TeamSummary[] = []
  for (const [teamNumber, list] of byTeam) {
    list.sort(
      (a, b) =>
        compareMatches(
          { type: matchTypeOf(a.pre), number: a.pre.matchNumber ?? 0 },
          { type: matchTypeOf(b.pre), number: b.pre.matchNumber ?? 0 },
        ) || a.createdAt - b.createdAt,
    )
    const stats = list.map((r) => {
      const points = pointsFor(tById.get(r.tournamentId ?? ''))
      return withAgreedTips(robotStats(r, points), r, tipFacts.get(r.id), points)
    })
    // Incomplete recordings feed accuracy (pooled over every shot) but not per-match totals and rates.
    const full = stats.filter((_, i) => !list[i].incomplete)
    // Tips that scouts disagree on stay out until someone fixes them.
    const tipsKnown = stats.filter((_, i) => !list[i].incomplete && !(list[i].allianceTips && tipFacts.get(list[i].id)?.value === null))
    out.push({
      teamNumber,
      teamName: names.get(teamNumber) ?? '',
      reports: list,
      stats,
      matchesPlayed: list.length,
      avgEstPoints: average(tipsKnown.map((s) => s.estPoints)),
      avgTips: average(tipsKnown.map((s) => s.total.tips)),
      nectarAccuracy: pooledAccuracy(stats, 'nectar'),
      pollenAccuracy: pooledAccuracy(stats, 'pollen'),
      overallAccuracy: pooledAccuracy(stats, 'all'),
      leaveRate: rate(full.map((s) => s.leave)),
      autoParkRate: rate(full.map((s) => s.autoPark)),
      teleopParkRate: rate(full.map((s) => s.teleopPark)),
      avgSwarmPoints: average(full.map((s) => s.swarmPoints)),
    })
  }
  return out
}
