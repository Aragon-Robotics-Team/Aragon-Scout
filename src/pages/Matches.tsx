import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../app/data'
import { ALL, TournamentSelect } from '../components/TournamentSelect'
import { Empty, Page, SearchInput, TeamChip, cx } from '../components/ui'
import { groupMatches, type MatchGroup } from '../lib/grouping'
import type { Alliance } from '../lib/types'

function matchesQuery(g: MatchGroup, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  if (String(g.matchNumber) === needle) return true
  if ([...g.red, ...g.blue].some((t) => String(t.number).includes(needle))) return true
  return g.reports.some((r) => r.pre.teamName.toLowerCase().includes(needle))
}

export function MatchesPage() {
  const { reports, tournaments, currentTournamentId, base, loaded } = useData()
  // null = follow this device's current tournament (which loads asynchronously).
  const [picked, setScope] = useState<string | null>(null)
  const scope = picked ?? currentTournamentId ?? ALL
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const inScope = scope === ALL ? reports : reports.filter((r) => r.tournamentId === scope)
    return groupMatches(inScope).filter((g) => matchesQuery(g, query.trim()))
  }, [reports, scope, query])

  // In "all tournaments", section the list by tournament.
  const sections = useMemo(() => {
    if (scope !== ALL) return [{ id: scope, name: tournaments.find((t) => t.id === scope)?.name ?? 'No tournament', groups }]
    const order = [...tournaments.map((t) => t.id), 'none']
    const byT = new Map<string, MatchGroup[]>()
    for (const g of groups) {
      const id = g.tournamentId ?? 'none'
      byT.set(id, [...(byT.get(id) ?? []), g])
    }
    return [...byT.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([id, gs]) => ({ id, name: tournaments.find((t) => t.id === id)?.name ?? 'No tournament', groups: gs }))
  }, [scope, groups, tournaments])

  return (
    <Page title={base ? 'Matches' : 'My matches'}>
      <div className="mb-4 flex gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput value={query} onChange={setQuery} placeholder="Search match, team # or name" />
        </div>
        <TournamentSelect tournaments={tournaments} value={scope} onChange={setScope} />
      </div>

      {loaded && groups.length === 0 ? (
        <Empty title={query ? 'No matches found' : 'No matches recorded yet'}>
          {!query && base === '' && (
            <Link to="/record" className="text-ink underline underline-offset-4">
              Record a match
            </Link>
          )}
        </Empty>
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.id}>
              <h2 className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{s.name}</span>
                <span className="tnum shrink-0 text-xs text-ink-3">
                  {s.groups.length} match{s.groups.length === 1 ? '' : 'es'}
                </span>
              </h2>
              <ul className="space-y-2">
                {s.groups.map((g) => (
                  <li key={g.key}>
                    <MatchRow group={g} href={`${base}/matches/${g.tournamentId ?? 'none'}/${g.matchNumber}`} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  )
}

function AllianceCell({ alliance, teams }: { alliance: Alliance; teams: MatchGroup['red'] }) {
  return (
    <div className={cx('flex min-w-0 flex-wrap items-center gap-1 border-l-2 px-2.5 py-2', alliance === 'red' ? 'border-red' : 'border-blue')}>
      {teams.length === 0 ? <span className="text-sm text-ink-3">—</span> : teams.map((t) => <TeamChip key={t.number} number={t.number} alliance={alliance} highlight={t.scouted} />)}
    </div>
  )
}

function MatchRow({ group: g, href }: { group: MatchGroup; href: string }) {
  const scored = g.redScore != null || g.blueScore != null
  return (
    <Link
      to={href}
      className="grid grid-cols-[3.25rem_5rem_1fr_1fr] items-stretch overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-ink-3"
    >
      <div className="flex flex-col items-center justify-center border-r border-line py-2">
        <span className="text-[10px] uppercase tracking-wider text-ink-3">Match</span>
        <span className="tnum text-lg font-semibold leading-tight">{g.matchNumber}</span>
      </div>
      <div className="tnum flex flex-col items-center justify-center border-r border-line text-sm">
        <span className="flex items-center gap-1">
        {scored ? (
          <>
            <span className={cx(g.redScore != null && g.blueScore != null && g.redScore > g.blueScore ? 'font-semibold text-ink' : 'text-ink-2')}>{g.redScore ?? '–'}</span>
            <span className="text-ink-3">–</span>
            <span className={cx(g.redScore != null && g.blueScore != null && g.blueScore > g.redScore ? 'font-semibold text-ink' : 'text-ink-2')}>{g.blueScore ?? '–'}</span>
          </>
        ) : (
          <span className="text-ink-3">—</span>
        )}
        </span>
        {g.conflicts.length > 0 && (
          <span title={g.conflicts.join('\n')} className="text-[10px] text-warn">
            ⚠ check
          </span>
        )}
      </div>
      <AllianceCell alliance="red" teams={g.red} />
      <AllianceCell alliance="blue" teams={g.blue} />
    </Link>
  )
}
