import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { TournamentTeam } from '../lib/types'
import { Label, cx } from './ui'

const MAX_OPTIONS = 8

function filterTeams(teams: TournamentTeam[], query: string): TournamentTeam[] {
  const q = query.trim().toLowerCase()
  const matches = q ? teams.filter((t) => String(t.number).startsWith(q) || t.name.toLowerCase().includes(q)) : teams
  return matches.slice(0, MAX_OPTIONS)
}

/** Arrow keys, Enter and Escape for an open team list. */
function listKeys(e: KeyboardEvent, options: TournamentTeam[], active: number, setActive: (f: (a: number) => number) => void, pick: (t: TournamentTeam) => void, close: () => void) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    setActive((a) => Math.min(options.length - 1, a + 1))
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    setActive((a) => Math.max(0, a - 1))
  } else if (e.key === 'Enter') {
    e.preventDefault()
    pick(options[active])
  } else if (e.key === 'Escape') {
    close()
  }
}

const inputClass =
  'h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none'

/**
 * Team name field with a type-to-filter list of the tournament's teams.
 * Matches on number or name; picking one also sets the team number.
 * Anything typed that isn't on the list is kept as a custom name.
 */
export function TeamCombobox({
  label,
  value,
  teams,
  onChange,
  onPick,
}: {
  label: string
  value: string
  teams: TournamentTeam[]
  onChange(name: string): void
  onPick(team: TournamentTeam): void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const blurTimer = useRef<number | undefined>(undefined)

  const options = useMemo(() => filterTeams(teams, value), [teams, value])

  const exact = options.some((o) => o.name.trim().toLowerCase() === value.trim().toLowerCase())
  const showList = open && teams.length > 0 && options.length > 0 && !(exact && options.length === 1)

  const pick = (t: TournamentTeam) => {
    onPick(t)
    setOpen(false)
  }

  return (
    <div className="relative">
      <label htmlFor={id}>
        <Label hint={teams.length > 0 ? `${teams.length} teams` : undefined}>{label}</Label>
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={teams.length > 0 ? 'Type a name or number' : undefined}
        onChange={(e) => {
          onChange(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={(e) => {
          // Selecting the current name lets a scout type straight over it.
          e.target.select()
          setOpen(true)
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={(e) => showList && listKeys(e, options, active, setActive, pick, () => setOpen(false))}
        className={inputClass}
      />
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute right-0 left-0 z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-surface-2 py-1 shadow-xl"
          onMouseDown={() => window.clearTimeout(blurTimer.current)}
        >
          <TeamOptions options={options} active={active} onPick={pick} />
          {value.trim() && !exact && (
            <li
              role="option"
              aria-selected={false}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
              className="cursor-pointer border-t border-line px-3 py-2.5 text-sm text-ink-2"
            >
              Use “{value.trim()}” as a custom name
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function TeamOptions({ options, active, onPick }: { options: TournamentTeam[]; active: number; onPick(t: TournamentTeam): void }) {
  return options.map((t, i) => (
    <li
      key={t.number}
      role="option"
      aria-selected={i === active}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onPick(t)}
      className={cx('flex cursor-pointer gap-3 px-3 py-2.5 text-[15px]', i === active && 'bg-line')}
    >
      <span className="tnum w-14 shrink-0 text-ink-2">{t.number}</span>
      <span className="truncate">{t.name || <span className="text-ink-3">No name</span>}</span>
    </li>
  ))
}

/**
 * Team number field that also takes a team name: typing digits sets the number
 * directly, typing a name filters the tournament's teams to pick from.
 */
export function TeamNumberField({
  label,
  value,
  teams,
  nameOf,
  onChange,
  alignRight,
}: {
  label: string
  value: number | null
  teams: TournamentTeam[]
  nameOf(n: number | null): string | undefined
  onChange(n: number | null): void
  /** Open the list leftward, for a field at the right edge of the screen. */
  alignRight?: boolean
}) {
  const id = useId()
  // While focused, the field holds whatever is typed; otherwise it shows the number.
  const [text, setText] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const shown = text ?? (value != null ? String(value) : '')
  const options = useMemo(() => (text == null ? [] : filterTeams(teams, text)), [teams, text])
  const showList = text != null && text.trim() !== '' && options.length > 0 && !(options.length === 1 && String(options[0].number) === text.trim())
  const name = nameOf(value)

  const pick = (t: TournamentTeam) => {
    onChange(t.number)
    setText(null)
  }

  return (
    <div className="relative min-w-0">
      <label htmlFor={id}>
        <Label>{label}</Label>
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        value={shown}
        placeholder="# or name"
        onChange={(e) => {
          const v = e.target.value
          setText(v)
          setActive(0)
          if (v.trim() === '') onChange(null)
          else if (/^\d+$/.test(v.trim())) onChange(Number(v.trim()))
        }}
        onFocus={(e) => {
          setText(shown)
          e.target.select()
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => showList && listKeys(e, options, active, setActive, pick, () => setText(null))}
        className={cx(inputClass, 'tnum')}
      />
      <div className="mt-1 h-4 truncate text-[11px] text-ink-3">{name ?? '\u00a0'}</div>
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className={cx('absolute z-20 mt-1 max-h-72 w-64 max-w-[80vw] overflow-auto rounded-xl border border-line bg-surface-2 py-1 shadow-xl', alignRight ? 'right-0' : 'left-0')}
        >
          <TeamOptions options={options} active={active} onPick={pick} />
        </ul>
      )}
    </div>
  )
}
