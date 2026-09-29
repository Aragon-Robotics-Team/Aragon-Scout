import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { openDb, type ScoutDB } from '../lib/db'
import { supabase } from '../lib/supabase'
import { SyncEngine, type SyncStatus } from '../lib/sync'
import { readJson, writeJson } from '../lib/storage'
import type { Report, Tournament } from '../lib/types'
import type { Account } from './auth'

/**
 * Everything the list/analysis screens read. The signed-in app fills it from
 * IndexedDB; the public share page fills it (read-only) from Supabase.
 */
export interface DataValue {
  reports: Report[]
  tournaments: Tournament[]
  loaded: boolean
  readOnly: boolean
  /** Route prefix for links, e.g. '' or '/t/12345'. */
  base: string
  db: ScoutDB | null
  currentTournamentId: string | null
  setCurrentTournamentId(id: string | null): void
  sync: { status: SyncStatus | 'local'; pending: number; error: string | null; syncNow(): void }
}

const DataContext = createContext<DataValue | null>(null)

export function useData(): DataValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside a data provider')
  return ctx
}

export function useDb(): ScoutDB {
  const { db } = useData()
  if (!db) throw new Error('No local database (read-only view)')
  return db
}

const noopSync = { status: 'local' as const, pending: 0, error: null, syncNow() {} }

export function LocalDataProvider({ account, children }: { account: Account; children: ReactNode }) {
  const db = useMemo(() => openDb(account.userId), [account.userId])
  const engine = useMemo(
    () => (supabase && account.userId !== 'local' ? new SyncEngine(db, supabase, account.userId, account.teamNumber) : null),
    [db, account.userId, account.teamNumber],
  )

  useEffect(() => {
    engine?.start()
    return () => engine?.stop()
  }, [engine])

  const subscribe = useCallback((fn: () => void) => engine?.subscribe(fn) ?? (() => {}), [engine])
  const status = useSyncExternalStore(subscribe, () => engine?.status ?? 'local')
  const error = useSyncExternalStore(subscribe, () => engine?.lastError ?? null)

  const reports = useLiveQuery(async () => (await db.reports.toArray()).map((r) => r.doc).filter((r) => !r.deleted), [db])
  const tournaments = useLiveQuery(
    async () =>
      (await db.tournaments.toArray())
        .map((t) => t.doc)
        .filter((t) => !t.deleted)
        .sort((a, b) => b.createdAt - a.createdAt),
    [db],
  )
  const pending = useLiveQuery(
    async () => (await db.reports.where('dirty').equals(1).count()) + (await db.tournaments.where('dirty').equals(1).count()),
    [db],
  )

  // The current tournament is a per-device choice.
  const currentKey = `as.currentTournament:${account.userId}`
  const [currentTournamentId, setCurrentState] = useState<string | null>(() => readJson<string>(currentKey))
  const setCurrentTournamentId = useCallback(
    (id: string | null) => {
      setCurrentState(id)
      writeJson(currentKey, id)
    },
    [currentKey],
  )

  // Fall back to the newest tournament if the stored one is gone.
  const validCurrent =
    tournaments && currentTournamentId && tournaments.some((t) => t.id === currentTournamentId)
      ? currentTournamentId
      : (tournaments?.[0]?.id ?? null)

  const value: DataValue = {
    reports: reports ?? [],
    tournaments: tournaments ?? [],
    loaded: reports !== undefined && tournaments !== undefined,
    readOnly: false,
    base: '',
    db,
    currentTournamentId: validCurrent,
    setCurrentTournamentId,
    sync: engine
      ? { status, pending: pending ?? 0, error, syncNow: () => void engine.sync() }
      : { ...noopSync, pending: pending ?? 0 },
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function StaticDataProvider({
  reports,
  tournaments,
  base,
  children,
}: {
  reports: Report[]
  tournaments: Tournament[]
  base: string
  children: ReactNode
}) {
  const [currentTournamentId, setCurrentTournamentId] = useState<string | null>(tournaments[0]?.id ?? null)
  const value: DataValue = {
    reports,
    tournaments,
    loaded: true,
    readOnly: true,
    base,
    db: null,
    currentTournamentId,
    setCurrentTournamentId,
    sync: noopSync,
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
