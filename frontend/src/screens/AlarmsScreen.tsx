import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BellRing, FilterX, Info } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useProfile } from '../auth/AuthProvider'
import { AckDialog, AlarmRow } from '../components/alarms/alarmUi'
import { Button, Card, EmptyState, ErrorState, PageHeader, SearchInput, Select, SkeletonRows, Tabs } from '../components/ui/primitives'
import { can } from '../config/permissions'
import { useDebounce } from '../hooks/useDebounce'
import { useSimState } from '../hooks/useSimState'
import { errorMessage } from '../lib/api'
import { alarmsService, overviewService, type AlarmFilters } from '../services/clinical'
import type { Alarm } from '../types'

type StatusTab = 'active' | 'acknowledged' | 'resolved' | 'all'

export default function AlarmsScreen() {
  const profile = useProfile()
  const clinical = can.viewPatients(profile.role)
  const [params, setParams] = useSearchParams()
  const [ackAlarm, setAckAlarm] = useState<Alarm | null>(null)
  const status = (params.get('status') ?? 'active') as StatusTab
  const q = params.get('q') ?? ''
  const debouncedQ = useDebounce(q, 250)
  const filters: AlarmFilters = {
    status,
    severity: params.get('severity') ?? '',
    category: params.get('category') ?? '',
    ward_id: params.get('ward') ?? '',
    q: debouncedQ,
    limit: status === 'resolved' || status === 'all' ? 300 : 200,
  }
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const sim = useSimState()
  const summary = useQuery({ queryKey: ['alarm-summary'], queryFn: alarmsService.summary })
  const wards = useQuery({ queryKey: ['wards'], queryFn: overviewService.wards, staleTime: 300_000 })
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['alarms', 'list', filters],
    queryFn: () => alarmsService.list(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  })
  const s = summary.data
  const hasFilters = !!(filters.severity || filters.category || filters.ward_id || q)

  return (
    <div>
      <PageHeader
        title="Alarms"
        subtitle={clinical ? 'Clinical and technical alarms across your wards.' : 'Technical alarms for monitors: batteries, sensors and connectivity.'}
      />
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-info-line bg-info-soft px-4 py-3 text-[13px] text-[#1849a9]">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>Acknowledging an alarm does not clear it.</strong> It records who is responding. The alarm stays open, marked as acknowledged, until the monitor reports that the condition has stopped. Then it moves to Resolved.
        </span>
      </div>
      <Card>
        <div className="px-5 pt-3">
          <Tabs
            value={status}
            onChange={(v) => set('status', v === 'active' ? '' : v)}
            items={[
              { value: 'active', label: 'Unacknowledged', count: s?.unacknowledged, tone: s?.critical_unacknowledged ? 'crit' : 'warn' },
              { value: 'acknowledged', label: 'Acknowledged · still active', count: s ? s.open - s.unacknowledged : undefined },
              { value: 'resolved', label: 'Resolved' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder={clinical ? 'Search patient, bed, monitor or message' : 'Search bed, monitor or message'} className="min-w-[240px] flex-1" />
          <Select value={filters.severity} onChange={(e) => set('severity', e.target.value)} className="w-auto" aria-label="Severity">
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
          </Select>
          {clinical && (
            <Select value={filters.category} onChange={(e) => set('category', e.target.value)} className="w-auto" aria-label="Category">
              <option value="">Clinical and technical</option>
              <option value="clinical">Clinical only</option>
              <option value="technical">Technical only</option>
            </Select>
          )}
          <Select value={filters.ward_id} onChange={(e) => set('ward', e.target.value)} className="w-auto" aria-label="Ward">
            <option value="">All wards</option>
            {wards.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<FilterX className="size-4" />}
              onClick={() => setParams(status === 'active' ? {} : { status }, { replace: true })}
            >
              Clear
            </Button>
          )}
        </div>
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <SkeletonRows rows={6} />
        ) : !data?.length ? (
          <EmptyState
            icon={<BellRing className="size-6" />}
            title={status === 'active' ? 'No unacknowledged alarms' : 'No alarms found'}
            description={status === 'active' ? 'Everything that is alarming has someone responding. Nice work.' : 'Try changing the filters.'}
          />
        ) : (
          <div className="divide-y divide-line">
            {data.map((a) => (
              <AlarmRow key={a.id} alarm={a} onAcknowledge={setAckAlarm} showPatient={clinical} nowIso={sim.data?.sim_time} />
            ))}
          </div>
        )}
        {data && data.length > 0 && <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">Showing {data.length} alarm{data.length === 1 ? '' : 's'}</div>}
      </Card>
      <AckDialog alarm={ackAlarm} onClose={() => setAckAlarm(null)} />
    </div>
  )
}
