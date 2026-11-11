import { describe, expect, it } from 'vitest'
import { cycleSummary, cycleTimes, formatSeconds, median, stackStarts } from './cycles'
import type { EventType, MatchEvent, Phase } from './types'

const ev = (t: number, type: EventType = 'nectar_score', phase: Phase = 'teleop'): MatchEvent => ({ t, type, phase })

describe('cycle times', () => {
  it('groups shots within 3 s of the previous one into a stack', () => {
    // 40.0, 41.5, 44.4 chain (each ≤ 3 s after the last), 47.5 is 3.1 s later: a new stack
    const events = [ev(40_000), ev(41_500, 'pollen_miss'), ev(44_400), ev(47_500), ev(60_000)]
    expect(stackStarts({ events })).toEqual([40_000, 47_500, 60_000])
    expect(cycleTimes({ events })).toEqual([7.5, 12.5])
  })

  it('counts misses and both ball types, ignores tips and flower taps', () => {
    const events = [ev(40_000, 'nectar_miss'), ev(50_000, 'tip'), ev(52_000, 'flower_pollen'), ev(55_000, 'pollen_score')]
    expect(cycleTimes({ events })).toEqual([15])
  })

  it('leaves out auto shots and recordings with a stopped clock', () => {
    const events = [ev(5_000, 'nectar_score', 'auto'), ev(20_000, 'nectar_score', 'auto'), ev(40_000), ev(52_000)]
    expect(cycleTimes({ events })).toEqual([12])
    expect(cycleTimes({ events, paused: true })).toEqual([])
  })

  it('sorts taps that were saved out of order', () => {
    expect(cycleTimes({ events: [ev(60_000), ev(40_000)] })).toEqual([20])
  })

  it('needs two stacks for a cycle', () => {
    expect(cycleTimes({ events: [ev(40_000), ev(41_000)] })).toEqual([])
    expect(cycleSummary([{ events: [] }])).toEqual({ median: null, count: 0 })
  })

  it('pools cycles from every match and takes the median', () => {
    const a = { events: [ev(40_000), ev(50_000), ev(60_000)] } // 10, 10
    const b = { events: [ev(40_000), ev(52_000), ev(100_000)] } // 12, 48
    expect(cycleSummary([a, b])).toEqual({ median: 11, count: 4 })
    expect(median([3, 1, 2])).toBe(2)
    expect(formatSeconds(11)).toBe('11.0 s')
    expect(formatSeconds(null)).toBe('—')
  })
})
