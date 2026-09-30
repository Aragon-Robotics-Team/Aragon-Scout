import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useData, useDb } from '../app/data'
import { LiveScoring } from '../components/LiveScoring'
import { PostMatchForm, PreMatchForm } from '../components/ReportForms'
import { Button, Page } from '../components/ui'
import { saveReport, saveTournament } from '../lib/db'
import { matchLabel, matchPath, matchTypeOf } from '../lib/matches'
import { mergeTeams, teamNameIndex, teamsOf } from '../lib/teams'
import { newReport } from '../lib/factories'
import { readJson, removeKey, writeJson } from '../lib/storage'
import type { Report } from '../lib/types'

type Stage = 'pre' | 'live' | 'post'

interface Draft {
  report: Report
  stage: Stage
  startedAt: number | null
}

export function RecordPage() {
  const { account } = useAuth()
  const { tournaments, currentTournamentId, reports } = useData()
  const db = useDb()
  const navigate = useNavigate()
  const draftKey = `as.draft:${account!.userId}`

  // The in-progress recording is kept in localStorage so a reload mid-match loses nothing.
  const [draft, setDraftState] = useState<Draft>(
    () => readJson<Draft>(draftKey) ?? { report: newReport(currentTournamentId, account!.teamNumber), stage: 'pre', startedAt: null },
  )
  const setDraft = useCallback(
    (d: Draft) => {
      setDraftState(d)
      writeJson(draftKey, d)
    },
    [draftKey],
  )
  const setReport = useCallback((report: Report) => setDraftState((d) => {
    const next = { ...d, report }
    writeJson(draftKey, next)
    return next
  }), [draftKey])

  const knownNames = useMemo(() => teamNameIndex(tournaments, reports), [tournaments, reports])

  const { report, stage } = draft
  // Before starting, follow the device's current tournament; after, it's fixed on the report.
  const tournament = tournaments.find((t) => t.id === (stage === 'pre' ? currentTournamentId : report.tournamentId))
  const onLiveDone = useCallback(() => setDraftState((d) => {
    const next = { ...d, stage: 'post' as const }
    writeJson(draftKey, next)
    return next
  }), [draftKey])

  if (stage === 'live' && draft.startedAt != null) {
    return <LiveScoring report={report} startedAt={draft.startedAt} tournamentName={tournament?.name} onChange={setReport} onDone={onLiveDone} />
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
      <PreMatchForm value={pre} knownNames={knownNames} tournament={tournament} onChange={(p) => setReport({ ...report, pre: p })} />
      <div className="mt-8">
        <Button
          variant="primary"
          className="h-14 w-full text-base"
          disabled={missing.length > 0}
          onClick={() => setDraft({ report: { ...report, tournamentId: tournament!.id }, stage: 'live', startedAt: Date.now() })}
        >
          Start recording
        </Button>
        <p className="mt-2 h-4 text-center text-xs text-ink-3">
          {missing.length > 0 ? `Needs ${missing.join(', ')}` : 'Start when the match starts — the 2:38 timer runs automatically'}
        </p>
      </div>
    </Page>
  )
}
