import { useEffect, useState } from 'react'
import { useAuth } from '../app/auth'
import { Wordmark } from '../components/Layout'
import { Button, Card, NumberInput, TextInput } from '../components/ui'
import { acceptInvite, createOrganization, declineInvite, joinWithCode, listMyInvites, type Invite } from '../lib/orgs'

/** After signing up: accept an invite, join with a code, or create the team. */
export function TeamSetupPage() {
  const { account, refresh, signOut } = useAuth()
  const [invites, setInvites] = useState<Invite[] | null>(null)
  const [code, setCode] = useState('')
  const [teamNumber, setTeamNumber] = useState<number | null>(null)
  const [teamName, setTeamName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listMyInvites(account!.userId)
      .then((list) => !cancelled && setInvites(list))
      .catch(() => !cancelled && setInvites([]))
    return () => {
      cancelled = true
    }
  }, [account])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-sm px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-2xl">
          <Wordmark />
        </div>
        <p className="mt-2 text-sm text-ink-2">
          Signed in as <span className="text-ink">@{account!.username}</span>. Join your team to start scouting.
        </p>
      </div>

      {invites && invites.length > 0 && (
        <Card className="mb-4 p-4">
          <h2 className="font-medium">Invites</h2>
          <ul className="mt-2 space-y-2">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">
                  <span className="tnum font-medium">{i.team?.number}</span> {i.team?.name}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button variant="ghost" className="h-9 text-xs" disabled={busy} onClick={() => run(async () => {
                    await declineInvite(i.id)
                    setInvites((l) => l?.filter((x) => x.id !== i.id) ?? null)
                  })}>
                    Decline
                  </Button>
                  <Button variant="primary" className="h-9 text-xs" disabled={busy} onClick={() => run(() => acceptInvite(i.id))}>
                    Accept
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-4 p-4">
        <h2 className="font-medium">Join with a code</h2>
        <p className="mb-3 mt-1 text-sm text-ink-2">Ask your team's owner or an admin for the code.</p>
        <div className="flex gap-2">
          <TextInput label="Join code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" className="flex-1" />
          <Button className="self-end" disabled={busy || code.trim().length < 4} onClick={() => run(() => joinWithCode(code))}>
            Join
          </Button>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="font-medium">Create your team</h2>
        <p className="mb-3 mt-1 text-sm text-ink-2">If your team isn't on Aragon Scout yet. You'll be its owner.</p>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <NumberInput label="Team #" value={teamNumber} onChange={setTeamNumber} />
          <TextInput label="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
        </div>
        <Button
          variant="primary"
          className="mt-3 w-full"
          disabled={busy || teamNumber == null || teamNumber <= 0}
          onClick={() => run(() => createOrganization(teamNumber!, teamName.trim()))}
        >
          Create team
        </Button>
      </Card>

      {error && <p className="mb-3 text-sm text-red">{error}</p>}
      <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
        Sign out
      </Button>
    </main>
  )
}
