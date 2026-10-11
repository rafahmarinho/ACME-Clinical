import { api } from '../lib/api'
import type {
  AdvanceResult,
  EventRow,
  Fault,
  IntegrationMessage,
  Preferences,
  Profile,
  Report,
  Role,
  SimState,
  SimulationOverview,
  SystemSettings,
} from '../types'

export const profileService = {
  me: () => api.get<Profile>('/me'),
  update: (values: { full_name?: string; title?: string | null; phone?: string | null; preferences?: Partial<Preferences> }) =>
    api.patch<Profile>('/me', values),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.upload<Profile>('/me/avatar', form)
  },
}

export const teamService = {
  list: () => api.get<Profile[]>('/team'),
  invite: (values: { email: string; full_name: string; role: Role; title?: string | null }) =>
    api.post<{ member: Profile; temporary_password: string }>('/team', values),
  update: (id: string, values: { role?: Role; is_active?: boolean; title?: string | null }) => api.patch<Profile>(`/team/${id}`, values),
}

export const settingsService = {
  get: () => api.get<SystemSettings>('/settings'),
  save: (values: Partial<SystemSettings>) => api.put<SystemSettings>('/settings', values),
}

export interface ReportInput {
  kind: Report['kind']
  format: 'pdf' | 'csv'
  hours: number
  patient_id?: string | null
  ward_id?: string | null
}

export const reportsService = {
  list: () => api.get<{ reports: Report[]; allowed_kinds: Report['kind'][] }>('/reports'),
  get: (id: string) => api.get<Report>(`/reports/${id}`),
  generate: (input: ReportInput) => api.post<Report>('/reports', input),
  download: (id: string) => api.get<{ url: string; expires_in: number }>(`/reports/${id}/download`),
  email: (id: string, recipient: string) => api.post<{ ok: boolean }>(`/reports/${id}/email`, { recipient }),
}

export const simulationService = {
  overview: () => api.get<SimulationOverview>('/simulation'),
  state: () => api.get<SimState>('/simulation/state'),
  advance: (ticks: number) => api.post<AdvanceResult>('/simulation/advance', { ticks }),
  tick: () => api.post<AdvanceResult>('/simulation/tick'),
  setAutoRun: (auto_run: boolean) => api.patch<SimState>('/simulation/auto-run', { auto_run }),
  scenario: (scenario: string) => api.post<AdvanceResult>('/simulation/scenario', { scenario }),
  fault: (monitorId: string, fault: Fault) => api.post<AdvanceResult>(`/simulation/monitors/${monitorId}/fault`, { fault }),
  reset: () => api.post<{ tick: number; patients: number; monitors: number; readings: number }>('/simulation/reset'),
  events: (filters: { kind?: string; severity?: string; limit?: number; before_id?: number }) =>
    api.get<EventRow[]>('/simulation/events', filters),
  integrations: (channel?: string) => api.get<IntegrationMessage[]>('/simulation/integrations', { channel }),
}
