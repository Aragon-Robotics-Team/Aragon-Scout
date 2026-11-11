import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../app/data'
import { Button, Card, Empty, Page, SearchInput, Segmented, cx } from '../components/ui'
import { formatSeconds } from '../lib/cycles'
import {
  NO_FILTERS,
  activeFilterCount,
  buildTeamDatabase,
  filterTeams,
  sortTeams,
  type DbFilters,
  type DbSort,
  type YesNo,
} from '../lib/database'
import { AIMING_LABELS, LAUNCHER_LABELS, SIZE_LABELS } from '../lib/pit'
import { ESTIMATE_NOTE, formatNum } from '../lib/scoring'
import { readJson, writeJson } from '../lib/storage'

const SORT_KEY = 'as.teamDatabaseSort'
const SORT_OPTIONS: { value: DbSort; label: string }[] = [
  { value: 'team', label: 'Team #' },
  { value: 'name', label: 'Name' },
  { value: 'lastSeen', label: 'Last seen' },
  { value: 'matches', label: 'Matches' },
  { value: 'points', label: 'Est. pts' },
  { value: 'cycle', label: 'Cycle' },
]

/** Every team we've scouted, across every tournament. */
export function TeamDatabasePage() {
  const { reports, tournaments, pitReports, base, readOnly, loaded } = useData()
  const [filters, setFilters] = useState<DbFilters>(NO_FILTERS)
  const [sort, setSortState] = useState<DbSort>(() => readJson<DbSort>(SORT_KEY) ?? 'team')
  const [showFilters, setShowFilters] = useState(false)
  const setSort = (s: DbSort) => {
    setSortState(s)
    writeJson(SORT_KEY, s)
  }
  const set = <K extends keyof DbFilters>(k: K, v: DbFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))

  const all = useMemo(() => buildTeamDatabase(reports, tournaments, pitReports), [reports, tournaments, pitReports])
  const teams = useMemo(() => sortTeams(filterTeams(all, filters), sort), [all, filters, sort])
  const tName = new Map(tournaments.map((t) => [t.id, t.name]))
  const active = activeFilterCount(filters)

  return (
    <Page title="Team database">
      <div className="mb-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput value={filters.query} onChange={(v) => set('query', v)} placeholder="Search team # or name" />
        </div>
        <Button className="h-11 shrink-0 rounded-full" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
          Filters{active > 0 && <span className="tnum rounded-full bg-accent px-1.5 text-xs text-on-accent">{active}</span>}
        </Button>
      </div>

      {showFilters && (
        <Card className="mb-3 space-y-3 p-4">
          <FilterSelect
            label="Tournament"
            value={filters.tournamentId}
            onChange={(v) => set('tournamentId', v)}
            options={tournaments.map((t) => [t.id, t.name] as const)}
          />
          {!readOnly && (
            <>
              <FilterSelect label="Pit report" value={filters.hasPit} onChange={(v) => set('hasPit', v)} options={YES_NO(['Has one', 'None yet'])} />
              <FilterSelect label="Aiming" value={filters.aiming} onChange={(v) => set('aiming', v)} options={entries(AIMING_LABELS)} />
              <FilterSelect label="Launcher" value={filters.launcher} onChange={(v) => set('launcher', v)} options={entries(LAUNCHER_LABELS)} />
              <FilterSelect label="Flower intake" value={filters.flowerIntake} onChange={(v) => set('flowerIntake', v)} options={YES_NO(['Yes', 'No'])} />
              <FilterSelect label="Size" value={filters.size} onChange={(v) => set('size', v)} options={entries(SIZE_LABELS)} />
              <FilterSelect label="Auto leave" value={filters.autoLeave} onChange={(v) => set('autoLeave', v)} options={YES_NO(['Yes', 'No'])} />
              <p className="text-xs text-ink-3">
                Robot filters use the newest pit report, or the picked tournament's. Questions marked "not asked" match neither yes nor no.
              </p>
            </>
          )}
          {active > 0 && (
            <Button variant="ghost" className="h-9 px-0" onClick={() => setFilters({ ...NO_FILTERS, query: filters.query })}>
              Clear filters
            </Button>
          )}
        </Card>
      )}

      <div className="mb-4 flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-xs text-ink-3">Sort</span>
        <Segmented<DbSort> className="shrink-0 [&>button]:whitespace-nowrap" value={sort} onChange={setSort} options={SORT_OPTIONS} />
      </div>

      <h2 className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{filters.tournamentId ? tName.get(filters.tournamentId) : 'All tournaments'}</span>
        <span className="tnum shrink-0 text-xs text-ink-3">
          {teams.length} team{teams.length === 1 ? '' : 's'}
        </span>
      </h2>

      {loaded && teams.length === 0 ? (
        <Empty title={all.length === 0 ? 'No teams scouted yet' : 'No teams match'}>
          {all.length === 0 && !readOnly && 'Teams appear here once they’re recorded in a match or pit-scouted.'}
        </Empty>
      ) : (
        <>
          <div className="mb-1.5 grid grid-cols-[1fr_3.25rem_3.25rem_3.5rem] px-4 text-[11px] text-ink-3">
            <span>Team</span>
            <span className="text-right">Matches</span>
            <span className="text-right" title={ESTIMATE_NOTE}>
              Est.*
            </span>
            <span className="text-right" title="Median teleop cycle time">
              Cycle
            </span>
          </div>
          <ul className="space-y-2">
            {teams.map((t) => {
              const latest = t.tournamentIds[0]
              return (
                <li key={t.teamNumber}>
                  <Link
                    to={`${base}/teams/${t.teamNumber}`}
                    className="grid grid-cols-[1fr_3.25rem_3.25rem_3.5rem] items-center rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-ink-3"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{t.teamName || `Team ${t.teamNumber}`}</span>
                        {t.pit.length > 0 && (
                          <span title="Pit-scouted" className="shrink-0 rounded-full border border-good/50 bg-good/15 px-1.5 text-[10px] font-medium text-ink">
                            Pit ✓
                          </span>
                        )}
                      </span>
                      <span className="tnum block truncate text-xs text-ink-3">
                        {t.teamNumber}
                        {latest && <> · {tName.get(latest)}</>}
                      </span>
                    </span>
                    <span className="tnum text-right text-ink-2">{t.summary?.matchesPlayed ?? '—'}</span>
                    <span className="tnum text-right text-ink-2">{t.summary ? formatNum(t.summary.avgEstPoints) : '—'}</span>
                    <span className="tnum text-right text-ink-2">{t.summary ? formatSeconds(t.summary.cycle.median) : '—'}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-[11px] text-ink-3">* Est. robot pts, lifetime average. {ESTIMATE_NOTE}</p>
        </>
      )}
    </Page>
  )
}

const entries = <T extends string>(labels: Record<T, string>) => Object.entries(labels) as [T, string][]
const YES_NO = ([yes, no]: [string, string]): [YesNo, string][] => [
  ['yes', yes],
  ['no', no],
]

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T | null
  onChange(v: T | null): void
  options: readonly (readonly [T, string])[]
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-2">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
        className={cx(
          'h-10 w-[60%] min-w-0 rounded-xl border bg-surface-2 px-3 text-sm focus:outline-none',
          value ? 'border-ink-3 text-ink' : 'border-line text-ink-2',
        )}
      >
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
