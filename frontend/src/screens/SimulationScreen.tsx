import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BatteryLow, CheckCircle2, FastForward, FlaskConical, HeartPulse, Mail, Pause, Play, Radio, RotateCcw, Unplug, WifiOff, Zap } from 'lucide-react'
import { useState } from 'react'
import { useProfile } from '../auth/AuthProvider'
import { BatteryIndicator, SENSOR_LABELS } from '../components/monitoring/vitals'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageLoader, Select, Skeleton, Tabs } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { can } from '../config/permissions'
import { useToggleAutoRun } from '../hooks/useSimState'
import { errorMessage } from '../lib/api'
import { cx, fmtDateTime, fmtTimeSec } from '../lib/format'
import { simulationService } from '../services/admin'
import type { AdvanceResult, EventRow, Fault } from '../types'

const SCENARIO_ICONS: Record<string, React.ReactNode> = {
  normal: <CheckCircle2 className="size-5" />,
  desaturation: <HeartPulse className="size-5" />,
  weak_batteries: <BatteryLow className="size-5" />,
  sensor_issues: <Unplug className="size-5" />,
  connection_loss: <WifiOff className="size-5" />,
  busy_shift: <Zap className="size-5" />,
}

const FAULT_LABELS: Record<Fault, string> = {
  none: 'No fault',
  desaturation: 'Desaturation',
  low_battery: 'Weak battery',
  sensor: 'Sensor detached',
  disconnect: 'Lost connection',
}

const EVENT_FILTERS = [
  { value: '', label: 'All events' },
  { value: 'alarm', label: 'Alarms' },
  { value: 'device', label: 'Devices' },
  { value: 'simulation', label: 'Simulation' },
  { value: 'integration', label: 'Integrations' },
  { value: 'thresholds', label: 'Thresholds' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'report', label: 'Reports' },
  { value: 'team', label: 'Team' },
  { value: 'note', label: 'Notes' },
]

