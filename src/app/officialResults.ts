import { useCallback, useEffect, useState } from 'react'
import { fetchOfficialResults, resultsKey, type OfficialResult } from '../lib/ftcscout'
import { readJson, writeJson } from '../lib/storage'
import type { Tournament } from '../lib/types'

/** Re-fetch at most this often while the analysis page is open. */
const STALE_MS = 5 * 60_000

interface Cached {
  fetchedAt: number
  results: OfficialResult[]
}

/**
 * FTCScout's official qualification results for a tournament, kept on this
 * device so OPR still works offline after one successful fetch.
 */
export function useOfficialResults(tournament: Tournament | undefined) {
  const key = tournament ? resultsKey(tournament.id) : null
  const code = tournament?.eventCode.trim() ?? ''
  const [cached, setCached] = useState<Cached | null>(() => (key ? readJson<Cached>(key) : null))
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [loadedKey, setLoadedKey] = useState(key)
  if (loadedKey !== key) {
    setLoadedKey(key)
    setCached(key ? readJson<Cached>(key) : null)
  }

  const refresh = useCallback(async () => {
    if (!key || !code || !navigator.onLine) return
    setStatus('loading')
    try {
      const next = { fetchedAt: Date.now(), results: await fetchOfficialResults(code) }
      writeJson(key, next)
      setCached(next)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [key, code])

  useEffect(() => {
    const saved = key ? readJson<Cached>(key) : null
    if (saved && Date.now() - saved.fetchedAt <= STALE_MS) return
    const id = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(id)
  }, [key, refresh])

  return { results: cached?.results ?? [], fetchedAt: cached?.fetchedAt ?? null, status, refresh, hasCode: !!code }
}
