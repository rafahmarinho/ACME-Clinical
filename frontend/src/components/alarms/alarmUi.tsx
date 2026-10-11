import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellOff, BellRing, CheckCircle2, Cpu, HeartPulse, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useProfile } from '../../auth/AuthProvider'
import { can } from '../../config/permissions'
import { errorMessage } from '../../lib/api'
import { ALARM_TYPE_LABELS, cx, fmtDateTime, fmtDuration, fmtTime } from '../../lib/format'
import { alarmsService } from '../../services/clinical'
import type { Alarm, AlarmState, Severity } from '../../types'
import { Modal } from '../ui/Modal'
import { Badge, Button, InlineAlert, Textarea } from '../ui/primitives'
import { useToast } from '../ui/Toast'

export function SeverityBadge({ severity }: { severity: Severity }) {
  const map = { critical: ['crit', 'Critical'], warning: ['warn', 'Warning'], advisory: ['info', 'Advisory'] } as const
  return (
    <Badge tone={map[severity][0]} dot>
      {map[severity][1]}
    </Badge>
  )
}

export function StateBadge({ state }: { state: AlarmState }) {
  if (state === 'active')
    return (
      <Badge tone="crit">
        <BellRing className="size-3" /> Active
      </Badge>
    )
  if (state === 'acknowledged')
    return (
      <Badge tone="warn">
        <BellOff className="size-3" /> Acknowledged · still active
      </Badge>
    )
  return (
    <Badge tone="ok">
      <CheckCircle2 className="size-3" /> Resolved
    </Badge>
  )
}

export function AlarmIcon({ alarm }: { alarm: Alarm }) {
  const Icon = alarm.category === 'technical' ? Cpu : HeartPulse
  const tone = !alarm.condition_active ? 'bg-ok-soft text-ok' : alarm.severity === 'critical' ? 'bg-crit-soft text-crit' : 'bg-warn-soft text-warn'
  return (
    <div className={cx('flex size-10 shrink-0 items-center justify-center rounded-lg', tone, alarm.state === 'active' && alarm.severity === 'critical' && 'animate-pulse-crit')}>
      <Icon className="size-5" />
    </div>
  )
}

export function useAcknowledge() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => alarmsService.acknowledge(id, note),
    onSuccess: (alarm) => {
      toast.success(
        'Alarm acknowledged',
        alarm.condition_active ? 'The alarm stays open until the condition is no longer present.' : 'The condition had already resolved.',
      )
      for (const key of ['alarms', 'alarm-summary', 'overview', 'live', 'patient', 'patients', 'notes', 'device', 'devices'])
        void queryClient.invalidateQueries({ queryKey: [key] })
    },
    onError: (err) => toast.error('Could not acknowledge the alarm', errorMessage(err)),
  })
}

export function AckDialog({ alarm, onClose }: { alarm: Alarm | null; onClose: () => void }) {
  const [note, setNote] = useState('')
  const ack = useAcknowledge()
  const submit = () => {
    if (!alarm) return
    ack.mutate({ id: alarm.id, note: note.trim() || undefined }, { onSuccess: () => { setNote(''); onClose() } })
  }
  return (
    <Modal
      open={alarm !== null}
      onClose={onClose}
      title="Acknowledge alarm"
      description={alarm ? `${ALARM_TYPE_LABELS[alarm.type] ?? alarm.type} · ${alarm.bed?.display ?? ''}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={ack.isPending} icon={<BellOff className="size-4" />}>
            Acknowledge
          </Button>
        </>
      }
    >
      {alarm && (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-soft p-3.5">
            <div className="flex items-center gap-2">
              <SeverityBadge severity={alarm.severity} />
              <span className="text-[13px] text-muted">since {fmtTime(alarm.started_at)}</span>
            </div>
            <p className="mt-2 text-[15px] font-semibold text-ink">{alarm.message}</p>
            {alarm.patient?.name && <p className="mt-0.5 text-[13px] text-muted">{alarm.patient.name}</p>}
          </div>
          {alarm.condition_active && (
            <InlineAlert tone="info" title="Acknowledging does not clear the alarm">
              It records that you are responding. The alarm stays open, and visible to the team, until the monitor reports that the condition has stopped.
            </InlineAlert>
          )}
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold" htmlFor="ack-note">
              Note <span className="font-normal text-muted">(optional — added to the patient record)</span>
            </label>
            <Textarea id="ack-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Repositioned probe, O₂ increased to 3 L/min" />
          </div>
        </div>
      )}
    </Modal>
  )
}

export function AlarmRow({ alarm, onAcknowledge, showPatient = true, nowIso }: { alarm: Alarm; onAcknowledge: (a: Alarm) => void; showPatient?: boolean; nowIso?: string }) {
  const profile = useProfile()
  const canAck = can.acknowledge(profile.role, alarm.category) && !alarm.acknowledged_at
  return (
    <div className={cx('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center', alarm.state === 'active' && alarm.severity === 'critical' && 'bg-crit-soft/40')}>
      <AlarmIcon alarm={alarm} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-ink">{ALARM_TYPE_LABELS[alarm.type] ?? alarm.type}</span>
          <SeverityBadge severity={alarm.severity} />
          <StateBadge state={alarm.state} />
          {alarm.escalated_at && (
            <Badge tone="violet">
              <ShieldAlert className="size-3" /> Escalated
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-ink">{alarm.message}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
          {alarm.bed && <span className="font-semibold text-navy-700">{alarm.bed.display}</span>}
          {showPatient && alarm.patient?.id && (
            <Link to={`/patients/${alarm.patient.id}`} className="hover:text-ink hover:underline">
              {alarm.patient.name}
            </Link>
          )}
          {alarm.monitor && <span>{alarm.monitor.serial}</span>}
          <span>Started {fmtDateTime(alarm.started_at)}</span>
          {alarm.condition_active ? (
            <span>Open for {fmtDuration(alarm.started_at, nowIso ?? alarm.last_seen_at)}</span>
          ) : (
            alarm.resolved_at && <span>Resolved {fmtTime(alarm.resolved_at)} · {alarm.resolution}</span>
          )}
        </div>
        {alarm.acknowledged_at && (
          <div className="mt-1.5 text-[12.5px] text-muted">
            Acknowledged by <span className="font-semibold text-ink">{alarm.acknowledged_by_user?.full_name ?? 'staff'}</span> at {fmtTime(alarm.acknowledged_at)}
            {alarm.ack_note && <span className="italic"> — “{alarm.ack_note}”</span>}
          </div>
        )}
      </div>
      {canAck && (
        <Button size="sm" variant={alarm.severity === 'critical' ? 'danger' : 'primary'} onClick={() => onAcknowledge(alarm)} icon={<BellOff className="size-3.5" />}>
          Acknowledge
        </Button>
      )}
    </div>
  )
}
