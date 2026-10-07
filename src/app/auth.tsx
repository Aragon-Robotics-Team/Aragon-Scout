import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isLocalMode, supabase } from '../lib/supabase'
import { readJson, removeKey, writeJson } from '../lib/storage'
import { isDeviceOnly, saveTheme, type ThemeSettings } from '../lib/theme'

export type Role = 'owner' | 'admin' | 'member'

/** The FTC team a person belongs to. */
export interface Org {
  id: string
  teamNumber: number
  name: string
  isPublic: boolean
  role: Role
}

export interface Account {
  userId: string
  email: string
  username: string
  /** Appearance saved to the account, applied on every device that doesn't override it. */
  theme: ThemeSettings | null
  /** Null until the person creates or joins a team. */
  org: Org | null
}

interface AuthValue {
  account: Account | null
  loading: boolean
  localMode: boolean
  signIn(email: string, password: string): Promise<void>
  /**
   * Resolves `true` when the user must confirm their email before signing in.
   * Local-only mode has no server, so it takes the team there too.
   */
  signUp(email: string, password: string, username: string, localTeam?: { number: number; name: string }): Promise<boolean>
  signOut(): Promise<void>
  /** Re-reads the profile and team after a change made through the server. */
  refresh(): Promise<void>
  updateUsername(username: string): Promise<void>
  saveAccountTheme(theme: ThemeSettings): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

// Cached so the app still knows who's signed in while offline.
const ACCOUNT_KEY = 'as.account'

/** Accounts cached before individual logins have no username; they're signed out. */
function cachedAccount(): Account | null {
  const a = readJson<Account>(ACCOUNT_KEY)
  return a && typeof a.username === 'string' && 'org' in a ? a : null
}

async function loadAccount(session: Session): Promise<Account | null> {
  const cached = cachedAccount()
  const fallback = cached && cached.userId === session.user.id ? cached : null
  if (!supabase || !navigator.onLine) return fallback
  const [profile, membership] = await Promise.all([
    supabase.from('profiles').select('username, theme').eq('id', session.user.id).maybeSingle(),
    supabase
      .from('memberships')
      .select('role, organizations(id, team_number, name, is_public)')
      .eq('user_id', session.user.id)
      .maybeSingle(),
  ])
  if (profile.error || membership.error) return fallback
  // No profile means the login predates individual accounts (or was deleted).
  if (!profile.data) return null
  const o = membership.data?.organizations as unknown as { id: string; team_number: number; name: string; is_public: boolean } | null
  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    username: profile.data.username,
    theme: (profile.data.theme as ThemeSettings | null) ?? null,
    org: o && membership.data ? { id: o.id, teamNumber: o.team_number, name: o.name, isPublic: o.is_public, role: membership.data.role as Role } : null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccountState] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)

  const setAccount = useCallback((a: Account | null) => {
    setAccountState(a)
    if (a) writeJson(ACCOUNT_KEY, a)
    else removeKey(ACCOUNT_KEY)
    // The account's theme follows the person, unless this device keeps its own.
    if (a?.theme && !isDeviceOnly()) saveTheme(a.theme)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setAccountState(cachedAccount())
      setLoading(false)
      return
    }
    let cancelled = false
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      if (data.session) {
        const a = await loadAccount(data.session)
        if (!a) await supabase!.auth.signOut()
        setAccount(a)
      } else if (!navigator.onLine) {
        // Token couldn't be refreshed offline — keep working with the cached account.
        setAccountState(cachedAccount())
      }
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setAccount(null)
      else if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        void loadAccount(session).then((a) => !cancelled && a && setAccount(a))
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [setAccount])

  const value = useMemo<AuthValue>(
    () => ({
      account,
      loading,
      localMode: isLocalMode,
      async signIn(email, password) {
        if (!supabase) throw new Error('Accounts are not configured.')
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message)
        const a = await loadAccount(data.session)
        if (!a) {
          await supabase.auth.signOut()
          throw new Error('This login is from the old shared team accounts, which were retired. Create your own account below.')
        }
        setAccount(a)
      },
      async signUp(email, password, username, localTeam) {
        if (!supabase) {
          const org: Org | null = localTeam ? { id: 'local', teamNumber: localTeam.number, name: localTeam.name, isPublic: false, role: 'owner' } : null
          setAccount({ userId: 'local', email, username, theme: null, org })
          return false
        }
        const { data: available, error: checkError } = await supabase.rpc('username_available', { name: username })
        if (checkError) throw new Error(checkError.message)
        if (!available) throw new Error(`@${username} is taken, or isn't 3–20 letters, numbers or _.`)
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username }, emailRedirectTo: window.location.origin },
        })
        if (error) throw new Error(error.message)
        if (data.session) {
          setAccount(await loadAccount(data.session))
          return false
        }
        return true
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut()
        setAccount(null)
      },
      async refresh() {
        if (!supabase) return
        const { data } = await supabase.auth.getSession()
        if (data.session) setAccount(await loadAccount(data.session))
      },
      async updateUsername(username) {
        if (!account) return
        if (supabase) {
          const { error } = await supabase.from('profiles').update({ username }).eq('id', account.userId)
          if (error) throw new Error(error.code === '23505' ? `@${username} is taken.` : error.code === '23514' ? 'Use 3–20 letters, numbers or _.' : error.message)
        }
        setAccount({ ...account, username })
      },
      async saveAccountTheme(theme) {
        if (!account) return
        if (supabase && account.userId !== 'local') {
          const { error } = await supabase.from('profiles').update({ theme }).eq('id', account.userId)
          if (error) throw new Error(error.message)
        }
        setAccount({ ...account, theme })
      },
    }),
    [account, loading, setAccount],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
