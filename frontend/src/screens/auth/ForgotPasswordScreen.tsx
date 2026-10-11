import { ArrowLeft, MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button, Field, InlineAlert, Input } from '../../components/ui/primitives'
import { supabase } from '../../lib/supabase'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (err) setError(err.message)
    else setSent(true)
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a secure link to choose a new password.">
      {sent ? (
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-ok-line bg-ok-soft p-4">
            <MailCheck className="mt-0.5 size-5 text-ok" />
            <div className="text-sm text-[#05603a]">
              <div className="font-semibold">Check your inbox</div>
              If an account exists for <strong>{email}</strong>, a reset link is on its way. The link expires in one hour.
            </div>
          </div>
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-navy-600 hover:underline">
            <ArrowLeft className="size-4" /> Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <InlineAlert tone="crit">{error}</InlineAlert>}
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@hospital.org" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Send reset link
          </Button>
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-navy-600 hover:underline">
            <ArrowLeft className="size-4" /> Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  )
}
