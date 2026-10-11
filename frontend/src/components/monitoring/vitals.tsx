import { BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Plug, Signal, SignalLow, WifiOff } from 'lucide-react'
import { cx, PARAM_META } from '../../lib/format'
import type { Alarm, MonitorLive, Parameter, Threshold } from '../../types'

export const RANGES = {
  ecg: [-0.45, 1.25] as [number, number],
  pleth: [-0.05, 1.15] as [number, number],
  resp: [-0.05, 1.05] as [number, number],
}

/** The alarm (if any) that currently concerns a given parameter. */
export function alarmFor(alarms: Alarm[] | undefined, parameter: Parameter): Alarm | undefined {
  return alarms?.find((a) => a.parameter === parameter && a.condition_active)
}

export function VitalValue({
  parameter,
  value,
  secondary,
  alarm,
  size = 'md',
  threshold,
  unavailable,
}: {
  parameter: Parameter | 'bp'
  value: number | null | undefined
  secondary?: number | null
  alarm?: Alarm
  size?: 'sm' | 'md' | 'lg' | 'xl'
  threshold?: Threshold
  unavailable?: string
}) {
  const meta = parameter === 'bp' ? { short: 'NIBP', unit: 'mmHg', color: 'var(--color-bp)' } : PARAM_META[parameter]
  const sizes = { sm: 'text-2xl', md: 'text-[40px]', lg: 'text-[56px]', xl: 'text-[72px]' }
  const tone = alarm ? (alarm.severity === 'critical' ? 'text-crit' : 'text-warn') : 'text-ink'
  return (
    <div
      className={cx(
        'relative min-w-0 rounded-lg px-3 py-2',
        alarm?.severity === 'critical' && !alarm.acknowledged_at && 'animate-pulse-crit bg-crit-soft',
        alarm?.severity === 'critical' && alarm.acknowledged_at && 'bg-crit-soft',
        alarm?.severity === 'warning' && 'bg-warn-soft',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: meta.color }}>
          {meta.short}
        </span>
        <span className="text-[10.5px] font-medium text-faint">{meta.unit}</span>
      </div>
      <div className={cx('num leading-[1.05] font-bold', sizes[size], tone)}>
        {value === null || value === undefined ? (
          <span className="text-faint" title={unavailable}>
            {parameter === 'bp' ? '–/–' : '––'}
          </span>
        ) : parameter === 'bp' ? (
          <>
            {value}
            <span className="text-[0.55em] text-muted">/{secondary ?? '–'}</span>
          </>
        ) : (
          value
        )}
      </div>
      {threshold && parameter !== 'bp' && (
        <div className="num mt-0.5 text-[10.5px] text-faint">
          {threshold.warn_high == null ? `≥ ${threshold.warn_low}` : threshold.warn_low == null ? `≤ ${threshold.warn_high}` : `${threshold.warn_low} – ${threshold.warn_high}`}
        </div>
      )}
      {unavailable && (value === null || value === undefined) && <div className="mt-0.5 truncate text-[10.5px] font-semibold text-warn">{unavailable}</div>}
    </div>
  )
}

export function BatteryIndicator({ pct, docked }: { pct: number; docked?: boolean }) {
  const Icon = docked ? Plug : pct <= 10 ? BatteryWarning : pct <= 20 ? BatteryLow : pct <= 60 ? BatteryMedium : BatteryFull
  const tone = pct <= 10 ? 'text-crit' : pct <= 20 ? 'text-warn' : 'text-muted'
  return (
    <span className={cx('num inline-flex items-center gap-1 text-[12px] font-semibold', tone)} title={`Battery ${Math.round(pct)}%`}>
      <Icon className="size-4" />
      {Math.round(pct)}%
    </span>
  )
}

export function ConnectionIndicator({ monitor }: { monitor: Pick<MonitorLive, 'connection' | 'signal_quality' | 'sensor_status' | 'status'> }) {
  if (monitor.status === 'maintenance') return <span className="text-[12px] font-semibold text-muted">Out of service</span>
  if (monitor.connection === 'lost')
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-crit">
        <WifiOff className="size-4" /> Offline
      </span>
    )
  const weak = monitor.signal_quality < 50
  const Icon = weak ? SignalLow : Signal
  return (
    <span className={cx('num inline-flex items-center gap-1 text-[12px] font-semibold', weak ? 'text-warn' : 'text-muted')} title={`Signal quality ${monitor.signal_quality}%`}>
      <Icon className="size-4" />
      {monitor.signal_quality}%
    </span>
  )
}

export const SENSOR_LABELS = {
  ok: 'Sensors OK',
  spo2_probe_off: 'SpO₂ probe off',
  ecg_leads_off: 'ECG leads off',
} as const
