import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData, useDb } from '../app/data'
import { PostMatchForm, PreMatchForm, TogglesForm } from '../components/ReportForms'
import { Button, Empty, Label, Page } from '../components/ui'
import { saveReport } from '../lib/db'
import type { Report } from '../lib/types'

export function EditReportPage() {
  const { id } = useParams()
  const { reports, tournaments, loaded } = useData()
  const original = reports.find((r) => r.id === id)
  if (!loaded) return <Page>{null}</Page>
  if (!original) return <Page title="Edit recording"><Empty title="Recording not found" /></Page>
  return <Editor key={original.id} original={original} tournaments={tournaments} />
}

function Editor({ original, tournaments }: { original: Report; tournaments: ReturnType<typeof useData>['tournaments'] }) {
  const db = useDb()
  const navigate = useNavigate()
  const [report, setReport] = useState(original)
  const valid = report.pre.matchNumber != null && report.pre.teamNumber != null && report.pre.alliance != null

  const save = async () => {
    await saveReport(db, report)
    navigate(`/matches/${report.tournamentId ?? 'none'}/${report.pre.matchNumber}?r=${report.id}`, { replace: true })
  }

  return (
    <Page title="Edit recording">
      <p className="-mt-3 mb-5 text-sm text-ink-3">The event timeline can't be changed after submitting.</p>
      <div className="space-y-8">
        <section>
          <Label>Tournament</Label>
          <select
            value={report.tournamentId ?? ''}
            onChange={(e) => setReport({ ...report, tournamentId: e.target.value || null })}
            className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-ink focus:outline-none"
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="">No tournament</option>
          </select>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium text-ink-2">Before the match</h2>
          <PreMatchForm value={report.pre} onChange={(pre) => setReport({ ...report, pre })} />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium text-ink-2">Leave &amp; park</h2>
          <TogglesForm value={report.toggles} onChange={(toggles) => setReport({ ...report, toggles })} />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium text-ink-2">After the match</h2>
          <PostMatchForm value={report.post} alliance={report.pre.alliance} onChange={(post) => setReport({ ...report, post })} />
        </section>
      </div>
      <div className="mt-8 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!valid} onClick={save}>
          Save changes
        </Button>
      </div>
    </Page>
  )
}
