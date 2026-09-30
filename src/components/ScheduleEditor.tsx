import { useRef, useState } from 'react'
import { fetchFtcScoutEvent } from '../lib/ftcscout'
import { normalizeSchedule, parseScheduleText, rowProblems } from '../lib/schedule'
import type { ScheduledMatch, Tournament, TournamentTeam } from '../lib/types'
import { Button, TextArea, cx } from './ui'

interface Row {
  key: number
  match: number | null
  teams: [number | null, number | null, number | null, number | null]
}

let nextKey = 1
const blank = (): Row => ({ key: nextKey++, match: null, teams: [null, null, null, null] })
const isBlank = (r: Row) => r.match == null && r.teams.every((t) => t == null)
const toRows = (schedule: ScheduledMatch[]): Row[] => [
  ...schedule.map((m) => ({ key: nextKey++, match: m.match, teams: [...m.red, ...m.blue] as Row['teams'] })),
  blank(),
]

function num(raw: string): number | null {
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Qualification schedule grid. Every source — typing, pasted text, a PDF, or
 * FTCScout — loads into this grid for review before anything is saved.
 */
export function ScheduleEditor({
  tournament,
  onSave,
  onCancel,
}: {
  tournament: Tournament
  onSave(schedule: ScheduledMatch[], teams: TournamentTeam[]): Promise<void>
  onCancel(): void
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(tournament.schedule ?? []))
  const [fetchedTeams, setFetchedTeams] = useState<TournamentTeam[]>([])
  const [pasting, setPasting] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string; skipped?: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = (schedule: ScheduledMatch[], source: string, skipped: string[] = []) => {
    setRows(toRows(schedule))
    setNote({
      ok: schedule.length > 0,
      text:
        schedule.length > 0
          ? `Loaded ${schedule.length} matches from ${source}. Check them below, then save.`
          : `No matches found in ${source}.`,
      skipped,
    })
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setNote(null)
    try {
      await fn()
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(null)
    }
  }

  const readPdf = (file: File) =>
    run('pdf', async () => {
      const { parseSchedulePdf } = await import('../lib/schedulePdf')
      const parsed = await parseSchedulePdf(await file.arrayBuffer())
      load(parsed.matches, 'the PDF', parsed.skipped)
    }).finally(() => {
      if (fileRef.current) fileRef.current.value = ''
    })

  const fetchScout = () =>
    run('ftcscout', async () => {
      const event = await fetchFtcScoutEvent(tournament.eventCode)
      if (event.schedule.length === 0) {
        throw new Error(`${event.name} is on FTCScout, but its qualification schedule hasn't been published yet.`)
      }
      setFetchedTeams(event.teams)
      load(event.schedule, `FTCScout (${event.name})`)
    })

  const readPaste = () => {
    const parsed = parseScheduleText(pasteText)
    load(parsed.matches, 'the pasted text', parsed.skipped)
    if (parsed.matches.length > 0) setPasting(false)
  }

  const update = (key: number, patch: (r: Row) => Row) =>
    setRows((current) => {
      const i = current.findIndex((r) => r.key === key)
      const next = [...current]
      next[i] = patch(current[i])
      // Keep exactly one empty row at the end to type into.
      if (!isBlank(next[next.length - 1])) next.push(blank())
      return next
    })

  const nextMatchFor = (key: number) => {
    const i = rows.findIndex((r) => r.key === key)
    const prev = rows.slice(0, i).reverse().find((r) => r.match != null)
    return (prev?.match ?? 0) + 1
  }

  const filled = rows.filter((r) => !isBlank(r))
  const matchNumbers = filled.map((r) => r.match)
  const problemRows = filled.filter((r) => rowProblems(r, matchNumbers).length > 0).length

  const save = () =>
    run('save', async () => {
      const schedule = normalizeSchedule(
        filled.map((r) => ({
          match: r.match!,
          red: [r.teams[0]!, r.teams[1]!],
          blue: [r.teams[2]!, r.teams[3]!],
        })),
      )
      await onSave(schedule, fetchedTeams)
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button className="h-9 text-xs" onClick={() => setPasting((p) => !p)}>
          {pasting ? 'Close paste' : 'Paste text'}
        </Button>
        <Button className="h-9 text-xs" disabled={busy != null} onClick={() => fileRef.current?.click()}>
          {busy === 'pdf' ? 'Reading PDF…' : 'Upload PDF'}
        </Button>
        <Button
          className="h-9 text-xs"
          disabled={busy != null || !tournament.eventCode.trim()}
          title={tournament.eventCode.trim() ? undefined : 'Add the FTC event code in Details first'}
          onClick={fetchScout}
        >
          {busy === 'ftcscout' ? 'Fetching…' : 'Fetch from FTCScout'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && readPdf(e.target.files[0])}
        />
      </div>

      {pasting && (
        <div className="space-y-2">
          <TextArea
            label="One match per line"
            rows={6}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'1 14323 13217 8625 3470\n2 32646 29619 19639 16236\n…or text copied from the schedule PDF'}
          />
          <Button className="h-9 text-xs" disabled={!pasteText.trim()} onClick={readPaste}>
            Read text
          </Button>
        </div>
      )}

      {note && (
        <div className={cx('rounded-xl border px-3 py-2 text-sm', note.ok ? 'border-line bg-surface-2 text-ink-2' : 'border-red/40 bg-red/10 text-ink')}>
          {note.text}
          {note.skipped && note.skipped.length > 0 && (
            <details className="mt-1 text-xs text-ink-3">
              <summary className="cursor-pointer">{note.skipped.length} line(s) couldn't be read</summary>
              <ul className="mt-1 space-y-0.5 font-mono">
                {note.skipped.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div>
        <div className="grid grid-cols-[2.75rem_repeat(4,minmax(0,1fr))_1.25rem] gap-1 px-0.5 pb-1 text-center text-[10px] font-medium uppercase tracking-wider">
          <span className="text-ink-3">Q#</span>
          <span className="text-red">Red 1</span>
          <span className="text-red">Red 2</span>
          <span className="text-blue">Blue 1</span>
          <span className="text-blue">Blue 2</span>
          <span />
        </div>
        <div className="space-y-1">
          {rows.map((r, i) => {
            const problems = isBlank(r) ? [] : rowProblems(r, matchNumbers)
            const last = i === rows.length - 1
            return (
              <div key={r.key}>
                <div className="grid grid-cols-[2.75rem_repeat(4,minmax(0,1fr))_1.25rem] items-center gap-1">
                  <input
                    aria-label="Match number"
                    inputMode="numeric"
                    value={r.match ?? ''}
                    placeholder={last ? String(nextMatchFor(r.key)) : ''}
                    onChange={(e) => update(r.key, (row) => ({ ...row, match: num(e.target.value) }))}
                    className={cx(cellClass, 'text-ink-2', problems.some((p) => p.includes('match')) && 'border-warn')}
                  />
                  {r.teams.map((t, j) => (
                    <input
                      key={j}
                      aria-label={['Red 1', 'Red 2', 'Blue 1', 'Blue 2'][j]}
                      inputMode="numeric"
                      value={t ?? ''}
                      onChange={(e) => {
                        const value = num(e.target.value)
                        const auto = nextMatchFor(r.key)
                        update(r.key, (row) => {
                          const teams = [...row.teams] as Row['teams']
                          teams[j] = value
                          return { ...row, teams, match: row.match ?? (value != null ? auto : null) }
                        })
                      }}
                      className={cx(cellClass, j < 2 ? 'border-red/25' : 'border-blue/25', problems.includes('Team listed twice') && 'border-warn')}
                    />
                  ))}
                  {!last ? (
                    <button
                      type="button"
                      aria-label={`Remove match ${r.match ?? ''}`}
                      onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                      className="text-ink-3 hover:text-red"
                    >
                      ×
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                {problems.length > 0 && <p className="px-1 pt-0.5 text-[11px] text-warn">{problems.join(' · ')}</p>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs text-ink-3">
          {filled.length} match{filled.length === 1 ? '' : 'es'}
          {problemRows > 0 && <span className="text-warn"> · {problemRows} need fixing</span>}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy != null || problemRows > 0} onClick={save}>
            {tournament.schedule?.length ? 'Replace schedule' : 'Save schedule'}
          </Button>
        </div>
      </div>
    </div>
  )
}

const cellClass =
  'tnum h-9 w-full min-w-0 rounded-lg border border-line bg-surface-2 px-1 text-center text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none'
