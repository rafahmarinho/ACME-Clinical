import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Save, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth, useProfile } from '../auth/AuthProvider'
import { Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Segmented, Select, Skeleton, Toggle } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { can } from '../config/permissions'
import { errorMessage } from '../lib/api'
import { profileService, settingsService } from '../services/admin'
import { overviewService } from '../services/clinical'
import type { Preferences, SystemSettings } from '../types'

export default function SettingsScreen() {
  const profile = useProfile()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" subtitle="Personal preferences apply to your account on every device." />
      <PersonalSettings key={profile.id} />
      {can.editSystemSettings(profile.role) && <SystemSettingsCard />}
    </div>
  )
}

function PersonalSettings() {
  const profile = useProfile()
  const { setProfile } = useAuth()
  const toast = useToast()
  const wards = useQuery({ queryKey: ['wards'], queryFn: overviewService.wards, staleTime: 300_000 })
  const save = useMutation({
    mutationFn: (prefs: Partial<Preferences>) => profileService.update({ preferences: prefs }),
    onSuccess: (p) => {
      setProfile(p)
      toast.success('Preference saved')
    },
    onError: (e) => toast.error('Could not save the preference', errorMessage(e)),
  })
  const p = profile.preferences
  return (
    <Card>
      <CardHeader title="Personal preferences" icon={<SlidersHorizontal className="size-4" />} />
      <div className="divide-y divide-line">
        <div className="p-5">
          <Toggle checked={p.alarm_sound} onChange={(v) => save.mutate({ alarm_sound: v })} label="Alarm sounds" description="Play a tone when a new alarm needs acknowledgement (critical: three fast beeps)." />
        </div>
        <div className="p-5">
          <Toggle checked={p.notify_critical} onChange={(v) => save.mutate({ notify_critical: v })} label="Highlight critical alarms" description="Pulse the alarm bell in the top bar while critical alarms are unacknowledged." />
        </div>
        <div className="p-5">
          <Toggle checked={p.show_waveforms} onChange={(v) => save.mutate({ show_waveforms: v })} label="Show waveforms" description="Draw live ECG and pleth waveforms on the live monitoring wall. Turn off on slow devices." />
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Default ward" hint="Opened first on the ward overview.">
            <Select value={p.default_ward ?? ''} onChange={(e) => save.mutate({ default_ward: e.target.value || null })}>
              <option value="">First ward</option>
              {wards.data?.map((w) => (
                <option key={w.id} value={w.code}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Temperature unit" hint="Used when temperature probes are connected.">
            <div>
              <Segmented
                value={p.temperature_unit}
                onChange={(v) => save.mutate({ temperature_unit: v })}
                items={[
                  { value: 'C', label: '°C' },
                  { value: 'F', label: '°F' },
                ]}
              />
            </div>
          </Field>
        </div>
      </div>
    </Card>
  )
}

function SystemSettingsCard() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['settings'], queryFn: settingsService.get })
  const [form, setForm] = useState<SystemSettings | null>(null)
  useEffect(() => {
    if (data) setForm(data)
  }, [data])
  const save = useMutation({
    mutationFn: () => settingsService.save(form!),
    onSuccess: (s) => {
      queryClient.setQueryData(['settings'], s)
      toast.success('System settings saved', 'The simulation uses them from the next minute.')
    },
    onError: (e) => toast.error('Could not save system settings', errorMessage(e)),
  })
  return (
    <Card>
      <CardHeader title="System settings" subtitle="Administrators only. Applies to every user." icon={<Building2 className="size-4" />} />
      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading || !form ? (
        <Skeleton className="m-5 h-48" />
      ) : (
        <form
          className="space-y-5 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Hospital name">
            <Input value={form.hospital_name} onChange={(e) => setForm({ ...form, hospital_name: e.target.value })} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Escalate unacknowledged critical alarms after" hint="Minutes before the attending physician is paged.">
              <Input type="number" min={1} max={60} value={form.escalation_minutes} onChange={(e) => setForm({ ...form, escalation_minutes: Number(e.target.value) })} />
            </Field>
            <Field label="EHR vitals sync interval" hint="Minutes between HL7 batches (0 disables).">
              <Input type="number" min={0} max={240} value={form.ehr_sync_minutes} onChange={(e) => setForm({ ...form, ehr_sync_minutes: Number(e.target.value) })} />
            </Field>
            <Field label="Low battery warning at (%)">
              <Input type="number" min={5} max={50} value={form.battery_low_pct} onChange={(e) => setForm({ ...form, battery_low_pct: Number(e.target.value) })} />
            </Field>
            <Field label="Critical battery at (%)">
              <Input type="number" min={1} max={30} value={form.battery_critical_pct} onChange={(e) => setForm({ ...form, battery_critical_pct: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="space-y-4 rounded-lg border border-line p-4">
            <div className="label">Simulated integrations</div>
            <Toggle checked={form.integrations.pager} onChange={(v) => setForm({ ...form, integrations: { ...form.integrations, pager: v } })} label="Pager gateway" description="Pages the primary nurse on critical alarms and the physician on escalation." />
            <Toggle checked={form.integrations.email} onChange={(v) => setForm({ ...form, integrations: { ...form.integrations, email: v } })} label="Email gateway" description="Welcome emails and shared reports." />
            <Toggle checked={form.integrations.ehr} onChange={(v) => setForm({ ...form, integrations: { ...form.integrations, ehr: v } })} label="EHR interface (HL7 v2)" description="Periodic ORU^R01 vitals batches." />
          </div>
          <Button type="submit" icon={<Save className="size-4" />} loading={save.isPending}>
            Save system settings
          </Button>
        </form>
      )}
    </Card>
  )
}
