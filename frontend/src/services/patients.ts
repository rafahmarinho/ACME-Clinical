import { api } from '../lib/api'
import type { Alarm, Note, PatientDetail, PatientRow, ReadingsResponse, Threshold } from '../types'

export interface PatientFilters {
  q?: string
  ward_id?: string
  acuity?: number | ''
  monitored?: 'yes' | 'no' | ''
  alarm?: 'any' | 'critical' | 'warning' | ''
  sort?: 'name' | 'bed' | 'acuity' | 'alarms'
}

export const patientsService = {
  list: (filters: PatientFilters) => api.get<PatientRow[]>('/patients', { ...filters }),
  get: (id: string) => api.get<PatientDetail>(`/patients/${id}`),
  update: (id: string, values: Partial<Pick<PatientDetail, 'diagnosis' | 'acuity' | 'code_status' | 'isolation' | 'allergies'>>) =>
    api.patch<PatientDetail>(`/patients/${id}`, values),
  readings: (id: string, hours: number) => api.get<ReadingsResponse>(`/patients/${id}/readings`, { hours }),
  alarms: (id: string) => api.get<Alarm[]>(`/patients/${id}/alarms`),
  notes: (id: string) => api.get<Note[]>(`/patients/${id}/notes`),
  addNote: (id: string, category: Note['category'], body: string) => api.post<Note>(`/patients/${id}/notes`, { category, body }),
  thresholds: (id: string) => api.get<Threshold[]>(`/patients/${id}/thresholds`),
  saveThresholds: (id: string, thresholds: Threshold[]) =>
    api.put<Threshold[]>(`/patients/${id}/thresholds`, {
      thresholds: thresholds.map(({ parameter, warn_low, warn_high, crit_low, crit_high, enabled }) => ({
        parameter,
        warn_low,
        warn_high,
        crit_low,
        crit_high,
        enabled,
      })),
    }),
  resetThreshold: (id: string, parameter: string) => api.del<Threshold[]>(`/patients/${id}/thresholds/${parameter}`),
}
