import type { Alliance, ScheduledMatch, Tournament } from './types'

export interface ParsedSchedule {
  matches: ScheduledMatch[]
  /** Lines that looked like match rows but couldn't be read. */
  skipped: string[]
}

const TIME = /\b\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?/gi
const MATCH_TOKEN = /\b(?:qualification|qual|q)\s*#?\s*(\d+)\b/i
const NOT_QUALS = /\b(?:playoffs?|semi-?finals?|finals?|elimination)\b/i

/**
 * Reads schedule rows from text: pasted by hand, or reconstructed from a PDF.
 * Understands the FTC Live / MatchMaker layout
 *   "9:45 AM  Qualification 1  1  14323  13217  8625  3470"   (time, match, field, R1, R2, B1, B2)
 * and plain rows
 *   "1 14323 13217 8625 3470"                                  (match, R1, R2, B1, B2)
 * Surrogate markers ("14323*") are ignored. Header/footer lines are skipped.
 */
export function parseScheduleText(text: string): ParsedSchedule {
  const matches: ScheduledMatch[] = []
  const skipped: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || NOT_QUALS.test(line)) continue
    const withoutTimes = line.replace(TIME, ' ')
    let match: number
    let rest: string
    const token = MATCH_TOKEN.exec(withoutTimes)
    if (token) {
      match = Number(token[1])
      rest = withoutTimes.slice(token.index + token[0].length)
    } else {
      const first = /^\s*(\d+)\b/.exec(withoutTimes)
      if (!first) continue
      match = Number(first[1])
      rest = withoutTimes.slice(first[0].length)
    }
    const nums = [...rest.matchAll(/\d+/g)].map((m) => Number(m[0]))
    let teams: number[] | null = null
    if (nums.length === 4) teams = nums
    else if (nums.length === 5) teams = nums.slice(1) // leading field number
    if (teams && teams.every((n) => n > 0) && match > 0) {
      matches.push({ match, red: [teams[0], teams[1]], blue: [teams[2], teams[3]] })
    } else if (token || nums.length >= 3) {
      // Looked like a match row but didn't have exactly four teams.
      skipped.push(line)
    }
  }
  return { matches: normalizeSchedule(matches), skipped }
}

/** Sorts by match number; a later row for the same match replaces an earlier one. */
export function normalizeSchedule(matches: ScheduledMatch[]): ScheduledMatch[] {
  const byMatch = new Map<number, ScheduledMatch>()
  for (const m of matches) byMatch.set(m.match, m)
  return [...byMatch.values()].sort((a, b) => a.match - b.match)
}

export function scheduleOf(t: Tournament | undefined): ScheduledMatch[] {
  return t?.schedule ?? []
}

export function findScheduledMatch(t: Tournament | undefined, match: number | null): ScheduledMatch | undefined {
  if (match == null) return undefined
  return scheduleOf(t).find((m) => m.match === match)
}

export function scheduleTeams(schedule: ScheduledMatch[]): number[] {
  return [...new Set(schedule.flatMap((m) => [...m.red, ...m.blue]))].sort((a, b) => a - b)
}

/** What choosing a robot in a scheduled match fills into the pre-match form. */
export function slotFill(m: ScheduledMatch, alliance: Alliance, index: 0 | 1) {
  const own = alliance === 'red' ? m.red : m.blue
  const other = alliance === 'red' ? m.blue : m.red
  return {
    teamNumber: own[index],
    alliance,
    partnerTeam: own[index === 0 ? 1 : 0],
    opponentTeams: [other[0], other[1]] as [number, number],
  }
}

/** Per-row problems for the review table. */
export function rowProblems(m: { match: number | null; teams: (number | null)[] }, allMatches: (number | null)[]): string[] {
  const problems: string[] = []
  if (m.match == null) problems.push('Missing match #')
  else if (allMatches.filter((n) => n === m.match).length > 1) problems.push('Duplicate match #')
  if (m.teams.some((t) => t == null)) problems.push('Missing team')
  const present = m.teams.filter((t): t is number => t != null)
  if (new Set(present).size !== present.length) problems.push('Team listed twice')
  return problems
}
