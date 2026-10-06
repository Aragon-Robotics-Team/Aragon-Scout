import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useData, useDb } from '../app/data'
import { LiveScoring } from '../components/LiveScoring'
import { IncompleteToggle, PostMatchForm, PreMatchForm } from '../components/ReportForms'
import { Button, Page } from '../components/ui'
import { saveReport, saveTournament } from '../lib/db'
import { matchLabel, matchPath, matchTypeOf } from '../lib/matches'
import { mergeTeams, teamNameIndex, teamsOf } from '../lib/teams'
import { newReport } from '../lib/factories'
import { readJson, removeKey, writeJson } from '../lib/storage'
import { MATCH_MS, type Clock } from '../lib/timing'
import type { Report } from '../lib/types'

type Stage = 'pre' | 'live' | 'post'

/** `pausedAt` and `pausedMs` are missing on drafts saved before the clock could stop. */
type Draft = { report: Report; stage: Stage } & Clock

export function RecordPage() {
  const { account } = useAuth()
  const { tournaments, currentTournamentId, reports } = useData()
  const db = useDb()
  const navigate = useNavigate()
  const draftKey = `as.draft:${account!.userId}`

  // The in-progress recording is kept in localStorage so a reload mid-match loses nothing.
  const [draft, setDraftState] = useState<Draft>(() => {
    const saved = readJson<Draft>(draftKey)
    if (saved) return { ...saved, pausedAt: saved.pausedAt ?? null, pausedMs: saved.pausedMs ?? 0 }
    return { report: newReport(currentTournamentId, account!.teamNumber), stage: 'pre', startedAt: null, pausedAt: null, pausedMs: 0 }
  })
  const setDraft = useCallback(
    (d: Draft) => {
      setDraftState(d)
      writeJson(draftKey, d)
    },
    [draftKey],
  )
  const update = useCallback((patch: (d: Draft) => Partial<Draft>) => setDraftState((d) => {
    const next = { ...d, ...patch(d) }
    writeJson(draftKey, next)
    return next
  }), [draftKey])
  const setReport = useCallback((report: Report) => update(() => ({ report })), [update])
  const setClock = useCallback((c: Clock) => update(() => c), [update])

  const knownNames = useMemo(() => teamNameIndex(tournaments, reports), [tournaments, reports])

  const { report, stage } = draft
  // Before starting, follow the device's current tournament; after, it's fixed on the report.
  const tournament = tournaments.find((t) => t.id === (stage === 'pre' ? currentTournamentId : report.tournamentId))
  // Ending before the buzzer or ever stopping the clock marks the recording incomplete; the scout can undo that at submit.
  const onLiveDone = useCallback(
    (elapsed: number) => update((d) => ({ stage: 'post', report: { ...d.report, incomplete: elapsed < MATCH_MS || !!d.report.paused } })),
    [update],
  )
  const onLiveBack = useCallback(() => update(() => ({ stage: 'pre' })), [update])

  if (stage === 'live') {
    return (
      <LiveScoring
        report={report}
        clock={draft}
        tournamentName={tournament?.name}
        onChange={setReport}
        onClock={setClock}
        onBack={onLiveBack}
        onDone={onLiveDone}
      />
    )
  }

  const discard = () => {
    if (!confirm('Discard this recording?')) return
    removeKey(draftKey)
    navigate('/')
  }

  if (stage === 'post') {
    const submit = async () => {
      await saveReport(db, report)
      // A team typed in by hand joins the tournament's list so every device can pick it next time.
      const n = report.pre.teamNumber
      if (tournament && n != null) {
        const list = teamsOf(tournament)
        const known = list.find((t) => t.number === n)
        const name = report.pre.teamName.trim()
        if (!known || (!known.name && name)) {
          await saveTournament(db, { ...tournament, teams: mergeTeams(list, [{ number: n, name }]) })
        }
      }
      removeKey(draftKey)
      navigate(matchPath('', report.tournamentId, report.pre, report.id), { replace: true })
    }
    return (
      <Page title="After the match">
        <p className="-mt-3 mb-5 text-sm text-ink-3">
          {tournament?.name ?? 'No tournament'} · {matchLabel(matchTypeOf(report.pre), report.pre.matchNumber)} · Team {report.pre.teamNumber}
        </p>
        <PostMatchForm value={report.post} alliance={report.pre.alliance} onChange={(post) => setReport({ ...report, post })} />
        <IncompleteToggle report={report} onChange={setReport} />
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={discard}>
            Discard
          </Button>
          <Button variant="primary" className="px-8" onClick={submit}>
            Submit
          </Button>
        </div>
      </Page>
    )
  }

  const pre = report.pre
  const missing = [
    pre.matchNumber == null && 'match #',
    pre.teamNumber == null && 'team #',
    pre.alliance == null && 'alliance',
    !tournament && 'tournament',
  ].filter(Boolean)

  return (
    <Page title="Record a match">
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
        {tournament ? (
          <>
            <span className="text-ink-2">
              Tournament <span className="text-ink">{tournament.name}</span>
            </span>
            <Link to="/tournaments" className="text-ink-3 hover:text-ink">
              Change
            </Link>
          </>
        ) : (
          <>
            <span className="text-ink-2">No tournament selected</span>
            <Link to="/tournaments" className="font-medium text-ink">
              Set up
            </Link>
          </>
        )}
      </div>
      <PreMatchForm
        value={pre}
        knownNames={knownNames}
        tournament={tournament}
        reports={reports}
        reportId={report.id}
        onChange={(p) => setReport({ ...report, pre: p })}
      />
      <div className="mt-8">
        <Button
          variant="primary"
          className="h-14 w-full text-base"
          disabled={missing.length > 0}
          onClick={() => setDraft({ report: { ...report, tournamentId: tournament!.id }, stage: 'live', startedAt: null, pausedAt: null, pausedMs: 0 })}
        >
          Confirm
        </Button>
        <p className="mt-2 h-4 text-center text-xs text-ink-3">
          {missing.length > 0 ? `Needs ${missing.join(', ')}` : 'Next, press Start when the match starts'}
        </p>
      </div>
    </Page>
  )
}
