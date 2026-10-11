import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronRight, Cpu, FilterX, WifiOff } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { useProfile } from '../../auth/AuthProvider'
import { SeverityBadge } from '../../components/alarms/alarmUi'
import { SENSOR_LABELS } from '../../components/monitoring/vitals'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SearchInput, Select, SkeletonRows, StatCard } from '../../components/ui/primitives'
import { can } from '../../config/permissions'
import { useDebounce } from '../../hooks/useDebounce'
import { errorMessage } from '../../lib/api'
import { cx, fmtDate } from '../../lib/format'
import { devicesService, type DeviceFilters } from '../../services/devices'
import { BatteryBar, DeviceStatusBadge } from './deviceUi'

export default function DeviceListScreen() {
  const profile = useProfile()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const filters: DeviceFilters = {
    q: useDebounce(q, 250),
    status: params.get('status') ?? '',
    connection: params.get('connection') ?? '',
    battery: params.get('battery') ?? '',
    issue: params.get('issue') ?? '',
  }
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const all = useQuery({ queryKey: ['devices', {}], queryFn: () => devicesService.list({}) })
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['devices', filters],
    queryFn: () => devicesService.list(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  })
  const fleet = all.data ?? []

  return (
    <div>
      <PageHeader
        title="Devices"
        subtitle={can.manageDevices(profile.role) ? 'Bedside monitors: status, assignment, batteries and service.' : 'Bedside monitors and their assignment to beds.'}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="In use" value={fleet.filter((d) => d.status === 'in_use').length} hint={`of ${fleet.length} monitors`} />
        <StatCard label="Offline" value={fleet.filter((d) => d.status === 'in_use' && d.connection === 'lost').length} tone={fleet.some((d) => d.status === 'in_use' && d.connection === 'lost') ? 'crit' : 'ok'} hint="No data reaching the central station" />
        <StatCard label="Low battery" value={fleet.filter((d) => d.battery_pct <= 20 && d.status !== 'maintenance').length} tone={fleet.some((d) => d.battery_pct <= 20 && d.status !== 'maintenance') ? 'warn' : 'ok'} hint="20% or less" />
        <StatCard label="Service overdue" value={fleet.filter((d) => d.service_overdue).length} tone={fleet.some((d) => d.service_overdue) ? 'warn' : 'ok'} hint="Past next service date" />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder="Search serial, asset tag, model or bed" className="min-w-[240px] flex-1" />
          <Select value={filters.status} onChange={(e) => set('status', e.target.value)} className="w-auto" aria-label="Status">
            <option value="">All statuses</option>
            <option value="in_use">In use</option>
            <option value="available">Available</option>
            <option value="maintenance">Maintenance</option>
          </Select>
          <Select value={filters.connection} onChange={(e) => set('connection', e.target.value)} className="w-auto" aria-label="Connection">
            <option value="">Any connection</option>
            <option value="connected">Connected</option>
            <option value="lost">Offline</option>
          </Select>
          <Select value={filters.battery} onChange={(e) => set('battery', e.target.value)} className="w-auto" aria-label="Battery">
            <option value="">Any battery</option>
            <option value="low">Low battery</option>
          </Select>
          <Select value={filters.issue} onChange={(e) => set('issue', e.target.value)} className="w-auto" aria-label="Issues">
            <option value="">All devices</option>
            <option value="any">Needs attention</option>
          </Select>
          {[...params.keys()].length > 0 && (
            <Button variant="ghost" size="sm" icon={<FilterX className="size-4" />} onClick={() => setParams({}, { replace: true })}>
              Clear
            </Button>
          )}
        </div>
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} />
        ) : !data?.length ? (
          <EmptyState icon={<Cpu className="size-6" />} title="No devices match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3">Monitor</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Bed</th>
                  <th className="px-3 py-3">Connection</th>
                  <th className="px-3 py-3">Sensors</th>
                  <th className="px-3 py-3">Battery</th>
                  <th className="px-3 py-3">Next service</th>
                  <th className="px-3 py-3">Alarms</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((d) => (
                  <tr key={d.id} onClick={() => navigate(`/devices/${d.id}`)} className="cursor-pointer hover:bg-soft">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-ink">{d.serial}</div>
                      <div className="text-[12.5px] text-muted">
                        {d.model} · {d.asset_tag} · FW {d.firmware}
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <DeviceStatusBadge status={d.status} />
                    </td>
                    <td className="px-3 py-3.5">
                      {d.bed ? (
                        <div>
                          <span className="font-semibold">{d.bed.display}</span>
                          {d.patient?.name && <div className="text-[12.5px] text-muted">{d.patient.name}</div>}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      {d.status === 'maintenance' ? (
                        <span className="text-muted">—</span>
                      ) : d.connection === 'lost' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-crit">
                          <WifiOff className="size-4" /> Offline
                        </span>
                      ) : (
                        <span className="num text-ink">Online · {d.signal_quality}%</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">{d.sensor_status === 'ok' ? <span className="text-muted">OK</span> : <Badge tone="warn">{SENSOR_LABELS[d.sensor_status]}</Badge>}</td>
                    <td className="px-3 py-3.5">
                      <BatteryBar pct={d.battery_pct} />
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={cx(d.service_overdue && 'font-semibold text-warn')}>{fmtDate(d.next_service_due)}</span>
                      {d.service_overdue && <div className="text-[11.5px] font-semibold text-warn">Overdue</div>}
                    </td>
                    <td className="px-3 py-3.5">{d.alarms.highest ? <SeverityBadge severity={d.alarms.highest} /> : <span className="text-muted">None</span>}</td>
                    <td className="pr-4">
                      <ChevronRight className="size-4 text-faint" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
