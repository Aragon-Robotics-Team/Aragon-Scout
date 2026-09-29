import type { Alliance, PointValues, Report, RpThresholds, Tournament } from './types'

// Defaults from BIOBUZZ Competition Manual V1, Table 10-2 and Table 10-3 ("All Other Events").
export const DEFAULT_POINTS: PointValues = {
  leave: 3,
  autoPark: 5,
  teleopPark: 5,
  autoTip: 20,
  teleopTip: 20,
  cellBall: 2,
  bottomNectar: 5,
  ownedFlowerBall: 2,
  gardenBall: 1,
}

export const DEFAULT_THRESHOLDS: RpThresholds = {
  swarmPoints: 16,
  pollinator1Tips: 4,
  pollinator2Tips: 7,
}

export interface PhaseCounts {
  nectarScored: number
  nectarMissed: number
  pollenScored: number
  pollenMissed: number
  tips: number
  flowerNectar: number
  flowerPollen: number
}

export interface RobotStats {
  auto: PhaseCounts
  teleop: PhaseCounts
  total: PhaseCounts
  /** scored / attempted, or null when nothing was attempted. */
  nectarAccuracy: number | null
  pollenAccuracy: number | null
  overallAccuracy: number | null
  leave: boolean
  autoPark: boolean
  teleopPark: boolean
  /** LEAVE + PARK points (feeds the alliance's SWARM RP). */
  swarmPoints: number
  /**
   * Points this robot earned directly: leave, parks, and hive tips.
   * NOTE: a "tip" is currently recorded only when the scouted robot's launch
   * tips the hive, and is credited fully to that robot. This rule may change
   * (e.g. to alliance-level tips) — keep tip attribution in this function.
   */
  estPoints: number
}

function emptyCounts(): PhaseCounts {
  return { nectarScored: 0, nectarMissed: 0, pollenScored: 0, pollenMissed: 0, tips: 0, flowerNectar: 0, flowerPollen: 0 }
}

function addCounts(a: PhaseCounts, b: PhaseCounts): PhaseCounts {
  return {
    nectarScored: a.nectarScored + b.nectarScored,
    nectarMissed: a.nectarMissed + b.nectarMissed,
    pollenScored: a.pollenScored + b.pollenScored,
    pollenMissed: a.pollenMissed + b.pollenMissed,
    tips: a.tips + b.tips,
    flowerNectar: a.flowerNectar + b.flowerNectar,
    flowerPollen: a.flowerPollen + b.flowerPollen,
  }
}

function ratio(scored: number, missed: number): number | null {
  const attempts = scored + missed
  return attempts === 0 ? null : scored / attempts
}

export function robotStats(report: Report, points: PointValues = DEFAULT_POINTS): RobotStats {
  const auto = emptyCounts()
  const teleop = emptyCounts()
  for (const e of report.events) {
    const c = e.phase === 'auto' ? auto : teleop
    switch (e.type) {
      case 'nectar_score': c.nectarScored++; break
      case 'nectar_miss': c.nectarMissed++; break
      case 'pollen_score': c.pollenScored++; break
      case 'pollen_miss': c.pollenMissed++; break
      case 'tip': c.tips++; break
      case 'flower_nectar': c.flowerNectar++; break
      case 'flower_pollen': c.flowerPollen++; break
    }
  }
  const total = addCounts(auto, teleop)
  const { leave, autoPark, teleopPark } = report.toggles
  const swarmPoints =
    (leave ? points.leave : 0) + (autoPark ? points.autoPark : 0) + (teleopPark ? points.teleopPark : 0)
  const estPoints = swarmPoints + auto.tips * points.autoTip + teleop.tips * points.teleopTip
  return {
    auto,
    teleop,
    total,
    nectarAccuracy: ratio(total.nectarScored, total.nectarMissed),
    pollenAccuracy: ratio(total.pollenScored, total.pollenMissed),
    overallAccuracy: ratio(total.nectarScored + total.pollenScored, total.nectarMissed + total.pollenMissed),
    leave,
    autoPark,
    teleopPark,
    swarmPoints,
    estPoints,
  }
}

/** End-of-match alliance points from the post-match counts (null fields count as 0). */
export function alliancePostPoints(report: Report, points: PointValues = DEFAULT_POINTS): number {
  const p = report.post
  return (
    (p.bottomNectarFlowers ?? 0) * points.bottomNectar +
    (p.ownedFlowerBalls ?? 0) * points.ownedFlowerBall +
    (p.gardenBalls ?? 0) * points.gardenBall +
    (p.cellBalls ?? 0) * points.cellBall
  )
}

export type Outcome = Alliance | 'tie'

export function winnerOf(redScore: number | null, blueScore: number | null): Outcome | null {
  if (redScore == null || blueScore == null) return null
  if (redScore > blueScore) return 'red'
  if (blueScore > redScore) return 'blue'
  return 'tie'
}

export function pointsFor(tournament: Tournament | undefined): PointValues {
  return tournament?.points ?? DEFAULT_POINTS
}

export function thresholdsFor(tournament: Tournament | undefined): RpThresholds {
  return tournament?.thresholds ?? DEFAULT_THRESHOLDS
}

export function formatPct(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

export function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length
}

export function formatNum(value: number | null, digits = 1): string {
  if (value == null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}
