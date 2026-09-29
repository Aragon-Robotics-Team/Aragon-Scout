import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isLocalMode, supabase } from '../lib/supabase'
import { readJson, removeKey, writeJson } from '../lib/storage'

export interface Account {
  userId: string
  email: string
  teamNumber: number
  teamName: string
  isPublic: boolean
}

interface AuthValue {
  account: Account | null
  loading: boolean
  localMode: boolean
  signIn(email: string, password: string): Promise<void>
  /** Resolves `true` when the user must confirm their email before signing in. */
  signUp(email: string, password: string, teamNumber: number, teamName: string): Promise<boolean>
  signOut(): Promise<void>
  updateProfile(patch: { teamName?: string; isPublic?: boolean }): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

// Cached so the app still knows who's signed in while offline.
const ACCOUNT_KEY = 'as.account'

async function loadAccount(session: Session): Promise<Account> {
  const cached = readJson<Account>(ACCOUNT_KEY)
  const meta = session.user.user_metadata as { team_number?: number | string; team_name?: string }
  const fallback: Account =
    cached && cached.userId === session.user.id
      ? cached
      : {
          userId: session.user.id,
          email: session.user.email ?? '',
          teamNumber: Number(meta.team_number ?? 0),
          teamName: meta.team_name ?? '',
          isPublic: false,
        }
  if (!supabase || !navigator.onLine) return fallback
  const { data, error } = await supabase
    .from('profiles')
    .select('team_number, team_name, is_public')
    .eq('id', session.user.id)
    .maybeSingle()
  if (error || !data) return fallback
  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    teamNumber: data.team_number,
    teamName: data.team_name,
    isPublic: data.is_public,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccountState] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)

  const setAccount = useCallback((a: Account | null) => {
    setAccountState(a)
    if (a) writeJson(ACCOUNT_KEY, a)
    else removeKey(ACCOUNT_KEY)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setAccountState(readJson<Account>(ACCOUNT_KEY))
      setLoading(false)
      return
    }
    let cancelled = false
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      if (data.session) {
        setAccount(await loadAccount(data.session))
      } else if (!navigator.onLine) {
        // Token couldn't be refreshed offline — keep working with the cached account.
        setAccountState(readJson<Account>(ACCOUNT_KEY))
      }
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setAccount(null)
      else if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        void loadAccount(session).then((a) => !cancelled && setAccount(a))
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
        setAccount(await loadAccount(data.session))
      },
      async signUp(email, password, teamNumber, teamName) {
        if (!supabase) {
          setAccount({ userId: 'local', email, teamNumber, teamName, isPublic: false })
          return false
        }
        const { data: available, error: checkError } = await supabase.rpc('team_number_available', {
          n: teamNumber,
        })
        if (checkError) throw new Error(checkError.message)
        if (!available) throw new Error(`Team ${teamNumber} already has an account. Sign in instead.`)
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { team_number: teamNumber, team_name: teamName },
            emailRedirectTo: window.location.origin,
          },
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
      async updateProfile(patch) {
        if (!account) return
        const next = {
          ...account,
          teamName: patch.teamName ?? account.teamName,
          isPublic: patch.isPublic ?? account.isPublic,
        }
        if (supabase) {
          const { error } = await supabase
            .from('profiles')
            .update({ team_name: next.teamName, is_public: next.isPublic })
            .eq('id', account.userId)
          if (error) throw new Error(error.message)
        }
        setAccount(next)
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
