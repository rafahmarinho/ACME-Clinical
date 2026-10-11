import { BellOff, Maximize2, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import { useProfile } from '../../auth/AuthProvider'
import { can } from '../../config/permissions'
import { cx } from '../../lib/format'
import type { Alarm, LiveMonitor } from '../../types'
import { Badge } from '../ui/primitives'
import { alarmFor, BatteryIndicator, ConnectionIndicator, RANGES, SENSOR_LABELS, VitalValue } from './vitals'
import { WaveformCanvas } from './WaveformCanvas'

export function MonitorTile({ monitor, showWaveforms, onAcknowledge }: { monitor: LiveMonitor; showWaveforms: boolean; onAcknowledge: (a: Alarm) => void }) {
  const profile = useProfile()
  const offline = monitor.connection === 'lost'
  const top = monitor.open_alarms[0]
  const v = monitor.vitals
  const tone = !top ? 'border-line' : top.severity === 'critical' ? 'border-crit ring-2 ring-crit/25' : 'border-warn ring-2 ring-warn/20'
  const waiting = !offline && v.hr === null && v.spo2 === null && v.rr === null && monitor.sensor_status === 'ok'

  return (
    <div className={cx('card flex flex-col overflow-hidden border', tone)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-md bg-navy-900 px-1.5 py-0.5 text-[12px] font-bold whitespace-nowrap text-white">{monitor.bed?.display}</span>
            <span className="truncate text-[15px] font-semibold text-ink">{monitor.patient?.name ?? 'Unassigned'}</span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {monitor.serial}
            {monitor.patient?.age != null && ` · ${monitor.patient.age} y ${monitor.patient.sex ?? ''}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionIndicator monitor={monitor} />
          <BatteryIndicator pct={monitor.battery_pct} />
          <Link to={`/monitoring/${monitor.id}`} className="rounded-md p-1 text-faint hover:bg-soft hover:text-ink" aria-label={`Open ${monitor.bed?.display} monitor`}>
            <Maximize2 className="size-4" />
          </Link>
        </div>
      </div>

      {top && (
        <div className={cx('flex items-center justify-between gap-2 px-4 py-1.5 text-[12.5px] font-semibold', top.severity === 'critical' ? 'bg-crit text-white' : 'bg-warn-soft text-warn')}>
          <span className="truncate">
            {top.acknowledged_at ? 'ACK · ' : ''}
            {top.message}
            {monitor.open_alarms.length > 1 && ` (+${monitor.open_alarms.length - 1})`}
          </span>
          {!top.acknowledged_at && can.acknowledge(profile.role, top.category) && (
            <button onClick={() => onAcknowledge(top)} className={cx('inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5', top.severity === 'critical' ? 'bg-white/20 hover:bg-white/30' : 'bg-warn/10 hover:bg-warn/20')}>
              <BellOff className="size-3.5" /> Ack
            </button>
          )}
        </div>
      )}

      {offline ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-soft py-10 text-center">
          <WifiOff className="size-8 text-crit" />
          <div className="text-sm font-semibold text-ink">No signal from monitor</div>
          <div className="text-[12.5px] text-muted">Check network, power and battery at the bedside</div>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-[1fr_auto] gap-x-2">
          <div className="min-w-0 space-y-1 py-2 pl-3">
            {showWaveforms ? (
              <>
                <WaveformCanvas monitorId={monitor.id} channel="ecg" color="var(--color-hr)" range={RANGES.ecg} height={62} label="II" muted={monitor.sensor_status === 'ecg_leads_off'} />
                <WaveformCanvas monitorId={monitor.id} channel="pleth" color="var(--color-spo2)" range={RANGES.pleth} height={42} label="PLETH" muted={monitor.sensor_status === 'spo2_probe_off'} />
              </>
            ) : (
              <div className="flex h-full items-center text-[12.5px] text-muted">Waveforms hidden (see Settings)</div>
            )}
            {monitor.sensor_status !== 'ok' && (
              <Badge tone="warn" className="mt-1">
                {SENSOR_LABELS[monitor.sensor_status]}
              </Badge>
            )}
            {waiting && <div className="text-[12px] text-muted">Waiting for first readings…</div>}
          </div>
          <div className="grid w-[150px] grid-cols-1 content-start gap-0.5 border-l border-line py-1 pr-1">
            <VitalValue parameter="hr" value={v.hr} alarm={alarmFor(monitor.open_alarms, 'hr')} size="md" unavailable={monitor.sensor_status === 'ecg_leads_off' ? 'Leads off' : undefined} />
            <VitalValue parameter="spo2" value={v.spo2} alarm={alarmFor(monitor.open_alarms, 'spo2')} size="md" unavailable={monitor.sensor_status === 'spo2_probe_off' ? 'Probe off' : undefined} />
          </div>
        </div>
      )}
      {!offline && (
        <div className="grid grid-cols-2 border-t border-line">
          <VitalValue parameter="rr" value={v.rr} alarm={alarmFor(monitor.open_alarms, 'rr')} size="sm" />
          <div className="border-l border-line">
            <VitalValue parameter="bp" value={v.sys} secondary={v.dia} alarm={alarmFor(monitor.open_alarms, 'sys') ?? alarmFor(monitor.open_alarms, 'dia')} size="sm" />
          </div>
        </div>
      )}
    </div>
  )
}
