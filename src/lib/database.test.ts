import { describe, expect, it } from 'vitest'
import { NO_FILTERS, activeFilterCount, buildTeamDatabase, filterTeams, sortTeams, teamMatches, tournamentRanks } from './database'
import { newReport, newTournament } from './factories'
import { newPitReport } from './pit'
import type { MatchEvent, PitReport, Report, Tournament } from './types'

const tournament = (name: string, startDate: string, createdAt = 0): Tournament => ({ ...newTournament(name, '', startDate), createdAt })

function recording(t: Tournament, team: number, match: number, extra: Partial<Report['pre']> = {}, events: MatchEvent[] = []): Report {
  const r = newReport(t.id, 1)
  return { ...r, createdAt: match, pre: { ...r.pre, teamNumber: team, matchNumber: match, alliance: 'red', ...extra }, events }
}

const pit = (t: Tournament, team: number, fields: Partial<PitReport> = {}): PitReport => ({ ...newPitReport(t.id, team), ...fields })

describe('team database', () => {
  const early = tournament('League meet', '2026-10-01')
  const late = tournament('Qualifier', '2026-11-08')
  const tournaments = [late, early]
  const shot = (t: number): MatchEvent => ({ t, type: 'nectar_score', phase: 'teleop' })
  const reports = [
    recording(early, 100, 1, { teamName: 'Hundred', partnerTeam: 555 }, [shot(40_000), shot(50_000)]),
    recording(late, 100, 4),
    recording(late, 200, 2),
  ]
  const pits = [
    pit(late, 100, { aiming: 'turret', launcher: 'counterRoller', flowerIntake: true, autoLeave: true, size: 'big', createdAt: 10 }),
    pit(early, 100, { aiming: 'fixed', flowerIntake: false, createdAt: 5 }),
    pit(late, 300, { teamName: 'Pit Only', flowerIntake: null, createdAt: 20 }),
  ]
  const db = buildTeamDatabase(reports, tournaments, pits)
  const byNumber = (n: number) => db.find((t) => t.teamNumber === n)!

  it('orders tournaments by date', () => {
    expect([...tournamentRanks(tournaments).entries()]).toEqual([
      [early.id, 0],
      [late.id, 1],
    ])
  })

  it('lists teams scouted in a recording or the pits, not partners or opponents', () => {
    expect(db.map((t) => t.teamNumber).sort()).toEqual([100, 200, 300])
  })

  it('gathers each team’s history, newest first', () => {
    const t = byNumber(100)
    expect(t.teamName).toBe('Hundred')
    expect(t.summary?.matchesPlayed).toBe(2)
    expect(t.summary?.cycle).toEqual({ median: 10, count: 1 })
    expect(t.tournamentIds).toEqual([late.id, early.id])
    expect(t.pit.map((p) => p.tournamentId)).toEqual([late.id, early.id])
    expect(t.lastSeen).toBe(10)
    expect(byNumber(300).teamName).toBe('Pit Only')
    expect(byNumber(300).summary).toBeUndefined()
  })

  it('searches by number prefix or name', () => {
    const numbers = (f: Partial<typeof NO_FILTERS>) => filterTeams(db, { ...NO_FILTERS, ...f }).map((t) => t.teamNumber).sort()
    expect(numbers({ query: '1' })).toEqual([100])
    expect(numbers({ query: 'pit' })).toEqual([300])
    expect(numbers({ tournamentId: early.id })).toEqual([100])
    expect(numbers({ hasPit: 'yes' })).toEqual([100, 300])
    expect(numbers({ hasPit: 'no' })).toEqual([200])
  })

  it('filters on the newest pit report, or the picked tournament’s', () => {
    const numbers = (f: Partial<typeof NO_FILTERS>) => filterTeams(db, { ...NO_FILTERS, ...f }).map((t) => t.teamNumber).sort()
    expect(numbers({ aiming: 'turret' })).toEqual([100])
    expect(numbers({ aiming: 'turret', tournamentId: early.id })).toEqual([])
    expect(numbers({ aiming: 'fixed', tournamentId: early.id })).toEqual([100])
    expect(numbers({ launcher: 'counterRoller', size: 'big', autoLeave: 'yes' })).toEqual([100])
  })

  it('never counts "not asked" as yes or no', () => {
    const numbers = (f: Partial<typeof NO_FILTERS>) => filterTeams(db, { ...NO_FILTERS, ...f }).map((t) => t.teamNumber).sort()
    expect(numbers({ flowerIntake: 'yes' })).toEqual([100])
    expect(numbers({ flowerIntake: 'no' })).toEqual([])
    expect(numbers({ flowerIntake: 'no', tournamentId: early.id })).toEqual([100])
  })

  it('counts active filters, not the search', () => {
    expect(activeFilterCount({ ...NO_FILTERS, query: 'x' })).toBe(0)
    expect(activeFilterCount({ ...NO_FILTERS, hasPit: 'yes', size: 'small' })).toBe(2)
  })

  it('sorts, with missing values last', () => {
    expect(sortTeams(db, 'matches').map((t) => t.teamNumber)).toEqual([100, 200, 300])
    expect(sortTeams(db, 'cycle').map((t) => t.teamNumber)).toEqual([100, 200, 300])
    expect(sortTeams(db, 'name').map((t) => t.teamNumber)).toEqual([100, 300, 200])
    expect(sortTeams(db, 'lastSeen').map((t) => t.teamNumber)).toEqual([300, 100, 200])
    expect(sortTeams(db, 'team').map((t) => t.teamNumber)).toEqual([100, 200, 300])
  })

  it('lists a team’s matches as scouted robot, partner or opponent, newest tournament first', () => {
    const vs = recording(early, 200, 7, { partnerTeam: 100, opponentTeams: [555, null] })
    const all = [...reports, vs]
    const label = (n: number) => teamMatches(n, all, tournaments).map((m) => `${m.role}:${m.group.matchNumber}:${m.alliance}`)
    expect(label(100)).toEqual(['scouted:4:red', 'scouted:1:red', 'partner:7:red'])
    expect(label(555)).toEqual(['partner:1:red', 'opponent:7:blue'])
    expect(teamMatches(100, all, tournaments)[0].report?.id).toBe(reports[1].id)
  })
})
