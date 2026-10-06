import { describe, expect, it } from 'vitest'
import { LIMITS, factMessage, lineUpTips, matchFacts, needsFixing, withResolution } from './consensus'
import { newReport, newTournament } from './factories'
import { allianceEstimate, groupMatches, summarizeTeams } from './grouping'
import { DEFAULT_POINTS } from './scoring'
import { phaseAt } from './timing'
import type { Alliance, Report } from './types'

function rec(team: number, alliance: Alliance, opts: { red?: number; blue?: number; garden?: number; tips?: number[]; old?: boolean; paused?: boolean } = {}): Report {
  const r = newReport('t1', 9999)
  r.pre = { ...r.pre, matchNumber: 5, teamNumber: team, alliance }
  r.post = { ...r.post, redScore: opts.red ?? null, blueScore: opts.blue ?? null, gardenBalls: opts.garden ?? null }
  r.events = (opts.tips ?? []).map((s) => ({ t: s * 1000, type: 'tip' as const, phase: phaseAt(s * 1000) }))
  if (opts.old) delete r.allianceTips
  r.paused = opts.paused
  return r
}

const fact = (reports: Report[], key: string, res = {}) => matchFacts(reports, res).find((f) => f.key === key)!

describe('score and count conflicts', () => {
  it('agrees when everyone entered the same value', () => {
    const f = fact([rec(1, 'red', { red: 80 }), rec(2, 'blue', { red: 80 })], 'redScore')
    expect(f).toMatchObject({ status: 'agreed', value: 80 })
    expect(factMessage(f)).toBeNull()
  })

  it('only warns within the limits, using the average', () => {
    const f = fact([rec(1, 'red', { red: 50 }), rec(2, 'blue', { red: 50 + LIMITS.points })], 'redScore')
    expect(f).toMatchObject({ status: 'small', value: 51.5 })
    expect(needsFixing(f)).toBe(false)
    expect(factMessage(f)).toBe('Red score entered differently: 50 vs 53')
    const g = fact([rec(1, 'red', { garden: 3 }), rec(2, 'red', { garden: 5 })], 'red.gardenBalls')
    expect(g.status).toBe('small')
  })

  it('needs fixing past the limits and leaves the value out until fixed', () => {
    const reports = [rec(1, 'red', { red: 50 }), rec(2, 'blue', { red: 60 })]
    expect(fact(reports, 'redScore')).toMatchObject({ status: 'large', value: null })
    expect(needsFixing(fact(reports, 'redScore'))).toBe(true)
    const fixed = fact(reports, 'redScore', { redScore: { value: 58 } })
    expect(fixed.value).toBe(58)
    expect(factMessage(fixed)).toBeNull()
    const kept = fact(reports, 'redScore', { redScore: { keep: true } })
    expect(kept.value).toBe(55)
    expect(needsFixing(kept)).toBe(false)
    expect(factMessage(kept)).not.toBeNull()
  })

  it('compares alliance counts only among that alliance', () => {
    const reports = [rec(1, 'red', { garden: 1 }), rec(2, 'blue', { garden: 9 })]
    expect(fact(reports, 'red.gardenBalls')).toMatchObject({ status: 'agreed', value: 1 })
    expect(fact(reports, 'blue.gardenBalls')).toMatchObject({ status: 'agreed', value: 9 })
  })

  it('saves agreed values on the tournament per match', () => {
    const t = withResolution(newTournament('T'), 'qual', 5, 'redScore', { value: 70 })
    expect(t.resolutions).toEqual({ 'qual:5': { redScore: { value: 70 } } })
    expect(withResolution(t, 'qual', 5, 'redScore', null).resolutions).toEqual({ 'qual:5': {} })
  })
})

describe('alliance tips', () => {
  it('lines up taps within the window', () => {
    expect(lineUpTips([[10_000, 60_000], [12_000, 61_000]])).toEqual([
      [10_000, 12_000],
      [60_000, 61_000],
    ])
    expect(lineUpTips([[10_000], [20_000]])).toEqual([[10_000, undefined], [undefined, 20_000]])
  })

  it('averages tip times when scouts agree', () => {
    const f = fact([rec(1, 'red', { tips: [10, 60] }), rec(2, 'red', { tips: [12, 61] })], 'red.tips')
    expect(f).toMatchObject({ status: 'agreed', value: 2, tipTimes: [11_000, 60_500] })
  })

  it('needs fixing when counts differ or a tip has no partner', () => {
    expect(fact([rec(1, 'red', { tips: [10] }), rec(2, 'red', { tips: [10, 60] })], 'red.tips')).toMatchObject({ status: 'large', value: null })
    const apart = fact([rec(1, 'red', { tips: [10, 60] }), rec(2, 'red', { tips: [10, 90] })], 'red.tips')
    expect(apart.status).toBe('large')
    expect(factMessage(apart)).toMatch(/weren't recorded within 5s/)
  })

  it("doesn't time recordings whose clock was stopped", () => {
    const f = fact([rec(1, 'red', { tips: [10, 60] }), rec(2, 'red', { tips: [30, 100], paused: true })], 'red.tips')
    expect(f).toMatchObject({ status: 'agreed', value: 2, tipTimes: [10_000, 60_000] })
  })

  it('adds up older robot-only tips without checking them', () => {
    const f = fact([rec(1, 'red', { tips: [10], old: true }), rec(2, 'red', { tips: [70, 90], old: true })], 'red.tips')
    expect(f).toMatchObject({ status: 'agreed', value: 3 })
  })

  it('keeps unresolved tips out of team averages and uses fixed counts', () => {
    const a = rec(1, 'red', { tips: [50] })
    const b = rec(2, 'red', { tips: [50, 100] })
    const t = newTournament('T')
    t.id = 't1'
    expect(summarizeTeams([a], [t], [a, b])[0].avgEstPoints).toBeNull()
    const fixed = withResolution(t, 'qual', 5, 'red.tips', { value: 2 })
    expect(summarizeTeams([a], [fixed], [a, b])[0]).toMatchObject({ avgTips: 2, avgEstPoints: 2 * DEFAULT_POINTS.teleopTip })
  })
})

describe('alliance estimate', () => {
  it('adds end-of-match counts, tips and each robot’s leave/park', () => {
    const a = rec(1, 'red', { tips: [10, 60], garden: 4 })
    const b = rec(2, 'red', { tips: [11, 60], garden: 4 })
    a.toggles.leave = true
    b.toggles.teleopPark = true
    const [g] = groupMatches([a, b])
    const p = DEFAULT_POINTS
    expect(allianceEstimate(g, 'red', p)).toBe(4 * p.gardenBall + p.autoTip + p.teleopTip + p.leave + p.teleopPark)
    expect(allianceEstimate(g, 'blue', p)).toBeNull()
  })
})
