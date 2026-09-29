import { alliancePostPoints, pointsFor, robotStats, winnerOf } from './scoring'
import type { Report, Tournament } from './types'

export const EXPORT_APP = 'aragon-scout'

export interface ExportFile {
  app: typeof EXPORT_APP
  version: 1
  exportedAt: string
  scoutingTeam: number | null
  tournaments: Tournament[]
  reports: (Report & { computed: ReturnType<typeof computed> })[]
}

function computed(report: Report, tournament: Tournament | undefined) {
  const points = pointsFor(tournament)
  return {
    robot: robotStats(report, points),
    alliancePostPoints: alliancePostPoints(report, points),
    winner: winnerOf(report.post.redScore, report.post.blueScore),
  }
}

/** Compiles reports into the downloadable JSON, with derived stats alongside the raw data. */
export function buildExport(reports: Report[], tournaments: Tournament[], scoutingTeam: number | null): ExportFile {
  const live = reports.filter((r) => !r.deleted)
  const usedIds = new Set(live.map((r) => r.tournamentId))
  const ts = tournaments.filter((t) => !t.deleted && usedIds.has(t.id))
  const byId = new Map(ts.map((t) => [t.id, t]))
  return {
    app: EXPORT_APP,
    version: 1,
    exportedAt: new Date().toISOString(),
    scoutingTeam,
    tournaments: ts,
    reports: live.map((r) => ({ ...r, computed: computed(r, byId.get(r.tournamentId ?? '')) })),
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Validates an exported file and returns clean documents (derived stats are dropped). */
export function parseImport(text: string): { scoutingTeam: number | null; tournaments: Tournament[]; reports: Report[] } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!isObj(data) || data.app !== EXPORT_APP || !Array.isArray(data.reports) || !Array.isArray(data.tournaments)) {
    throw new Error('That file is not an Aragon Scout export.')
  }
  const reports: Report[] = []
  for (const r of data.reports) {
    if (!isObj(r) || typeof r.id !== 'string' || !isObj(r.pre) || !Array.isArray(r.events) || !isObj(r.post) || !isObj(r.toggles)) {
      throw new Error('The file contains a malformed match report.')
    }
    const { computed: _computed, ...doc } = r as unknown as Report & { computed?: unknown }
    reports.push(doc)
  }
  const tournaments: Tournament[] = []
  for (const t of data.tournaments) {
    if (!isObj(t) || typeof t.id !== 'string' || typeof t.name !== 'string') {
      throw new Error('The file contains a malformed tournament.')
    }
    tournaments.push(t as unknown as Tournament)
  }
  return { scoutingTeam: typeof data.scoutingTeam === 'number' ? data.scoutingTeam : null, tournaments, reports }
}
