import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useData, useDb } from '../app/data'
import { AnswerToggle } from '../components/ReportForms'
import { StartPositionButton } from '../components/StartPosition'
import { TeamCombobox } from '../components/TeamCombobox'
import { TournamentSelect } from '../components/TournamentSelect'
import { Button, Card, Empty, Label, NumberInput, Page, SearchInput, TextArea, TextInput, cx } from '../components/ui'
import { deletePitReport, savePitReport, saveTournament } from '../lib/db'
import {
  AIMING_LABELS,
  LAUNCHER_LABELS,
  MAX_PIT_STARTS,
  PIT_ALLIANCE,
  SIZE_HINT,
  SIZE_LABELS,
  newPitReport,
  pitReportId,
} from '../lib/pit'
import { mergeTeams, teamNameIndex, teamsOf, withTeamAdded } from '../lib/teams'
import type { PitReport, StartPose } from '../lib/types'

const TITLE = 'Pre-match / Pit scouting'

/** The current tournament's teams, each marked scouted or not yet. */
export function PitListPage() {
  const { tournaments, pitReports, currentTournamentId, loaded } = useData()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const tid = params.get('t') ?? currentTournamentId
  const tournament = tournaments.find((t) => t.id === tid)

  const rows = useMemo(() => {
    if (!tournament) return []
    const ours = pitReports.filter((r) => r.tournamentId === tournament.id)
    const byNumber = new Map(ours.map((r) => [r.teamNumber, r]))
    // Teams with a report but missing from the list (e.g. removed from it later) still show.
    const teams = mergeTeams(teamsOf(tournament), ours.map((r) => ({ number: r.teamNumber, name: r.teamName })))
    return teams.map((t) => ({ ...t, report: byNumber.get(t.number) }))
  }, [tournament, pitReports])

  if (!loaded) return <Page>{null}</Page>
  if (!tournament) {
    return (
      <Page title={TITLE}>
        <Empty title="No tournament selected">
          <Link to="/tournaments" className="underline underline-offset-4">
            Set up a tournament
          </Link>
        </Empty>
      </Page>
    )
  }

  const q = query.trim().toLowerCase()
  const visible = rows.filter((r) => !q || String(r.number).startsWith(q) || r.name.toLowerCase().includes(q))
  const done = rows.filter((r) => r.report).length

  return (
    <Page title={TITLE}>
      <div className="mb-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput value={query} onChange={setQuery} placeholder="Search team # or name" />
        </div>
        <TournamentSelect tournaments={tournaments} value={tournament.id} onChange={(id) => setParams({ t: id }, { replace: true })} allowAll={false} />
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="tnum text-sm text-ink-2">
          <span className="font-medium text-ink">
            {done} / {rows.length}
          </span>{' '}
          scouted
        </p>
        <Link
          to={`/pit/${tournament.id}/new`}
          className="inline-flex h-9 items-center rounded-xl border border-line bg-surface-2 px-3 text-xs font-medium text-ink hover:border-ink-3"
        >
          Add team
        </Link>
      </div>

      {rows.length === 0 ? (
        <Empty title="No teams yet">
          Add them one at a time here, or load the whole list on the{' '}
          <Link to={`/tournaments/${tournament.id}`} className="underline underline-offset-4">
            tournament page
          </Link>
          .
        </Empty>
      ) : visible.length === 0 ? (
        <Empty title="No teams found" />
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li key={r.number}>
              <Link
                to={`/pit/${tournament.id}/${r.number}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-ink-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name || `Team ${r.number}`}</span>
                  <span className="tnum block text-xs text-ink-3">
                    {r.number}
                    {r.report?.editedBy && <> · by @{r.report.editedBy.username}</>}
                  </span>
                </span>
                {r.report ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-good/50 bg-good/15 px-2.5 py-1 text-xs font-medium text-ink">
                    <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-good text-[10px] font-bold text-white">
                      ✓
                    </span>
                    Scouted
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-ink-3">Not yet</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

/** One team's pit report: /pit/:tid/:team, or /pit/:tid/new for a team not on the list. */
export function PitFormPage() {
  const { tid, team } = useParams()
  const { tournaments, pitReports, reports, loaded } = useData()
  const tournament = tournaments.find((t) => t.id === tid)
  const isNew = team === 'new'
  const teamNumber = isNew ? null : Number(team)

  if (!loaded) return <Page>{null}</Page>
  if (!tournament || (!isNew && !Number.isInteger(teamNumber))) {
    return (
      <Page title={TITLE}>
        <Empty title="Team not found">
          <Link to="/pit" className="underline underline-offset-4">
            Back to pit scouting
          </Link>
        </Empty>
      </Page>
    )
  }

  const existing = teamNumber != null ? pitReports.find((r) => r.id === pitReportId(tournament.id, teamNumber)) : undefined
  const knownNames = teamNameIndex(tournaments, reports)
  const initial = existing ?? newPitReport(tournament.id, teamNumber ?? 0, teamNumber != null ? (knownNames.get(teamNumber) ?? '') : '')
  // Keyed so a different team (or a report arriving from sync before any edit) starts a fresh form.
  return <PitForm key={`${tournament.id}:${team}:${existing ? 'saved' : 'new'}`} initial={initial} isNew={isNew} saved={!!existing} knownNames={knownNames} />
}

function PitForm({ initial, isNew, saved, knownNames }: { initial: PitReport; isNew: boolean; saved: boolean; knownNames: Map<number, string> }) {
  const { tournaments, pitReports } = useData()
  const db = useDb()
  const { account } = useAuth()
  const navigate = useNavigate()
  const tournament = tournaments.find((t) => t.id === initial.tournamentId)!
  const [draft, setDraft] = useState(initial)
  const [number, setNumber] = useState<number | null>(isNew ? null : initial.teamNumber)
  const set = <K extends keyof PitReport>(k: K, v: PitReport[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const back = `/pit?t=${tournament.id}`

  // A new team that already has a report should be opened, not overwritten.
  const clash = isNew && number != null ? pitReports.find((r) => r.id === pitReportId(tournament.id, number)) : undefined
  const canSave = number != null && number > 0 && !clash

  const changeNumber = (n: number | null) => {
    const autoName = knownNames.get(number ?? -1) ?? ''
    const keepTyped = draft.teamName.trim() && draft.teamName !== autoName
    setNumber(n)
    if (!keepTyped) set('teamName', n != null ? (knownNames.get(n) ?? '') : '')
  }

  const save = async () => {
    if (!canSave) return
    const doc: PitReport = {
      ...draft,
      id: pitReportId(tournament.id, number),
      teamNumber: number,
      teamName: draft.teamName.trim(),
      editedBy: account ? { userId: account.userId, username: account.username } : null,
    }
    await savePitReport(db, doc)
    const teams = withTeamAdded(tournament, number, doc.teamName)
    if (teams) await saveTournament(db, { ...tournament, teams })
    navigate(back)
  }
  const remove = async () => {
    if (!confirm(`Delete the pit report for team ${initial.teamNumber}?`)) return
    await deletePitReport(db, initial)
    navigate(back, { replace: true })
  }

  const setStart = (i: number, pose: StartPose | null) => {
    const starts = [...draft.starts]
    if (pose) starts[i] = pose
    else starts.splice(i, 1)
    set('starts', starts)
  }

  return (
    <Page>
      <Link to={back} className="text-sm text-ink-3 hover:text-ink">
        ← {TITLE}
      </Link>
      <div className="mt-2 mb-4">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {isNew ? 'Add team' : draft.teamName || `Team ${initial.teamNumber}`}
        </h1>
        <p className="tnum text-sm text-ink-2">
          {!isNew && <>{initial.teamNumber} · </>}
          {tournament.name}
        </p>
      </div>

      {!isNew && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-xs text-ink-3">
            {saved ? (
              <>
                Last saved{initial.editedBy && <> by @{initial.editedBy.username}</>} ·{' '}
                {new Date(initial.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </>
            ) : (
              'Not scouted yet'
            )}
          </p>
          <Link
            to={`/teams/${initial.teamNumber}?t=${tournament.id}`}
            className="inline-flex h-11 items-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium text-ink hover:border-ink-3"
          >
            View in database
          </Link>
          {saved && (
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4">
        <Section title="Team">
          {isNew && <NumberInput label="Team #" value={number} onChange={changeNumber} />}
          {clash && (
            <p className="-mt-2 text-sm text-warn">
              Team {number} already has a pit report.{' '}
              <Link to={`/pit/${tournament.id}/${number}`} className="font-medium text-ink underline underline-offset-4">
                Open it
              </Link>
            </p>
          )}
          <TeamCombobox
            label="Team name"
            value={draft.teamName}
            teams={teamsOf(tournament)}
            onChange={(name) => set('teamName', name)}
            onPick={(t) => {
              if (isNew) setNumber(t.number)
              set('teamName', t.name)
            }}
          />
        </Section>

        <Section title="Auto">
          <AnswerToggle label="Leave" value={draft.autoLeave} onChange={(v) => set('autoLeave', v)} className="w-full" />
          <AnswerToggle label="Park" value={draft.autoPark} onChange={(v) => set('autoPark', v)} className="w-full" />
          {Array.from({ length: Math.min(draft.starts.length + 1, MAX_PIT_STARTS) }, (_, i) => (
            <div key={i}>
              <Label hint={i === 0 ? 'drawn on the red side' : 'if they have a second auto'}>Starting position {i + 1}</Label>
              <StartPositionButton value={draft.starts[i] ?? null} alliance={PIT_ALLIANCE} onChange={(v) => setStart(i, v)} />
            </div>
          ))}
          <NumberInput label="Expected balls" hint="in auto" value={draft.expectedBalls} onChange={(v) => set('expectedBalls', v)} />
          <NumberInput label="Expected hive tips" hint="in auto" value={draft.expectedTips} onChange={(v) => set('expectedTips', v)} />
        </Section>

        <Section title="Mechanism">
          <div>
            <Label>Aiming</Label>
            <Choices options={AIMING_LABELS} value={draft.aiming} onChange={(v) => set('aiming', v)} columns={2} />
          </div>
          <div>
            <Label>Launcher</Label>
            <Choices options={LAUNCHER_LABELS} value={draft.launcher} onChange={(v) => set('launcher', v)} columns={1} />
          </div>
          {draft.launcher === 'other' && (
            <TextInput label="Other launcher" placeholder="Describe it" value={draft.launcherOther} onChange={(e) => set('launcherOther', e.target.value)} />
          )}
          <AnswerToggle label="Flower intake" value={draft.flowerIntake} onChange={(v) => set('flowerIntake', v)} className="w-full" />
          <div>
            <Label>Size</Label>
            <Choices options={SIZE_LABELS} value={draft.size} onChange={(v) => set('size', v)} columns={3} />
            <p className="mt-1.5 text-xs text-ink-3">{SIZE_HINT}</p>
          </div>
        </Section>

        <Section title="Notes" sub="optional">
          <TextArea label="Strengths and weaknesses" rows={3} value={draft.strengths} onChange={(e) => set('strengths', e.target.value)} />
          <TextArea label="Improvements from prior competitions" rows={3} value={draft.improvements} onChange={(e) => set('improvements', e.target.value)} />
          <TextArea label="Extra info" rows={3} value={draft.extra} onChange={(e) => set('extra', e.target.value)} />
        </Section>
      </div>

      <div className="mt-8">
        <Button variant="primary" className="h-14 w-full text-base" disabled={!canSave} onClick={save}>
          Save
        </Button>
        <p className="mt-2 h-4 text-center text-xs text-ink-3">{number == null ? 'Needs team #' : 'Everything else is optional'}</p>
      </div>
    </Page>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-4">
      <h2 className="flex items-baseline justify-between font-medium">
        {title}
        {sub && <span className="text-xs font-normal text-ink-3">{sub}</span>}
      </h2>
      {children}
    </Card>
  )
}

/** Pick one (or none: tap the picked one again to clear it). */
function Choices<T extends string>({
  options,
  value,
  onChange,
  columns,
}: {
  options: Record<T, string>
  value: T | null
  onChange(v: T | null): void
  columns: 1 | 2 | 3
}) {
  return (
    <div className={cx('grid gap-2', columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {(Object.keys(options) as T[]).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(value === k ? null : k)}
          className={cx(
            'min-h-11 rounded-xl border-2 px-3 py-2 text-sm font-medium transition-colors',
            columns === 1 ? 'text-left' : 'text-center',
            value === k ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface-2 text-ink-2 hover:border-ink-3',
          )}
        >
          {options[k]}
        </button>
      ))}
    </div>
  )
}
