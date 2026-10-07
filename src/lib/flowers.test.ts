import { describe, expect, it } from 'vitest'
import { matchFacts } from './consensus'
import { newReport } from './factories'
import { flowerResult, flowerTotals } from './flowers'
import type { Alliance, FlowerBall } from './types'

describe('flowers', () => {
  it('gives ownership to the top-most nectar and the bonus to the bottom-most', () => {
    // The example from the request: yellow blue blue red yellow, bottom → top.
    expect(flowerResult(['pollen', 'blue', 'blue', 'red', 'pollen'])).toEqual({ owner: 'red', bonus: 'blue', balls: 5 })
    expect(flowerResult(['pollen', 'pollen'])).toEqual({ owner: null, bonus: null, balls: 2 })
    expect(flowerResult([])).toEqual({ owner: null, bonus: null, balls: 0 })
  })

  it('totals bonus flowers and owned balls per alliance', () => {
    const flowers: FlowerBall[][] = [['pollen', 'blue', 'blue', 'red', 'pollen'], ['red'], ['blue', 'pollen'], []]
    expect(flowerTotals(flowers, 'red')).toEqual({ bottomNectarFlowers: 1, ownedFlowerBalls: 6 })
    expect(flowerTotals(flowers, 'blue')).toEqual({ bottomNectarFlowers: 2, ownedFlowerBalls: 2 })
  })

  it('lets every scout’s flowers count for both alliances', () => {
    const rec = (alliance: Alliance, flowers: FlowerBall[][]) => {
      const r = newReport('t1', 1)
      r.pre = { ...r.pre, matchNumber: 1, teamNumber: alliance === 'red' ? 1 : 2, alliance }
      r.post = { ...r.post, flowers, ...flowerTotals(flowers, alliance) }
      return r
    }
    const a = rec('red', [['red', 'blue'], [], [], []])
    const b = rec('blue', [['red', 'blue', 'pollen'], [], [], []])
    const facts = matchFacts([a, b])
    expect(facts.find((f) => f.key === 'blue.ownedFlowerBalls')).toMatchObject({ status: 'small', value: 2.5 })
    expect(facts.find((f) => f.key === 'red.bottomNectarFlowers')).toMatchObject({ status: 'agreed', value: 1 })
    expect(facts.find((f) => f.key === 'red.bottomNectarFlowers')!.entries).toHaveLength(2)
  })
})
