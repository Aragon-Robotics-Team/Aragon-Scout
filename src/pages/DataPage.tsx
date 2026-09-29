import { useRef, useState } from 'react'
import { useAuth } from '../app/auth'
import { useData, useDb } from '../app/data'
import { Button, Card, Page } from '../components/ui'
import { notifyLocalChange } from '../lib/db'
import { buildExport, downloadJson, parseImport, slug } from '../lib/exportData'

export function DataPage() {
  const { account } = useAuth()
  const { reports, tournaments, currentTournamentId } = useData()
  const db = useDb()
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const team = account?.teamNumber ?? null
  const current = tournaments.find((t) => t.id === currentTournamentId)
  const today = () => new Date().toISOString().slice(0, 10)

  const exportAll = () => downloadJson(`aragon-scout-${team}-all-${today()}.json`, buildExport(reports, tournaments, team))
  const exportCurrent = () =>
    current &&
    downloadJson(
      `aragon-scout-${team}-${slug(current.name)}-${today()}.json`,
      buildExport(reports.filter((r) => r.tournamentId === current.id), [current], team),
    )

  const importFile = async (file: File) => {
    setMessage(null)
    try {
      const data = parseImport(await file.text())
      let added = 0
      let updated = 0
      await db.transaction('rw', db.reports, db.tournaments, async () => {
        for (const t of data.tournaments) {
          const local = await db.tournaments.get(t.id)
          if (!local || t.updatedAt > local.doc.updatedAt) await db.tournaments.put({ id: t.id, dirty: 1, doc: t })
        }
        for (const r of data.reports) {
          const local = await db.reports.get(r.id)
          if (!local) added++
          else if (r.updatedAt > local.doc.updatedAt) updated++
          else continue
          await db.reports.put({ id: r.id, dirty: 1, doc: r })
        }
      })
      notifyLocalChange()
      const from = data.scoutingTeam != null && data.scoutingTeam !== team ? ` (recorded by team ${data.scoutingTeam})` : ''
      setMessage({ ok: true, text: `Imported ${added} new and ${updated} updated recording${added + updated === 1 ? '' : 's'}${from}.` })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Page title="Import / export">
      <Card className="p-4">
        <h2 className="font-medium">Export</h2>
        <p className="mt-1 text-sm text-ink-2">
          Download recordings as JSON — raw events plus computed stats — for use offline or in a spreadsheet. Single matches can be
          exported from their detail page.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={exportCurrent} disabled={!current}>
            {current ? `Export ${current.name}` : 'Export tournament'}
          </Button>
          <Button onClick={exportAll} disabled={reports.length === 0}>
            Export everything
          </Button>
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="font-medium">Import</h2>
        <p className="mt-1 text-sm text-ink-2">
          Load an Aragon Scout export — e.g. from a device that recorded without a connection. Recordings are merged; newer edits win.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
        />
        <Button className="mt-4" onClick={() => fileRef.current?.click()}>
          Choose file…
        </Button>
        {message && <p className={`mt-3 text-sm ${message.ok ? 'text-good' : 'text-red'}`}>{message.text}</p>}
      </Card>
    </Page>
  )
}
