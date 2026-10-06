import { describe, expect, it } from 'vitest'
import { snapHeading, snapStart } from './field'

describe('starting position', () => {
  it('snaps a mid-field tap to the nearest wall on the alliance half', () => {
    expect(snapStart(60, 72, 0, 'red')).toMatchObject({ x: 9, y: 72, facing: 90 })
    expect(snapStart(84, 72, 0, 'blue')).toMatchObject({ x: 135, y: 72, facing: 270 })
  })

  it('keeps the robot on its own half', () => {
    const p = snapStart(100, 140, 0, 'red')
    expect(p.x).toBeLessThanOrEqual(72 - 9)
    expect(p).toMatchObject({ y: 135, facing: 0 })
  })

  it('slides out of the loading zone and away from flowers', () => {
    // Red loading zone spans y 24.5–47.5 on the left wall.
    expect(snapStart(5, 30, 0, 'red')).toMatchObject({ x: 9, y: 15.5 })
    // Flower at (48, 0) on the top wall: a robot centered under it would touch it.
    const p = snapStart(48, 5, 0, 'red')
    expect(p.y).toBe(9)
    expect(Math.abs(p.x - 48)).toBeGreaterThanOrEqual(9 + 3.5)
  })

  it('turns in 15° steps, pulling toward square angles', () => {
    expect(snapHeading(22)).toBe(15)
    expect(snapHeading(38)).toBe(45)
    expect(snapHeading(98)).toBe(90)
    expect(snapHeading(-5)).toBe(0)
    expect(snapHeading(352)).toBe(0)
  })
})
