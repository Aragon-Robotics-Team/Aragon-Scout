import type { Aiming, Alliance, Launcher, PitReport, RobotSize } from './types'

/** Pit starting positions don't belong to an alliance; they're all drawn on the red half. */
export const PIT_ALLIANCE: Alliance = 'red'
export const MAX_PIT_STARTS = 2

export const AIMING_LABELS: Record<Aiming, string> = { turret: 'Turret', fixed: 'Fixed' }
export const LAUNCHER_LABELS: Record<Launcher, string> = {
  over: 'Fixed over shooter',
  under: 'Fixed under shooter',
  counterRoller: 'Counter-roller / roller on hood',
  other: 'Other',
}
export const SIZE_LABELS: Record<RobotSize, string> = { small: 'Small', medium: 'Medium', big: 'Big' }
export const SIZE_HINT = 'Small: well under 18 in · Big: near the 18 in limit'

/** 128-bit string hash (cyrb128), as four 32-bit words. */
function hash128(text: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

/**
 * The same UUID for a (tournament, team) on every device, so the team's pit
 * report is one shared document even when it's started on two phones offline.
 */
export function pitReportId(tournamentId: string, teamNumber: number): string {
  const hex = hash128(`pit:${tournamentId}:${teamNumber}`)
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('')
  // Version 8 (custom) and the RFC 4122 variant, so it's a well-formed UUID.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export function newPitReport(tournamentId: string, teamNumber: number, teamName = ''): PitReport {
  const now = Date.now()
  return {
    id: pitReportId(tournamentId, teamNumber),
    schemaVersion: 1,
    tournamentId,
    teamNumber,
    teamName,
    autoLeave: null,
    autoPark: null,
    starts: [],
    expectedBalls: null,
    expectedTips: null,
    aiming: null,
    launcher: null,
    launcherOther: '',
    flowerIntake: null,
    size: null,
    strengths: '',
    improvements: '',
    extra: '',
    editedBy: null,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
}

/** Fills fields missing on reports saved by an older version of the app. */
export function normalizePitReport(doc: PitReport): PitReport {
  return { ...newPitReport(doc.tournamentId, doc.teamNumber), ...doc, starts: Array.isArray(doc.starts) ? doc.starts : [] }
}

export function launcherLabel(r: Pick<PitReport, 'launcher' | 'launcherOther'>): string | null {
  if (!r.launcher) return null
  return r.launcher === 'other' ? r.launcherOther.trim() || 'Other' : LAUNCHER_LABELS[r.launcher]
}

/** Each team's latest live pit report per tournament, newest tournament first per team. */
export function pitReportsByTeam(pitReports: PitReport[], tournamentOrder: Map<string, number>): Map<number, PitReport[]> {
  const out = new Map<number, PitReport[]>()
  for (const r of pitReports) {
    if (r.deleted) continue
    const list = out.get(r.teamNumber)
    if (list) list.push(r)
    else out.set(r.teamNumber, [r])
  }
  for (const list of out.values()) {
    list.sort((a, b) => (tournamentOrder.get(b.tournamentId) ?? 0) - (tournamentOrder.get(a.tournamentId) ?? 0) || b.updatedAt - a.updatedAt)
  }
  return out
}
