import { formatElapsed, phaseAt } from './timing'
import type { Alliance, Report, Resolution, Tournament } from './types'

/**
 * How far apart recordings of one match may be before they need fixing.
 * Differences up to these limits only warn; stats use the average.
 * Edit here to change them — the app has no setting for this on purpose.
 */
export const LIMITS = {
  /** Alliance end-of-match counts (flowers and balls). */
  balls: 2,
  /** Final scores. */
  points: 3,
  /** Two scouts' taps within this many ms are the same hive tip. */
  tipWindowMs: 5_000,
}

const COUNTS = ['bottomNectarFlowers', 'ownedFlowerBalls', 'gardenBalls', 'cellBalls'] as const
type CountKey = (typeof COUNTS)[number]

const COUNT_LABELS: Record<CountKey, string> = {
  bottomNectarFlowers: 'bottom nectar flowers',
  ownedFlowerBalls: 'balls in owned flowers',
  gardenBalls: 'balls in garden',
  cellBalls: 'balls left in cell',
}

export type FactKey = 'redScore' | 'blueScore' | `${Alliance}.${CountKey}` | `${Alliance}.tips`

export interface Fact {
  key: FactKey
  label: string
  /** One entry per recording that filled this in. */
  entries: { reportId: string; teamNumber: number | null; value: number }[]
  /** agreed: all equal · small: within LIMITS, warn only · large: needs fixing */
  status: 'agreed' | 'small' | 'large'
  /** What explains a large tip disagreement, beyond differing counts. */
  detail?: string
  resolution?: Resolution
  /** The value stats use: resolved, else the average; null while a large difference is unresolved. */
  value: number | null
  /** Averaged tip times (ms) when scouts' tips line up; tips facts only. */
  tipTimes?: number[]
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

function average(values: number[]): number {
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

function numberFact(key: FactKey, label: string, entries: Fact['entries'], limit: number, resolution: Resolution | undefined): Fact | null {
  if (entries.length === 0) return null
  const values = entries.map((e) => e.value)
  const spread = Math.max(...values) - Math.min(...values)
  const status = spread === 0 ? 'agreed' : spread <= limit ? 'small' : 'large'
  return { key, label, entries, status, resolution, value: settle(status, average(values), resolution) }
}

function settle(status: Fact['status'], fallback: number, resolution: Resolution | undefined): number | null {
  if (resolution && 'value' in resolution) return resolution.value
  if (status === 'large' && !resolution) return null
  return fallback
}

/**
 * Lines up tips from several recordings: tips within the window are one tip.
 * Returns each tip's taps (one slot per recording, undefined where missing).
 */
export function lineUpTips(lists: number[][], windowMs = LIMITS.tipWindowMs): (number | undefined)[][] {
  const taps = lists.flatMap((ts, source) => ts.map((t) => ({ t, source }))).sort((a, b) => a.t - b.t)
  const used = new Set<(typeof taps)[number]>()
  const tips: (number | undefined)[][] = []
  for (const first of taps) {
    if (used.has(first)) continue
    const slots: (number | undefined)[] = lists.map(() => undefined)
    for (const tap of taps) {
      if (used.has(tap) || tap.t < first.t || tap.t - first.t > windowMs || slots[tap.source] !== undefined) continue
      slots[tap.source] = tap.t
      used.add(tap)
    }
    tips.push(slots)
  }
  return tips
}

function tipsFact(alliance: Alliance, recs: Report[], resolution: Resolution | undefined): Fact | null {
  if (recs.length === 0) return null
  const key: FactKey = `${alliance}.tips`
  const label = `${cap(alliance)} alliance tips`
  const tipsOf = (r: Report) => r.events.filter((e) => e.type === 'tip').map((e) => e.t)
  const entries = recs.map((r) => ({ reportId: r.id, teamNumber: r.pre.teamNumber, value: tipsOf(r).length }))
  const current = recs.filter((r) => r.allianceTips)

  // Older recordings only tapped their own robot's tips: each robot adds its own, unchecked.
  if (current.length === 0) {
    const sum = entries.reduce((n, e) => n + e.value, 0)
    return { key, label, entries, status: 'agreed', resolution, value: resolution && 'value' in resolution ? resolution.value : sum }
  }

  const counts = current.map((r) => tipsOf(r).length)
  // Stopped clocks shift tap times, so those recordings only count, they don't time.
  const timed = current.filter((r) => !r.paused)
  const lined = lineUpTips(timed.map(tipsOf))
  const unmatched = lined.filter((slots) => slots.some((t) => t === undefined))
  const countsDiffer = new Set(counts).size > 1
  const status: Fact['status'] = countsDiffer || unmatched.length > 0 ? 'large' : 'agreed'

  let detail: string | undefined
  if (!countsDiffer && unmatched.length > 0) {
    const at = unmatched.map((slots) => formatElapsed(average(slots.filter((t): t is number => t !== undefined)))).join(', ')
    detail = `Tips at ${at} weren't recorded within ${LIMITS.tipWindowMs / 1000}s by every scout`
  }
  const tipTimes = status === 'agreed' && timed.length > 0 ? lined.map((slots) => average(slots as number[])) : undefined
  const currentEntries = entries.filter((e) => current.some((r) => r.id === e.reportId))
  return { key, label, entries: currentEntries, status, detail, resolution, value: settle(status, counts[0], resolution), tipTimes }
}

/** Every alliance-level value recorded for one match, compared across recordings. */
export function matchFacts(reports: Report[], resolutions: Partial<Record<FactKey, Resolution>> = {}): Fact[] {
  const facts: (Fact | null)[] = []
  for (const [key, label] of [
    ['redScore', 'Red score'],
    ['blueScore', 'Blue score'],
  ] as const) {
    const entries = reports.flatMap((r) => (r.post[key] != null ? [{ reportId: r.id, teamNumber: r.pre.teamNumber, value: r.post[key]! }] : []))
    facts.push(numberFact(key, label, entries, LIMITS.points, resolutions[key]))
  }
  for (const alliance of ['red', 'blue'] as const) {
    const recs = reports.filter((r) => r.pre.alliance === alliance)
    for (const c of COUNTS) {
      const key: FactKey = `${alliance}.${c}`
      const entries = recs.flatMap((r) => (r.post[c] != null ? [{ reportId: r.id, teamNumber: r.pre.teamNumber, value: r.post[c]! }] : []))
      facts.push(numberFact(key, `${cap(alliance)} ${COUNT_LABELS[c]}`, entries, LIMITS.balls, resolutions[key]))
    }
    facts.push(tipsFact(alliance, recs, resolutions[`${alliance}.tips`]))
  }
  return facts.filter((f): f is Fact => f != null)
}

/** The warning line for a fact that isn't agreed and hasn't been fixed. */
export function factMessage(f: Fact): string | null {
  if (f.status === 'agreed' || (f.resolution && 'value' in f.resolution)) return null
  const values = [...new Set(f.entries.map((e) => e.value))].join(' vs ')
  if (f.key.endsWith('.tips')) return f.detail && new Set(f.entries.map((e) => e.value)).size === 1 ? `${f.label}: ${f.detail}` : `${f.label} don't match: ${values}`
  return `${f.label} entered differently: ${values}`
}

/** Facts that still need someone to pick the right value. */
export function needsFixing(f: Fact): boolean {
  return f.status === 'large' && !f.resolution
}

export function resolutionsFor(tournament: Tournament | undefined, matchType: string, matchNumber: number): Partial<Record<FactKey, Resolution>> {
  return tournament?.resolutions?.[`${matchType}:${matchNumber}`] ?? {}
}

/** Saves an agreed value (or "keep as is") for one fact of one match, returning the updated tournament. */
export function withResolution(t: Tournament, matchType: string, matchNumber: number, key: FactKey, res: Resolution | null): Tournament {
  const mk = `${matchType}:${matchNumber}`
  const forMatch = { ...(t.resolutions?.[mk] ?? {}) }
  if (res) forMatch[key] = res
  else delete forMatch[key]
  return { ...t, resolutions: { ...t.resolutions, [mk]: forMatch } }
}

/** A post-match field's value as stats should see it. */
export function factValue(facts: Fact[], key: FactKey): number | null {
  return facts.find((f) => f.key === key)?.value ?? null
}

/** Auto/teleop split of agreed tip times, for scoring them. */
export function tipPhases(times: number[]): { auto: number; teleop: number } {
  const auto = times.filter((t) => phaseAt(t) === 'auto').length
  return { auto, teleop: times.length - auto }
}

/** Averaged tip times for an alliance, when scouts' tips line up. */
export function tipTimesLabel(f: Fact | undefined): string | null {
  if (!f?.tipTimes || f.tipTimes.length === 0) return null
  return f.tipTimes.map(formatElapsed).join(', ')
}
