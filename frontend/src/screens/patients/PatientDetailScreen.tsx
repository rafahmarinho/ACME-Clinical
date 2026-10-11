import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, ArrowLeft, BedDouble, Link2, Pencil, Plus, RotateCcw, Save, ShieldAlert, Stethoscope, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useProfile } from '../../auth/AuthProvider'
import { AckDialog, AlarmRow } from '../../components/alarms/alarmUi'
import { TrendChart } from '../../components/monitoring/TrendChart'
import { alarmFor, BatteryIndicator, ConnectionIndicator, SENSOR_LABELS, VitalValue } from '../../components/monitoring/vitals'
import { Modal } from '../../components/ui/Modal'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  KeyValue,
  PageLoader,
  Segmented,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from '../../components/ui/primitives'
import { useToast } from '../../components/ui/Toast'
import { can } from '../../config/permissions'
import { ApiError, errorMessage } from '../../lib/api'
import { cx, fmtDate, fmtDateTime, PARAM_META, timeAgo } from '../../lib/format'
import { devicesService } from '../../services/devices'
import { patientsService } from '../../services/patients'
import type { Alarm, Note, Parameter, PatientDetail, Threshold } from '../../types'

const NOTE_LABELS: Record<Note['category'], string> = {
  general: 'General',
  assessment: 'Assessment',
  medication: 'Medication',
  handoff: 'Handoff',
  alarm: 'Alarm response',
}

