import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { newReport, newTournament } from './factories'
import { groupMatches } from './grouping'
import { compareMatches, matchLabel, parseMatchParam } from './matches'
import { findScheduledMatch, parseScheduleText, rowProblems, slotFill } from './schedule'
import { linesFromItems, type PositionedText } from './schedulePdf'
import { mergeTeams, parseTeamList, teamNameIndex } from './teams'

// Rows as they appear on an FTC Live / MatchMaker printout (from a real Silicon qualifier sheet).
const MATCHMAKER_TEXT = `Silicon Qualification Schedule
Teams:32   Matches Per Team:5   Matches:40
Start  Match  Field  Red 1  Red 2  Blue 1  Blue 2
9:45 AM  Qualification 1  1  14323  13217  8625  3470
9:52 AM  Qualification 2  2  32646  29619  19639  16236
Lunch
12:45 PM  Qualification 21  1  25667  4345  23641  8625
MatchMaker Scheduling Software © 2007-2024 Idle Loop Software Design, LLC
FIRST Tech Challenge Live © 2018-2026 FIRST®`

describe('parseScheduleText', () => {
  it('reads the MatchMaker layout and skips headers, lunch and footers', () => {
    const { matches, skipped } = parseScheduleText(MATCHMAKER_TEXT)
    expect(matches).toEqual([
      { match: 1, red: [14323, 13217], blue: [8625, 3470] },
      { match: 2, red: [32646, 29619], blue: [19639, 16236] },
      { match: 21, red: [25667, 4345], blue: [23641, 8625] },
    ])
    expect(skipped).toEqual([])
  })

  it('reads plain pasted rows with or without a field column', () => {
    const { matches } = parseScheduleText('1 14323 13217 8625 3470\n2\t2\t32646\t29619\t19639\t16236\nQ3, 19505, 26713, 8381, 25667')
    expect(matches.map((m) => m.match)).toEqual([1, 2, 3])
    expect(matches[1].red).toEqual([32646, 29619])
    expect(matches[2].blue).toEqual([8381, 25667])
  })

  it('ignores surrogate markers and reports rows it could not read', () => {
    const { matches, skipped } = parseScheduleText('Qualification 5 1 23287 21419* 16481 12635\nQualification 6 2 19862 30619')
    expect(matches).toEqual([{ match: 5, red: [23287, 21419], blue: [16481, 12635] }])
    expect(skipped).toEqual(['Qualification 6 2 19862 30619'])
  })

  it('skips playoff rows', () => {
    expect(parseScheduleText('Semifinal 1 1 100 200 300 400').matches).toEqual([])
  })
})

describe('linesFromItems (PDF text positions)', () => {
  it('rebuilds table rows from positioned text, tolerating small baseline drift', () => {
    const cell = (str: string, x: number, y: number): PositionedText => ({ str, x, y, height: 10 })
    const items = [
      cell('Qualification 2', 120, 686.8),
      cell('9:52 AM', 40, 686),
      cell('32646', 300, 686.4),
      cell('9:45 AM', 40, 700),
      cell('Qualification 1', 120, 700),
      cell('1', 220, 700),
      cell('14323', 300, 700.6),
      cell('13217', 360, 700),
      cell('8625', 420, 699.5),
      cell('3470', 480, 700),
      cell('2', 220, 686),
      cell('29619', 360, 686),
      cell('19639', 420, 686),
      cell('16236', 480, 686.2),
    ]
    expect(linesFromItems(items)).toEqual([
      '9:45 AM Qualification 1 1 14323 13217 8625 3470',
      '9:52 AM Qualification 2 2 32646 29619 19639 16236',
    ])
  })

  it('reads a MatchMaker-style schedule PDF end to end', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(await readFile(new URL('./__fixtures__/matchmaker-schedule.pdf', import.meta.url)))
    const doc = await pdfjs.getDocument({ data }).promise
    const page = await doc.getPage(1)
    const content = await page.getTextContent()
    const items = content.items.flatMap((i) => ('str' in i ? [{ str: i.str, x: i.transform[4], y: i.transform[5], height: i.height }] : []))
    const { matches, skipped } = parseScheduleText(linesFromItems(items).join('\n'))
    expect(matches.map((m) => m.match)).toEqual([1, 2, 3, 4, 5, 21, 22])
    expect(matches[4]).toEqual({ match: 5, red: [23287, 21419], blue: [16481, 12635] })
    expect(matches[6]).toEqual({ match: 22, red: [8404, 19896], blue: [29619, 23287] })
    expect(skipped).toEqual([])
  })
})

