import { describe, expect, it } from 'vitest'
import { newReport } from './factories'
import { groupMatches } from './grouping'
import { computeOpr, oprRows, type AllianceRow } from './opr'
import { DEFAULT_POINTS } from './scoring'

describe('OPR', () => {
  it('recovers each team’s contribution by least squares', () => {
    const truth: Record<number, number> = { 1: 10, 2: 25, 3: 40, 4: 5, 5: 30, 6: 15 }
    const teams = Object.keys(truth).map(Number)
    const rows: AllianceRow[] = []
    // Every pair plays once: 15 alliance scores for 6 teams.
    for (let i = 0; i < teams.length; i++)
      for (let j = i + 1; j < teams.length; j++) rows.push({ teams: [teams[i], teams[j]], score: truth[teams[i]] + truth[teams[j]] })
    const { opr, enough } = computeOpr(rows)
    expect(enough).toBe(true)
    for (const t of teams) expect(opr.get(t)).toBeCloseTo(truth[t], 1)
  })

  it('refuses to rate with too few scores, and holds back teams with few matches', () => {
    const few = computeOpr([
      { teams: [1, 2], score: 45 },
      { teams: [1, 3], score: 35 },
      { teams: [2, 3], score: 50 },
    ])
    expect(few.enough).toBe(false)
    expect(few.opr.size).toBe(0)

    const rows: AllianceRow[] = []
    for (let k = 0; k < 4; k++) rows.push({ teams: [1, 2], score: 30 }, { teams: [1, 3], score: 25 }, { teams: [2, 3], score: 35 })
    rows.push({ teams: [3, 4], score: 20 })
    const r = computeOpr(rows)
    expect(r.enough).toBe(true)
    expect(r.tooFew.has(4)).toBe(true)
    expect(r.opr.has(4)).toBe(false)
  })

  it('uses official scores and fills gaps with the recordings’ estimates', () => {
    const rec = (match: number, team: number, partner: number, opponents: [number, number]) => {
      const r = newReport('t1', 1)
      r.pre = { ...r.pre, matchNumber: match, teamNumber: team, alliance: 'red', partnerTeam: partner, opponentTeams: opponents }
      r.toggles.leave = true
      return r
    }
    const groups = groupMatches([rec(1, 1, 2, [3, 4]), rec(2, 1, 3, [2, 4])])
    const rows = oprRows(groups, [{ match: 1, red: [1, 2], blue: [3, 4], redScore: 50, blueScore: 40 }], DEFAULT_POINTS)
    expect(rows).toEqual([
      { teams: [1, 2], score: 50 },
      { teams: [3, 4], score: 40 },
      // Match 2 has no official result; only red was scouted, so only red's estimate counts.
      { teams: [1, 3], score: DEFAULT_POINTS.leave },
    ])
  })
})
