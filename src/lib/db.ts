import Dexie, { type Table } from 'dexie'
import type { Report, Tournament } from './types'

/** `dirty` = 1 while the row has local changes not yet pushed to the cloud. */
export interface LocalReport {
  id: string
  dirty: 0 | 1
  doc: Report
}

export interface LocalTournament {
  id: string
  dirty: 0 | 1
  doc: Tournament
}

export interface MetaRow {
  key: string
  value: unknown
}

export class ScoutDB extends Dexie {
  reports!: Table<LocalReport, string>
  tournaments!: Table<LocalTournament, string>
  meta!: Table<MetaRow, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      reports: 'id, dirty',
      tournaments: 'id, dirty',
      meta: 'key',
    })
  }
}

/** One local database per account, so two teams on one device never mix data. */
export function openDb(userId: string): ScoutDB {
  return new ScoutDB(`aragon-scout-${userId}`)
}

export async function getMeta<T>(db: ScoutDB, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(db: ScoutDB, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/** Local writes always go through these so they are marked for sync. */
export async function saveReport(db: ScoutDB, doc: Report): Promise<void> {
  await db.reports.put({ id: doc.id, dirty: 1, doc: { ...doc, updatedAt: Date.now() } })
  notifyLocalChange()
}

export async function saveTournament(db: ScoutDB, doc: Tournament): Promise<void> {
  await db.tournaments.put({ id: doc.id, dirty: 1, doc: { ...doc, updatedAt: Date.now() } })
  notifyLocalChange()
}

export async function deleteReport(db: ScoutDB, doc: Report): Promise<void> {
  await saveReport(db, { ...doc, deleted: true })
}

export async function deleteTournament(db: ScoutDB, doc: Tournament): Promise<void> {
  await saveTournament(db, { ...doc, deleted: true })
}

const listeners = new Set<() => void>()

export function onLocalChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function notifyLocalChange() {
  for (const fn of listeners) fn()
}
