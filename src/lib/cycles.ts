import type { EventType, Report } from './types'

/** Shots this close together (ms, each to the one before) are one stack: a burst of balls fired in a row. */
export const STACK_GAP_MS = 3_000

const SHOTS: ReadonlySet<EventType> = new Set(['nectar_score', 'nectar_miss', 'pollen_score', 'pollen_miss'])

/** When each stack of teleop shots starts (ms since the recording started). */
export function stackStarts(report: Pick<Report, 'events'>): number[] {
  const times = report.events
    .filter((e) => e.phase === 'teleop' && SHOTS.has(e.type))
    .map((e) => e.t)
    .sort((a, b) => a - b)
  const starts: number[] = []
  let last = -Infinity
  for (const t of times) {
    if (t - last > STACK_GAP_MS) starts.push(t)
    last = t
  }
  return starts
}

/**
 * Seconds from the start of each teleop stack to the start of the next. Auto is
 * left out (it's scripted), and so are recordings whose clock was stopped,
 * since their times drift from the real match.
 */
export function cycleTimes(report: Pick<Report, 'events' | 'paused'>): number[] {
  if (report.paused) return []
  const starts = stackStarts(report)
  return starts.slice(1).map((t, i) => (t - starts[i]) / 1000)
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Every cycle from these recordings pooled, so one slow cycle (defense, a jam) doesn't skew it. */
export function cycleSummary(reports: Pick<Report, 'events' | 'paused'>[]): { median: number | null; count: number } {
  const all = reports.flatMap(cycleTimes)
  return { median: median(all), count: all.length }
}

export function formatSeconds(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)} s`
}
