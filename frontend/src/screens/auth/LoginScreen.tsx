import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Field, InlineAlert, Input } from '../../components/ui/primitives'
import { ROLE_LABELS } from '../../lib/format'
import type { Role } from '../../types'
import { AuthLayout } from './AuthLayout'

const DEMO_ACCOUNTS: { email: string; name: string; role: Role }[] = [
  { email: 'nurse@acme-clinical.test', name: 'Olivia Bennett', role: 'nurse' },
  { email: 'physician@acme-clinical.test', name: 'Dr. Marcus Hale', role: 'physician' },
  { email: 'biomed@acme-clinical.test', name: 'Priya Raman', role: 'biomed' },
  { email: 'admin@acme-clinical.test', name: 'Daniel Okafor', role: 'admin' },
]
const SHOW_DEMO = (import.meta.env.VITE_SHOW_DEMO_ACCOUNTS ?? 'true') !== 'false'

export function LoginScreen() {
  const { session, profile, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session && profile) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use your hospital account to access the ward.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <InlineAlert tone="crit">{error}</InlineAlert>}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@hospital.org" />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-3 -translate-y-1/2 text-faint hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-navy-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading} icon={<LogIn className="size-4" />}>
          Sign in
        </Button>
      </form>

      {SHOW_DEMO && (
        <div className="mt-10">
          <div className="label mb-3">Demo accounts</div>
          <div className="grid gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email)
                  setError(null)
                  document.getElementById('password')?.focus()
                }}
                className="flex items-center justify-between rounded-lg border border-line px-3.5 py-2.5 text-left transition hover:border-navy-200 hover:bg-soft"
              >
                <span>
                  <span className="block text-sm font-semibold text-ink">{a.name}</span>
                  <span className="block text-[12.5px] text-muted">{a.email}</span>
                </span>
                <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11.5px] font-semibold text-navy-700">{ROLE_LABELS[a.role]}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-muted">The demo password is set by DEMO_PASSWORD when the database is seeded (see README).</p>
        </div>
      )}
    </AuthLayout>
  )
}
