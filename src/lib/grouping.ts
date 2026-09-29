import { average, pointsFor, robotStats, type RobotStats } from './scoring'
import type { Alliance, Report, Tournament } from './types'

export interface AllianceTeam {
  number: number
  /** True when one of our recordings scouted this robot. */
  scouted: boolean
}

/** One real match, built from every recording that shares (tournament, match #). */
export interface MatchGroup {
  key: string
  tournamentId: string | null
  matchNumber: number
  reports: Report[]
  red: AllianceTeam[]
  blue: AllianceTeam[]
  redScore: number | null
  blueScore: number | null
  /** Human-readable disagreements between recordings; empty when consistent. */
  conflicts: string[]
}

export function matchKey(tournamentId: string | null, matchNumber: number): string {
  return `${tournamentId ?? 'none'}:${matchNumber}`
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)]
}

export function groupMatches(reports: Report[]): MatchGroup[] {
  const byKey = new Map<string, Report[]>()
  for (const r of reports) {
    if (r.deleted || r.pre.matchNumber == null) continue
    const key = matchKey(r.tournamentId, r.pre.matchNumber)
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
      matchNumber: list[0].pre.matchNumber!,
      reports: list,
      red,
      blue,
      redScore: latest.find((r) => r.post.redScore != null)?.post.redScore ?? null,
      blueScore: latest.find((r) => r.post.blueScore != null)?.post.blueScore ?? null,
      conflicts,
    })
  }
  return groups.sort((a, b) => a.matchNumber - b.matchNumber)
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
  const byTeam = new Map<number, Report[]>()
  for (const r of reports) {
    if (r.deleted || r.pre.teamNumber == null) continue
    const list = byTeam.get(r.pre.teamNumber)
    if (list) list.push(r)
    else byTeam.set(r.pre.teamNumber, [r])
  }
  const out: TeamSummary[] = []
  for (const [teamNumber, list] of byTeam) {
    list.sort((a, b) => (a.pre.matchNumber ?? 0) - (b.pre.matchNumber ?? 0) || a.createdAt - b.createdAt)
    const stats = list.map((r) => robotStats(r, pointsFor(tById.get(r.tournamentId ?? ''))))
    const named = [...list].sort((a, b) => b.updatedAt - a.updatedAt).find((r) => r.pre.teamName.trim())
    out.push({
      teamNumber,
      teamName: named?.pre.teamName.trim() ?? '',
      reports: list,
      stats,
      matchesPlayed: list.length,
      avgEstPoints: average(stats.map((s) => s.estPoints)),
      avgTips: average(stats.map((s) => s.total.tips)),
      nectarAccuracy: pooledAccuracy(stats, 'nectar'),
      pollenAccuracy: pooledAccuracy(stats, 'pollen'),
      overallAccuracy: pooledAccuracy(stats, 'all'),
      leaveRate: rate(stats.map((s) => s.leave)),
      autoParkRate: rate(stats.map((s) => s.autoPark)),
      teleopParkRate: rate(stats.map((s) => s.teleopPark)),
      avgSwarmPoints: average(stats.map((s) => s.swarmPoints)),
    })
  }
  return out
}
