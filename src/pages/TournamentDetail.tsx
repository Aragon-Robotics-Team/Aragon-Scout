import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useData, useDb } from '../app/data'
import { ScheduleEditor } from '../components/ScheduleEditor'
import { Button, Card, Empty, NumberInput, Page, TextArea, TextInput, cx } from '../components/ui'
import { deleteTournament, saveTournament } from '../lib/db'
import { fetchFtcScoutEvent } from '../lib/ftcscout'
import { scheduleOf, scheduleTeams } from '../lib/schedule'
import { DEFAULT_POINTS, DEFAULT_THRESHOLDS } from '../lib/scoring'
import { mergeTeams, parseTeamList, teamsOf } from '../lib/teams'
import type { PointValues, RpThresholds, ScheduledMatch, Tournament, TournamentTeam } from '../lib/types'

const POINT_LABELS: [keyof PointValues, string][] = [
  ['leave', 'Leave'],
  ['autoPark', 'Auto park'],
  ['teleopPark', 'Teleop park'],
  ['autoTip', 'Auto hive tip'],
  ['teleopTip', 'Teleop hive tip'],
  ['cellBall', 'Ball left in cell'],
  ['bottomNectar', 'Bottom nectar bonus'],
  ['ownedFlowerBall', 'Ball in owned flower'],
  ['gardenBall', 'Ball in garden'],
]

const RP_LABELS: [keyof RpThresholds, string][] = [
  ['swarmPoints', 'Swarm RP (leave + park pts)'],
  ['pollinator1Tips', 'Pollinator 1 RP (tips)'],
  ['pollinator2Tips', 'Pollinator 2 RP (tips)'],
]

export function TournamentDetailPage() {
  const { id } = useParams()
  const { tournaments, reports, loaded } = useData()
  const tournament = tournaments.find((t) => t.id === id)
  if (!loaded) return <Page>{null}</Page>
  if (!tournament) {
    return (
      <Page title="Tournament">
        <Empty title="Tournament not found">
          <Link to="/tournaments" className="underline underline-offset-4">
            Back to tournaments
          </Link>
        </Empty>
      </Page>
    )
  }
  const recordingCount = reports.filter((r) => r.tournamentId === tournament.id).length
  return (
    <Page>
      <Link to="/tournaments" className="text-sm text-ink-3 hover:text-ink">
        ← Tournaments
      </Link>
      <h1 className="mt-2 mb-5 truncate text-2xl font-semibold tracking-tight">{tournament.name}</h1>
      <div className="space-y-4">
        <ScheduleSection tournament={tournament} />
        <TeamsSection tournament={tournament} />
        {/* Remount only when the details themselves change (e.g. from another device), not on team/schedule edits. */}
        <DetailsSection key={JSON.stringify(detailsOf(tournament))} tournament={tournament} recordingCount={recordingCount} />
      </div>
    </Page>
  )
}

