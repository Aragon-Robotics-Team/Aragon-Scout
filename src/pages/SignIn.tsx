import { useState, type FormEvent } from 'react'
import { useAuth } from '../app/auth'
import { Wordmark } from '../components/Layout'
import { Button, NumberInput, Segmented, TextInput } from '../components/ui'

export function SignInPage() {
  const { signIn, signUp, localMode } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>(localMode ? 'up' : 'in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teamNumber, setTeamNumber] = useState<number | null>(null)
  const [teamName, setTeamName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)
  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'in') await signIn(email.trim(), password)
      else {
        if (teamNumber == null || teamNumber <= 0) throw new Error('Enter your team number.')
        const needsConfirm = await signUp(email.trim(), password, teamNumber, teamName.trim())
        if (needsConfirm) setConfirmSent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="text-2xl">
          <Wordmark />
        </div>
        <p className="mt-2 text-sm text-ink-2">One account per team. Every scout signs in with it.</p>
      </div>

      {confirmSent ? (
        <div className="rounded-2xl border border-line bg-surface p-5 text-center text-sm">
          <p className="font-medium">Check your email</p>
          <p className="mt-1 text-ink-2">
            We sent a confirmation link to {email}. Open it, then sign in here.
          </p>
          <Button className="mt-4" onClick={() => { setConfirmSent(false); setMode('in') }}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!localMode && (
            <Segmented
              className="w-full [&>button]:flex-1"
              value={mode}
              onChange={(m) => { setMode(m); setError(null) }}
              options={[
                { value: 'in', label: 'Sign in' },
                { value: 'up', label: 'Create team account' },
              ]}
            />
          )}
          {localMode && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-ink-2">
              Local-only mode: Supabase isn't configured, so data stays on this device and doesn't sync.
            </p>
          )}
          {mode === 'up' && (
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <NumberInput label="Team #" value={teamNumber} onChange={setTeamNumber} />
              <TextInput label="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            </div>
          )}
          {!localMode && (
            <>
              <TextInput label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <TextInput
                label="Password"
                type="password"
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          )}
          {error && <p className="text-sm text-red">{error}</p>}
          {offline && !localMode && <p className="text-sm text-ink-3">You're offline. Sign in once with a connection; after that the app works offline.</p>}
          <Button type="submit" variant="primary" className="h-12 w-full" disabled={busy || (offline && !localMode)}>
            {busy ? 'Please wait…' : localMode ? 'Start' : mode === 'in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
      )}
    </main>
  )
}
