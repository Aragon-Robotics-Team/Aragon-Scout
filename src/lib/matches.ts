import type { MatchType, PreMatch } from './types'

export function matchTypeOf(pre: Pick<PreMatch, 'matchType'>): MatchType {
  return pre.matchType ?? 'qual'
}

/** Short label used in lists and URLs: "Q12" / "P3". */
export function matchLabel(type: MatchType, n: number | null): string {
  return `${type === 'playoff' ? 'P' : 'Q'}${n ?? '?'}`
}

export function matchTitle(type: MatchType, n: number | null): string {
  return `${type === 'playoff' ? 'Playoff' : 'Qualification'} ${n ?? '?'}`
}

/** Parses a URL segment like "Q12", "p3" or a bare "12" (qual). */
export function parseMatchParam(param: string | undefined): { type: MatchType; number: number } | null {
  const m = /^([qp]?)(\d+)$/i.exec(param ?? '')
  if (!m) return null
  return { type: m[1].toLowerCase() === 'p' ? 'playoff' : 'qual', number: Number(m[2]) }
}

export function matchPath(base: string, tournamentId: string | null, pre: Pick<PreMatch, 'matchType' | 'matchNumber'>, reportId?: string) {
  const path = `${base}/matches/${tournamentId ?? 'none'}/${matchLabel(matchTypeOf(pre), pre.matchNumber)}`
  return reportId ? `${path}?r=${reportId}` : path
}

/** Quals before playoffs, then by number. */
export function compareMatches(
  a: { type: MatchType; number: number },
  b: { type: MatchType; number: number },
): number {
  if (a.type !== b.type) return a.type === 'qual' ? -1 : 1
  return a.number - b.number
}
