import { CheckCircle2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Field, InlineAlert, Input } from '../../components/ui/primitives'
import { supabase } from '../../lib/supabase'
import { AuthLayout } from './AuthLayout'

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number.'
  return null
}

export function ResetPasswordScreen() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setWaited(true), 2500)
    return () => window.clearTimeout(id)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('The passwords do not match.')
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) return setError(err.message)
    setDone(true)
  }

  if (done) {
    return (
      <AuthLayout title="Password updated">
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-ok-line bg-ok-soft p-4 text-sm text-[#05603a]">
            <CheckCircle2 className="mt-0.5 size-5 text-ok" />
            Your new password is active. Use it the next time you sign in.
          </div>
          <Button size="lg" className="w-full" onClick={() => (window.location.href = '/')}>
            Continue to ACME Clinical
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Pick a password you haven't used before.">
      {!session && waited ? (
        <div className="space-y-4">
          <InlineAlert tone="warn" title="This reset link is invalid or has expired">
            Request a new link to reset your password.
          </InlineAlert>
          <Button variant="secondary" onClick={() => navigate('/forgot-password')}>
            Request a new link
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <InlineAlert tone="crit">{error}</InlineAlert>}
          <Field label="New password" htmlFor="new-password" hint="At least 8 characters, with letters and numbers.">
            <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password">
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!session}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
