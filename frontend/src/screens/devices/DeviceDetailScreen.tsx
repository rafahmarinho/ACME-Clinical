import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BatteryCharging, Link2, Plus, Power, Unlink, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useProfile } from '../../auth/AuthProvider'
import { AckDialog, AlarmRow } from '../../components/alarms/alarmUi'
import { ConnectionIndicator, SENSOR_LABELS } from '../../components/monitoring/vitals'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, KeyValue, PageLoader, Select, Skeleton, Textarea } from '../../components/ui/primitives'
import { useToast } from '../../components/ui/Toast'
import { can } from '../../config/permissions'
import { ApiError, errorMessage } from '../../lib/api'
import { fmtDate, fmtDateTime, timeAgo } from '../../lib/format'
import { devicesService, maintenanceService, type MaintenanceInput } from '../../services/devices'
import type { Alarm, DeviceDetail, MaintenanceRecord } from '../../types'
import { BatteryBar, DeviceStatusBadge, WORK_KINDS, WORK_STATUS } from './deviceUi'

export default function DeviceDetailScreen() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [ackAlarm, setAckAlarm] = useState<Alarm | null>(null)
  const [confirm, setConfirm] = useState<null | 'unassign' | 'maintenance' | 'battery'>(null)
  const [assigning, setAssigning] = useState(false)
  const [newWork, setNewWork] = useState(false)
  const { data: d, isLoading, isError, error, refetch } = useQuery({ queryKey: ['device', id], queryFn: () => devicesService.get(id), refetchInterval: 20_000 })

  const onDone = (title: string, description?: string) => (next: DeviceDetail) => {
    queryClient.setQueryData(['device', id], next)
    for (const k of ['devices', 'overview', 'live', 'patients', 'patient', 'maintenance', 'alarms']) void queryClient.invalidateQueries({ queryKey: [k] })
    toast.success(title, description)
    setConfirm(null)
  }
  const unassign = useMutation({ mutationFn: () => devicesService.unassign(id), onSuccess: onDone('Monitor unassigned', 'Open alarms for this monitor were closed.'), onError: (e) => toast.error('Could not unassign', errorMessage(e)) })
  const maintenance = useMutation({
    mutationFn: (on: boolean) => devicesService.maintenanceMode(id, on),
    onSuccess: (next) => onDone(next.status === 'maintenance' ? 'Monitor taken out of service' : 'Monitor returned to service')(next),
    onError: (e) => toast.error('Could not change service status', errorMessage(e)),
  })
  const battery = useMutation({ mutationFn: () => devicesService.replaceBattery(id), onSuccess: onDone('Battery replaced', 'A completed work order was logged.'), onError: (e) => toast.error('Could not log the battery swap', errorMessage(e)) })

  if (isLoading) return <PageLoader label="Loading device…" />
  if (isError || !d) return <ErrorState message={error instanceof ApiError && error.status === 404 ? 'This device does not exist.' : errorMessage(error)} onRetry={() => void refetch()} />

  const manage = can.manageDevices(profile.role)
  return (
    <div className="space-y-6">
      <div>
        <Link to="/devices" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:underline">
          <ArrowLeft className="size-4" /> Devices
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[26px] leading-tight font-bold">{d.serial}</h1>
              <DeviceStatusBadge status={d.status} />
              {d.service_overdue && <Badge tone="warn">Service overdue</Badge>}
            </div>
            <div className="mt-1 text-sm text-muted">
              {d.model} · Asset {d.asset_tag} · Firmware {d.firmware}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can.replaceBattery(profile.role) && d.status !== 'maintenance' && (
              <Button variant="secondary" icon={<BatteryCharging className="size-4" />} onClick={() => setConfirm('battery')}>
                Replace battery
              </Button>
            )}
            {manage && (
              <Button variant={d.status === 'maintenance' ? 'success' : 'secondary'} icon={<Power className="size-4" />} onClick={() => (d.status === 'maintenance' ? maintenance.mutate(false) : setConfirm('maintenance'))} loading={maintenance.isPending}>
                {d.status === 'maintenance' ? 'Return to service' : 'Take out of service'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Live status" subtitle={d.last_seen_at ? `Last data ${timeAgo(d.last_seen_at)}` : 'No data yet'} />
          <dl className="grid grid-cols-2 gap-5 p-5">
            <KeyValue label="Connection">
              <ConnectionIndicator monitor={d} />
            </KeyValue>
            <KeyValue label="Sensors">{d.sensor_status === 'ok' ? 'OK' : <Badge tone="warn">{SENSOR_LABELS[d.sensor_status]}</Badge>}</KeyValue>
            <KeyValue label="Battery">
              <BatteryBar pct={d.battery_pct} />
            </KeyValue>
            <KeyValue label="Signal quality">
              <span className="num">{d.signal_quality}%</span>
            </KeyValue>
            <KeyValue label="Last service">{fmtDate(d.last_service_at)}</KeyValue>
            <KeyValue label="Next service">{fmtDate(d.next_service_due)}</KeyValue>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Bed assignment"
            actions={
              can.assignMonitors(profile.role) &&
              d.status !== 'maintenance' &&
              (d.bed ? (
                <Button variant="secondary" size="sm" icon={<Unlink className="size-4" />} onClick={() => setConfirm('unassign')}>
                  Unassign
                </Button>
              ) : (
                <Button size="sm" icon={<Link2 className="size-4" />} onClick={() => setAssigning(true)}>
                  Assign to bed
                </Button>
              ))
            }
          />
          <div className="p-5">
            {d.bed ? (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-soft p-4">
                <span className="rounded-lg bg-navy-900 px-2.5 py-1 text-lg font-bold whitespace-nowrap text-white">{d.bed.display}</span>
                <div>
                  <div className="font-semibold">{d.patient?.name ?? 'Patient'}</div>
                  <div className="text-[13px] text-muted">{d.bed.ward_name}</div>
                </div>
                {d.patient?.id && (
                  <Link to={`/patients/${d.patient.id}`} className="ml-auto text-sm font-semibold text-navy-600 hover:underline">
                    Open patient
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">{d.status === 'maintenance' ? 'Out of service. Return it to service before assigning it to a bed.' : 'Not assigned. It is docked and charging.'}</p>
            )}
            <h3 className="label mt-6 mb-2">Assignment history</h3>
            {d.assignments.length === 0 ? (
              <p className="text-sm text-muted">No assignments yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {d.assignments.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <span className="font-semibold">{a.bed?.display ?? 'Bed removed'}</span>
                      {a.patient?.name && <span className="text-muted"> · {a.patient.name}</span>}
                    </span>
                    <span className="text-[12.5px] text-muted">
                      {fmtDateTime(a.assigned_at)} → {a.unassigned_at ? fmtDateTime(a.unassigned_at) : 'now'}
                      {a.assigned_by_user && ` · by ${a.assigned_by_user.full_name}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Maintenance and work orders"
          icon={<Wrench className="size-4" />}
          actions={
            manage && (
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setNewWork(true)}>
                New work order
              </Button>
            )
          }
        />
        {d.maintenance.length === 0 ? (
          <EmptyState title="No maintenance records" />
        ) : (
          <div className="divide-y divide-line">
            {d.maintenance.map((r) => (
              <WorkOrderRow key={r.id} record={r} editable={manage} deviceId={id} />
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Recent technical alarms" />
        {d.recent_alarms.length === 0 ? (
          <EmptyState title="No technical alarms" />
        ) : (
          <div className="divide-y divide-line">
            {d.recent_alarms.map((a) => (
              <AlarmRow key={a.id} alarm={a} onAcknowledge={setAckAlarm} />
            ))}
          </div>
        )}
      </Card>

      <AckDialog alarm={ackAlarm} onClose={() => setAckAlarm(null)} />
      <ConfirmDialog
        open={confirm === 'unassign'}
        onClose={() => setConfirm(null)}
        onConfirm={() => unassign.mutate()}
        loading={unassign.isPending}
        title={`Unassign ${d.serial}?`}
        description={`Monitoring of ${d.patient?.name ?? 'this patient'} in ${d.bed?.display} will stop and open alarms for this monitor will be closed.`}
        confirmLabel="Unassign"
        tone="danger"
      />
      <ConfirmDialog
        open={confirm === 'maintenance'}
        onClose={() => setConfirm(null)}
        onConfirm={() => maintenance.mutate(true)}
        loading={maintenance.isPending}
        title="Take this monitor out of service?"
        description={d.bed ? `It will be removed from ${d.bed.display} and monitoring of that patient will stop.` : 'It cannot be assigned to beds until it is returned to service.'}
        confirmLabel="Take out of service"
        tone="danger"
      />
      <ConfirmDialog
        open={confirm === 'battery'}
        onClose={() => setConfirm(null)}
        onConfirm={() => battery.mutate()}
        loading={battery.isPending}
        title="Log a battery replacement?"
        description={`The battery level of ${d.serial} is reset to 100% and a completed work order is recorded.`}
        confirmLabel="Battery replaced"
      />
      {assigning && <AssignBedModal device={d} onClose={() => setAssigning(false)} onAssigned={onDone('Monitor assigned', 'Readings appear from the next simulation minute.')} />}
      {newWork && <WorkOrderModal monitorId={id} onClose={() => setNewWork(false)} />}
    </div>
  )
}

function AssignBedModal({ device, onClose, onAssigned }: { device: DeviceDetail; onClose: () => void; onAssigned: (d: DeviceDetail) => void }) {
  const toast = useToast()
  const [bedId, setBedId] = useState('')
  const beds = useQuery({ queryKey: ['beds-available'], queryFn: devicesService.availableBeds })
  const assign = useMutation({
    mutationFn: () => devicesService.assign(device.id, bedId),
    onSuccess: (d) => {
      onAssigned(d)
      onClose()
    },
    onError: (e) => toast.error('Could not assign the monitor', errorMessage(e)),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign ${device.serial}`}
      description="Only beds with an admitted patient and no monitor are listed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!bedId} loading={assign.isPending} onClick={() => assign.mutate()}>
            Assign
          </Button>
        </>
      }
    >
      {beds.isLoading ? (
        <Skeleton className="h-20" />
      ) : beds.isError ? (
        <ErrorState compact message={errorMessage(beds.error)} onRetry={() => void beds.refetch()} />
      ) : !beds.data?.length ? (
        <EmptyState title="No beds need a monitor" description="Every admitted patient already has a monitor." />
      ) : (
        <Field label="Bed">
          <Select value={bedId} onChange={(e) => setBedId(e.target.value)}>
            <option value="">Choose a bed…</option>
            {beds.data.map((b) => (
              <option key={b.bed.id} value={b.bed.id}>
                {b.bed.display} — {b.patient.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Modal>
  )
}

function WorkOrderRow({ record, editable, deviceId }: { record: MaintenanceRecord; editable: boolean; deviceId: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [completing, setCompleting] = useState(false)
  const [resolution, setResolution] = useState('')
  const update = useMutation({
    mutationFn: (values: Partial<MaintenanceRecord>) => maintenanceService.update(record.id, values),
    onSuccess: () => {
      toast.success('Work order updated')
      setCompleting(false)
      void queryClient.invalidateQueries({ queryKey: ['device', deviceId] })
      void queryClient.invalidateQueries({ queryKey: ['maintenance'] })
    },
    onError: (e) => toast.error('Could not update the work order', errorMessage(e)),
  })
  const st = WORK_STATUS[record.status]
  const open = record.status === 'scheduled' || record.status === 'in_progress'
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{record.title}</span>
          <Badge tone={st.tone}>{st.label}</Badge>
          <Badge tone="neutral">{WORK_KINDS[record.kind]}</Badge>
          {record.overdue && <Badge tone="crit">Overdue</Badge>}
        </div>
        {record.details && <p className="mt-1 text-sm text-muted">{record.details}</p>}
        {record.resolution && <p className="mt-1 text-sm text-ink">Resolution: {record.resolution}</p>}
        <p className="mt-1 text-[12.5px] text-muted">
          {record.completed_at ? `Completed ${fmtDateTime(record.completed_at)}` : `Scheduled ${fmtDate(record.scheduled_for)}`}
          {record.technician && ` · ${record.technician.full_name}`}
        </p>
      </div>
      {editable && open && (
        <div className="flex gap-2">
          {record.status === 'scheduled' && (
            <Button size="sm" variant="secondary" loading={update.isPending && !completing} onClick={() => update.mutate({ status: 'in_progress' })}>
              Start
            </Button>
          )}
          <Button size="sm" variant="success" onClick={() => setCompleting(true)}>
            Complete
          </Button>
        </div>
      )}
      <Modal
        open={completing}
        onClose={() => setCompleting(false)}
        title="Complete work order"
        description={record.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleting(false)}>
              Cancel
            </Button>
            <Button variant="success" loading={update.isPending} disabled={resolution.trim().length < 3} onClick={() => update.mutate({ status: 'completed', resolution: resolution.trim() })}>
              Mark completed
            </Button>
          </>
        }
      >
        <Field label="Resolution" hint="What was done and the test result.">
          <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. Replaced SpO₂ cable, functional test passed" />
        </Field>
      </Modal>
    </div>
  )
}

export function WorkOrderModal({ monitorId, onClose, monitors }: { monitorId?: string; onClose: () => void; monitors?: { id: string; serial: string }[] }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<MaintenanceInput>({ monitor_id: monitorId ?? '', kind: 'inspection', title: '', details: '', scheduled_for: new Date().toISOString().slice(0, 10), status: 'scheduled' })
  const create = useMutation({
    mutationFn: () => maintenanceService.create({ ...form, details: form.details?.trim() || null }),
    onSuccess: () => {
      toast.success('Work order created')
      void queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      void queryClient.invalidateQueries({ queryKey: ['device'] })
      onClose()
    },
    onError: (e) => toast.error('Could not create the work order', errorMessage(e)),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="New work order"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={!form.monitor_id || form.title.trim().length < 3} onClick={() => create.mutate()}>
            Create work order
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {monitors && (
          <Field label="Monitor">
            <Select value={form.monitor_id} onChange={(e) => setForm({ ...form, monitor_id: e.target.value })}>
              <option value="">Choose a monitor…</option>
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.serial}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as MaintenanceInput['kind'] })}>
              {Object.entries(WORK_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scheduled for">
            <Input type="date" value={form.scheduled_for ?? ''} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} />
          </Field>
        </div>
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Replace worn SpO₂ cable" maxLength={200} />
        </Field>
        <Field label="Details">
          <Textarea value={form.details ?? ''} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Symptoms, who reported it, parts needed…" />
        </Field>
      </div>
    </Modal>
  )
}