function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-medium">{title}</h2>
        {sub && <p className="text-xs text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

function ScheduleSection({ tournament }: { tournament: Tournament }) {
  const db = useDb()
  const schedule = scheduleOf(tournament)
  const [editing, setEditing] = useState(false)

  const save = async (next: ScheduledMatch[], fetchedTeams: TournamentTeam[]) => {
    // Every team in the schedule joins the team list; FTCScout also supplies names.
    const fromSchedule = scheduleTeams(next).map((number) => ({ number, name: '' }))
    const teams = mergeTeams(mergeTeams(teamsOf(tournament), fromSchedule), fetchedTeams)
    await saveTournament(db, { ...tournament, schedule: next, teams })
    setEditing(false)
  }

  return (
    <Card className="p-4">
      <SectionTitle
        title="Qualification schedule"
        sub={
          schedule.length
            ? `${schedule.length} matches · recording fills in teams from the match #`
            : 'Add it so scouts only need the match # and which robot'
        }
        action={
          !editing && (
            <Button className="h-9 shrink-0 text-xs" onClick={() => setEditing(true)}>
              {schedule.length ? 'Edit' : 'Add'}
            </Button>
          )
        }
      />
      {editing ? (
        <ScheduleEditor tournament={tournament} onSave={save} onCancel={() => setEditing(false)} />
      ) : (
        schedule.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-ink-3">Show matches</summary>
            <table className="mt-2 w-full text-center text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider">
                  <th className="py-1 text-left font-medium text-ink-3">Q#</th>
                  <th className="font-medium text-red">Red 1</th>
                  <th className="font-medium text-red">Red 2</th>
                  <th className="font-medium text-blue">Blue 1</th>
                  <th className="font-medium text-blue">Blue 2</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {schedule.map((m) => (
                  <tr key={m.match} className="border-t border-line">
                    <td className="py-1.5 text-left text-ink-2">{m.match}</td>
                    {[...m.red, ...m.blue].map((n, i) => (
                      <td key={i}>{n}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )
      )}
    </Card>
  )
}

function TeamsSection({ tournament }: { tournament: Tournament }) {
  const db = useDb()
  const teams = teamsOf(tournament)
  const [number, setNumber] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [pasting, setPasting] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const saveTeams = (next: TournamentTeam[]) => saveTournament(db, { ...tournament, teams: next })

  const add = async () => {
    if (number == null) return
    await saveTeams(mergeTeams(teams, [{ number, name }]))
    setNumber(null)
    setName('')
  }
  const importPaste = async () => {
    const parsed = parseTeamList(pasteText)
    if (parsed.length === 0) return setNote({ ok: false, text: 'No teams found. Use one team per line, like "12345 Buzz Bots".' })
    await saveTeams(mergeTeams(teams, parsed))
    setNote({ ok: true, text: `Added or updated ${parsed.length} team${parsed.length === 1 ? '' : 's'}.` })
    setPasteText('')
    setPasting(false)
  }
  const fetchScout = async () => {
    setBusy(true)
    setNote(null)
    try {
      const event = await fetchFtcScoutEvent(tournament.eventCode)
      await saveTeams(mergeTeams(teams, event.teams))
      setNote({ ok: true, text: `Loaded ${event.teams.length} teams from ${event.name}.` })
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }
  const rename = (n: number, newName: string) =>
    saveTeams(teams.map((t) => (t.number === n ? { ...t, name: newName.trim() } : t)))
  const remove = (n: number) => saveTeams(teams.filter((t) => t.number !== n))

  const visible = showAll ? teams : teams.slice(0, 8)

  return (
    <Card className="p-4">
      <SectionTitle title="Teams" sub={teams.length ? `${teams.length} teams — used by the team name dropdown` : 'Fills the team name dropdown when recording'} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Button className="h-9 text-xs" onClick={() => setPasting((p) => !p)}>
          {pasting ? 'Close paste' : 'Paste list'}
        </Button>
        <Button
          className="h-9 text-xs"
          disabled={busy || !tournament.eventCode.trim()}
          title={tournament.eventCode.trim() ? undefined : 'Add the FTC event code in Details first'}
          onClick={fetchScout}
        >
          {busy ? 'Fetching…' : 'Fetch from FTCScout'}
        </Button>
      </div>
      {pasting && (
        <div className="mb-3 space-y-2">
          <TextArea
            label="One team per line"
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'14323 Buzz Bots\n13217, Hive Mind'}
          />
          <Button className="h-9 text-xs" disabled={!pasteText.trim()} onClick={importPaste}>
            Add teams
          </Button>
        </div>
      )}
      {note && <p className={cx('mb-3 text-sm', note.ok ? 'text-good' : 'text-red')}>{note.text}</p>}

      {teams.length > 0 && (
        <ul className="mb-3 divide-y divide-line">
          {visible.map((t) => (
            <li key={t.number} className="flex items-center gap-2 py-1.5">
              <span className="tnum w-14 shrink-0 text-sm text-ink-2">{t.number}</span>
              <input
                aria-label={`Name of team ${t.number}`}
                defaultValue={t.name}
                placeholder="Add name"
                onBlur={(e) => e.target.value.trim() !== t.name && rename(t.number, e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm text-ink placeholder:text-ink-3 hover:border-line focus:border-ink-3 focus:outline-none"
              />
              <button type="button" aria-label={`Remove team ${t.number}`} onClick={() => remove(t.number)} className="px-1 text-ink-3 hover:text-red">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {teams.length > 8 && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mb-3 text-xs text-ink-3 hover:text-ink">
          {showAll ? 'Show fewer' : `Show all ${teams.length}`}
        </button>
      )}

      <div className="grid grid-cols-[6.5rem_1fr_auto] items-end gap-2">
        <NumberInput label="Team #" value={number} onChange={setNumber} />
        <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={number == null} onClick={add}>
          Add
        </Button>
      </div>
    </Card>
  )
}

function detailsOf(t: Tournament) {
  return { name: t.name, eventCode: t.eventCode, startDate: t.startDate, points: t.points, thresholds: t.thresholds }
}

function DetailsSection({ tournament, recordingCount }: { tournament: Tournament; recordingCount: number }) {
  const db = useDb()
  const navigate = useNavigate()
  const [t, setT] = useState(tournament)
  const setPoint = (k: keyof PointValues, v: number | null) => setT({ ...t, points: { ...t.points, [k]: v ?? 0 } })
  const setRp = (k: keyof RpThresholds, v: number | null) => setT({ ...t, thresholds: { ...t.thresholds, [k]: v ?? 0 } })
  const dirty = JSON.stringify(detailsOf(t)) !== JSON.stringify(detailsOf(tournament))

  // Only the fields this form owns are written, so it never overwrites teams or the schedule.
  const save = () =>
    saveTournament(db, {
      ...tournament,
      name: t.name.trim() || tournament.name,
      eventCode: t.eventCode.trim(),
      startDate: t.startDate,
      points: t.points,
      thresholds: t.thresholds,
    })
  const remove = async () => {
    if (!confirm(`Delete "${tournament.name}"?`)) return
    await deleteTournament(db, tournament)
    navigate('/tournaments', { replace: true })
  }

  return (
    <Card className="space-y-4 p-4">
      <SectionTitle title="Details & point values" />
      <TextInput label="Name" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="FTC event code" placeholder="e.g. USCANCQ2" value={t.eventCode} onChange={(e) => setT({ ...t, eventCode: e.target.value })} />
        <TextInput label="Date" type="date" value={t.startDate} onChange={(e) => setT({ ...t, startDate: e.target.value })} />
      </div>
      <details>
        <summary className="cursor-pointer text-xs font-medium text-ink-2">Point values &amp; ranking point thresholds</summary>
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {POINT_LABELS.map(([k, label]) => (
              <NumberInput key={k} label={label} value={t.points[k]} onChange={(v) => setPoint(k, v)} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {RP_LABELS.map(([k, label]) => (
              <NumberInput key={k} label={label} value={t.thresholds[k]} onChange={(v) => setRp(k, v)} />
            ))}
          </div>
          <Button variant="ghost" onClick={() => setT({ ...t, points: { ...DEFAULT_POINTS }, thresholds: { ...DEFAULT_THRESHOLDS } })}>
            Reset to manual defaults
          </Button>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="danger"
          disabled={recordingCount > 0}
          title={recordingCount > 0 ? 'Move or delete its recordings first' : undefined}
          onClick={remove}
        >
          Delete
        </Button>
        <Button variant="primary" className="ml-auto" disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
    </Card>
  )
}