export default function SimulationScreen() {
  const profile = useProfile()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [confirmReset, setConfirmReset] = useState(false)
  const [last, setLast] = useState<AdvanceResult | null>(null)
  const sim = useQuery({ queryKey: ['simulation'], queryFn: simulationService.overview, refetchInterval: 15_000 })
  const toggle = useToggleAutoRun()

  const refreshAll = () => void queryClient.invalidateQueries()
  const report = (title: string) => (r: AdvanceResult) => {
    setLast(r)
    refreshAll()
    toast.success(title, `${r.alarms_raised ?? 0} alarms raised · ${r.alarms_resolved ?? 0} resolved · ${r.readings ?? 0} readings`)
  }
  const advance = useMutation({ mutationFn: simulationService.advance, onSuccess: (r) => report(`Advanced ${r.ticks} min`)(r), onError: (e) => toast.error('Could not advance', errorMessage(e)) })
  const scenario = useMutation({ mutationFn: simulationService.scenario, onSuccess: report('Scenario applied'), onError: (e) => toast.error('Could not apply the scenario', errorMessage(e)) })
  const fault = useMutation({
    mutationFn: ({ id, f }: { id: string; f: Fault }) => simulationService.fault(id, f),
    onSuccess: report('Fault injection applied'),
    onError: (e) => toast.error('Could not inject the fault', errorMessage(e)),
  })
  const reset = useMutation({
    mutationFn: simulationService.reset,
    onSuccess: (r) => {
      setConfirmReset(false)
      setLast(null)
      refreshAll()
      toast.success('Demo data reset', `${r.patients} patients, ${r.monitors} monitors and ${r.readings} readings restored.`)
    },
    onError: (e) => toast.error('Reset failed', errorMessage(e)),
  })

  if (sim.isLoading) return <PageLoader label="Loading simulation…" />
  if (sim.isError || !sim.data) return <ErrorState message={errorMessage(sim.error)} onRetry={() => void sim.refetch()} />
  const { state, scenarios, monitors, faults } = sim.data
  const busy = advance.isPending || scenario.isPending || fault.isPending || reset.isPending

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Demo control center"
        title="Simulation"
        subtitle="Pick scenarios, inject device faults, advance time and inspect everything the system did. Results persist and appear on every screen."
        actions={
          can.resetDemo(profile.role) && (
            <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmReset(true)}>
              Reset demo data
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Clock" icon={<FlaskConical className="size-4" />} subtitle="One tick is one simulated minute" />
          <div className="p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="label">Simulation time</div>
                <div className="num text-[44px] leading-none font-bold">{fmtTimeSec(state.sim_time)}</div>
                <div className="mt-1 text-sm text-muted">
                  Tick {state.tick} · {fmtDateTime(state.sim_time)}
                </div>
              </div>
              <Button
                variant={state.auto_run ? 'success' : 'secondary'}
                size="lg"
                icon={state.auto_run ? <Pause className="size-4" /> : <Play className="size-4" />}
                loading={toggle.isPending}
                onClick={() => toggle.mutate(!state.auto_run, { onSuccess: () => void sim.refetch() })}
              >
                {state.auto_run ? 'Pause' : 'Run live'}
              </Button>
            </div>
            <p className="mt-3 text-[13px] text-muted">
              Live mode advances one minute every 5 seconds while someone has the app open. Use the buttons to jump ahead instantly.
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[1, 5, 15, 60].map((n) => (
                <Button key={n} variant="secondary" icon={<FastForward className="size-4" />} disabled={busy} loading={advance.isPending && advance.variables === n} onClick={() => advance.mutate(n)}>
                  +{n} min
                </Button>
              ))}
            </div>
            {last && !last.skipped && (
              <div className="mt-4 grid grid-cols-4 gap-2 rounded-lg bg-soft p-3 text-center">
                {(
                  [
                    ['Readings', last.readings],
                    ['Raised', last.alarms_raised],
                    ['Resolved', last.alarms_resolved],
                    ['Messages', last.messages],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l}>
                    <div className="num text-xl font-bold">{v ?? 0}</div>
                    <div className="text-[11px] font-semibold text-muted uppercase">{l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Scenarios" subtitle="Applies faults to specific monitors and simulates one minute" />
          <div className="@container">
          <div className="grid gap-3 p-5 @lg:grid-cols-2">
            {scenarios.map((s) => {
              const active = state.scenario === s.id
              return (
                <button
                  key={s.id}
                  disabled={busy}
                  onClick={() => scenario.mutate(s.id)}
                  className={cx(
                    'flex gap-3 rounded-xl border p-3.5 text-left transition disabled:cursor-wait',
                    active ? 'border-navy-900 bg-navy-900 text-white' : 'border-line hover:border-navy-200 hover:bg-soft',
                  )}
                >
                  <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg', active ? 'bg-white/15' : 'bg-navy-50 text-navy-600')}>{SCENARIO_ICONS[s.id]}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {s.label} {active && <Badge tone="ok">Active</Badge>}
                    </span>
                    <span className={cx('mt-0.5 block text-[12.5px]', active ? 'text-navy-100' : 'text-muted')}>{s.description}</span>
                    {s.monitors.length > 0 && <span className={cx('mt-1 block font-mono text-[11px]', active ? 'text-navy-200' : 'text-faint')}>{s.monitors.join(' · ')}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Monitors and fault injection" subtitle="Inject a fault on one monitor. It takes effect immediately and changes vitals, alarms and the 3D ward." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3">Monitor</th>
                <th className="px-3 py-3">Bed</th>
                <th className="px-3 py-3">State</th>
                <th className="px-3 py-3">Battery</th>
                <th className="px-3 py-3">Active fault</th>
                <th className="px-3 py-3">Inject</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {monitors.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-3 font-semibold">{m.serial}</td>
                  <td className="px-3 py-3">{m.bed ?? <span className="text-muted">{m.status === 'maintenance' ? 'In maintenance' : 'Docked'}</span>}</td>
                  <td className="px-3 py-3">
                    {m.status !== 'in_use' ? (
                      <span className="text-muted">—</span>
                    ) : m.connection === 'lost' ? (
                      <Badge tone="crit">Offline</Badge>
                    ) : m.sensor_status !== 'ok' ? (
                      <Badge tone="warn">{SENSOR_LABELS[m.sensor_status as keyof typeof SENSOR_LABELS]}</Badge>
                    ) : (
                      <Badge tone="ok">Online</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <BatteryIndicator pct={m.battery_pct} docked={m.status === 'available'} />
                  </td>
                  <td className="px-3 py-3">{m.fault === 'none' ? <span className="text-muted">None</span> : <Badge tone="violet">{FAULT_LABELS[m.fault]}</Badge>}</td>
                  <td className="px-3 py-3">
                    <Select
                      value={m.fault}
                      disabled={m.status !== 'in_use' || busy}
                      onChange={(e) => fault.mutate({ id: m.id, f: e.target.value as Fault })}
                      className="h-9 w-48"
                      aria-label={`Fault for ${m.serial}`}
                    >
                      {faults.map((f) => (
                        <option key={f} value={f}>
                          {f === 'none' ? 'Clear faults' : FAULT_LABELS[f]}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <EventInspector />
        <IntegrationOutbox />
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
        loading={reset.isPending}
        title="Reset all demo data?"
        description="Patients, monitors, alarms, notes, maintenance records, reports and events go back to their initial state, with two hours of fresh history. User accounts are kept."
        confirmLabel="Reset demo data"
        tone="danger"
      />
    </div>
  )
}

function EventInspector() {
  const [kind, setKind] = useState('')
  const [severity, setSeverity] = useState('')
  const q = useInfiniteQuery({
    queryKey: ['events', kind, severity],
    queryFn: ({ pageParam }) => simulationService.events({ kind: kind || undefined, severity: severity || undefined, limit: 50, before_id: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage: EventRow[]) => (lastPage.length === 50 ? lastPage[lastPage.length - 1].id : undefined),
  })
  const rows = q.data?.pages.flat() ?? []
  const tone = { critical: 'crit', warning: 'warn', info: 'neutral' } as const
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title="Event inspector"
        subtitle="Simulation output and staff actions, newest first"
        actions={
          <div className="flex gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-auto" aria-label="Event type">
              {EVENT_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-9 w-auto" aria-label="Severity">
              <option value="">Any severity</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </Select>
          </div>
        }
      />
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-2 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !rows.length ? (
        <EmptyState title="No events" />
      ) : (
        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {rows.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="num w-24 px-5 py-2.5 text-[12px] whitespace-nowrap text-muted">
                    {fmtTimeSec(e.occurred_at)}
                    <div className="text-[11px] text-faint">tick {e.tick ?? '—'}</div>
                  </td>
                  <td className="w-44 px-2 py-2.5">
                    <Badge tone={tone[e.severity]}>{e.kind}</Badge>
                  </td>
                  <td className="px-3 py-2.5 pr-5 text-[13px]">
                    {e.message}
                    {e.actor && <div className="text-[11.5px] text-muted">by {e.actor.full_name}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.hasNextPage && (
            <div className="p-3 text-center">
              <Button variant="ghost" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                Load older events
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function IntegrationOutbox() {
  const [channel, setChannel] = useState<'' | 'pager' | 'email' | 'ehr'>('')
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['integrations', channel], queryFn: () => simulationService.integrations(channel || undefined) })
  const icons = { pager: <Radio className="size-4" />, email: <Mail className="size-4" />, ehr: <HeartPulse className="size-4" /> }
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader title="Simulated integrations" subtitle="Pager, email and EHR messages. Nothing leaves the system." />
      <div className="px-5 pt-2">
        <Tabs
          value={channel}
          onChange={setChannel}
          items={[
            { value: '', label: 'All' },
            { value: 'pager', label: 'Pager' },
            { value: 'email', label: 'Email' },
            { value: 'ehr', label: 'EHR' },
          ]}
        />
      </div>
      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-2 p-5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : !data?.length ? (
        <EmptyState title="No messages yet" description="Critical alarms page the nurse; unacknowledged ones escalate to the physician." />
      ) : (
        <ul className="max-h-[520px] divide-y divide-line overflow-y-auto">
          {data.map((m) => (
            <li key={m.id} className="flex gap-3 px-5 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-600">{icons[m.channel]}</span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{m.subject}</div>
                <div className="truncate text-[12px] text-muted">
                  To {m.recipient} · {fmtTimeSec(m.sim_time ?? m.created_at)} · <span className="text-ok">{m.status}</span>
                </div>
                {m.channel === 'ehr' && <pre className="mt-1 overflow-x-auto rounded bg-soft p-2 font-mono text-[10.5px] text-muted">{m.body}</pre>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
