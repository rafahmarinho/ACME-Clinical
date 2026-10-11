import { useQuery } from '@tanstack/react-query'
import { Activity, BellRing, Cpu, UsersRound, X } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useProfile } from '../auth/AuthProvider'
import { BatteryIndicator, ConnectionIndicator } from '../components/monitoring/vitals'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, StatCard, Tabs } from '../components/ui/primitives'
import { can } from '../config/permissions'
import { BedCard } from '../components/ward/BedCard'
import { errorMessage } from '../lib/api'
import { cx, fmtTime } from '../lib/format'
import { overviewService } from '../services/clinical'
import type { EventRow, OverviewBed } from '../types'

const Ward3D = lazy(() => import('../components/ward/Ward3D'))

export default function OverviewScreen() {
  const profile = useProfile()
  const navigate = useNavigate()
  const clinical = can.viewPatients(profile.role)
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['overview'], queryFn: overviewService.get, refetchInterval: 20_000 })
  const [wardCode, setWardCode] = useState<string | null>(profile.preferences.default_ward)
  const [view, setView] = useState<'grid' | '3d'>(() => (localStorage.getItem('acme.overview.view') as '3d' | 'grid') || 'grid')
  const [selected, setSelected] = useState<OverviewBed | null>(null)

  const setViewPersist = (v: 'grid' | '3d') => {
    setView(v)
    try {
      localStorage.setItem('acme.overview.view', v)
    } catch {
      /* storage unavailable */
    }
  }

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
  const ward = data?.wards.find((w) => w.code === wardCode) ?? data?.wards[0]
  const k = data?.kpis

  return (
    <div>
      <PageHeader
        eyebrow={ward ? `${ward.floor ?? ''} · ${ward.name}` : 'Ward overview'}
        title={`Good ${greeting()}, ${profile.full_name.replace(/^Dr\.\s*/, '').split(' ')[0]}`}
        subtitle={clinical ? 'Live status of every bed, patient and monitor on your wards.' : 'Device status for every bed. Patient details are hidden for your role.'}
        actions={
          <Segmented
            value={view}
            onChange={setViewPersist}
            items={[
              { value: 'grid', label: 'Bed grid' },
              { value: '3d', label: '3D ward' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {k ? (
          <>
            <StatCard label="Patients" value={k.patients} hint={`${k.monitored} on continuous monitoring · ${k.beds_free} beds free`} icon={<UsersRound className="size-4" />} />
            <StatCard
              label="Open alarms"
              value={k.open_alarms}
              tone={k.critical ? 'crit' : k.open_alarms ? 'warn' : 'ok'}
              hint={`${k.critical} critical · ${k.unacknowledged} unacknowledged`}
              icon={<BellRing className="size-4" />}
            />
            <StatCard label="Monitors online" value={`${k.monitored - k.devices_offline}/${k.monitored}`} tone={k.devices_offline ? 'crit' : 'ok'} hint={`${k.devices_offline} offline · ${k.devices_sensor_issue} sensor issues`} icon={<Activity className="size-4" />} />
            <StatCard label="Device fleet" value={k.devices_total} tone={k.devices_low_battery ? 'warn' : 'default'} hint={`${k.devices_low_battery} low battery · ${k.devices_available} spare · ${k.devices_maintenance} in service`} icon={<Cpu className="size-4" />} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="px-5 pt-3">
            {data && (
              <Tabs
                value={ward?.code ?? ''}
                onChange={(c) => {
                  setWardCode(c)
                  setSelected(null)
                }}
                items={data.wards.map((w) => ({
                  value: w.code,
                  label: w.name,
                  count: w.beds.reduce((n, b) => n + b.alarms.unacknowledged, 0),
                  tone: w.beds.some((b) => b.alarms.highest === 'critical' && b.alarms.unacknowledged) ? 'crit' : 'warn',
                }))}
              />
            )}
          </div>
          {isLoading || !ward ? (
            <div className="grid gap-4 p-5 sm:grid-cols-2 2xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          ) : view === 'grid' ? (
            <div className="grid gap-4 p-5 sm:grid-cols-2 2xl:grid-cols-4">
              {ward.beds.map((b) => (
                <BedCard key={b.id} bed={b} linkPatients={clinical} />
              ))}
            </div>
          ) : (
            <div className="relative h-[620px]">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Loading 3D ward…</div>}>
                <Ward3D key={ward.code} beds={ward.beds} onSelect={setSelected} selectedId={selected?.id} />
              </Suspense>
              <div className="pointer-events-none absolute top-4 left-4 flex flex-wrap gap-2">
                <Legend color="#10b981" label="Stable" />
                <Legend color="#f59e0b" label="Warning" />
                <Legend color="#ef4444" label="Critical" />
                <Legend color="#94a3b8" label="Offline" />
              </div>
              <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-white/90 px-3 py-2 text-[12px] text-muted shadow-sm">
                Drag to orbit · scroll to zoom · click a bed for details. Staff figures walk to beds that need attention.
              </div>
              {selected && <BedPanel bed={latest(ward.beds, selected)} clinical={clinical} onClose={() => setSelected(null)} onOpen={(p) => navigate(p)} />}
            </div>
          )}
        </Card>

        <Card className="flex max-h-[760px] min-w-0 flex-col">
          <CardHeader title="Recent activity" subtitle="Alarms, device events and staff actions" />
          <div className="flex-1 overflow-y-auto">
            {!data ? (
              <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : data.recent_events.length === 0 ? (
              <EmptyState title="No activity yet" description="Events appear here as the simulation runs." />
            ) : (
              <ul className="divide-y divide-line">
                {data.recent_events.map((e) => (
                  <EventItem key={e.id} event={e} />
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-line p-3 text-center">
            <Link to="/alarms" className="text-sm font-semibold text-navy-600 hover:underline">
              Go to alarms
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}

function latest(beds: OverviewBed[], b: OverviewBed) {
  return beds.find((x) => x.id === b.id) ?? b
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-semibold text-ink shadow-sm">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function BedPanel({ bed, clinical, onClose, onOpen }: { bed: OverviewBed; clinical: boolean; onClose: () => void; onOpen: (path: string) => void }) {
  const m = bed.monitor
  return (
    <div className="animate-slide-up absolute top-4 right-4 w-[300px] rounded-xl border border-line bg-white p-4 shadow-(--shadow-pop)">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] font-bold text-muted">{bed.display}</div>
          <div className="text-base font-semibold text-ink">{bed.occupied ? bed.patient?.name : 'Available bed'}</div>
          {bed.patient?.diagnosis && <div className="text-[12.5px] text-muted">{bed.patient.diagnosis}</div>}
        </div>
        <button onClick={onClose} className="text-faint hover:text-ink" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {m && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-1 text-center">
            {(
              [
                ['HR', m.vitals.hr, 'var(--color-hr)'],
                ['SpO₂', m.vitals.spo2, 'var(--color-spo2)'],
                ['RR', m.vitals.rr, 'var(--color-rr)'],
                ['SYS', m.vitals.sys, 'var(--color-bp)'],
              ] as const
            ).map(([l, v, c]) => (
              <div key={l} className="rounded-md bg-soft py-1.5">
                <div className="text-[10px] font-bold" style={{ color: c }}>
                  {l}
                </div>
                <div className="num text-xl font-bold">{m.connection === 'lost' ? '––' : (v ?? '––')}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
            <span>{m.serial}</span>
            <span className="flex gap-3">
              <ConnectionIndicator monitor={m} />
              <BatteryIndicator pct={m.battery_pct} />
            </span>
          </div>
        </>
      )}
      {bed.top_alarm && (
        <div className={cx('mt-3 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold', bed.top_alarm.severity === 'critical' ? 'bg-crit-soft text-crit' : 'bg-warn-soft text-warn')}>
          {bed.top_alarm.acknowledged && <Badge tone="neutral" className="mr-1.5">ACK</Badge>}
          {bed.top_alarm.message}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {clinical && bed.patient?.id && (
          <Button size="sm" onClick={() => onOpen(`/patients/${bed.patient!.id}`)}>
            Patient chart
          </Button>
        )}
        {m && (
          <Button size="sm" variant="secondary" onClick={() => onOpen(clinical ? `/monitoring/${m.id}` : `/devices/${m.id}`)}>
            {clinical ? 'Live monitor' : 'Device'}
          </Button>
        )}
      </div>
    </div>
  )
}

const EVENT_TONE: Record<EventRow['severity'], string> = { critical: 'bg-crit', warning: 'bg-warn', info: 'bg-navy-200' }

export function EventItem({ event }: { event: EventRow }) {
  return (
    <li className="flex gap-3 px-5 py-3">
      <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', EVENT_TONE[event.severity])} />
      <div className="min-w-0">
        <p className="text-[13px] leading-snug text-ink">{event.message}</p>
        <p className="mt-0.5 text-[11.5px] text-muted">
          {fmtTime(event.occurred_at)} · <span className="font-mono">{event.kind}</span>
        </p>
      </div>
    </li>
  )
}
