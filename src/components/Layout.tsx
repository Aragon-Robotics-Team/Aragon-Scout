import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { useData } from '../app/data'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/record', label: 'Record a match' },
  { to: '/matches', label: 'My matches' },
  { to: '/analysis', label: 'Tournament analysis' },
  { to: '/tournaments', label: 'Tournaments' },
  { to: '/data', label: 'Import / export' },
  { to: '/account', label: 'Account' },
]

export function syncLabel(status: string, pending: number): { color: string; text: string } {
  if (status === 'local') return { color: 'bg-ink-3', text: 'Local only — not syncing' }
  if (status === 'offline') return { color: 'bg-ink-3', text: pending ? `Offline · ${pending} waiting to sync` : 'Offline' }
  if (status === 'error') return { color: 'bg-red', text: 'Sync error' }
  if (status === 'syncing' || pending > 0) return { color: 'bg-warn', text: pending ? `${pending} waiting to sync` : 'Syncing…' }
  return { color: 'bg-good', text: 'All changes synced' }
}

export function Wordmark() {
  return (
    <span className="text-[17px] font-semibold tracking-tight">
      Aragon <span className="text-red">Scout</span>
    </span>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { account } = useAuth()
  const { sync } = useData()
  // The menu is open for one path only, so navigating closes it.
  const { pathname } = useLocation()
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((typeof v === 'function' ? v(open) : v) ? pathname : null)
  const s = syncLabel(sync.status, sync.pending)

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link
            to="/account"
            aria-label={`Account, team ${account?.teamNumber}. ${s.text}`}
            title={s.text}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-2 text-[10px] font-semibold tnum text-ink-2"
          >
            {account?.teamNumber}
            <span className={cx('absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg', s.color)} />
          </Link>
          <Link to="/" aria-label="Home">
            <Wordmark />
          </Link>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-full text-ink-2 hover:text-ink"
          >
            <span className={cx('h-px w-5 bg-current transition-transform', open && 'translate-y-[3px] rotate-45')} />
            <span className={cx('h-px w-5 bg-current transition-transform', open && '-translate-y-[3px] -rotate-45')} />
          </button>
        </div>
        {open && (
          <nav className="mx-auto max-w-2xl px-2 pb-3">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  cx('block rounded-xl px-3 py-2.5 text-[15px]', isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink')
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      {open && <div className="fixed inset-0 z-20 bg-black/50" onClick={() => setOpen(false)} />}
      {children}
    </div>
  )
}
