import { describe, expect, it } from 'vitest'
import { buildExport, parseImport } from './exportData'
import { newReport, newTournament } from './factories'
import { groupMatches, summarizeTeams } from './grouping'
import { shouldAcceptRemote } from './merge'
import { alliancePostPoints, robotStats, winnerOf } from './scoring'
import { FLOWER_UNLOCK_MS, MATCH_MS, phaseAt, remainingInStage, stageAt } from './timing'
import type { Alliance, EventType, Report } from './types'

function report(opts: {
  match: number
  team: number
  alliance: Alliance
  partner?: number
  opponents?: [number, number]
  red?: number
  blue?: number
  events?: [number, EventType][]
  tournamentId?: string
}): Report {
  const r = newReport(opts.tournamentId ?? 't1', 9999)
  r.pre = {
    ...r.pre,
    matchNumber: opts.match,
    teamNumber: opts.team,
    alliance: opts.alliance,
    partnerTeam: opts.partner ?? null,
    opponentTeams: opts.opponents ?? [null, null],
  }
  r.post = { ...r.post, redScore: opts.red ?? null, blueScore: opts.blue ?? null }
  r.events = (opts.events ?? []).map(([t, type]) => ({ t, type, phase: phaseAt(t) }))
  return r
}

describe('timing', () => {
  it('follows the BIOBUZZ 30s / 8s / 2:00 structure', () => {
    expect(MATCH_MS).toBe(158_000)
    expect(stageAt(0)).toBe('auto')
    expect(stageAt(29_999)).toBe('auto')
    expect(stageAt(30_000)).toBe('transition')
    expect(stageAt(38_000)).toBe('teleop')
    expect(stageAt(158_000)).toBe('done')
    expect(remainingInStage(10_000)).toBe(20_000)
    expect(remainingInStage(38_000)).toBe(120_000)
  })

  it('counts transition taps as auto', () => {
    expect(phaseAt(35_000)).toBe('auto')
    expect(phaseAt(38_000)).toBe('teleop')
  })

  it('unlocks flowers with one minute left', () => {
    expect(MATCH_MS - FLOWER_UNLOCK_MS).toBe(60_000)
  })
})

describe('scoring', () => {
  it('computes accuracy and estimated robot points', () => {
    const r = report({
      match: 1,
      team: 100,
      alliance: 'red',
      events: [
        [5_000, 'nectar_score'],
        [6_000, 'nectar_miss'],
        [10_000, 'tip'],
        [36_000, 'pollen_score'], // transition → auto
        [50_000, 'pollen_score'],
        [51_000, 'pollen_miss'],
        [60_000, 'tip'],
        [120_000, 'flower_nectar'],
      ],
    })
    r.toggles = { leave: true, autoPark: false, teleopPark: true }
    const s = robotStats(r)
    expect(s.auto).toMatchObject({ nectarScored: 1, nectarMissed: 1, pollenScored: 1, tips: 1 })
    expect(s.teleop).toMatchObject({ pollenScored: 1, pollenMissed: 1, tips: 1, flowerNectar: 1 })
    expect(s.nectarAccuracy).toBe(0.5)
    expect(s.pollenAccuracy).toBeCloseTo(2 / 3)
    expect(s.overallAccuracy).toBe(0.6)
    expect(s.swarmPoints).toBe(3 + 5)
    expect(s.estPoints).toBe(3 + 5 + 20 + 20)
  })

  it('returns null accuracy with no attempts', () => {
    expect(robotStats(report({ match: 1, team: 1, alliance: 'blue' })).overallAccuracy).toBeNull()
  })

  it('scores alliance end-of-match counts', () => {
    const r = report({ match: 1, team: 1, alliance: 'blue' })
    r.post = { ...r.post, bottomNectarFlowers: 2, ownedFlowerBalls: 5, gardenBalls: 3, cellBalls: 4 }
    expect(alliancePostPoints(r)).toBe(2 * 5 + 5 * 2 + 3 * 1 + 4 * 2)
  })

  it('computes the winner, including ties', () => {
    expect(winnerOf(50, 40)).toBe('red')
    expect(winnerOf(40, 50)).toBe('blue')
    expect(winnerOf(40, 40)).toBe('tie')
    expect(winnerOf(40, null)).toBeNull()
  })
})

