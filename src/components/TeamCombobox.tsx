import { useId, useMemo, useRef, useState } from 'react'
import type { TournamentTeam } from '../lib/types'
import { Label, cx } from './ui'

const MAX_OPTIONS = 8

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

  const options = useMemo(() => {
    const q = value.trim().toLowerCase()
    const matches = q
      ? teams.filter((t) => String(t.number).startsWith(q) || t.name.toLowerCase().includes(q))
      : teams
    return matches.slice(0, MAX_OPTIONS)
  }, [teams, value])

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
        onKeyDown={(e) => {
          if (!showList) return
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
            setOpen(false)
          }
        }}
        className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
      />
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute right-0 left-0 z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-surface-2 py-1 shadow-xl"
          onMouseDown={() => window.clearTimeout(blurTimer.current)}
        >
          {options.map((t, i) => (
            <li
              key={t.number}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(t)}
              className={cx('flex cursor-pointer gap-3 px-3 py-2.5 text-[15px]', i === active && 'bg-line')}
            >
              <span className="tnum w-14 shrink-0 text-ink-2">{t.number}</span>
              <span className="truncate">{t.name || <span className="text-ink-3">No name</span>}</span>
            </li>
          ))}
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
