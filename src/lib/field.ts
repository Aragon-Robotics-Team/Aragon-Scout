import type { Alliance, StartPose } from './types'

// BIOBUZZ field geometry in inches, as seen from the audience: red on the left.
// x runs left → right, y runs top → bottom (Competition Manual §9, Figure 9-2).
export const FIELD = 144
export const TILE = 24
/** STARTING CONFIGURATION is an 18-inch cube (R102). */
export const ROBOT = 18

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 23 in. wide × 11 in. deep, against each alliance's side wall. */
export const LOADING_ZONES: Record<Alliance, Rect> = {
  red: { x: 0, y: 24.5, w: 11, h: 23 },
  blue: { x: FIELD - 11, y: FIELD - 47.5, w: 11, h: 23 },
}

/** 23 in. × 2 in. strips in opposite corners. */
export const GARDENS: Record<Alliance, Rect> = {
  red: { x: 0, y: FIELD - 2, w: 23, h: 2 },
  blue: { x: FIELD - 23, y: 0, w: 23, h: 2 },
}

/** Wall-mounted flowers, centered on the perimeter. */
export const FLOWERS = [
  { x: 48, y: 0 },
  { x: 0, y: 96 },
  { x: FIELD, y: 48 },
  { x: 96, y: FIELD },
]
export const FLOWER_R = 3.5

/** Half the width of the robot's axis-aligned bounding box at a heading. */
export function halfExtent(heading: number): number {
  const r = (heading * Math.PI) / 180
  return (ROBOT / 2) * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)))
}

function overlaps(cx: number, cy: number, h: number, r: Rect): boolean {
  return cx + h > r.x && cx - h < r.x + r.w && cy + h > r.y && cy - h < r.y + r.h
}

function touchesFlower(cx: number, cy: number, h: number): boolean {
  return FLOWERS.some((f) => {
    const dx = Math.max(Math.abs(f.x - cx) - h, 0)
    const dy = Math.max(Math.abs(f.y - cy) - h, 0)
    return dx * dx + dy * dy < FLOWER_R * FLOWER_R
  })
}

/**
 * Moves a tapped point to the nearest legal start (G304): on the alliance's
 * half, touching the perimeter wall, clear of the loading zone and flowers.
 * Also returns which way the robot faces away from that wall.
 */
export function snapStart(px: number, py: number, heading: number, alliance: Alliance): StartPose & { facing: number } {
  const h = halfExtent(heading)
  const [xMin, xMax] = alliance === 'red' ? [h, FIELD / 2 - h] : [FIELD / 2 + h, FIELD - h]
  const side = alliance === 'red' ? { x: h, facing: 90 } : { x: FIELD - h, facing: 270 }
  const walls = [
    { from: [side.x, h], to: [side.x, FIELD - h], facing: side.facing },
    { from: [xMin, h], to: [xMax, h], facing: 180 },
    { from: [xMin, FIELD - h], to: [xMax, FIELD - h], facing: 0 },
  ]
  let best: (StartPose & { facing: number }) | null = null
  let bestD = Infinity
  for (const w of walls) {
    const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1])
    for (let d = 0; d <= len; d += 0.5) {
      const x = w.from[0] + ((w.to[0] - w.from[0]) * d) / len
      const y = w.from[1] + ((w.to[1] - w.from[1]) * d) / len
      if (overlaps(x, y, h, LOADING_ZONES[alliance]) || touchesFlower(x, y, h)) continue
      const dist = Math.hypot(x - px, y - py)
      if (dist < bestD) {
        bestD = dist
        best = { x, y, heading, facing: w.facing }
      }
    }
  }
  return best!
}

/** Rounds a drag angle to 15° steps, pulling toward square-to-the-wall within 10°. */
export function snapHeading(deg: number): number {
  const a = ((deg % 360) + 360) % 360
  const square = Math.round(a / 90) * 90
  const out = Math.abs(a - square) <= 10 ? square : Math.round(a / 15) * 15
  return out % 360
}

/** Heading from the robot's center toward a point, in this file's convention. */
export function headingToward(fromX: number, fromY: number, toX: number, toY: number): number {
  return (Math.atan2(toX - fromX, fromY - toY) * 180) / Math.PI
}