describe('schedule helpers', () => {
  const t = newTournament('T')
  t.schedule = parseScheduleText(MATCHMAKER_TEXT).matches

  it('fills the pre-match form from a robot slot', () => {
    const m = findScheduledMatch(t, 1)!
    expect(slotFill(m, 'blue', 1)).toEqual({ teamNumber: 3470, alliance: 'blue', partnerTeam: 8625, opponentTeams: [14323, 13217] })
    expect(findScheduledMatch(t, 99)).toBeUndefined()
  })

  it('flags review problems', () => {
    expect(rowProblems({ match: 1, teams: [1, 2, 3, 4] }, [1])).toEqual([])
    expect(rowProblems({ match: 1, teams: [1, 1, 3, null] }, [1, 1])).toEqual(['Duplicate match #', 'Missing team', 'Team listed twice'])
  })
})

describe('team lists', () => {
  it('parses pasted lists in common shapes', () => {
    expect(parseTeamList('14323 Buzz Bots\n13217, Hive Mind\n8625\t"Stingers"\n\nnot a team')).toEqual([
      { number: 14323, name: 'Buzz Bots' },
      { number: 13217, name: 'Hive Mind' },
      { number: 8625, name: 'Stingers' },
    ])
  })

  it('merges without erasing known names', () => {
    const merged = mergeTeams([{ number: 2, name: 'Two' }], [{ number: 2, name: '' }, { number: 1, name: 'One' }, { number: 2, name: 'Deux' }])
    expect(merged).toEqual([
      { number: 1, name: 'One' },
      { number: 2, name: 'Deux' },
    ])
  })

  it('prefers the official list over typed names', () => {
    const t = newTournament('T')
    t.teams = [{ number: 12345, name: 'Buzz Bots' }]
    const r = newReport(t.id, 1)
    r.pre.teamNumber = 12345
    r.pre.teamName = 'buzzbots'
    const r2 = newReport(t.id, 1)
    r2.pre.teamNumber = 777
    r2.pre.teamName = 'Typed Only'
    const names = teamNameIndex([t], [r, r2])
    expect(names.get(12345)).toBe('Buzz Bots')
    expect(names.get(777)).toBe('Typed Only')
  })
})

describe('match types', () => {
  it('labels, parses and orders quals before playoffs', () => {
    expect(matchLabel('qual', 12)).toBe('Q12')
    expect(matchLabel('playoff', 3)).toBe('P3')
    expect(parseMatchParam('P3')).toEqual({ type: 'playoff', number: 3 })
    expect(parseMatchParam('12')).toEqual({ type: 'qual', number: 12 })
    expect(parseMatchParam('x')).toBeNull()
    expect(compareMatches({ type: 'playoff', number: 1 }, { type: 'qual', number: 40 })).toBeGreaterThan(0)
  })

  it('keeps Q1 and P1 as different matches; old recordings count as quals', () => {
    const q = newReport('t', 1)
    q.pre = { ...q.pre, matchNumber: 1, teamNumber: 10, alliance: 'red' }
    delete q.pre.matchType
    const p = newReport('t', 1)
    p.pre = { ...p.pre, matchType: 'playoff', matchNumber: 1, teamNumber: 20, alliance: 'red' }
    const groups = groupMatches([p, q])
    expect(groups.map((g) => [g.matchType, g.matchNumber])).toEqual([
      ['qual', 1],
      ['playoff', 1],
    ])
  })
})

describe('FTCScout', () => {
  it('maps teams and qualification matches, skipping playoffs', async () => {
    const { fetchFtcScoutEvent } = await import('./ftcscout')
    const team = (n: number, a: string, s: string) => ({ teamNumber: n, alliance: a, station: s })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          data: {
            eventByCode: {
              name: 'Silicon Qualifier',
              teams: [{ teamNumber: 14323, team: { name: 'Buzz Bots' } }, { teamNumber: 3470, team: null }],
              matches: [
                { matchNum: 2, tournamentLevel: 'Quals', teams: [team(3, 'Blue', 'One'), team(1, 'Red', 'One'), team(4, 'Blue', 'Two'), team(2, 'Red', 'Two')] },
                { matchNum: 1, tournamentLevel: 'Quals', teams: [team(14323, 'Red', 'One'), team(13217, 'Red', 'Two'), team(8625, 'Blue', 'One'), team(3470, 'Blue', 'Two')] },
                { matchNum: 1, tournamentLevel: 'Finals', teams: [team(9, 'Red', 'One'), team(8, 'Red', 'Two'), team(7, 'Blue', 'One'), team(6, 'Blue', 'Two')] },
              ],
            },
          },
        }),
      })),
    )
    const event = await fetchFtcScoutEvent(' usCaq1 ')
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string).variables).toEqual({ season: 2026, code: 'USCAQ1' })
    expect(event.teams).toEqual([
      { number: 14323, name: 'Buzz Bots' },
      { number: 3470, name: '' },
    ])
    expect(event.schedule).toEqual([
      { match: 1, red: [14323, 13217], blue: [8625, 3470] },
      { match: 2, red: [1, 2], blue: [3, 4] },
    ])
    vi.unstubAllGlobals()
  })
})
