import { api } from '../lib/api'
import type { Alarm, LiveMonitor, Overview, SearchResults, Threshold, Ward, Waveform } from '../types'

export interface AlarmFilters {
  status?: 'active' | 'acknowledged' | 'open' | 'resolved' | 'all'
  severity?: string
  category?: string
  ward_id?: string
  q?: string
  patient_id?: string
  monitor_id?: string
  limit?: number
}

export interface AlarmCounts {
  open: number
  unacknowledged: number
  critical: number
  warning: number
  critical_unacknowledged: number
  technical: number
  clinical: number
}

export const overviewService = {
  get: () => api.get<Overview>('/overview'),
  live: () => api.get<LiveMonitor[]>('/monitoring/live'),
  wards: () => api.get<Ward[]>('/wards'),
  search: (q: string, signal?: AbortSignal) => api.get<SearchResults>('/search', { q }, signal),
  waveforms: (start: number, seconds: number) => api.get<Record<string, Waveform>>('/monitoring/waveforms', { start, seconds }),
  waveform: (monitorId: string, start: number, seconds: number) =>
    api.get<Waveform>(`/monitors/${monitorId}/waveform`, { start, seconds }),
}

export const alarmsService = {
  list: (filters: AlarmFilters) => api.get<Alarm[]>('/alarms', { ...filters }),
  summary: () => api.get<AlarmCounts>('/alarms/summary'),
  acknowledge: (id: string, note?: string) => api.post<Alarm>(`/alarms/${id}/acknowledge`, { note: note || null }),
}

export const thresholdsService = {
  defaults: () => api.get<Threshold[]>('/thresholds/defaults'),
  saveDefaults: (items: Threshold[]) =>
    api.put<Threshold[]>('/thresholds/defaults', {
      thresholds: items.map(({ parameter, warn_low, warn_high, crit_low, crit_high, enabled }) => ({
        parameter,
        warn_low,
        warn_high,
        crit_low,
        crit_high,
        enabled,
      })),
    }),
  overrides: () => api.get<Threshold[]>('/thresholds/overrides'),
}
