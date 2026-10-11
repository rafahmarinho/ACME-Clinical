import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useProfile } from '../auth/AuthProvider'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, SkeletonRows } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { can } from '../config/permissions'
import { errorMessage } from '../lib/api'
import { fmtDateTime, PARAM_META } from '../lib/format'
import { thresholdsService } from '../services/clinical'
import type { Threshold } from '../types'

const KEYS = ['crit_low', 'warn_low', 'warn_high', 'crit_high'] as const

export default function ThresholdsScreen() {
  const profile = useProfile()
  const toast = useToast()
  const queryClient = useQueryClient()
  const editable = can.editDefaultThresholds(profile.role)
  const defaults = useQuery({ queryKey: ['thresholds', 'defaults'], queryFn: thresholdsService.defaults })
  const overrides = useQuery({ queryKey: ['thresholds', 'overrides'], queryFn: thresholdsService.overrides })
  const [rows, setRows] = useState<Threshold[]>([])
  const [edited, setEdited] = useState(false)
  const source = JSON.stringify(defaults.data ?? [])
  useEffect(() => {
    if (!edited) setRows(JSON.parse(source))
  }, [source, edited])

  const save = useMutation({
    mutationFn: () => thresholdsService.saveDefaults(rows),
    onSuccess: (data) => {
      queryClient.setQueryData(['thresholds', 'defaults'], data)
      setEdited(false)
      toast.success('Ward default alarm limits saved', 'They apply immediately to every patient without patient-specific limits.')
    },
    onError: (e) => toast.error('Could not save the limits', errorMessage(e)),
  })
  const set = (i: number, key: (typeof KEYS)[number] | 'enabled', value: string | boolean) => {
    setEdited(true)
    setRows((all) => all.map((r, j) => (j === i ? { ...r, [key]: typeof value === 'boolean' ? value : value === '' ? null : Number(value) } : r)))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alarm thresholds"
        subtitle="Ward defaults apply to every monitored patient. Physicians can set patient-specific limits from the patient chart."
      />
      <Card>
        <CardHeader
          title="Ward default limits"
          icon={<SlidersHorizontal className="size-4" />}
          subtitle={editable ? 'Changes take effect from the next simulated minute.' : 'Read only for your role.'}
          actions={
            editable && (
              <Button icon={<Save className="size-4" />} disabled={!edited} loading={save.isPending} onClick={() => save.mutate()}>
                Save defaults
              </Button>
            )
          }
        />
        {defaults.isError ? (
          <ErrorState message={errorMessage(defaults.error)} onRetry={() => void defaults.refetch()} />
        ) : defaults.isLoading ? (
          <SkeletonRows rows={5} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3">Parameter</th>
                  <th className="px-3 py-3">Critical low</th>
                  <th className="px-3 py-3">Warning low</th>
                  <th className="px-3 py-3">Warning high</th>
                  <th className="px-3 py-3">Critical high</th>
                  <th className="px-3 py-3">Enabled</th>
                  <th className="px-3 py-3">Last change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((t, i) => (
                  <tr key={t.parameter}>
                    <td className="px-5 py-3">
                      <div className="font-semibold" style={{ color: PARAM_META[t.parameter].color }}>
                        {PARAM_META[t.parameter].label}
                      </div>
                      <div className="text-[12px] text-muted">{PARAM_META[t.parameter].unit}</div>
                    </td>
                    {KEYS.map((k) => (
                      <td key={k} className="px-3 py-3">
                        <Input type="number" className="num h-9 w-24" value={t[k] ?? ''} disabled={!editable} onChange={(e) => set(i, k, e.target.value)} aria-label={`${t.parameter} ${k}`} />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <input type="checkbox" className="size-4 accent-navy-900" checked={t.enabled} disabled={!editable} onChange={(e) => set(i, 'enabled', e.target.checked)} aria-label={`${t.parameter} enabled`} />
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-muted">
                      {t.updated_by_user ? `${t.updated_by_user.full_name} · ${fmtDateTime(t.updated_at)}` : 'Default configuration'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Patient-specific limits" subtitle="Overrides set by physicians for individual patients" />
        {overrides.isError ? (
          <ErrorState message={errorMessage(overrides.error)} onRetry={() => void overrides.refetch()} />
        ) : overrides.isLoading ? (
          <SkeletonRows rows={3} />
        ) : !overrides.data?.length ? (
          <EmptyState title="No patient-specific limits" description="All patients use the ward defaults." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3">Patient</th>
                  <th className="px-3 py-3">Parameter</th>
                  <th className="px-3 py-3">Warning range</th>
                  <th className="px-3 py-3">Critical range</th>
                  <th className="px-3 py-3">Set by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {overrides.data.map((t) => (
                  <tr key={`${t.patient?.id}-${t.parameter}`}>
                    <td className="px-5 py-3">
                      {t.patient?.id ? (
                        <Link to={`/patients/${t.patient.id}`} className="font-semibold text-navy-600 hover:underline">
                          {t.patient.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                      <div className="text-[12px] text-muted">{t.bed?.display}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone="info">{PARAM_META[t.parameter].short}</Badge>
                    </td>
                    <td className="num px-3 py-3">
                      {t.warn_low ?? '–'} – {t.warn_high ?? '–'} {PARAM_META[t.parameter].unit}
                    </td>
                    <td className="num px-3 py-3">
                      {t.crit_low ?? '–'} – {t.crit_high ?? '–'} {PARAM_META[t.parameter].unit}
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-muted">{t.updated_by_user?.full_name ?? '—'}</td>
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
