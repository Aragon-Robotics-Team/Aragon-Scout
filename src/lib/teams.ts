import type { Report, Tournament, TournamentTeam } from './types'

export function teamsOf(t: Tournament | undefined): TournamentTeam[] {
  return t?.teams ?? []
}

/**
 * Merges incoming teams into a list. Incoming non-empty names replace existing
 * ones; an empty incoming name never erases a known name.
 */
export function mergeTeams(existing: TournamentTeam[], incoming: TournamentTeam[]): TournamentTeam[] {
  const byNumber = new Map(existing.map((t) => [t.number, { ...t }]))
  for (const t of incoming) {
    if (!Number.isInteger(t.number) || t.number <= 0) continue
    const name = t.name.trim()
    const current = byNumber.get(t.number)
    if (current) {
      if (name) current.name = name
    } else {
      byNumber.set(t.number, { number: t.number, name })
    }
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number)
}

/** Parses pasted lines like "12345 Buzz Bots", "12345, Buzz Bots" or "12345\tBuzz Bots". */
export function parseTeamList(text: string): TournamentTeam[] {
  const out: TournamentTeam[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*#?(\d{1,6})\b[\s,;:\t\-–—·|]*(.*?)\s*$/.exec(line)
    if (m) out.push({ number: Number(m[1]), name: m[2].replace(/^["']|["']$/g, '') })
  }
  return out
}

/**
 * Team number → display name. Official tournament lists win over names typed
 * into recordings; among lists, the newest tournament wins.
 */
export function teamNameIndex(tournaments: Tournament[], reports: Report[] = []): Map<number, string> {
  const names = new Map<number, string>()
  for (const r of [...reports].sort((a, b) => a.updatedAt - b.updatedAt)) {
    const name = r.pre.teamName.trim()
    if (r.pre.teamNumber != null && name) names.set(r.pre.teamNumber, name)
  }
  for (const t of [...tournaments].sort((a, b) => a.createdAt - b.createdAt)) {
    for (const team of teamsOf(t)) if (team.name.trim()) names.set(team.number, team.name.trim())
  }
  return names
}
