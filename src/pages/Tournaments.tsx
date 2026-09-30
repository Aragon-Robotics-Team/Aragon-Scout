import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData, useDb } from '../app/data'
import { Button, Card, Empty, Page, TextInput, cx } from '../components/ui'
import { saveTournament } from '../lib/db'
import { newTournament } from '../lib/factories'

export function TournamentsPage() {
  const { tournaments, currentTournamentId, setCurrentTournamentId, reports, loaded } = useData()
  const db = useDb()
  const navigate = useNavigate()
  const [creatingPicked, setCreating] = useState<boolean | null>(null)
  const creating = creatingPicked ?? (loaded && tournaments.length === 0)
  const [name, setName] = useState('')
  const [eventCode, setEventCode] = useState('')
  const [startDate, setStartDate] = useState('')

  const create = async () => {
    const t = newTournament(name.trim(), eventCode.trim(), startDate)
    await saveTournament(db, t)
    setCurrentTournamentId(t.id)
    navigate(`/tournaments/${t.id}`)
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
          <p className="text-xs text-ink-3">Next you can add the team list and qualification schedule. Point values default to the V1 manual.</p>
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
                  <Link to={`/tournaments/${t.id}`} className="mt-2 inline-block text-xs text-ink-3 hover:text-ink">
                    {[
                      t.schedule?.length ? `${t.schedule.length} scheduled matches` : 'No schedule',
                      t.teams?.length ? `${t.teams.length} teams` : 'no team list',
                    ].join(' · ')}{' '}
                    · Set up →
                  </Link>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </Page>
  )
}
