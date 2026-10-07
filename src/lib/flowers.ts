import type { Alliance, FlowerBall, PostMatch } from './types'

/** Where each flower sits, matching the order of FLOWERS in field.ts. */
export const FLOWER_NAMES = ['Top wall', 'Left wall', 'Right wall', 'Bottom wall'] as const

export function emptyFlowers(): FlowerBall[][] {
  return FLOWER_NAMES.map(() => [])
}

export interface FlowerResult {
  /** Top-most nectar's alliance; it scores every ball in the flower (§10.5.2). */
  owner: Alliance | null
  /** Bottom-most nectar's alliance; it earns the Bottom NECTAR Bonus. */
  bonus: Alliance | null
  balls: number
}

export function flowerResult(stack: FlowerBall[]): FlowerResult {
  const nectar = stack.filter((b): b is Alliance => b !== 'pollen')
  return { owner: nectar.at(-1) ?? null, bonus: nectar[0] ?? null, balls: stack.length }
}

/** The two flower counts the scoring uses, for one alliance. */
export function flowerTotals(flowers: FlowerBall[][], alliance: Alliance): { bottomNectarFlowers: number; ownedFlowerBalls: number } {
  let bottomNectarFlowers = 0
  let ownedFlowerBalls = 0
  for (const stack of flowers) {
    const r = flowerResult(stack)
    if (r.bonus === alliance) bottomNectarFlowers++
    if (r.owner === alliance) ownedFlowerBalls += r.balls
  }
  return { bottomNectarFlowers, ownedFlowerBalls }
}

/**
 * A recording's flower counts for an alliance: from its flowers when entered
 * (which cover both alliances), else its typed counts for its own alliance.
 */
export function flowerCountsFor(post: PostMatch, ownAlliance: Alliance | null, alliance: Alliance) {
  if (post.flowers) return flowerTotals(post.flowers, alliance)
  if (ownAlliance !== alliance) return null
  return { bottomNectarFlowers: post.bottomNectarFlowers, ownedFlowerBalls: post.ownedFlowerBalls }
}
