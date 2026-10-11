import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronRight, FilterX, ShieldAlert, UsersRound, WifiOff } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { SeverityBadge } from '../../components/alarms/alarmUi'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SearchInput, Select, SkeletonRows } from '../../components/ui/primitives'
import { useDebounce } from '../../hooks/useDebounce'
import { errorMessage } from '../../lib/api'
import { cx } from '../../lib/format'
import { overviewService } from '../../services/clinical'
import { patientsService, type PatientFilters } from '../../services/patients'
import type { PatientRow } from '../../types'

export default function PatientListScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const filters: PatientFilters = {
    q: useDebounce(q, 250),
    ward_id: params.get('ward') ?? '',
    acuity: (Number(params.get('acuity')) || '') as number | '',
    monitored: (params.get('monitored') ?? '') as PatientFilters['monitored'],
    alarm: (params.get('alarm') ?? '') as PatientFilters['alarm'],
    sort: (params.get('sort') ?? 'bed') as PatientFilters['sort'],
  }
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const wards = useQuery({ queryKey: ['wards'], queryFn: overviewService.wards, staleTime: 300_000 })
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['patients', filters],
    queryFn: () => patientsService.list(filters),
    placeholderData: keepPreviousData,
  })
  const hasFilters = [...params.keys()].some((k) => k !== 'sort')

  return (
    <div>
      <PageHeader title="Patients" subtitle="Everyone admitted to your wards, with live vital signs and open alarms." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder="Search name, MRN, diagnosis or bed" className="min-w-[240px] flex-1" />
          <Select value={filters.ward_id} onChange={(e) => set('ward', e.target.value)} className="w-auto min-w-40" aria-label="Ward">
            <option value="">All wards</option>
            {wards.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <Select value={String(filters.acuity)} onChange={(e) => set('acuity', e.target.value)} className="w-auto" aria-label="Acuity">
            <option value="">Any acuity</option>
            {[5, 4, 3, 2, 1].map((a) => (
              <option key={a} value={a}>
                Acuity {a}
              </option>
            ))}
          </Select>
          <Select value={filters.monitored} onChange={(e) => set('monitored', e.target.value)} className="w-auto" aria-label="Monitoring">
            <option value="">Monitored or not</option>
            <option value="yes">On a monitor</option>
            <option value="no">Not monitored</option>
          </Select>
          <Select value={filters.alarm} onChange={(e) => set('alarm', e.target.value)} className="w-auto" aria-label="Alarms">
            <option value="">Any alarm state</option>
            <option value="any">With open alarms</option>
            <option value="critical">Critical alarms</option>
            <option value="warning">Warnings</option>
          </Select>
          <Select value={filters.sort} onChange={(e) => set('sort', e.target.value)} className="w-auto" aria-label="Sort">
            <option value="bed">Sort by bed</option>
            <option value="name">Sort by name</option>
            <option value="acuity">Sort by acuity</option>
            <option value="alarms">Sort by alarms</option>
          </Select>
          {hasFilters && (
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
          <EmptyState icon={<UsersRound className="size-6" />} title="No patients match these filters" description="Try a different search or clear the filters." />
        ) : (
          <div className={cx('overflow-x-auto transition-opacity', isFetching && 'opacity-80')}>
            <table className="w-full min-w-[960px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3">Bed</th>
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Diagnosis</th>
                  <th className="px-3 py-3 text-center">Acuity</th>
                  <th className="px-3 py-3">Vitals</th>
                  <th className="px-3 py-3">Alarms</th>
                  <th className="px-3 py-3">Attending</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((p) => (
                  <PatientTableRow key={p.id} p={p} onOpen={() => navigate(`/patients/${p.id}`)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
            {data.length} patient{data.length === 1 ? '' : 's'}
          </div>
        )}
      </Card>
    </div>
  )
}

function PatientTableRow({ p, onOpen }: { p: PatientRow; onOpen: () => void }) {
  const m = p.monitor
  return (
    <tr onClick={onOpen} className={cx('cursor-pointer transition hover:bg-soft', p.alarms.highest === 'critical' && 'bg-crit-soft/40')}>
      <td className="px-5 py-3.5">
        <span className="rounded-md bg-navy-900 px-1.5 py-0.5 text-[12px] font-bold whitespace-nowrap text-white">{p.bed?.display ?? '—'}</span>
      </td>
      <td className="px-3 py-3.5 whitespace-nowrap">
        <div className="font-semibold text-ink">{p.name}</div>
        <div className="text-[12.5px] text-muted">
          {p.mrn} · {p.age} y · {p.sex}
        </div>
      </td>
      <td className="max-w-[260px] px-3 py-3.5">
        <div className="truncate text-ink">{p.diagnosis}</div>
        <div className="mt-0.5 flex gap-1.5">
          {p.code_status !== 'Full code' && <Badge tone="violet">{p.code_status}</Badge>}
          {p.isolation && (
            <Badge tone="warn">
              <ShieldAlert className="size-3" />
              {p.isolation}
            </Badge>
          )}
        </div>
      </td>
      <td className="px-3 py-3.5 text-center">
        <span className={cx('num inline-flex size-7 items-center justify-center rounded-full text-[13px] font-bold', p.acuity >= 4 ? 'bg-crit-soft text-crit' : p.acuity === 3 ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok')}>
          {p.acuity}
        </span>
      </td>
      <td className="px-3 py-3.5">
        {!m ? (
          <span className="text-[12.5px] text-muted">Not monitored</span>
        ) : m.connection === 'lost' ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-crit">
            <WifiOff className="size-3.5" /> Offline
          </span>
        ) : (
          <div className="num flex gap-3 text-[15px] font-bold">
            <span style={{ color: 'var(--color-hr)' }}>{m.vitals.hr ?? '––'}</span>
            <span style={{ color: 'var(--color-spo2)' }}>{m.vitals.spo2 ?? '––'}%</span>
            <span style={{ color: 'var(--color-rr)' }}>{m.vitals.rr ?? '––'}</span>
            <span className="text-muted">
              {m.vitals.sys ?? '–'}/{m.vitals.dia ?? '–'}
            </span>
          </div>
        )}
      </td>
      <td className="px-3 py-3.5">
        {p.alarms.highest ? (
          <div className="flex items-center gap-2">
            <SeverityBadge severity={p.alarms.highest} />
            <span className="text-[12.5px] text-muted">
              {p.alarms.count} open{p.alarms.unacknowledged ? ` · ${p.alarms.unacknowledged} unack.` : ''}
            </span>
          </div>
        ) : (
          <span className="text-[12.5px] text-muted">None</span>
        )}
      </td>
      <td className="px-3 py-3.5 text-[13px] text-ink">{p.attending?.full_name ?? '—'}</td>
      <td className="pr-4">
        <ChevronRight className="size-4 text-faint" />
      </td>
    </tr>
  )
}
