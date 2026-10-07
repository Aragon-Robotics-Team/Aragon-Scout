import { resultsKey, type OfficialResult } from './ftcscout'
import { allianceEstimate, groupMatches, type MatchGroup } from './grouping'
import { pointsFor } from './scoring'
import { readJson } from './storage'
import type { PointValues, Report, Tournament } from './types'

/** One alliance in one match: its teams and its non-penalty score. */
export interface AllianceRow {
  teams: number[]
  score: number
}

/** A team needs this many matches in the data before its OPR is shown. */
export const MIN_MATCHES_PER_TEAM = 3
/** The whole fit needs at least this many alliance scores per team. */
const MIN_ROWS_PER_TEAM = 1.5
/**
 * Added to the diagonal of MᵀM so the system still solves when it's
 * singular (early in an event, or two teams that always played together).
 * Small enough not to move well-determined ratings.
 */
const RIDGE = 1e-3

export interface OprResult {
  /** Team → OPR, only for teams with enough matches. */
  opr: Map<number, number>
  /** Teams in the data with too few matches to rate. */
  tooFew: Set<number>
  /** False when there are too few scores overall to rate anyone. */
  enough: boolean
  rows: number
}

/**
 * Offensive Power Rating by least squares: each alliance's score is modeled
 * as the sum of its teams' ratings, and x = (MᵀM)⁻¹ Mᵀs.
 */
export function computeOpr(rows: AllianceRow[]): OprResult {
  const teams = [...new Set(rows.flatMap((r) => r.teams))].sort((a, b) => a - b)
  const index = new Map(teams.map((t, i) => [t, i]))
  const n = teams.length
  const played = new Map<number, number>()
  for (const r of rows) for (const t of r.teams) played.set(t, (played.get(t) ?? 0) + 1)
  const tooFew = new Set(teams.filter((t) => (played.get(t) ?? 0) < MIN_MATCHES_PER_TEAM))
  const enough = n > 0 && rows.length >= MIN_ROWS_PER_TEAM * n
  if (!enough) return { opr: new Map(), tooFew: new Set(teams), enough, rows: rows.length }

  // MᵀM is n×n: diagonal = matches played, off-diagonal = matches played together.
  const A = Array.from({ length: n }, () => new Float64Array(n))
  const b = new Float64Array(n)
  for (const r of rows) {
    const ids = r.teams.map((t) => index.get(t)!)
    for (const i of ids) {
      b[i] += r.score
      for (const j of ids) A[i][j] += 1
    }
  }
  for (let i = 0; i < n; i++) A[i][i] += RIDGE

  const x = solveSymmetric(A, b)
  const opr = new Map<number, number>()
  teams.forEach((t, i) => {
    if (!tooFew.has(t)) opr.set(t, x[i])
  })
  return { opr, tooFew, enough, rows: rows.length }
}

/** Solves A x = b for symmetric positive-definite A by Cholesky decomposition. */
function solveSymmetric(A: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length
  const L = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j]
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k]
      L[i][j] = i === j ? Math.sqrt(Math.max(sum, 1e-12)) : sum / L[j][j]
    }
  }
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let sum = b[i]
    for (let k = 0; k < i; k++) sum -= L[i][k] * y[k]
    y[i] = sum / L[i][i]
  }
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i]
    for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k]
    x[i] = sum / L[i][i]
  }
  return x
}

/**
 * The alliance scores OPR is fit to, for one tournament's qualification
 * matches: FTCScout's official non-penalty scores where it has them,
 * otherwise each alliance's estimate from the scouts' recordings (also
 * penalty-free). Playoffs are left out, as is usual for OPR.
 */
export function oprRows(groups: MatchGroup[], official: OfficialResult[], points: PointValues): AllianceRow[] {
  const rows: AllianceRow[] = []
  const covered = new Set<number>()
  for (const m of official) {
    covered.add(m.match)
    rows.push({ teams: m.red, score: m.redScore }, { teams: m.blue, score: m.blueScore })
  }
  for (const g of groups) {
    if (g.matchType !== 'qual' || covered.has(g.matchNumber)) continue
    for (const a of ['red', 'blue'] as const) {
      const teams = (a === 'red' ? g.red : g.blue).map((t) => t.number)
      const score = allianceEstimate(g, a, points)
      if (teams.length === 2 && score != null) rows.push({ teams, score })
    }
  }
  return rows
}

/** Official results saved on this device for a tournament, if any were downloaded. */
export function savedOfficial(tournamentId: string): OfficialResult[] {
  return readJson<{ results: OfficialResult[] }>(resultsKey(tournamentId))?.results ?? []
}

export function tournamentOpr(t: Tournament, reports: Report[], tournaments: Tournament[], official: OfficialResult[]): OprResult {
  const groups = groupMatches(
    reports.filter((r) => r.tournamentId === t.id),
    tournaments,
  )
  return computeOpr(oprRows(groups, official, pointsFor(t)))
}

/**
 * Across all tournaments OPRs from different events can't be fit together,
 * so each team shows its rating from the latest tournament that rated it.
 */
export function latestOpr(reports: Report[], tournaments: Tournament[]): Map<number, number> {
  const out = new Map<number, number>()
  const ordered = [...tournaments].filter((t) => !t.deleted).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || a.createdAt - b.createdAt)
  for (const t of ordered) {
    for (const [team, v] of tournamentOpr(t, reports, tournaments, savedOfficial(t.id)).opr) out.set(team, v)
  }
  return out
}
