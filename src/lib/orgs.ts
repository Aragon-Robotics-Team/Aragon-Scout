import type { Role } from '../app/auth'
import { supabase } from './supabase'

// Every change to teams, members and invites goes through server functions
// that check the caller's role (see supabase/schema.sql).

function client() {
  if (!supabase) throw new Error('Teams need a connection to the server.')
  return supabase
}

async function call<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!navigator.onLine) throw new Error("You're offline — this needs a connection.")
  const { data, error } = await client().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const createOrganization = (teamNumber: number, name: string) => call<string>('create_organization', { n: teamNumber, org_name: name })
export const joinWithCode = (code: string) => call<string>('join_with_code', { code })
export const acceptInvite = (id: string) => call<string>('accept_invite', { invite: id })
export const declineInvite = (id: string) => call('decline_invite', { invite: id })
/** `target` is a username (with or without @) or an email address. */
export const inviteMember = (target: string) => call('invite_member', { target })
export const cancelInvite = (id: string) => call('cancel_invite', { invite: id })
export const joinCode = () => call<string | null>('org_join_code')
export const newJoinCode = () => call<string>('new_join_code')
export const updateOrganization = (patch: { name?: string; isPublic?: boolean }) =>
  call('update_organization', { org_name: patch.name ?? null, public_sharing: patch.isPublic ?? null })
export const setMemberRole = (userId: string, role: 'admin' | 'member') => call('set_member_role', { person: userId, new_role: role })
export const removeMember = (userId: string) => call('remove_member', { person: userId })
export const transferOwnership = (userId: string) => call('transfer_ownership', { person: userId })
export const leaveOrganization = () => call('leave_organization')
export const deleteOrganization = (teamNumber: number) => call('delete_organization', { confirm_team_number: teamNumber })
export const teamNumberAvailable = (n: number) => call<boolean>('team_number_available', { n })

export interface Member {
  userId: string
  username: string
  role: Role
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const { data, error } = await client().from('memberships').select('user_id, role, joined_at').eq('org_id', orgId).order('joined_at')
  if (error) throw new Error(error.message)
  const ids = (data ?? []).map((m) => m.user_id)
  const { data: profiles, error: pErr } = await client().from('profiles').select('id, username').in('id', ids)
  if (pErr) throw new Error(pErr.message)
  const names = new Map((profiles ?? []).map((p) => [p.id, p.username as string]))
  const rank: Record<Role, number> = { owner: 0, admin: 1, member: 2 }
  return (data ?? [])
    .map((m) => ({ userId: m.user_id, username: names.get(m.user_id) ?? '?', role: m.role as Role }))
    .sort((a, b) => rank[a.role] - rank[b.role])
}

export interface Invite {
  id: string
  orgId: string
  /** Who was invited: a username or an email. */
  target: string
  /** For invites sent to me: the team that invited me. */
  team?: { number: number; name: string }
}

/** Invites the team has sent (owners and admins only). */
export async function listSentInvites(orgId: string): Promise<Invite[]> {
  const { data, error } = await client().from('invites').select('id, org_id, user_id, email').eq('org_id', orgId).order('created_at')
  if (error) throw new Error(error.message)
  const userIds = (data ?? []).flatMap((i) => (i.user_id ? [i.user_id] : []))
  const { data: profiles } = userIds.length ? await client().from('profiles').select('id, username').in('id', userIds) : { data: [] }
  const names = new Map((profiles ?? []).map((p) => [p.id, p.username as string]))
  return (data ?? []).map((i) => ({ id: i.id, orgId: i.org_id, target: i.user_id ? `@${names.get(i.user_id) ?? '?'}` : (i.email as string) }))
}

/** Invites waiting for me, by username or by my email. */
export async function listMyInvites(userId: string): Promise<Invite[]> {
  const { data, error } = await client().from('invites').select('id, org_id, user_id, email, organizations(team_number, name)').order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((i) => i.user_id === userId || i.email)
    .map((i) => {
      const o = i.organizations as unknown as { team_number: number; name: string } | null
      return { id: i.id, orgId: i.org_id, target: '', team: o ? { number: o.team_number, name: o.name } : undefined }
    })
}