describe('grouping', () => {
  it('groups two scouts on the same match into one row', () => {
    const a = report({ match: 12, team: 12345, alliance: 'red', partner: 11111, opponents: [67890, 22222], red: 85, blue: 70 })
    const b = report({ match: 12, team: 67890, alliance: 'blue', partner: 22222, opponents: [12345, 11111], red: 85, blue: 70 })
    const other = report({ match: 13, team: 5, alliance: 'red' })
    const groups = groupMatches([a, b, other])
    expect(groups).toHaveLength(2)
    const g = groups[0]
    expect(g.matchNumber).toBe(12)
    expect(g.reports).toHaveLength(2)
    expect(g.red).toEqual([
      { number: 11111, scouted: false },
      { number: 12345, scouted: true },
    ])
    expect(g.blue).toEqual([
      { number: 22222, scouted: false },
      { number: 67890, scouted: true },
    ])
    expect(g.conflicts).toEqual([])
    expect([g.redScore, g.blueScore]).toEqual([85, 70])
  })

  it('flags recordings that disagree', () => {
    const a = report({ match: 3, team: 1, alliance: 'red', red: 50, blue: 40 })
    const b = report({ match: 3, team: 2, alliance: 'blue', opponents: [1, 7], red: 55, blue: 40 })
    b.pre.partnerTeam = 1 // team 1 is now claimed on both alliances
    const [g] = groupMatches([a, b])
    expect(g.conflicts).toContain('Red score entered differently: 50 vs 55')
    expect(g.conflicts).toContain('Team 1 is listed on both alliances')
  })

  it('keeps tournaments separate and skips deleted reports', () => {
    const a = report({ match: 1, team: 1, alliance: 'red', tournamentId: 'x' })
    const b = report({ match: 1, team: 2, alliance: 'red', tournamentId: 'y' })
    const c = report({ match: 2, team: 3, alliance: 'red', tournamentId: 'x' })
    c.deleted = true
    expect(groupMatches([a, b, c])).toHaveLength(2)
  })

  it('summarizes teams across matches', () => {
    const t = newTournament('Test')
    const r1 = report({ match: 1, team: 7, alliance: 'red', tournamentId: t.id, events: [[40_000, 'tip'], [41_000, 'nectar_score']] })
    const r2 = report({ match: 4, team: 7, alliance: 'blue', tournamentId: t.id, events: [[42_000, 'nectar_miss']] })
    r1.toggles.leave = true
    r1.pre.teamName = 'Robo'
    const [s] = summarizeTeams([r1, r2], [t])
    expect(s.matchesPlayed).toBe(2)
    expect(s.teamName).toBe('Robo')
    expect(s.avgEstPoints).toBe((3 + 20 + 0) / 2)
    expect(s.nectarAccuracy).toBe(0.5)
    expect(s.leaveRate).toBe(0.5)
  })

  it('uses per-tournament point values', () => {
    const t = newTournament('Custom')
    t.points.teleopTip = 30
    const r = report({ match: 1, team: 8, alliance: 'red', tournamentId: t.id, events: [[50_000, 'tip']] })
    expect(summarizeTeams([r], [t])[0].avgEstPoints).toBe(30)
  })
})

describe('merge', () => {
  it('is last-write-wins and protects newer local edits', () => {
    expect(shouldAcceptRemote(undefined, 1)).toBe(true)
    expect(shouldAcceptRemote({ dirty: 0, doc: { updatedAt: 5 } }, 5)).toBe(true)
    expect(shouldAcceptRemote({ dirty: 0, doc: { updatedAt: 5 } }, 4)).toBe(false)
    expect(shouldAcceptRemote({ dirty: 1, doc: { updatedAt: 5 } }, 5)).toBe(false)
    expect(shouldAcceptRemote({ dirty: 1, doc: { updatedAt: 5 } }, 6)).toBe(true)
  })
})

describe('export / import', () => {
  it('round-trips and includes computed stats', () => {
    const t = newTournament('Round trip')
    const r = report({ match: 2, team: 42, alliance: 'blue', tournamentId: t.id, events: [[45_000, 'tip']] })
    const file = buildExport([r], [t], 9999)
    expect(file.reports[0].computed.robot.estPoints).toBe(20)
    const back = parseImport(JSON.stringify(file))
    expect(back.reports).toEqual([r])
    expect(back.tournaments).toEqual([t])
    expect(back.scoutingTeam).toBe(9999)
  })

  it('rejects files that are not exports', () => {
    expect(() => parseImport('nope')).toThrow('not valid JSON')
    expect(() => parseImport('{"foo":1}')).toThrow('not an Aragon Scout export')
  })
})
