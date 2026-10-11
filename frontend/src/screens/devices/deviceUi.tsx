import { Badge } from '../../components/ui/primitives'
import { cx } from '../../lib/format'
import type { MaintenanceRecord, MonitorLive } from '../../types'

export function DeviceStatusBadge({ status }: { status: MonitorLive['status'] }) {
  if (status === 'in_use') return <Badge tone="navy" dot>In use</Badge>
  if (status === 'available') return <Badge tone="ok" dot>Available</Badge>
  return <Badge tone="warn" dot>Maintenance</Badge>
}

export function BatteryBar({ pct }: { pct: number }) {
  const color = pct <= 10 ? 'bg-crit' : pct <= 20 ? 'bg-warn' : 'bg-ok'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-soft ring-1 ring-line">
        <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
      <span className={cx('num text-[12.5px] font-semibold', pct <= 20 ? 'text-crit' : 'text-ink')}>{Math.round(pct)}%</span>
    </div>
  )
}

export const WORK_STATUS: Record<MaintenanceRecord['status'], { label: string; tone: 'info' | 'warn' | 'ok' | 'neutral' }> = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warn' },
  completed: { label: 'Completed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const WORK_KINDS: Record<MaintenanceRecord['kind'], string> = {
  preventive: 'Preventive maintenance',
  repair: 'Repair',
  battery_replacement: 'Battery replacement',
  calibration: 'Calibration',
  inspection: 'Inspection',
}
