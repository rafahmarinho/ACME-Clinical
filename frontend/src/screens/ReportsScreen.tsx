import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, FileBarChart2, FileSpreadsheet, FileText, Mail, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useProfile } from '../auth/AuthProvider'
import { Modal } from '../components/ui/Modal'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, Segmented, Select, SkeletonRows, Skeleton } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { can } from '../config/permissions'
import { errorMessage } from '../lib/api'
import { fmtBytes, fmtDateTime, titleCase } from '../lib/format'
import { reportsService, type ReportInput } from '../services/admin'
import { overviewService } from '../services/clinical'
import { patientsService } from '../services/patients'
import type { Report } from '../types'

const KIND_INFO: Record<Report['kind'], { label: string; description: string }> = {
  shift_summary: { label: 'Shift summary', description: 'Alarm load, response times and vital-sign ranges for every patient.' },
  patient_summary: { label: 'Patient vitals summary', description: 'Trends, hourly averages, alarms and notes for one patient.' },
  device_status: { label: 'Device status', description: 'Battery, connectivity, technical alarms and open work orders.' },
  alarm_log: { label: 'Alarm log', description: 'Every alarm in the period with acknowledgement and resolution times.' },
}

export default function ReportsScreen() {
  const profile = useProfile()
  const toast = useToast()
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['reports'], queryFn: reportsService.list })
  const allowed = list.data?.allowed_kinds ?? []
  const [form, setForm] = useState<ReportInput>({ kind: profile.role === 'biomed' ? 'device_status' : 'shift_summary', format: 'pdf', hours: 8, patient_id: null, ward_id: null })
  const [preview, setPreview] = useState<Report | null>(null)
  const patients = useQuery({ queryKey: ['patients', {}], queryFn: () => patientsService.list({}), enabled: can.viewPatients(profile.role) })
  const wards = useQuery({ queryKey: ['wards'], queryFn: overviewService.wards, staleTime: 300_000 })

  const generate = useMutation({
    mutationFn: () => reportsService.generate(form),
    onSuccess: (r) => {
      toast.success('Report ready', `${r.title} (${r.format.toUpperCase()})`)
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
      setPreview(r)
    },
    onError: (e) => toast.error('Could not generate the report', errorMessage(e)),
  })

  const download = async (r: Report) => {
    try {
      const { url } = await reportsService.download(r.id)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast.error('Download failed', errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate PDF or CSV reports from the simulated data. Files are stored securely and listed for your team." />
      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <Card className="h-fit">
          <CardHeader title="New report" icon={<Sparkles className="size-4" />} />
          <div className="space-y-4 p-5">
            {list.isLoading ? (
              <Skeleton className="h-60" />
            ) : (
              <>
                <div className="space-y-2">
                  {allowed.map((k) => (
                    <label key={k} className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${form.kind === k ? 'border-navy-500 bg-navy-50' : 'border-line hover:bg-soft'}`}>
                      <input type="radio" name="kind" className="mt-1 accent-navy-900" checked={form.kind === k} onChange={() => setForm({ ...form, kind: k })} />
                      <span>
                        <span className="block text-sm font-semibold">{KIND_INFO[k].label}</span>
                        <span className="block text-[12.5px] text-muted">{KIND_INFO[k].description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {form.kind === 'patient_summary' && (
                  <Field label="Patient">
                    <Select value={form.patient_id ?? ''} onChange={(e) => setForm({ ...form, patient_id: e.target.value || null })}>
                      <option value="">Choose a patient…</option>
                      {patients.data?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.bed?.display} — {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {form.kind === 'shift_summary' && (
                  <Field label="Ward">
                    <Select value={form.ward_id ?? ''} onChange={(e) => setForm({ ...form, ward_id: e.target.value || null })}>
                      <option value="">All wards</option>
                      {wards.data?.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Period" hint="Measured on the simulation clock">
                  <Segmented
                    value={form.hours}
                    onChange={(h) => setForm({ ...form, hours: h })}
                    items={[
                      { value: 1, label: '1 h' },
                      { value: 4, label: '4 h' },
                      { value: 8, label: '8 h' },
                      { value: 12, label: '12 h' },
                      { value: 24, label: '24 h' },
                    ]}
                  />
                </Field>
                <Field label="Format">
                  <Segmented
                    value={form.format}
                    onChange={(f) => setForm({ ...form, format: f })}
                    items={[
                      { value: 'pdf', label: 'PDF' },
                      { value: 'csv', label: 'CSV' },
                    ]}
                  />
                </Field>
                <Button className="w-full" size="lg" loading={generate.isPending} disabled={form.kind === 'patient_summary' && !form.patient_id} onClick={() => generate.mutate()} icon={<FileBarChart2 className="size-4" />}>
                  Generate report
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Generated reports" subtitle="Most recent first" />
          {list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
          ) : list.isLoading ? (
            <SkeletonRows />
          ) : !list.data?.reports.length ? (
            <EmptyState icon={<FileText className="size-6" />} title="No reports yet" description="Generate your first report with the form." />
          ) : (
            <ul className="divide-y divide-line">
              {list.data.reports.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
                    {r.format === 'pdf' ? <FileText className="size-5" /> : <FileSpreadsheet className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-muted">
                      <span>{fmtDateTime(r.created_at)}</span>
                      <span>{r.created_by_user?.full_name}</span>
                      <span>Last {r.params.hours} h</span>
                      <span>{fmtBytes(r.file_size)}</span>
                    </div>
                  </div>
                  <Badge tone="navy">{r.format.toUpperCase()}</Badge>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" icon={<Eye className="size-3.5" />} onClick={() => setPreview(r)}>
                      View
                    </Button>
                    <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => void download(r)}>
                      Download
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {preview && <ReportPreview report={preview} onClose={() => setPreview(null)} onDownload={() => void download(preview)} />}
    </div>
  )
}

function ReportPreview({ report, onClose, onDownload }: { report: Report; onClose: () => void; onDownload: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const full = useQuery({ queryKey: ['report', report.id], queryFn: () => reportsService.get(report.id) })
  const send = useMutation({
    mutationFn: () => reportsService.email(report.id, email.trim()),
    onSuccess: () => {
      toast.success('Report sent', `Delivered to ${email} through the simulated email gateway.`)
      setEmail('')
    },
    onError: (e) => toast.error('Could not send the report', errorMessage(e)),
  })
  const s = full.data?.summary
  const kpis = (s?.kpis ?? {}) as Record<string, number | null>
  const byType = (s?.alarms_by_type ?? []) as { label: string; count: number }[]
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={report.title}
      description={`Generated ${fmtDateTime(report.created_at)} · last ${report.params.hours} h`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button icon={<Download className="size-4" />} onClick={onDownload}>
            Download {report.format.toUpperCase()}
          </Button>
        </>
      }
    >
      {full.isLoading ? (
        <Skeleton className="h-64" />
      ) : full.isError ? (
        <ErrorState compact message={errorMessage(full.error)} onRetry={() => void full.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(kpis)
              .slice(0, 8)
              .map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line p-3">
                  <div className="label">{titleCase(k)}</div>
                  <div className="num mt-1 text-2xl font-bold">{v ?? '—'}</div>
                </div>
              ))}
          </div>
          {byType.length > 0 && (
            <div>
              <div className="label mb-2">Alarms by type</div>
              <ResponsiveContainer width="100%" height={Math.max(140, byType.length * 34)}>
                <BarChart data={byType} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid horizontal={false} stroke="#e8edf3" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1e4275" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {Array.isArray(s?.patients) && (
            <div className="overflow-x-auto">
              <div className="label mb-2">Patients</div>
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-2">Bed</th>
                    <th className="px-3 py-2">Patient</th>
                    <th className="px-3 py-2">HR avg</th>
                    <th className="px-3 py-2">SpO₂ min</th>
                    <th className="px-3 py-2">Alarms</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(s!.patients as any[]).map((p) => (
                    <tr key={p.patient}>
                      <td className="px-3 py-2 font-semibold">{p.bed}</td>
                      <td className="px-3 py-2">{p.patient}</td>
                      <td className="num px-3 py-2">{p.hr_avg ?? '—'}</td>
                      <td className="num px-3 py-2">{p.spo2_min ?? '—'}</td>
                      <td className="num px-3 py-2">{p.clinical_alarms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {Array.isArray(s?.devices) && (
            <div className="overflow-x-auto">
              <div className="label mb-2">Devices</div>
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-2">Serial</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Battery</th>
                    <th className="px-3 py-2">Tech. alarms</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(s!.devices as any[]).map((d) => (
                    <tr key={d.serial}>
                      <td className="px-3 py-2 font-semibold">{d.serial}</td>
                      <td className="px-3 py-2">{titleCase(d.status)}</td>
                      <td className="num px-3 py-2">{d.battery_pct}%</td>
                      <td className="num px-3 py-2">{d.technical_alarms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form
            className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-soft p-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) send.mutate()
              else toast.error('Enter a valid email address')
            }}
          >
            <div className="min-w-[220px] flex-1">
              <Field label="Share by email (simulated)">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="quality@hospital.org" />
              </Field>
            </div>
            <Button type="submit" variant="secondary" icon={<Mail className="size-4" />} loading={send.isPending}>
              Send
            </Button>
          </form>
        </div>
      )}
    </Modal>
  )
}
