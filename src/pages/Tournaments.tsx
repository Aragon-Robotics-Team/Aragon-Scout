import { useState } from 'react'
import { useData, useDb } from '../app/data'
import { Button, Card, Empty, NumberInput, Page, TextInput, cx } from '../components/ui'
import { deleteTournament, saveTournament } from '../lib/db'
import { newTournament } from '../lib/factories'
import { DEFAULT_POINTS, DEFAULT_THRESHOLDS } from '../lib/scoring'
import type { PointValues, RpThresholds, Tournament } from '../lib/types'

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

export function TournamentsPage() {
  const { tournaments, currentTournamentId, setCurrentTournamentId, reports, loaded } = useData()
  const db = useDb()
  const [creatingPicked, setCreating] = useState<boolean | null>(null)
  const creating = creatingPicked ?? (loaded && tournaments.length === 0)
  const [name, setName] = useState('')
  const [eventCode, setEventCode] = useState('')
  const [startDate, setStartDate] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const create = async () => {
    const t = newTournament(name.trim(), eventCode.trim(), startDate)
    await saveTournament(db, t)
    setCurrentTournamentId(t.id)
    setName('')
    setEventCode('')
    setStartDate('')
    setCreating(false)
  }

  return (
    <Page title="Tournaments" action={!creating && <Button onClick={() => setCreating(true)}>New</Button>}>
      {creating && (
        <Card className="mb-5 space-y-3 p-4">
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NorCal Qualifier 2" />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="FTC event code" hint="optional" value={eventCode} onChange={(e) => setEventCode(e.target.value)} />
            <TextInput label="Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <p className="text-xs text-ink-3">Point values default to the V1 manual; you can change them after creating.</p>
          <div className="flex justify-end gap-2">
            {tournaments.length > 0 && (
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            )}
            <Button variant="primary" disabled={!name.trim()} onClick={create}>
              Create &amp; use
            </Button>
          </div>
        </Card>
      )}

      {tournaments.length === 0 && !creating ? (
        <Empty title="No tournaments yet" />
      ) : (
        <ul className="space-y-2">
          {tournaments.map((t) => {
            const count = reports.filter((r) => r.tournamentId === t.id).length
            const isCurrent = t.id === currentTournamentId
            return (
              <li key={t.id}>
                <Card className={cx('p-4', isCurrent && 'border-ink-3')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="text-xs text-ink-3">
                        {[t.eventCode, t.startDate, `${count} recording${count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {isCurrent ? (
                      <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs text-ink">Current</span>
                    ) : (
                      <Button className="h-8 shrink-0 px-3 text-xs" onClick={() => setCurrentTournamentId(t.id)}>
                        Use
                      </Button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(editing === t.id ? null : t.id)}
                    className="mt-2 text-xs text-ink-3 hover:text-ink"
                  >
                    {editing === t.id ? 'Close settings' : 'Settings & point values'}
                  </button>
                  {editing === t.id && <TournamentSettings key={t.id} tournament={t} recordingCount={count} onDone={() => setEditing(null)} />}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </Page>
  )
}

function TournamentSettings({ tournament, recordingCount, onDone }: { tournament: Tournament; recordingCount: number; onDone(): void }) {
  const db = useDb()
  const [t, setT] = useState(tournament)
  const setPoint = (k: keyof PointValues, v: number | null) => setT({ ...t, points: { ...t.points, [k]: v ?? 0 } })
  const setRp = (k: keyof RpThresholds, v: number | null) => setT({ ...t, thresholds: { ...t.thresholds, [k]: v ?? 0 } })

  const save = async () => {
    await saveTournament(db, { ...t, name: t.name.trim() || tournament.name })
    onDone()
  }
  const remove = async () => {
    if (!confirm(`Delete "${tournament.name}"?`)) return
    await deleteTournament(db, tournament)
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <TextInput label="Name" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="FTC event code" value={t.eventCode} onChange={(e) => setT({ ...t, eventCode: e.target.value })} />
        <TextInput label="Date" type="date" value={t.startDate} onChange={(e) => setT({ ...t, startDate: e.target.value })} />
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-ink-2">Point values</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {POINT_LABELS.map(([k, label]) => (
            <NumberInput key={k} label={label} value={t.points[k]} onChange={(v) => setPoint(k, v)} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-ink-2">Ranking point thresholds</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {RP_LABELS.map(([k, label]) => (
            <NumberInput key={k} label={label} value={t.thresholds[k]} onChange={(v) => setRp(k, v)} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => setT({ ...t, points: { ...DEFAULT_POINTS }, thresholds: { ...DEFAULT_THRESHOLDS } })}>
          Reset to manual defaults
        </Button>
        <div className="ml-auto flex gap-2">
          <Button
            variant="danger"
            disabled={recordingCount > 0}
            title={recordingCount > 0 ? 'Move or delete its recordings first' : undefined}
            onClick={remove}
          >
            Delete
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
