import type { Role, Severity } from '../types'

export const ROLE_LABELS: Record<Role, string> = {
  nurse: 'Nurse',
  physician: 'Physician',
  biomed: 'Biomedical technician',
  admin: 'Administrator',
}

export const PARAM_META = {
  hr: { label: 'Heart rate', short: 'HR', unit: 'bpm', color: 'var(--color-hr)' },
  spo2: { label: 'Oxygen saturation', short: 'SpO₂', unit: '%', color: 'var(--color-spo2)' },
  rr: { label: 'Respiratory rate', short: 'RR', unit: '/min', color: 'var(--color-rr)' },
  sys: { label: 'Systolic BP', short: 'SYS', unit: 'mmHg', color: 'var(--color-bp)' },
  dia: { label: 'Diastolic BP', short: 'DIA', unit: 'mmHg', color: 'var(--color-bp)' },
} as const

export const ALARM_TYPE_LABELS: Record<string, string> = {
  hr_high: 'High heart rate',
  hr_low: 'Low heart rate',
  spo2_low: 'Low SpO₂',
  spo2_high: 'High SpO₂',
  rr_high: 'High respiratory rate',
  rr_low: 'Low respiratory rate',
  sys_high: 'High systolic BP',
  sys_low: 'Low systolic BP',
  dia_high: 'High diastolic BP',
  dia_low: 'Low diastolic BP',
  battery_low: 'Low battery',
  sensor_issue: 'Sensor issue',
  connection_lost: 'Connection lost',
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, advisory: 2 }

const dateTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const timeOnly = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
const timeSec = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const dateOnly = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

export const fmtDateTime = (v?: string | null) => (v ? dateTime.format(new Date(v)) : '—')
export const fmtTime = (v?: string | null) => (v ? timeOnly.format(new Date(v)) : '—')
export const fmtTimeSec = (v?: string | null) => (v ? timeSec.format(new Date(v)) : '—')
export const fmtDate = (v?: string | null) => (v ? dateOnly.format(new Date(v.length === 10 ? `${v}T12:00:00` : v)) : '—')

export function fmtDuration(fromIso: string, toIso: string): string {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000))
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  return `${h} h ${mins % 60} min`
}

export function timeAgo(iso: string | null | undefined, nowIso?: string): string {
  if (!iso) return '—'
  const now = nowIso ? new Date(nowIso).getTime() : Date.now()
  const s = Math.round((now - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export const fmtBytes = (n?: number | null) => (!n ? '—' : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export const initials = (name: string) =>
  name
    .replace(/^Dr\.\s*/, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
