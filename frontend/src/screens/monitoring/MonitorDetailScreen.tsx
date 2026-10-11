import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Cpu, UserRound, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useProfile } from '../../auth/AuthProvider'
import { AckDialog, AlarmRow } from '../../components/alarms/alarmUi'
import { TrendChart } from '../../components/monitoring/TrendChart'
import { alarmFor, BatteryIndicator, ConnectionIndicator, RANGES, SENSOR_LABELS, VitalValue } from '../../components/monitoring/vitals'
import { useWaveformFeed } from '../../components/monitoring/waveformStore'
import { WaveformCanvas } from '../../components/monitoring/WaveformCanvas'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageLoader, Skeleton } from '../../components/ui/primitives'
import { errorMessage } from '../../lib/api'
import { timeAgo } from '../../lib/format'
import { overviewService } from '../../services/clinical'
import { patientsService } from '../../services/patients'
import type { Alarm } from '../../types'

export default function MonitorDetailScreen() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const [ackAlarm, setAckAlarm] = useState<Alarm | null>(null)
  const live = useQuery({ queryKey: ['live'], queryFn: overviewService.live, refetchInterval: 15_000 })
  const m = live.data?.find((x) => x.id === id)
  useWaveformFeed(!!m && m.connection === 'connected', id, m ? `${m.vitals.hr}:${m.vitals.rr}:${m.sensor_status}` : undefined)
  const readings = useQuery({
    queryKey: ['readings', m?.patient?.id, 1],
    queryFn: () => patientsService.readings(m!.patient!.id!, 1),
    enabled: !!m?.patient?.id,
  })

  if (live.isLoading) return <PageLoader label="Connecting to monitor…" />
  if (live.isError) return <ErrorState message={errorMessage(live.error)} onRetry={() => void live.refetch()} />
  if (!m)
    return (
      <EmptyState
        title="This monitor is not assigned to a bed"
        description="It may have been unassigned or taken out of service."
        action={
          <Link to="/monitoring">
            <Button variant="secondary">Back to live monitoring</Button>
          </Link>
        }
      />
    )
  const offline = m.connection === 'lost'
  const v = m.vitals

  return (
    <div className="space-y-6">
      <div>
        <Link to="/monitoring" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:underline">
          <ArrowLeft className="size-4" /> Live monitoring
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-navy-900 px-2.5 py-1 text-lg font-bold whitespace-nowrap text-white">{m.bed?.display}</span>
            <div>
              <h1 className="text-[24px] leading-tight font-bold">{m.patient?.name}</h1>
              <div className="text-sm text-muted">
                {m.serial} · {m.model} · last data {timeAgo(m.last_seen_at)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ConnectionIndicator monitor={m} />
            <BatteryIndicator pct={m.battery_pct} />
            {m.sensor_status !== 'ok' && <Badge tone="warn">{SENSOR_LABELS[m.sensor_status]}</Badge>}
            {m.patient?.id && (
              <Link to={`/patients/${m.patient.id}`}>
                <Button variant="secondary" icon={<UserRound className="size-4" />}>
                  Patient chart
                </Button>
              </Link>
            )}
            {profile.role !== 'physician' && (
              <Link to={`/devices/${m.id}`}>
                <Button variant="secondary" icon={<Cpu className="size-4" />}>
                  Device
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        {offline ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <WifiOff className="size-12 text-crit" />
            <div className="text-lg font-semibold">No signal from {m.serial}</div>
            <div className="max-w-md text-sm text-muted">The central station stopped receiving data. Values are hidden until the connection returns. The alarm stays open until the monitor reconnects.</div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_280px]">
            <div className="space-y-3 p-5">
              <WaveformCanvas monitorId={m.id} channel="ecg" color="var(--color-hr)" range={RANGES.ecg} height={150} speed={110} label="ECG II · 25 mm/s" muted={m.sensor_status === 'ecg_leads_off'} />
              <WaveformCanvas monitorId={m.id} channel="pleth" color="var(--color-spo2)" range={RANGES.pleth} height={90} speed={110} label="PLETH" muted={m.sensor_status === 'spo2_probe_off'} />
              <WaveformCanvas monitorId={m.id} channel="resp" color="var(--color-rr)" range={RANGES.resp} height={70} speed={45} label="RESP" />
            </div>
            <div className="grid grid-cols-2 gap-1 border-t border-line p-3 lg:grid-cols-1 lg:border-t-0 lg:border-l">
              <VitalValue parameter="hr" value={v.hr} alarm={alarmFor(m.open_alarms, 'hr')} size="xl" unavailable={m.sensor_status === 'ecg_leads_off' ? 'Leads off' : undefined} />
              <VitalValue parameter="spo2" value={v.spo2} alarm={alarmFor(m.open_alarms, 'spo2')} size="xl" unavailable={m.sensor_status === 'spo2_probe_off' ? 'Probe off' : undefined} />
              <VitalValue parameter="rr" value={v.rr} alarm={alarmFor(m.open_alarms, 'rr')} size="lg" />
              <VitalValue parameter="bp" value={v.sys} secondary={v.dia} alarm={alarmFor(m.open_alarms, 'sys') ?? alarmFor(m.open_alarms, 'dia')} size="lg" />
            </div>
          </div>
        )}
      </Card>

      {m.open_alarms.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Open alarms on this monitor" />
          <div className="divide-y divide-line">
            {m.open_alarms.map((a) => (
              <AlarmRow key={a.id} alarm={a} onAcknowledge={setAckAlarm} showPatient={false} />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Last hour" subtitle="Heart rate, SpO₂ and respiratory rate" />
        <div className="p-4">
          {readings.isLoading ? (
            <Skeleton className="h-[220px]" />
          ) : readings.data?.points.length ? (
            <TrendChart points={readings.data.points} parameters={['hr', 'spo2', 'rr']} />
          ) : (
            <EmptyState title="No readings yet" />
          )}
        </div>
      </Card>
      <AckDialog alarm={ackAlarm} onClose={() => setAckAlarm(null)} />
    </div>
  )
}
