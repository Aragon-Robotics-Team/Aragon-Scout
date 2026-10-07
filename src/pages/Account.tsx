import { useState } from 'react'
import { useAuth } from '../app/auth'
import { useData } from '../app/data'
import { syncLabel } from '../components/Layout'
import { TeamCard } from '../components/Team'
import { AppearanceCard } from '../components/Appearance'
import { Button, Card, Page, TextInput, cx } from '../components/ui'

export function AccountPage() {
  const { account, signOut, updateUsername, localMode } = useAuth()
  const { sync, db } = useData()
  const [username, setUsername] = useState(account?.username ?? '')
  const [error, setError] = useState<string | null>(null)
  if (!account) return null
  const s = syncLabel(sync.status, sync.pending)

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const doSignOut = async () => {
    const warn =
      sync.pending > 0
        ? `${sync.pending} change${sync.pending === 1 ? " hasn't" : "s haven't"} synced yet and will be lost. Sign out anyway?`
        : 'Sign out on this device?'
    if (!confirm(warn)) return
    await signOut()
    await db?.delete()
  }

  return (
    <Page title="Account">
      <Card className="p-4">
        <div className="min-w-0">
          <div className="truncate font-medium">@{account.username}</div>
          <div className="truncate text-sm text-ink-3">{localMode ? 'Local-only mode' : account.email}</div>
        </div>
        {!localMode && (
          <div className="mt-4 flex items-end gap-2">
            <TextInput
              className="flex-1"
              label="Username"
              hint="3–20 letters, numbers or _"
              value={username}
              autoCapitalize="none"
              onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))}
            />
            <Button disabled={username.trim() === account.username || !username.trim()} onClick={() => run(() => updateUsername(username.trim()))}>
              Save
            </Button>
          </div>
        )}
      </Card>

      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={cx('h-2.5 w-2.5 rounded-full', s.color)} />
            {s.text}
          </div>
          {!localMode && (
            <Button className="h-9 text-xs" onClick={sync.syncNow} disabled={sync.status === 'offline'}>
              Sync now
            </Button>
          )}
        </div>
        {sync.error && <p className="mt-2 text-xs text-red">{sync.error}</p>}
        <p className="mt-2 text-xs text-ink-3">
          Recordings save on this device first and sync whenever there's a connection. Everyone on your team shares the same data.
        </p>
      </Card>

      {account.org && !localMode && <TeamCard org={account.org} />}
      {account.org && localMode && (
        <Card className="mt-4 p-4 text-sm text-ink-2">
          Team <span className="tnum text-ink">{account.org.teamNumber}</span> {account.org.name}. Teams, members and sharing need Supabase.
        </Card>
      )}

      <AppearanceCard />

      {error && <p className="mt-3 text-sm text-red">{error}</p>}

      <Button variant="danger" className="mt-6 w-full" onClick={() => run(doSignOut)}>
        {localMode ? 'Reset this device' : 'Sign out'}
      </Button>
    </Page>
  )
}
