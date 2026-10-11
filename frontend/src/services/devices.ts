import { api } from '../lib/api'
import type { AvailableBed, DeviceDetail, DeviceRow, MaintenanceRecord } from '../types'

export interface DeviceFilters {
  q?: string
  status?: string
  connection?: string
  battery?: string
  issue?: string
}

export interface MaintenanceInput {
  monitor_id: string
  kind: MaintenanceRecord['kind']
  title: string
  details?: string | null
  scheduled_for?: string | null
  status?: MaintenanceRecord['status']
}

export const devicesService = {
  list: (filters: DeviceFilters) => api.get<DeviceRow[]>('/monitors', { ...filters }),
  get: (id: string) => api.get<DeviceDetail>(`/monitors/${id}`),
  availableBeds: () => api.get<AvailableBed[]>('/beds/available'),
  assign: (id: string, bedId: string) => api.post<DeviceDetail>(`/monitors/${id}/assign`, { bed_id: bedId }),
  unassign: (id: string) => api.post<DeviceDetail>(`/monitors/${id}/unassign`),
  maintenanceMode: (id: string, enabled: boolean) => api.post<DeviceDetail>(`/monitors/${id}/maintenance-mode`, { enabled }),
  replaceBattery: (id: string) => api.post<DeviceDetail>(`/monitors/${id}/replace-battery`),
}

export const maintenanceService = {
  list: (filters: { status?: string; monitor_id?: string; q?: string }) => api.get<MaintenanceRecord[]>('/maintenance', filters),
  create: (input: MaintenanceInput) => api.post<MaintenanceRecord>('/maintenance', input),
  update: (id: string, values: Partial<Pick<MaintenanceRecord, 'status' | 'resolution' | 'details' | 'scheduled_for'>>) =>
    api.patch<MaintenanceRecord>(`/maintenance/${id}`, values),
}
