import { useState } from 'react'
import { useAuth } from '../app/auth'
import { useData } from '../app/data'
import { syncLabel } from '../components/Layout'
import { ToggleButton } from '../components/ReportForms'
import { Button, Card, Page, TextInput, cx } from '../components/ui'

export function AccountPage() {
  const { account, signOut, updateProfile, localMode } = useAuth()
  const { sync, db } = useData()
  const [teamName, setTeamName] = useState(account?.teamName ?? '')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  if (!account) return null
  const s = syncLabel(sync.status, sync.pending)
  const shareUrl = `${window.location.origin}/t/${account.teamNumber}`

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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked — the link is visible to copy by hand
    }
  }

  return (
    <Page title="Account">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="tnum flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-semibold">
            {account.teamNumber}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{account.teamName || `Team ${account.teamNumber}`}</div>
            <div className="truncate text-sm text-ink-3">{localMode ? 'Local-only mode' : account.email}</div>
          </div>
        </div>
        <div className="mt-4 flex items-end gap-2">
          <TextInput className="flex-1" label="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          <Button disabled={teamName.trim() === account.teamName} onClick={() => run(() => updateProfile({ teamName: teamName.trim() }))}>
            Save
          </Button>
        </div>
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
          Recordings save on this device first and sync whenever there's a connection. Every device signed in to this account shares the same data.
        </p>
      </Card>

      {!localMode && (
        <Card className="mt-4 p-4">
          <h2 className="font-medium">Public sharing</h2>
          <p className="mt-1 text-sm text-ink-2">
            Anyone with the link can view your matches and analysis. Only your team's signed-in scouts can ever add or edit data.
          </p>
          <ToggleButton
            className="mt-3 w-full"
            label={account.isPublic ? 'Shared publicly' : 'Private'}
            on={account.isPublic}
            onChange={(v) => run(() => updateProfile({ isPublic: v }))}
          />
          {account.isPublic && (
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">{shareUrl}</code>
              <Button className="h-9 text-xs" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {error && <p className="mt-3 text-sm text-red">{error}</p>}

      <Button variant="danger" className="mt-6 w-full" onClick={() => run(doSignOut)}>
        {localMode ? 'Reset this device' : 'Sign out'}
      </Button>
    </Page>
  )
}