export default function PatientDetailScreen() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const [ackAlarm, setAckAlarm] = useState<Alarm | null>(null)
  const [tab, setTab] = useState<'notes' | 'alarms' | 'thresholds'>('notes')
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const { data: p, isLoading, isError, error, refetch } = useQuery({ queryKey: ['patient', id], queryFn: () => patientsService.get(id), refetchInterval: 20_000 })

  if (isLoading) return <PageLoader label="Loading patient…" />
  if (isError || !p) {
    const notFound = error instanceof ApiError && error.status === 404
    return <ErrorState message={notFound ? 'This patient does not exist or has been discharged.' : errorMessage(error)} onRetry={notFound ? undefined : () => void refetch()} />
  }
  const m = p.monitor

  return (
    <div className="space-y-6">
      <div>
        <Link to="/patients" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:underline">
          <ArrowLeft className="size-4" /> Patients
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={p.name} size={56} />
            <div>
              <h1 className="text-[26px] leading-tight font-bold tracking-tight">{p.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="rounded-md bg-navy-900 px-1.5 py-0.5 text-[12px] font-bold whitespace-nowrap text-white">{p.bed?.display}</span>
                <span>{p.mrn}</span>·<span>{p.age} years · {p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : 'Other'}</span>·<span>Admitted {fmtDate(p.admitted_at)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={p.acuity >= 4 ? 'crit' : p.acuity === 3 ? 'warn' : 'ok'}>Acuity {p.acuity}</Badge>
                <Badge tone={p.code_status === 'Full code' ? 'neutral' : 'violet'}>{p.code_status}</Badge>
                {p.isolation && (
                  <Badge tone="warn">
                    <ShieldAlert className="size-3" /> {p.isolation} precautions
                  </Badge>
                )}
                {p.allergies.length ? <Badge tone="crit">Allergies: {p.allergies.join(', ')}</Badge> : <Badge tone="ok">No known allergies</Badge>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {can.editPatient(profile.role) && (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {m && (
              <Link to={`/monitoring/${m.id}`}>
                <Button icon={<Activity className="size-4" />}>Live monitor</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader
            title="Current vital signs"
            subtitle={m ? `${m.serial} · updated ${timeAgo(m.vitals.ts ?? null, undefined)}` : 'No monitor assigned'}
            icon={<Activity className="size-4" />}
            actions={
              m ? (
                <div className="flex items-center gap-3">
                  <ConnectionIndicator monitor={m} />
                  <BatteryIndicator pct={m.battery_pct} />
                </div>
              ) : undefined
            }
          />
          {!m ? (
            <EmptyState
              icon={<BedDouble className="size-6" />}
              title="Not on continuous monitoring"
              description="Assign an available bedside monitor to start receiving vital signs for this patient."
              action={
                can.assignMonitors(profile.role) && (
                  <Button icon={<Link2 className="size-4" />} onClick={() => setAssigning(true)}>
                    Assign monitor
                  </Button>
                )
              }
            />
          ) : m.connection === 'lost' ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <WifiOff className="size-9 text-crit" />
              <div className="font-semibold">Monitor offline</div>
              <div className="text-sm text-muted">Last data {timeAgo(m.last_seen_at)}. Check the device at the bedside.</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4">
              <VitalValue parameter="hr" value={m.vitals.hr} alarm={alarmFor(p.open_alarms, 'hr')} size="lg" threshold={p.thresholds.find((t) => t.parameter === 'hr')} unavailable={m.sensor_status === 'ecg_leads_off' ? SENSOR_LABELS.ecg_leads_off : undefined} />
              <VitalValue parameter="spo2" value={m.vitals.spo2} alarm={alarmFor(p.open_alarms, 'spo2')} size="lg" threshold={p.thresholds.find((t) => t.parameter === 'spo2')} unavailable={m.sensor_status === 'spo2_probe_off' ? SENSOR_LABELS.spo2_probe_off : undefined} />
              <VitalValue parameter="rr" value={m.vitals.rr} alarm={alarmFor(p.open_alarms, 'rr')} size="lg" threshold={p.thresholds.find((t) => t.parameter === 'rr')} />
              <VitalValue parameter="bp" value={m.vitals.sys} secondary={m.vitals.dia} alarm={alarmFor(p.open_alarms, 'sys') ?? alarmFor(p.open_alarms, 'dia')} size="lg" />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Care team" icon={<Stethoscope className="size-4" />} />
          <dl className="grid grid-cols-2 gap-5 p-5">
            <KeyValue label="Diagnosis">{p.diagnosis}</KeyValue>
            <KeyValue label="Ward">{p.bed?.ward_name}</KeyValue>
            <KeyValue label="Attending physician">{p.attending?.full_name ?? '—'}</KeyValue>
            <KeyValue label="Primary nurse">{p.primary_nurse?.full_name ?? '—'}</KeyValue>
            <KeyValue label="Date of birth">{fmtDate(p.date_of_birth)}</KeyValue>
            <KeyValue label="Baseline">
              <span className="num">
                HR {p.baseline.hr} · SpO₂ {p.baseline.spo2}% · BP {p.baseline.sys}/{p.baseline.dia}
              </span>
            </KeyValue>
          </dl>
        </Card>
      </div>

      {p.open_alarms.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Open alarms" subtitle="Acknowledged alarms stay open until the condition resolves." />
          <div className="divide-y divide-line">
            {p.open_alarms.map((a) => (
              <AlarmRow key={a.id} alarm={a} onAcknowledge={setAckAlarm} showPatient={false} />
            ))}
          </div>
        </Card>
      )}

      <Trends patient={p} />

      <Card>
        <div className="px-5 pt-3">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'notes', label: 'Clinical notes' },
              { value: 'alarms', label: 'Alarm history' },
              { value: 'thresholds', label: 'Alarm limits' },
            ]}
          />
        </div>
        {tab === 'notes' && <NotesPanel patientId={p.id} />}
        {tab === 'alarms' && <AlarmHistory patientId={p.id} onAcknowledge={setAckAlarm} />}
        {tab === 'thresholds' && <ThresholdsPanel patient={p} />}
      </Card>

      <AckDialog alarm={ackAlarm} onClose={() => setAckAlarm(null)} />
      {editing && <EditPatientModal patient={p} onClose={() => setEditing(false)} />}
      {assigning && <AssignMonitorModal patient={p} onClose={() => setAssigning(false)} />}
    </div>
  )
}

function Trends({ patient }: { patient: PatientDetail }) {
  const [hours, setHours] = useState(2)
  const [params, setParams] = useState<Parameter[]>(['hr', 'spo2'])
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['readings', patient.id, hours],
    queryFn: () => patientsService.readings(patient.id, hours),
    enabled: !!patient.monitor || hours > 0,
  })
  const toggle = (p: Parameter) => setParams((cur) => (cur.includes(p) ? (cur.length > 1 ? cur.filter((x) => x !== p) : cur) : [...cur, p]))
  return (
    <Card>
      <CardHeader
        title="Trends"
        subtitle="Simulated readings, one per minute"
        actions={
          <Segmented
            value={hours}
            onChange={setHours}
            items={[
              { value: 1, label: '1 h' },
              { value: 2, label: '2 h' },
              { value: 6, label: '6 h' },
              { value: 24, label: '24 h' },
            ]}
          />
        }
      />
      <div className="flex flex-wrap gap-2 px-5 pt-4">
        {(['hr', 'spo2', 'rr', 'sys', 'dia'] as Parameter[]).map((k) => (
          <button
            key={k}
            onClick={() => toggle(k)}
            className={cx('rounded-full border px-3 py-1 text-[12.5px] font-semibold transition', params.includes(k) ? 'border-transparent text-white' : 'border-line text-muted hover:text-ink')}
            style={params.includes(k) ? { background: PARAM_META[k].color } : undefined}
          >
            {PARAM_META[k].short}
            {data?.stats[k] && <span className="num ml-1.5 opacity-80">{data.stats[k]!.min}–{data.stats[k]!.max}</span>}
          </button>
        ))}
      </div>
      <div className="p-4">
        {isError ? (
          <ErrorState compact message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <Skeleton className="h-[260px]" />
        ) : !data?.points.length ? (
          <EmptyState title="No readings in this period" description="Readings appear once a monitor is assigned and the simulation advances." />
        ) : (
          <TrendChart points={data.points} parameters={params} thresholds={patient.thresholds} height={260} />
        )}
      </div>
    </Card>
  )
}

function NotesPanel({ patientId }: { patientId: string }) {
  const profile = useProfile()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<Note['category']>('general')
  const [body, setBody] = useState('')
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['notes', patientId], queryFn: () => patientsService.notes(patientId) })
  const add = useMutation({
    mutationFn: () => patientsService.addNote(patientId, category, body.trim()),
    onSuccess: () => {
      setBody('')
      toast.success('Note added')
      void queryClient.invalidateQueries({ queryKey: ['notes', patientId] })
    },
    onError: (e) => toast.error('Could not save the note', errorMessage(e)),
  })
  return (
    <div className="grid gap-6 p-5 lg:grid-cols-[360px_1fr]">
      {can.writeNotes(profile.role) && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim().length >= 2) add.mutate()
          }}
        >
          <Field label="Note type">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Note['category'])}>
              {Object.entries(NOTE_LABELS)
                .filter(([k]) => k !== 'alarm')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Note">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={5} placeholder="Observations, interventions, handoff details…" />
          </Field>
          <Button type="submit" icon={<Plus className="size-4" />} loading={add.isPending} disabled={body.trim().length < 2}>
            Add note
          </Button>
        </form>
      )}
      <div className="min-w-0">
        {isError ? (
          <ErrorState compact message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : !data?.length ? (
          <EmptyState title="No notes yet" description="Notes written by the care team appear here." />
        ) : (
          <ol className="space-y-3">
            {data.map((n) => (
              <li key={n.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar name={n.author?.full_name ?? '?'} url={n.author?.avatar_url} size={28} />
                  <span className="text-sm font-semibold">{n.author?.full_name ?? 'Unknown'}</span>
                  <Badge tone={n.category === 'alarm' ? 'crit' : 'navy'}>{NOTE_LABELS[n.category]}</Badge>
                  <span className="ml-auto text-[12px] text-muted">{fmtDateTime(n.created_at)}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-ink">{n.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function AlarmHistory({ patientId, onAcknowledge }: { patientId: string; onAcknowledge: (a: Alarm) => void }) {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['alarms', 'patient', patientId], queryFn: () => patientsService.alarms(patientId) })
  if (isError) return <ErrorState compact message={errorMessage(error)} onRetry={() => void refetch()} />
  if (isLoading) return <div className="space-y-3 p-5">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
  if (!data?.length) return <EmptyState title="No alarms recorded" />
  return (
    <div className="divide-y divide-line">
      {data.map((a) => (
        <AlarmRow key={a.id} alarm={a} onAcknowledge={onAcknowledge} showPatient={false} />
      ))}
    </div>
  )
}

const LIMIT_KEYS = ['crit_low', 'warn_low', 'warn_high', 'crit_high'] as const

function ThresholdsPanel({ patient }: { patient: PatientDetail }) {
  const profile = useProfile()
  const toast = useToast()
  const queryClient = useQueryClient()
  const editable = can.editPatientThresholds(profile.role)
  const [rows, setRows] = useState<Threshold[]>(patient.thresholds)
  const [edited, setEdited] = useState(false)
  const source = JSON.stringify(patient.thresholds)
  // Background refreshes must not overwrite limits the user is still editing.
  useEffect(() => {
    if (!edited) setRows(JSON.parse(source))
  }, [source, edited])
  const dirty = edited && JSON.stringify(rows) !== source

  const done = (title: string) => {
    toast.success(title)
    void queryClient.invalidateQueries({ queryKey: ['patient', patient.id] })
    void queryClient.invalidateQueries({ queryKey: ['thresholds'] })
  }
  const save = useMutation({
    mutationFn: () => {
      const changed = rows.filter((r, i) => JSON.stringify(r) !== JSON.stringify(patient.thresholds[i]))
      return patientsService.saveThresholds(patient.id, changed)
    },
    onSuccess: () => {
      setEdited(false)
      done('Alarm limits saved for this patient')
    },
    onError: (e) => toast.error('Could not save alarm limits', errorMessage(e)),
  })
  const reset = useMutation({
    mutationFn: (param: string) => patientsService.resetThreshold(patient.id, param),
    onSuccess: () => done('Ward default restored'),
    onError: (e) => toast.error('Could not restore the default', errorMessage(e)),
  })
  const update = (i: number, key: (typeof LIMIT_KEYS)[number] | 'enabled', value: string | boolean) => {
    setEdited(true)
    setRows((all) => all.map((r, j) => (j === i ? { ...r, [key]: typeof value === 'boolean' ? value : value === '' ? null : Number(value) } : r)))
  }

  return (
    <div className="p-5">
      <p className="mb-4 text-sm text-muted">
        Values outside the warning range raise a warning; values beyond the critical limits raise a critical alarm. Patient-specific limits override the ward defaults.
        {!editable && ' Only physicians and administrators can change them.'}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2.5">Parameter</th>
              <th className="px-3 py-2.5">Critical low</th>
              <th className="px-3 py-2.5">Warning low</th>
              <th className="px-3 py-2.5">Warning high</th>
              <th className="px-3 py-2.5">Critical high</th>
              <th className="px-3 py-2.5">Enabled</th>
              <th className="px-3 py-2.5">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((t, i) => (
              <tr key={t.parameter}>
                <td className="px-3 py-2.5 font-semibold">
                  <span style={{ color: PARAM_META[t.parameter].color }}>{PARAM_META[t.parameter].short}</span>{' '}
                  <span className="font-normal text-muted">{PARAM_META[t.parameter].unit}</span>
                </td>
                {LIMIT_KEYS.map((k) => (
                  <td key={k} className="px-3 py-2">
                    <Input type="number" className="num h-9 w-24" value={t[k] ?? ''} disabled={!editable} onChange={(e) => update(i, k, e.target.value)} aria-label={`${t.parameter} ${k}`} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <input type="checkbox" className="size-4 accent-navy-900" checked={t.enabled} disabled={!editable} onChange={(e) => update(i, 'enabled', e.target.checked)} aria-label={`${t.parameter} enabled`} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={t.source === 'patient' ? 'info' : 'neutral'}>{t.source === 'patient' ? 'Patient' : 'Ward default'}</Badge>
                    {editable && t.source === 'patient' && (
                      <button className="text-faint hover:text-ink" title="Restore ward default" onClick={() => reset.mutate(t.parameter)}>
                        <RotateCcw className="size-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="mt-4 flex gap-2">
          <Button icon={<Save className="size-4" />} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            Save patient limits
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setEdited(false)}>
              Discard changes
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function EditPatientModal({ patient, onClose }: { patient: PatientDetail; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    diagnosis: patient.diagnosis,
    acuity: patient.acuity,
    code_status: patient.code_status,
    isolation: patient.isolation ?? '',
    allergies: patient.allergies.join(', '),
  })
  const save = useMutation({
    mutationFn: () =>
      patientsService.update(patient.id, {
        diagnosis: form.diagnosis.trim(),
        acuity: form.acuity,
        code_status: form.code_status,
        isolation: form.isolation.trim() || null,
        allergies: form.allergies.split(',').map((a) => a.trim()).filter(Boolean),
      }),
    onSuccess: (p) => {
      queryClient.setQueryData(['patient', patient.id], p)
      void queryClient.invalidateQueries({ queryKey: ['patients'] })
      toast.success('Patient record updated')
      onClose()
    },
    onError: (e) => toast.error('Could not update the patient', errorMessage(e)),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit patient"
      description={`${patient.name} · ${patient.mrn}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()} disabled={form.diagnosis.trim().length < 2}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Diagnosis">
          <Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Acuity">
            <Select value={form.acuity} onChange={(e) => setForm({ ...form, acuity: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Code status">
            <Select value={form.code_status} onChange={(e) => setForm({ ...form, code_status: e.target.value })}>
              {['Full code', 'DNR', 'DNR / DNI', 'Comfort care'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Isolation precautions" hint="Leave empty if none">
          <Select value={form.isolation} onChange={(e) => setForm({ ...form, isolation: e.target.value })}>
            {['', 'Contact', 'Droplet', 'Airborne'].map((c) => (
              <option key={c} value={c}>
                {c || 'None'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Allergies" hint="Separate with commas">
          <Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

function AssignMonitorModal({ patient, onClose }: { patient: PatientDetail; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [monitorId, setMonitorId] = useState('')
  const devices = useQuery({ queryKey: ['devices', { status: 'available' }], queryFn: () => devicesService.list({ status: 'available' }) })
  const assign = useMutation({
    mutationFn: () => devicesService.assign(monitorId, patient.bed!.id),
    onSuccess: (d) => {
      toast.success(`${d.serial} assigned to ${patient.bed?.display}`, 'Readings appear from the next simulation minute.')
      for (const k of ['patient', 'patients', 'overview', 'live', 'devices']) void queryClient.invalidateQueries({ queryKey: [k] })
      onClose()
    },
    onError: (e) => toast.error('Could not assign the monitor', errorMessage(e)),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Assign a monitor"
      description={`${patient.name} · bed ${patient.bed?.display}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!monitorId} loading={assign.isPending} onClick={() => assign.mutate()}>
            Assign
          </Button>
        </>
      }
    >
      {devices.isLoading ? (
        <Skeleton className="h-24" />
      ) : devices.isError ? (
        <ErrorState compact message={errorMessage(devices.error)} onRetry={() => void devices.refetch()} />
      ) : !devices.data?.length ? (
        <EmptyState title="No spare monitors" description="Every monitor is in use or in maintenance. Ask biomedical engineering for a replacement." />
      ) : (
        <div className="space-y-2">
          {devices.data.map((d) => (
            <label key={d.id} className={cx('flex cursor-pointer items-center justify-between rounded-lg border p-3', monitorId === d.id ? 'border-navy-500 bg-navy-50' : 'border-line hover:bg-soft')}>
              <span className="flex items-center gap-3">
                <input type="radio" name="monitor" className="accent-navy-900" checked={monitorId === d.id} onChange={() => setMonitorId(d.id)} />
                <span>
                  <span className="block text-sm font-semibold">{d.serial}</span>
                  <span className="block text-[12.5px] text-muted">
                    {d.model} · FW {d.firmware} · {d.asset_tag}
                  </span>
                </span>
              </span>
              <BatteryIndicator pct={d.battery_pct} docked />
            </label>
          ))}
        </div>
      )}
    </Modal>
  )
}
