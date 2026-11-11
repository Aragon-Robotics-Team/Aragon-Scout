import { groupMatches, summarizeTeams, type MatchGroup, type TeamSummary } from './grouping'
import { compareMatches } from './matches'
import { pitReportsByTeam } from './pit'
import { teamNameIndex } from './teams'
import type { Aiming, Alliance, Launcher, PitReport, Report, RobotSize, Tournament } from './types'

/**
 * Tournament id → rank, oldest first (by date, then when it was added), so
 * "newest tournament" means the same thing everywhere.
 */
export function tournamentRanks(tournaments: Tournament[]): Map<string, number> {
  const ordered = [...tournaments].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || a.createdAt - b.createdAt)
  return new Map(ordered.map((t, i) => [t.id, i]))
}

/** A team in the database: everything we've scouted about it, across every tournament. */
export interface DbTeam {
  teamNumber: number
  teamName: string
  /** Lifetime stats from the matches where this team was the scouted robot. */
  summary?: TeamSummary
  /** Pit reports, newest tournament first. */
  pit: PitReport[]
  /** Tournaments they were scouted at (recording or pit report), newest first. */
  tournamentIds: string[]
  /** When we last scouted them (ms). */
  lastSeen: number
}

/** Every team scouted in a recording or a pit report. Partners/opponents and list-only teams have no data of their own. */
export function buildTeamDatabase(reports: Report[], tournaments: Tournament[], pitReports: PitReport[]): DbTeam[] {
  const ranks = tournamentRanks(tournaments)
  const names = teamNameIndex(tournaments, reports)
  const summaries = new Map(summarizeTeams(reports, tournaments, reports).map((s) => [s.teamNumber, s]))
  const pitByTeam = pitReportsByTeam(pitReports, ranks)
  const numbers = new Set([...summaries.keys(), ...pitByTeam.keys()])
  const out: DbTeam[] = []
  for (const teamNumber of numbers) {
    const summary = summaries.get(teamNumber)
    const pit = pitByTeam.get(teamNumber) ?? []
    const seen = [...(summary?.reports ?? []), ...pit]
    const tournamentIds = [...new Set(seen.map((x) => x.tournamentId).filter((id): id is string => id != null && ranks.has(id)))].sort(
      (a, b) => ranks.get(b)! - ranks.get(a)!,
    )
    out.push({
      teamNumber,
      teamName: names.get(teamNumber) || pit.find((p) => p.teamName.trim())?.teamName.trim() || '',
      summary,
      pit,
      tournamentIds,
      lastSeen: Math.max(0, ...seen.map((x) => x.createdAt)),
    })
  }
  return out
}

/** The pit report filters look at: that tournament's when one is picked, otherwise the newest. */
export function pitFor(team: DbTeam, tournamentId: string | null): PitReport | undefined {
  return tournamentId ? team.pit.find((p) => p.tournamentId === tournamentId) : team.pit[0]
}

export type YesNo = 'yes' | 'no'

export interface DbFilters {
  query: string
  tournamentId: string | null
  hasPit: YesNo | null
  aiming: Aiming | null
  launcher: Launcher | null
  flowerIntake: YesNo | null
  size: RobotSize | null
  autoLeave: YesNo | null
}

export const NO_FILTERS: DbFilters = {
  query: '',
  tournamentId: null,
  hasPit: null,
  aiming: null,
  launcher: null,
  flowerIntake: null,
  size: null,
  autoLeave: null,
}

/** How many filters (not counting the search box) are on. */
export function activeFilterCount(f: DbFilters): number {
  return (Object.keys(NO_FILTERS) as (keyof DbFilters)[]).filter((k) => k !== 'query' && f[k] != null).length
}

/** A yes/no filter only matches an answered question: "not asked" is neither. */
function answered(want: YesNo | null, got: boolean | null | undefined): boolean {
  return want == null || (got != null && got === (want === 'yes'))
}

export function filterTeams(teams: DbTeam[], f: DbFilters): DbTeam[] {
  const q = f.query.trim().toLowerCase()
  return teams.filter((t) => {
    if (q && !String(t.teamNumber).startsWith(q) && !t.teamName.toLowerCase().includes(q)) return false
    if (f.tournamentId && !t.tournamentIds.includes(f.tournamentId)) return false
    const pit = pitFor(t, f.tournamentId)
    if (f.hasPit && !!pit !== (f.hasPit === 'yes')) return false
    if (f.aiming && pit?.aiming !== f.aiming) return false
    if (f.launcher && pit?.launcher !== f.launcher) return false
    if (f.size && pit?.size !== f.size) return false
    return answered(f.flowerIntake, pit?.flowerIntake) && answered(f.autoLeave, pit?.autoLeave)
  })
}

export type DbSort = 'team' | 'name' | 'lastSeen' | 'matches' | 'points' | 'cycle'

const desc = (a: number | null | undefined, b: number | null | undefined) => (b ?? -Infinity) - (a ?? -Infinity)
/** Lowest first, with missing values last. */
const asc = (a: number | null | undefined, b: number | null | undefined) => (a ?? Infinity) - (b ?? Infinity) || 0

const SORTS: Record<DbSort, (a: DbTeam, b: DbTeam) => number> = {
  team: () => 0,
  // Unnamed teams go last.
  name: (a, b) => (!a.teamName ? 1 : 0) - (!b.teamName ? 1 : 0) || a.teamName.localeCompare(b.teamName),
  lastSeen: (a, b) => b.lastSeen - a.lastSeen,
  matches: (a, b) => desc(a.summary?.matchesPlayed, b.summary?.matchesPlayed),
  points: (a, b) => desc(a.summary?.avgEstPoints, b.summary?.avgEstPoints),
  cycle: (a, b) => asc(a.summary?.cycle.median, b.summary?.cycle.median),
}

export function sortTeams(teams: DbTeam[], sort: DbSort): DbTeam[] {
  return [...teams].sort((a, b) => SORTS[sort](a, b) || a.teamNumber - b.teamNumber)
}

export type MatchRole = 'scouted' | 'partner' | 'opponent'

export interface TeamMatch {
  group: MatchGroup
  alliance: Alliance
  role: MatchRole
  /** Our recording of this team, when it was the scouted robot. */
  report?: Report
}

/**
 * Every recorded match this team played in: as the scouted robot, or as a
 * partner / opponent of one. Newest tournament first, then in match order.
 */
export function teamMatches(teamNumber: number, reports: Report[], tournaments: Tournament[]): TeamMatch[] {
  const ranks = tournamentRanks(tournaments)
  const out: TeamMatch[] = []
  for (const group of groupMatches(reports, tournaments)) {
    const alliance: Alliance | null = group.red.some((t) => t.number === teamNumber) ? 'red' : group.blue.some((t) => t.number === teamNumber) ? 'blue' : null
    if (!alliance) continue
    const report = group.reports.find((r) => r.pre.teamNumber === teamNumber)
    const role: MatchRole = report ? 'scouted' : group.reports.some((r) => r.pre.alliance === alliance) ? 'partner' : 'opponent'
    out.push({ group, alliance, role, report })
  }
  const rank = (m: TeamMatch) => ranks.get(m.group.tournamentId ?? '') ?? -1
  return out.sort(
    (a, b) =>
      rank(b) - rank(a) ||
      compareMatches({ type: a.group.matchType, number: a.group.matchNumber }, { type: b.group.matchType, number: b.group.matchNumber }),
  )
}
