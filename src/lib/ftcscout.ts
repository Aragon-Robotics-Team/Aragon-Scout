import { normalizeSchedule } from './schedule'
import type { ScheduledMatch, TournamentTeam } from './types'

const API = 'https://api.ftcscout.org/graphql'
/** FTCScout numbers seasons by their starting year: BIOBUZZ (2026–27) is 2026. */
export const FTC_SEASON = 2026

interface EventResponse {
  data?: {
    eventByCode: {
      name: string
      teams: { teamNumber: number; team: { name: string } | null }[]
      matches: { matchNum: number; tournamentLevel: string; teams: { teamNumber: number; alliance: string; station: string }[] }[]
    } | null
  }
  errors?: { message: string }[]
}

export interface FtcScoutEvent {
  name: string
  teams: TournamentTeam[]
  schedule: ScheduledMatch[]
}

/** Fetches an event's teams and qualification schedule from FTCScout's public API. */
export async function fetchFtcScoutEvent(eventCode: string): Promise<FtcScoutEvent> {
  const code = eventCode.trim().toUpperCase()
  if (!code) throw new Error('Add the FTC event code to this tournament first.')
  if (!navigator.onLine) throw new Error("You're offline — FTCScout needs a connection.")
  const query = `query($season: Int!, $code: String!) {
    eventByCode(season: $season, code: $code) {
      name
      teams { teamNumber team { name } }
      matches { matchNum tournamentLevel teams { teamNumber alliance station } }
    }
  }`
  let res: Response
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { season: FTC_SEASON, code } }),
    })
  } catch {
    throw new Error("Couldn't reach FTCScout. Check your connection.")
  }
  const body = (await res.json()) as EventResponse
  if (body.errors?.length) throw new Error(`FTCScout: ${body.errors[0].message}`)
  const event = body.data?.eventByCode
  if (!event) throw new Error(`FTCScout has no ${FTC_SEASON}–${(FTC_SEASON + 1) % 100} event with code ${code}.`)

  const schedule: ScheduledMatch[] = []
  for (const m of event.matches) {
    if (m.tournamentLevel !== 'Quals') continue
    const slot = (alliance: string, station: string) =>
      m.teams.find((t) => t.alliance === alliance && t.station === station)?.teamNumber
    const r1 = slot('Red', 'One')
    const r2 = slot('Red', 'Two')
    const b1 = slot('Blue', 'One')
    const b2 = slot('Blue', 'Two')
    if (r1 && r2 && b1 && b2) schedule.push({ match: m.matchNum, red: [r1, r2], blue: [b1, b2] })
  }
  return {
    name: event.name,
    teams: event.teams.map((t) => ({ number: t.teamNumber, name: t.team?.name ?? '' })),
    schedule: normalizeSchedule(schedule),
  }
}

/** Where a tournament's downloaded official results are kept on this device. */
export const resultsKey = (tournamentId: string) => `as.results:${tournamentId}`

/** One played qualification match with FTCScout's non-penalty scores. */
export interface OfficialResult {
  match: number
  red: number[]
  blue: number[]
  redScore: number
  blueScore: number
}

interface ResultsResponse {
  data?: {
    eventByCode: {
      matches: {
        matchNum: number
        tournamentLevel: string
        hasBeenPlayed: boolean
        teams: { teamNumber: number; alliance: string }[]
        scores: { red: { totalPointsNp: number }; blue: { totalPointsNp: number } } | null
      }[]
    } | null
  }
  errors?: { message: string }[]
}

/** Fetches an event's played qualification matches and their non-penalty scores. */
export async function fetchOfficialResults(eventCode: string): Promise<OfficialResult[]> {
  const code = eventCode.trim().toUpperCase()
  const query = `query($season: Int!, $code: String!) {
    eventByCode(season: $season, code: $code) {
      matches {
        matchNum tournamentLevel hasBeenPlayed
        teams { teamNumber alliance }
        scores { ... on MatchScores${FTC_SEASON} { red { totalPointsNp } blue { totalPointsNp } } }
      }
    }
  }`
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { season: FTC_SEASON, code } }),
  })
  const body = (await res.json()) as ResultsResponse
  if (body.errors?.length) throw new Error(`FTCScout: ${body.errors[0].message}`)
  const out: OfficialResult[] = []
  for (const m of body.data?.eventByCode?.matches ?? []) {
    if (m.tournamentLevel !== 'Quals' || !m.hasBeenPlayed || !m.scores?.red || !m.scores.blue) continue
    const side = (a: string) => m.teams.filter((t) => t.alliance === a).map((t) => t.teamNumber)
    out.push({ match: m.matchNum, red: side('Red'), blue: side('Blue'), redScore: m.scores.red.totalPointsNp, blueScore: m.scores.blue.totalPointsNp })
  }
  return out.sort((a, b) => a.match - b.match)
}
