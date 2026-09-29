import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useParams } from 'react-router-dom'
import { StaticDataProvider } from '../app/data'
import { Wordmark } from '../components/Layout'
import { Empty, Page, cx } from '../components/ui'
import { supabase } from '../lib/supabase'
import type { Report, Tournament } from '../lib/types'
import { AnalysisPage } from './Analysis'
import { MatchDetailPage } from './MatchDetail'
import { MatchesPage } from './Matches'
import { TeamDetailPage } from './TeamDetail'

type Loaded = { teamName: string; reports: Report[]; tournaments: Tournament[] }

async function fetchAll<T>(table: 'reports' | 'tournaments', owner: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!
      .from(table)
      .select('data, updated_at')
      .eq('owner', owner)
      .eq('deleted', false)
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []).map((r) => ({ ...(r.data as T), updatedAt: r.updated_at })))
    if (!data || data.length < 1000) return out
  }
}

/** Read-only view of a team that turned on public sharing. Needs a connection. */
export function PublicTeamPage() {
  const { owner } = useParams()
  const teamNumber = Number(owner)
  const [state, setState] = useState<{ status: 'loading' } | { status: 'missing' | 'error'; message?: string } | ({ status: 'ok' } & Loaded)>({
    status: 'loading',
  })

  useEffect(() => {
    if (!supabase) {
      setState({ status: 'error', message: 'Sharing is not available in local-only mode.' })
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, team_name')
        .eq('team_number', teamNumber)
        .eq('is_public', true)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!profile) return cancelled || setState({ status: 'missing' })
      const [reports, tournaments] = await Promise.all([
        fetchAll<Report>('reports', profile.id),
        fetchAll<Tournament>('tournaments', profile.id),
      ])
      if (!cancelled) {
        setState({ status: 'ok', teamName: profile.team_name, reports, tournaments: tournaments.sort((a, b) => b.createdAt - a.createdAt) })
      }
    })().catch((err) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }))
    return () => {
      cancelled = true
    }
  }, [teamNumber])

  const base = `/t/${teamNumber}`
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Wordmark />
          <span className="tnum truncate pl-3 text-xs text-ink-3">
            Shared by {state.status === 'ok' && state.teamName ? state.teamName : `team ${teamNumber}`} · view only
          </span>
        </div>
        {state.status === 'ok' && (
          <nav className="mx-auto flex max-w-2xl gap-1 px-3 pb-2">
            {[
              [base, 'Matches'],
              [`${base}/analysis`, 'Analysis'],
            ].map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === base}
                className={({ isActive }) => cx('rounded-full px-3 py-1.5 text-sm', isActive ? 'bg-surface-2 text-ink' : 'text-ink-3')}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      {state.status === 'loading' && <Page>{null}</Page>}
      {state.status === 'missing' && (
        <Page>
          <Empty title={`Team ${teamNumber} isn't sharing publicly`}>The team may have turned sharing off.</Empty>
        </Page>
      )}
      {state.status === 'error' && (
        <Page>
          <Empty title="Couldn't load this team">{state.message}</Empty>
        </Page>
      )}
      {state.status === 'ok' && (
        <StaticDataProvider reports={state.reports} tournaments={state.tournaments} base={base}>
          <Routes>
            <Route index element={<MatchesPage />} />
            <Route path="matches" element={<MatchesPage />} />
            <Route path="matches/:tid/:match" element={<MatchDetailPage />} />
            <Route path="analysis" element={<AnalysisPage />} />
            <Route path="analysis/:team" element={<TeamDetailPage />} />
          </Routes>
        </StaticDataProvider>
      )}
    </div>
  )
}
