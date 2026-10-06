import type { Phase } from './types'

// BIOBUZZ match timing (Competition Manual §10.4).
export const AUTO_MS = 30_000
export const TRANSITION_MS = 8_000
export const TELEOP_MS = 120_000
export const TELEOP_START_MS = AUTO_MS + TRANSITION_MS
export const MATCH_MS = TELEOP_START_MS + TELEOP_MS
/** Flower scoring unlocks with 1:00 left in the match (§10.5.2, G410). */
export const FLOWER_UNLOCK_MS = MATCH_MS - 60_000

export type Stage = 'auto' | 'transition' | 'teleop' | 'done'

export function stageAt(elapsed: number): Stage {
  if (elapsed < AUTO_MS) return 'auto'
  if (elapsed < TELEOP_START_MS) return 'transition'
  if (elapsed < MATCH_MS) return 'teleop'
  return 'done'
}

/** Taps during the auto→teleop transition count as auto. */
export function phaseAt(elapsed: number): Phase {
  return elapsed < TELEOP_START_MS ? 'auto' : 'teleop'
}

/** Time left in the current stage, in ms. */
export function remainingInStage(elapsed: number): number {
  switch (stageAt(elapsed)) {
    case 'auto':
      return AUTO_MS - elapsed
    case 'transition':
      return TELEOP_START_MS - elapsed
    case 'teleop':
      return MATCH_MS - elapsed
    case 'done':
      return 0
  }
}

/** Game-clock time left out of 2:30; holds at 2:00 through the transition, like the field display. */
export function matchRemaining(elapsed: number): number {
  if (elapsed < AUTO_MS) return AUTO_MS + TELEOP_MS - elapsed
  if (elapsed < TELEOP_START_MS) return TELEOP_MS
  return Math.max(0, MATCH_MS - elapsed)
}

/** A recording's clock, which the scout can stop and restart mid-match. */
export interface Clock {
  /** null until the scout presses Start. */
  startedAt: number | null
  /** Set while stopped. */
  pausedAt: number | null
  /** Total time spent stopped before the current stop. */
  pausedMs: number
}

export function clockElapsed(c: Clock, now: number): number {
  if (c.startedAt == null) return 0
  return (c.pausedAt ?? now) - c.startedAt - c.pausedMs
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Elapsed time since start, formatted as m:ss (floored, for event labels). */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
