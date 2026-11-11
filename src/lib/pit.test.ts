import { describe, expect, it } from 'vitest'
import { buildExport, parseImport } from './exportData'
import { newTournament } from './factories'
import { launcherLabel, newPitReport, normalizePitReport, pitReportId, pitReportsByTeam } from './pit'
import { withTeamAdded } from './teams'
import type { PitReport } from './types'

describe('pit reports', () => {
  it('gives a (tournament, team) the same well-formed UUID everywhere', () => {
    const id = pitReportId('t-1', 14323)
    expect(id).toBe(pitReportId('t-1', 14323))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(pitReportId('t-1', 14324)).not.toBe(id)
    expect(pitReportId('t-2', 14323)).not.toBe(id)
    expect(newPitReport('t-1', 14323).id).toBe(id)
  })

  it('starts with every question unanswered', () => {
    const r = newPitReport('t', 1, 'Buzz')
    expect([r.autoLeave, r.autoPark, r.flowerIntake, r.aiming, r.launcher, r.size]).toEqual([null, null, null, null, null, null])
    expect(r.starts).toEqual([])
  })

  it('fills in fields an older report is missing', () => {
    const old = { id: 'x', tournamentId: 't', teamNumber: 5, teamName: 'Five', updatedAt: 3 } as unknown as PitReport
    const r = normalizePitReport(old)
    expect(r.starts).toEqual([])
    expect(r.flowerIntake).toBeNull()
    expect(r.teamName).toBe('Five')
    expect(r.updatedAt).toBe(3)
  })

  it('labels the launcher, using the typed text for Other', () => {
    expect(launcherLabel({ launcher: 'counterRoller', launcherOther: '' })).toBe('Counter-roller / roller on hood')
    expect(launcherLabel({ launcher: 'other', launcherOther: ' Catapult ' })).toBe('Catapult')
    expect(launcherLabel({ launcher: 'other', launcherOther: '' })).toBe('Other')
    expect(launcherLabel({ launcher: null, launcherOther: '' })).toBeNull()
  })

  it('lists each team’s reports newest tournament first, without deleted ones', () => {
    const a = { ...newPitReport('old', 7), updatedAt: 1 }
    const b = { ...newPitReport('new', 7), updatedAt: 2 }
    const gone = { ...newPitReport('new', 8), deleted: true }
    const byTeam = pitReportsByTeam([a, b, gone], new Map([['old', 1], ['new', 2]]))
    expect(byTeam.get(7)?.map((r) => r.tournamentId)).toEqual(['new', 'old'])
    expect(byTeam.has(8)).toBe(false)
  })

  it('adds a new team to the tournament list, or fills a blank name', () => {
    const t = { ...newTournament('Q'), teams: [{ number: 1, name: 'One' }, { number: 2, name: '' }] }
    expect(withTeamAdded(t, 3, 'Three')).toEqual([{ number: 1, name: 'One' }, { number: 2, name: '' }, { number: 3, name: 'Three' }])
    expect(withTeamAdded(t, 2, 'Two')?.find((x) => x.number === 2)?.name).toBe('Two')
    expect(withTeamAdded(t, 1, 'Renamed')).toBeNull()
    expect(withTeamAdded(t, 2, ' ')).toBeNull()
    expect(withTeamAdded(t, null, 'x')).toBeNull()
  })

  it('round-trips through export and import, with their tournament', () => {
    const t = newTournament('Q')
    const r = { ...newPitReport(t.id, 42, 'Answer'), autoLeave: true, launcher: 'other' as const, launcherOther: 'Flinger' }
    const file = buildExport([], [t], 99, [r, { ...newPitReport(t.id, 43), deleted: true }])
    expect(file.tournaments.map((x) => x.id)).toEqual([t.id])
    const back = parseImport(JSON.stringify(file))
    expect(back.pitReports).toEqual([r])
  })

  it('imports files from before pit scouting', () => {
    const file = buildExport([], [], 99) as Partial<ReturnType<typeof buildExport>>
    delete file.pitReports
    expect(parseImport(JSON.stringify(file)).pitReports).toEqual([])
  })
})

describe('pit report sync before the server schema update', () => {
  it('recognises a missing table, and only that', async () => {
    const { isMissingTable } = await import('./sync')
    expect(isMissingTable('relation "public.pit_reports" does not exist')).toBe(true)
    expect(isMissingTable("Could not find the table 'public.pit_reports' in the schema cache")).toBe(true)
    expect(isMissingTable('new row violates row-level security policy')).toBe(false)
  })
})
