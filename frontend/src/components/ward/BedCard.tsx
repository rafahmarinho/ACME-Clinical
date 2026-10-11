import { BedDouble, ShieldAlert, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import { cx } from '../../lib/format'
import type { OverviewBed } from '../../types'
import { BatteryIndicator, SENSOR_LABELS } from '../monitoring/vitals'

export function BedCard({ bed, linkPatients }: { bed: OverviewBed; linkPatients: boolean }) {
  const m = bed.monitor
  const offline = m?.connection === 'lost'
  const sev = bed.alarms.highest
  const unacked = bed.alarms.unacknowledged > 0
  const border = sev === 'critical' ? 'border-crit' : sev === 'warning' ? 'border-warn' : 'border-line'
  const target = linkPatients && bed.patient?.id ? `/patients/${bed.patient.id}` : m ? `/devices/${m.id}` : undefined

  const body = (
    <div
      className={cx(
        'card flex h-full flex-col border-2 p-4 transition',
        border,
        sev === 'critical' && unacked && 'animate-pulse-crit',
        target && 'hover:-translate-y-0.5 hover:shadow-(--shadow-pop)',
        !bed.occupied && 'border-dashed bg-soft shadow-none',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-navy-900 px-1.5 py-0.5 text-[12px] font-bold whitespace-nowrap text-white">{bed.label}</span>
            {bed.patient?.acuity && <span className="text-[11px] font-semibold text-muted">Acuity {bed.patient.acuity}</span>}
          </div>
          <div className="mt-2 truncate text-[15px] font-semibold text-ink">{bed.occupied ? bed.patient?.name : 'Available bed'}</div>
          {bed.patient?.diagnosis && <div className="truncate text-[12.5px] text-muted">{bed.patient.diagnosis}</div>}
        </div>
        {bed.patient?.isolation && (
          <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn" title={`${bed.patient.isolation} precautions`}>
            <ShieldAlert className="size-3" /> {bed.patient.isolation}
          </span>
        )}
      </div>

      {bed.occupied && m && !offline && (
        <div className="mt-3 grid grid-cols-3 gap-1">
          <Mini label="HR" value={m.vitals.hr} color="var(--color-hr)" alarm={bed.top_alarm?.message.startsWith('Heart')} />
          <Mini label="SpO₂" value={m.vitals.spo2} color="var(--color-spo2)" alarm={bed.top_alarm?.message.startsWith('SpO')} />
          <Mini label="RR" value={m.vitals.rr} color="var(--color-rr)" alarm={bed.top_alarm?.message.startsWith('Resp')} />
        </div>
      )}
      {bed.occupied && offline && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-crit-soft px-3 py-3 text-[13px] font-semibold text-crit">
          <WifiOff className="size-4" /> Monitor offline
        </div>
      )}
      {bed.occupied && !m && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-soft px-3 py-3 text-[13px] text-muted">
          <BedDouble className="size-4" /> Not on continuous monitoring
        </div>
      )}

      <div className="mt-auto pt-3">
        {bed.top_alarm ? (
          <div className={cx('truncate rounded-md px-2 py-1 text-[12px] font-semibold', bed.top_alarm.severity === 'critical' ? 'bg-crit text-white' : 'bg-warn-soft text-warn')}>
            {bed.top_alarm.acknowledged ? 'ACK · ' : ''}
            {bed.top_alarm.message}
            {bed.alarms.count > 1 && ` (+${bed.alarms.count - 1})`}
          </div>
        ) : m ? (
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span>{m.serial}</span>
            <span className="flex items-center gap-2">
              {m.sensor_status !== 'ok' && <span className="font-semibold text-warn">{SENSOR_LABELS[m.sensor_status]}</span>}
              <BatteryIndicator pct={m.battery_pct} />
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
  return target ? (
    <Link to={target} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

function Mini({ label, value, color, alarm }: { label: string; value: number | null; color: string; alarm?: boolean }) {
  return (
    <div className={cx('rounded-md px-2 py-1.5', alarm ? 'bg-crit-soft' : 'bg-soft')}>
      <div className="text-[10px] font-bold tracking-wider" style={{ color }}>
        {label}
      </div>
      <div className={cx('num text-[26px] leading-none font-bold', alarm ? 'text-crit' : 'text-ink')}>{value ?? '––'}</div>
    </div>
  )
}
