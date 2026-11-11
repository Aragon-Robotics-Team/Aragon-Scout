import type { SupabaseClient } from '@supabase/supabase-js'
import type { Table } from 'dexie'
import { getMeta, onLocalChange, setMeta, type ScoutDB } from './db'
import { shouldAcceptRemote } from './merge'
import type { PitReport, Report, Tournament } from './types'

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error'

type Doc = { id: string; updatedAt: number; deleted: boolean }
type TableName = 'reports' | 'tournaments' | 'pit_reports'

/** The server hasn't got this table yet (its schema predates it). */
export function isMissingTable(message: string): boolean {
  return /does not exist|could not find the table|PGRST205|42P01/i.test(message)
}
type LocalTable<D extends Doc> = Table<{ id: string; dirty: 0 | 1; doc: D }, string>

interface RemoteRow {
  id: string
  data: unknown
  updated_at: number
  server_updated_at: string
}

const PAGE = 500
/** Re-read a little behind the cursor so rows committed out of order aren't missed. */
const OVERLAP_MS = 30_000
const INTERVAL_MS = 30_000

/**
 * Offline-first sync: every write lands in IndexedDB first (marked dirty); this
 * engine pulls newer cloud rows, then pushes dirty rows, whenever online.
 */
export class SyncEngine {
  status: SyncStatus = navigator.onLine ? 'synced' : 'offline'
  lastError: string | null = null
  private listeners = new Set<() => void>()
  private running: Promise<void> | null = null
  private again = false
  private timer: number | undefined
  private debounce: number | undefined
  private cleanup: (() => void)[] = []

  private db: ScoutDB
  private client: SupabaseClient
  private orgId: string

  constructor(db: ScoutDB, client: SupabaseClient, orgId: string) {
    this.db = db
    this.client = client
    this.orgId = orgId
  }

  start() {
    const kick = () => this.sync()
    const onOnline = () => this.sync()
    const onOffline = () => this.set('offline')
    const onVisible = () => document.visibilityState === 'visible' && this.sync()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    const offLocal = onLocalChange(() => {
      window.clearTimeout(this.debounce)
      this.debounce = window.setTimeout(kick, 800)
    })
    this.timer = window.setInterval(kick, INTERVAL_MS)
    this.cleanup = [
      () => window.removeEventListener('online', onOnline),
      () => window.removeEventListener('offline', onOffline),
      () => document.removeEventListener('visibilitychange', onVisible),
      offLocal,
      () => window.clearInterval(this.timer),
      () => window.clearTimeout(this.debounce),
    ]
    void this.sync()
  }

  stop() {
    for (const fn of this.cleanup) fn()
    this.cleanup = []
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private set(status: SyncStatus, error: string | null = null) {
    this.status = status
    this.lastError = error
    for (const fn of this.listeners) fn()
  }

  /** Runs a sync; if one is in flight, queues exactly one more afterwards. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.again = false
        await this.once()
      } while (this.again)
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async once() {
    if (!navigator.onLine) {
      this.set('offline')
      return
    }
    this.set('syncing')
    try {
      await this.pull<Tournament>('tournaments', this.db.tournaments)
      await this.pull<Report>('reports', this.db.reports)
      await this.push<Tournament>('tournaments', this.db.tournaments, () => ({}))
      await this.push<Report>('reports', this.db.reports, (doc) => ({
        recorded_by: doc.recordedBy?.userId ?? null,
        tournament_id: doc.tournamentId,
        match_number: doc.pre.matchNumber,
        scouted_team: doc.pre.teamNumber,
      }))
      await this.syncPitReports()
      this.set('synced')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.set(navigator.onLine ? 'error' : 'offline', message)
    }
  }

  /**
   * Pit reports came after the first server schema. Until supabase/schema.sql is
   * re-run their table is missing: recordings still sync, and pit reports wait
   * on the device (an error only once there's one to push).
   */
  private async syncPitReports() {
    try {
      await this.pull<PitReport>('pit_reports', this.db.pitReports)
    } catch (err) {
      if (!(err instanceof Error && isMissingTable(err.message))) throw err
      if ((await this.db.pitReports.where('dirty').equals(1).count()) === 0) return
      throw new Error('Pit scouting needs a server update: re-run supabase/schema.sql in Supabase.')
    }
    await this.push<PitReport>('pit_reports', this.db.pitReports, (doc) => ({
      tournament_id: doc.tournamentId,
      team_number: doc.teamNumber,
    }))
  }

  private async pull<D extends Doc>(table: TableName, local: LocalTable<D>) {
    const cursorKey = `cursor:${table}`
    let cursor = (await getMeta<string>(this.db, cursorKey)) ?? '1970-01-01T00:00:00Z'
    const since = new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString()
    let offset = 0
    for (;;) {
      const { data, error } = await this.client
        .from(table)
        .select('id, data, updated_at, server_updated_at')
        .eq('org_id', this.orgId)
        .gt('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as RemoteRow[]
      if (rows.length === 0) break
      await this.db.transaction('rw', local, async () => {
        for (const row of rows) {
          const current = await local.get(row.id)
          if (shouldAcceptRemote(current, row.updated_at)) {
            await local.put({ id: row.id, dirty: 0, doc: { ...(row.data as D), updatedAt: row.updated_at } })
          }
        }
      })
      for (const row of rows) if (row.server_updated_at > cursor) cursor = row.server_updated_at
      if (rows.length < PAGE) break
      offset += PAGE
    }
    await setMeta(this.db, cursorKey, cursor)
  }

  private async push<D extends Doc>(
    table: TableName,
    local: LocalTable<D>,
    extra: (doc: D) => Record<string, unknown>,
  ) {
    const dirty = await local.where('dirty').equals(1).toArray()
    for (let i = 0; i < dirty.length; i += PAGE) {
      const batch = dirty.slice(i, i + PAGE)
      const payload = batch.map(({ doc }) => ({
        id: doc.id,
        org_id: this.orgId,
        data: doc,
        deleted: doc.deleted,
        updated_at: doc.updatedAt,
        ...extra(doc),
      }))
      const { error } = await this.client.from(table).upsert(payload, { onConflict: 'id' })
      if (error) throw new Error(error.message)
      // Only clear the flag if the row wasn't edited again while we were pushing.
      await this.db.transaction('rw', local, async () => {
        for (const { doc } of batch) {
          const current = await local.get(doc.id)
          if (current && current.doc.updatedAt === doc.updatedAt) {
            await local.put({ ...current, dirty: 0 })
          }
        }
      })
    }
  }
}
