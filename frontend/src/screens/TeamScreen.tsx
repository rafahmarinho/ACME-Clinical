import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Pencil, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useProfile } from '../auth/AuthProvider'
import { Modal } from '../components/ui/Modal'
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, InlineAlert, Input, PageHeader, SearchInput, Select, SkeletonRows, Toggle } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { errorMessage } from '../lib/api'
import { fmtDateTime, ROLE_LABELS } from '../lib/format'
import { teamService } from '../services/admin'
import type { Profile, Role } from '../types'

const ROLE_TONE: Record<Role, 'info' | 'violet' | 'warn' | 'navy'> = { nurse: 'info', physician: 'violet', biomed: 'warn', admin: 'navy' }

export default function TeamScreen() {
  const me = useProfile()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['team'], queryFn: teamService.list })
  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (m) =>
          (!q || `${m.full_name} ${m.email} ${m.title ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!role || m.role === role) &&
          (!status || (status === 'active' ? m.is_active : !m.is_active)),
      ),
    [data, q, role, status],
  )

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Manage who can access ACME Clinical and what they can do."
        actions={
          <Button icon={<UserPlus className="size-4" />} onClick={() => setInviting(true)}>
            Add team member
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <Card key={r} className="flex items-center justify-between p-4">
            <span className="text-sm font-semibold text-muted">{ROLE_LABELS[r]}s</span>
            <span className="num text-2xl font-bold">{(data ?? []).filter((m) => m.role === r && m.is_active).length}</span>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, email or title" className="min-w-[240px] flex-1" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-auto" aria-label="Role">
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Status">
            <option value="">Active and inactive</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </Select>
        </div>
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <SkeletonRows />
        ) : !rows.length ? (
          <EmptyState icon={<Users className="size-6" />} title="No team members found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3">Member</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Title</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Last sign-in</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((m) => (
                  <tr key={m.id} className={m.is_active ? '' : 'opacity-60'}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.full_name} url={m.avatar_url} size={36} />
                        <div>
                          <div className="font-semibold">
                            {m.full_name} {m.id === me.id && <span className="text-[12px] font-normal text-muted">(you)</span>}
                          </div>
                          <div className="text-[12.5px] text-muted">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABELS[m.role]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-muted">{m.title ?? '—'}</td>
                    <td className="px-3 py-3">{m.is_active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="neutral">Deactivated</Badge>}</td>
                    <td className="px-3 py-3 text-muted">{m.last_sign_in_at ? fmtDateTime(m.last_sign_in_at) : 'Never'}</td>
                    <td className="px-3 py-3 text-right">
                      <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(m)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {editing && <EditMemberModal member={editing} isSelf={editing.id === me.id} onClose={() => setEditing(null)} />}
    </div>
  )
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ email: '', full_name: '', role: 'nurse' as Role, title: '' })
  const [result, setResult] = useState<{ member: Profile; temporary_password: string } | null>(null)
  const invite = useMutation({
    mutationFn: () => teamService.invite({ ...form, email: form.email.trim(), full_name: form.full_name.trim(), title: form.title.trim() || null }),
    onSuccess: (r) => {
      setResult(r)
      void queryClient.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e) => toast.error('Could not add the team member', errorMessage(e)),
  })
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) && form.full_name.trim().length >= 2

  if (result) {
    return (
      <Modal open onClose={onClose} title="Team member added" footer={<Button onClick={onClose}>Done</Button>}>
        <div className="space-y-4">
          <InlineAlert tone="ok" title={`${result.member.full_name} can now sign in`}>
            A welcome email was sent through the simulated email gateway. Share the temporary password securely. It is shown only once.
          </InlineAlert>
          <div className="flex items-center justify-between rounded-lg border border-line bg-soft px-4 py-3">
            <code className="num text-[15px] font-semibold">{result.temporary_password}</code>
            <Button
              size="sm"
              variant="secondary"
              icon={<Copy className="size-3.5" />}
              onClick={() => {
                void navigator.clipboard?.writeText(result.temporary_password)
                toast.info('Copied to clipboard')
              }}
            >
              Copy
            </Button>
          </div>
          <p className="text-[13px] text-muted">They can change it from their profile, or use “Forgot password?” on the sign-in page.</p>
        </div>
      </Modal>
    )
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Add team member"
      description="Creates an account with a temporary password."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} loading={invite.isPending} onClick={() => invite.mutate()}>
            Add member
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name">
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Maya Singh" />
        </Field>
        <Field label="Work email">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@hospital.org" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title (optional)">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. RN" />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function EditMemberModal({ member, isSelf, onClose }: { member: Profile; isSelf: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [role, setRole] = useState<Role>(member.role)
  const [title, setTitle] = useState(member.title ?? '')
  const [active, setActive] = useState(member.is_active)
  const save = useMutation({
    mutationFn: () => teamService.update(member.id, { role, title: title.trim() || null, is_active: active }),
    onSuccess: () => {
      toast.success('Team member updated')
      void queryClient.invalidateQueries({ queryKey: ['team'] })
      onClose()
    },
    onError: (e) => toast.error('Could not update the team member', errorMessage(e)),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${member.full_name}`}
      description={member.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {isSelf && <InlineAlert tone="info">You cannot change your own role or deactivate your own account.</InlineAlert>}
        <Field label="Role" hint="Controls navigation and permissions immediately.">
          <Select value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Toggle checked={active} disabled={isSelf} onChange={setActive} label="Account active" description="Deactivated members cannot sign in or use the API." />
      </div>
    </Modal>
  )
}
