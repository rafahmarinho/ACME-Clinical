import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useProfile } from '../auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SearchInput, SkeletonRows, StatCard, Tabs } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { can } from '../config/permissions'
import { useDebounce } from '../hooks/useDebounce'
import { errorMessage } from '../lib/api'
import { fmtDate, fmtDateTime } from '../lib/format'
import { devicesService, maintenanceService } from '../services/devices'
import type { MaintenanceRecord } from '../types'
import { WorkOrderModal } from './devices/DeviceDetailScreen'
import { WORK_KINDS, WORK_STATUS } from './devices/deviceUi'

type Tab = 'open' | 'scheduled' | 'in_progress' | 'completed' | 'all'

export default function MaintenanceScreen() {
  const profile = useProfile()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('open')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const debounced = useDebounce(q, 250)
  const all = useQuery({ queryKey: ['maintenance', 'all'], queryFn: () => maintenanceService.list({}) })
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['maintenance', tab, debounced],
    queryFn: async () => {
      const rows = await maintenanceService.list({ status: tab === 'open' || tab === 'all' ? undefined : tab, q: debounced || undefined })
      return tab === 'open' ? rows.filter((r) => r.status === 'scheduled' || r.status === 'in_progress') : rows
    },
    placeholderData: keepPreviousData,
  })
  const monitors = useQuery({ queryKey: ['devices', {}], queryFn: () => devicesService.list({}) })
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MaintenanceRecord['status'] }) => maintenanceService.update(id, { status, ...(status === 'completed' ? { resolution: 'Completed — see device log.' } : {}) }),
    onSuccess: () => {
      toast.success('Work order updated')
      void queryClient.invalidateQueries({ queryKey: ['maintenance'] })
    },
    onError: (e) => toast.error('Could not update the work order', errorMessage(e)),
  })
  const rows = all.data ?? []
  const count = (s: MaintenanceRecord['status']) => rows.filter((r) => r.status === s).length

  return (
    <div>
      <PageHeader
        title="Maintenance"
        subtitle="Preventive maintenance, repairs, calibrations and battery replacements for the monitor fleet."
        actions={
          can.manageDevices(profile.role) && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New work order
            </Button>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Scheduled" value={count('scheduled')} tone="info" />
        <StatCard label="In progress" value={count('in_progress')} tone="warn" />
        <StatCard label="Overdue" value={rows.filter((r) => r.overdue).length} tone={rows.some((r) => r.overdue) ? 'crit' : 'ok'} />
        <StatCard label="Completed" value={count('completed')} tone="ok" />
      </div>
      <Card>
        <div className="px-5 pt-3">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'open', label: 'Open', count: count('scheduled') + count('in_progress') },
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <div className="border-b border-line p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search title or monitor serial" className="max-w-md" />
        </div>
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <SkeletonRows />
        ) : !data?.length ? (
          <EmptyState icon={<Wrench className="size-6" />} title="No work orders here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3">Work order</th>
                  <th className="px-3 py-3">Monitor</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Scheduled</th>
                  <th className="px-3 py-3">Technician</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((r) => (
                  <tr key={r.id} className="hover:bg-soft">
                    <td className="max-w-[340px] px-5 py-3.5">
                      <div className="font-semibold">{r.title}</div>
                      {(r.resolution || r.details) && <div className="truncate text-[12.5px] text-muted">{r.resolution ?? r.details}</div>}
                    </td>
                    <td className="px-3 py-3.5">
                      <Link to={`/devices/${r.monitor_id}`} className="font-semibold text-navy-600 hover:underline">
                        {r.monitor?.serial}
                      </Link>
                    </td>
                    <td className="px-3 py-3.5">{WORK_KINDS[r.kind]}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex gap-1.5">
                        <Badge tone={WORK_STATUS[r.status].tone}>{WORK_STATUS[r.status].label}</Badge>
                        {r.overdue && <Badge tone="crit">Overdue</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-3.5">{r.completed_at ? fmtDateTime(r.completed_at) : fmtDate(r.scheduled_for)}</td>
                    <td className="px-3 py-3.5">{r.technician?.full_name ?? '—'}</td>
                    <td className="px-3 py-3.5 text-right">
                      {can.manageDevices(profile.role) && r.status === 'scheduled' && (
                        <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: r.id, status: 'in_progress' })}>
                          Start
                        </Button>
                      )}
                      {can.manageDevices(profile.role) && r.status === 'in_progress' && (
                        <Link to={`/devices/${r.monitor_id}`}>
                          <Button size="sm" variant="success">
                            Complete
                          </Button>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && <WorkOrderModal onClose={() => setCreating(false)} monitors={monitors.data?.map((m) => ({ id: m.id, serial: m.serial })) ?? []} />}
    </div>
  )
}
