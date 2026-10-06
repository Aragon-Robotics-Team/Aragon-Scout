import { compareMatches, matchTypeOf } from './matches'
import { average, pointsFor, robotStats, type RobotStats } from './scoring'
import { teamNameIndex } from './teams'
import { findScheduledMatch, slotFill } from './schedule'
import type { Alliance, MatchType, PreMatch, Report, Tournament } from './types'

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
  redScore: number | null
  blueScore: number | null
  /** Human-readable disagreements between recordings; empty when consistent. */
  conflicts: string[]
}

export function matchKey(tournamentId: string | null, matchType: MatchType, matchNumber: number): string {
  return `${tournamentId ?? 'none'}:${matchType}:${matchNumber}`
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)]
}

export function groupMatches(reports: Report[]): MatchGroup[] {
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

    const redScores = distinct(list.map((r) => r.post.redScore).filter((s): s is number => s != null))
    const blueScores = distinct(list.map((r) => r.post.blueScore).filter((s): s is number => s != null))
    if (redScores.length > 1) conflicts.push(`Red score entered differently: ${redScores.join(' vs ')}`)
    if (blueScores.length > 1) conflicts.push(`Blue score entered differently: ${blueScores.join(' vs ')}`)

    // Most recently edited recording wins for display.
    const latest = [...list].sort((a, b) => b.updatedAt - a.updatedAt)
    groups.push({
      key,
      tournamentId: list[0].tournamentId,
      matchType: matchTypeOf(list[0].pre),
      matchNumber: list[0].pre.matchNumber!,
      reports: list,
      red,
      blue,
      redScore: latest.find((r) => r.post.redScore != null)?.post.redScore ?? null,
      blueScore: latest.find((r) => r.post.blueScore != null)?.post.blueScore ?? null,
      conflicts,
    })
  }
  return groups.sort((a, b) =>
    compareMatches({ type: a.matchType, number: a.matchNumber }, { type: b.matchType, number: b.matchNumber }),
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

export function summarizeTeams(reports: Report[], tournaments: Tournament[]): TeamSummary[] {
  const tById = new Map(tournaments.map((t) => [t.id, t]))
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
    const stats = list.map((r) => robotStats(r, pointsFor(tById.get(r.tournamentId ?? ''))))
    // Incomplete recordings feed accuracy (pooled over every shot) but not per-match totals and rates.
    const full = stats.filter((_, i) => !list[i].incomplete)
    out.push({
      teamNumber,
      teamName: names.get(teamNumber) ?? '',
      reports: list,
      stats,
      matchesPlayed: list.length,
      avgEstPoints: average(full.map((s) => s.estPoints)),
      avgTips: average(full.map((s) => s.total.tips)),
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
