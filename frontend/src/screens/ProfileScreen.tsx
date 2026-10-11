import { useMutation } from '@tanstack/react-query'
import { Camera, KeyRound, Save } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useAuth, useProfile } from '../auth/AuthProvider'
import { Avatar, Badge, Button, Card, CardHeader, Field, InlineAlert, Input, KeyValue, PageHeader } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { errorMessage } from '../lib/api'
import { fmtDate, ROLE_LABELS } from '../lib/format'
import { supabase } from '../lib/supabase'
import { profileService } from '../services/admin'
import { passwordProblem } from './auth/ResetPasswordScreen'

export default function ProfileScreen() {
  const profile = useProfile()
  const { setProfile } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ full_name: profile.full_name, title: profile.title ?? '', phone: profile.phone ?? '' })

  const save = useMutation({
    mutationFn: () => profileService.update({ full_name: form.full_name.trim(), title: form.title.trim() || null, phone: form.phone.trim() || null }),
    onSuccess: (p) => {
      setProfile(p)
      toast.success('Profile saved')
    },
    onError: (e) => toast.error('Could not save your profile', errorMessage(e)),
  })
  const upload = useMutation({
    mutationFn: profileService.uploadAvatar,
    onSuccess: (p) => {
      setProfile(p)
      toast.success('Profile photo updated')
    },
    onError: (e) => toast.error('Upload failed', errorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Profile" subtitle="Your personal details and sign-in security." />
      <Card>
        <div className="flex flex-wrap items-center gap-5 p-6">
          <div className="relative">
            <Avatar name={profile.full_name} url={profile.avatar_url} size={84} />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-2 border-white bg-navy-900 text-white shadow hover:bg-navy-700"
              aria-label="Change profile photo"
              disabled={upload.isPending}
            >
              <Camera className="size-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload.mutate(f)
                e.target.value = ''
              }}
            />
          </div>
          <div>
            <h2 className="text-xl font-bold">{profile.full_name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <Badge tone="navy">{ROLE_LABELS[profile.role]}</Badge>
              {profile.email} · member since {fmtDate(profile.created_at)}
            </div>
            {upload.isPending && <div className="mt-1 text-[12.5px] text-muted">Uploading photo…</div>}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" />
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate()
            }}
          >
            <Field label="Full name">
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} minLength={2} required />
            </Field>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. RN, Charge Nurse" />
            </Field>
            <Field label="Phone / pager">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +1 555 0100" />
            </Field>
            <dl className="grid grid-cols-2 gap-4 pt-2">
              <KeyValue label="Email">{profile.email}</KeyValue>
              <KeyValue label="Role">{ROLE_LABELS[profile.role]}</KeyValue>
            </dl>
            <Button type="submit" icon={<Save className="size-4" />} loading={save.isPending} disabled={form.full_name.trim().length < 2}>
              Save changes
            </Button>
          </form>
        </Card>
        <ChangePassword email={profile.email} />
      </div>
    </div>
  )
}

function ChangePassword({ email }: { email: string }) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const problem = passwordProblem(next)
    if (problem) return setError(problem)
    if (next !== confirm) return setError('The new passwords do not match.')
    setLoading(true)
    // Re-authenticate first so a stolen session cannot change the password.
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current })
    if (authError) {
      setLoading(false)
      return setError('Your current password is incorrect.')
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    setLoading(false)
    if (updateError) return setError(updateError.message)
    setCurrent('')
    setNext('')
    setConfirm('')
    toast.success('Password changed')
  }

  return (
    <Card>
      <CardHeader title="Change password" icon={<KeyRound className="size-4" />} />
      <form className="space-y-4 p-5" onSubmit={submit} noValidate>
        {error && <InlineAlert tone="crit">{error}</InlineAlert>}
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 8 characters, with letters and numbers.">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" loading={loading} disabled={!current || !next}>
          Update password
        </Button>
      </form>
    </Card>
  )
}
