import { useCallback, useEffect, useState } from 'react'
import { useAuth, type Org } from '../app/auth'
import {
  cancelInvite,
  deleteOrganization,
  inviteMember,
  joinCode,
  leaveOrganization,
  listMembers,
  listSentInvites,
  newJoinCode,
  removeMember,
  setMemberRole,
  transferOwnership,
  updateOrganization,
  type Invite,
  type Member,
} from '../lib/orgs'
import { ToggleButton } from './ReportForms'
import { Button, Card, NumberInput, TextInput, cx } from './ui'

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const

async function fetchTeam(orgId: string, manager: boolean) {
  const [members, invites, code] = await Promise.all([listMembers(orgId), manager ? listSentInvites(orgId) : [], manager ? joinCode() : null])
  return { members, invites, code }
}

/** Team settings, members, invites and the join code. What you can change depends on your role. */
export function TeamCard({ org }: { org: Org }) {
  const { account, refresh } = useAuth()
  const manager = org.role === 'owner' || org.role === 'admin'
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [name, setName] = useState(org.name)
  const [target, setTarget] = useState('')
  const [confirmNumber, setConfirmNumber] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const apply = (d: Awaited<ReturnType<typeof fetchTeam>>) => {
    setMembers(d.members)
    setInvites(d.invites)
    setCode(d.code)
  }
  const load = useCallback(async () => apply(await fetchTeam(org.id, manager)), [org.id, manager])

  useEffect(() => {
    let cancelled = false
    fetchTeam(org.id, manager)
      .then((d) => !cancelled && apply(d))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [org.id, manager])

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      await refresh()
      await load()
      if (done) setNotice(done)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const shareUrl = `${window.location.origin}/t/${org.teamNumber}`

  return (
    <>
      <Card className="mt-4 p-4">
        <div className="flex items-center gap-3">
          <div className="tnum flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-semibold">
            {org.teamNumber}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{org.name || `Team ${org.teamNumber}`}</div>
            <div className="text-sm text-ink-3">You're {org.role === 'owner' ? 'the owner' : `${org.role === 'admin' ? 'an admin' : 'a member'}`}</div>
          </div>
        </div>
        {manager && (
          <div className="mt-4 flex items-end gap-2">
            <TextInput className="flex-1" label="Team name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button disabled={busy || name.trim() === org.name} onClick={() => run(() => updateOrganization({ name: name.trim() }), 'Saved.')}>
              Save
            </Button>
          </div>
        )}
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="font-medium">Members</h2>
        <ul className="mt-2 divide-y divide-line">
          {members.map((m) => (
            <MemberRow key={m.userId} member={m} me={account!.userId} myRole={org.role} busy={busy} run={run} />
          ))}
        </ul>

        {manager && (
          <>
            <div className="mt-4 flex items-end gap-2">
              <TextInput
                className="flex-1"
                label="Invite by username or email"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="@alex or alex@example.com"
                autoCapitalize="none"
              />
              <Button
                variant="primary"
                disabled={busy || target.trim().length < 3}
                onClick={() => run(async () => {
                  await inviteMember(target)
                  setTarget('')
                }, 'Invite sent. They’ll see it after signing in.')}
              >
                Invite
              </Button>
            </div>
            {invites.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-ink-2">
                    <span className="truncate">Invited {i.target}</span>
                    <Button variant="ghost" className="h-8 text-xs" disabled={busy} onClick={() => run(() => cancelInvite(i.id))}>
                      Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
              <div>
                <div className="text-xs text-ink-3">Join code (joins as a member)</div>
                <div className="tnum text-lg font-semibold tracking-[0.2em]">{code ?? '········'}</div>
              </div>
              <Button
                className="h-9 text-xs"
                disabled={busy}
                onClick={() => {
                  if (confirm('Make a new code? The current one will stop working.')) void run(async () => setCode(await newJoinCode()))
                }}
              >
                New code
              </Button>
            </div>
          </>
        )}
      </Card>

      {manager && (
        <Card className="mt-4 p-4">
          <h2 className="font-medium">Public sharing</h2>
          <p className="mt-1 text-sm text-ink-2">Anyone with the link can view your matches and analysis. Only your team can ever add or edit data.</p>
          <ToggleButton
            tone="neutral"
            className="mt-3 w-full"
            label={org.isPublic ? 'Shared publicly' : 'Private'}
            on={org.isPublic}
            onChange={(v) => void run(() => updateOrganization({ isPublic: v }))}
          />
          {org.isPublic && (
            <code className="mt-3 block truncate rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2 select-all">{shareUrl}</code>
          )}
        </Card>
      )}

      <Card className="mt-4 p-4">
        {org.role === 'owner' ? (
          <>
            <h2 className="font-medium text-red">Delete team</h2>
            <p className="mt-1 text-sm text-ink-2">
              Deletes every tournament and recording for everyone on the team. To leave instead, make another member an admin and hand them
              ownership.
            </p>
            <div className="mt-3 flex items-end gap-2">
              <NumberInput label="Type your team number" value={confirmNumber} onChange={setConfirmNumber} className="flex-1" />
              <Button
                variant="danger"
                disabled={busy || confirmNumber !== org.teamNumber}
                onClick={() => run(() => deleteOrganization(org.teamNumber))}
              >
                Delete
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-medium">Leave team</h2>
            <p className="mt-1 text-sm text-ink-2">Your recordings stay with the team.</p>
            <Button
              variant="danger"
              className="mt-3 w-full"
              disabled={busy}
              onClick={() => {
                if (confirm(`Leave team ${org.teamNumber}?`)) void run(leaveOrganization)
              }}
            >
              Leave team
            </Button>
          </>
        )}
      </Card>
      {(error || notice) && <p className={cx('mt-3 text-sm', error ? 'text-red' : 'text-ink-2')}>{error ?? notice}</p>}
    </>
  )
}

function MemberRow({
  member: m,
  me,
  myRole,
  busy,
  run,
}: {
  member: Member
  me: string
  myRole: Org['role']
  busy: boolean
  run(fn: () => Promise<unknown>, done?: string): Promise<void>
}) {
  const isMe = m.userId === me
  // Owners manage everyone; admins manage members.
  const canManage = !isMe && m.role !== 'owner' && (myRole === 'owner' || (myRole === 'admin' && m.role === 'member'))
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span className="min-w-0 truncate text-sm">
        @{m.username}
        {isMe && <span className="text-ink-3"> (you)</span>}
        <span className="ml-2 text-xs text-ink-3">{ROLE_LABEL[m.role]}</span>
      </span>
      {canManage && (
        <span className="flex shrink-0 gap-1">
          {m.role === 'member' ? (
            <Button variant="ghost" className="h-8 px-2 text-xs" disabled={busy} onClick={() => run(() => setMemberRole(m.userId, 'admin'))}>
              Make admin
            </Button>
          ) : (
            <>
              {myRole === 'owner' && (
                <Button
                  variant="ghost"
                  className="h-8 px-2 text-xs"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Make @${m.username} the owner? You'll become an admin.`)) void run(() => transferOwnership(m.userId))
                  }}
                >
                  Make owner
                </Button>
              )}
              <Button variant="ghost" className="h-8 px-2 text-xs" disabled={busy} onClick={() => run(() => setMemberRole(m.userId, 'member'))}>
                Make member
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="h-8 px-2 text-xs text-red"
            disabled={busy}
            onClick={() => {
              if (confirm(`Remove @${m.username} from the team? Their recordings stay.`)) void run(() => removeMember(m.userId))
            }}
          >
            Remove
          </Button>
        </span>
      )}
    </li>
  )
}
