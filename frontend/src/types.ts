export type Role = 'nurse' | 'physician' | 'biomed' | 'admin'
export type Severity = 'critical' | 'warning' | 'advisory'
export type AlarmState = 'active' | 'acknowledged' | 'resolved'
export type Parameter = 'hr' | 'spo2' | 'rr' | 'sys' | 'dia'
export type Fault = 'none' | 'desaturation' | 'low_battery' | 'sensor' | 'disconnect'

export interface Preferences {
  alarm_sound: boolean
  auto_advance: boolean
  default_ward: string | null
  density: 'comfortable' | 'compact'
  temperature_unit: 'C' | 'F'
  show_waveforms: boolean
  notify_critical: boolean
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  title: string | null
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  preferences: Preferences
  created_at: string
  last_sign_in_at?: string | null
}

export interface Person {
  id: string
  full_name: string
  role: Role
  title: string | null
  avatar_url: string | null
}

export interface BedRef {
  id: string
  label: string
  ward_id: string
  ward_code: string
  ward_name: string
  display: string
}

export interface PatientBrief {
  id: string | null
  name: string
  initials: string
  mrn: string | null
  age?: number | null
  sex?: string
  acuity?: number
  diagnosis?: string
  code_status?: string
  isolation?: string | null
}

export interface Vitals {
  hr: number | null
  spo2: number | null
  rr: number | null
  sys: number | null
  dia: number | null
  map: number | null
  ts?: string
}

export interface AlarmSummary {
  count: number
  unacknowledged: number
  highest: Severity | null
}

export interface MonitorLive {
  id: string
  serial: string
  model: string
  asset_tag: string
  firmware: string
  status: 'available' | 'in_use' | 'maintenance'
  connection: 'connected' | 'lost'
  sensor_status: 'ok' | 'spo2_probe_off' | 'ecg_leads_off'
  battery_pct: number
  signal_quality: number
  fault: Fault
  last_seen_at: string | null
  last_service_at: string | null
  next_service_due: string | null
  bed: BedRef | null
  vitals: Vitals
}

export interface Alarm {
  id: string
  monitor_id: string | null
  patient_id: string | null
  bed_id: string | null
  type: string
  category: 'clinical' | 'technical'
  severity: Severity
  parameter: Parameter | null
  message: string
  value: number | null
  limit_value: number | null
  condition_active: boolean
  started_at: string
  last_seen_at: string
  resolved_at: string | null
  resolution: string | null
  acknowledged_at: string | null
  acknowledged_by: string | null
  ack_note: string | null
  escalated_at: string | null
  state: AlarmState
  patient: PatientBrief | null
  bed: BedRef | null
  monitor: { id: string; serial: string; model: string } | null
  acknowledged_by_user: Person | null
}

export interface LiveMonitor extends MonitorLive {
  patient: PatientBrief | null
  alarms: AlarmSummary
  open_alarms: Alarm[]
}

export interface OverviewBed extends BedRef {
  position_x: number
  position_z: number
  occupied: boolean
  patient: PatientBrief | null
  monitor: MonitorLive | null
  alarms: AlarmSummary
  top_alarm: { id: string; message: string; severity: Severity; acknowledged: boolean } | null
}

export interface SimState {
  id: number
  tick: number
  sim_time: string
  scenario: string
  auto_run: boolean
  tick_seconds: number
  seed: number
  last_tick_at: string | null
}

export interface EventRow {
  id: number
  occurred_at: string
  tick: number | null
  kind: string
  severity: 'info' | 'warning' | 'critical'
  entity_type: string | null
  entity_id: string | null
  message: string
  actor_id: string | null
  actor?: Person | null
  data: Record<string, unknown>
  created_at: string
}

export interface Overview {
  sim: SimState
  kpis: {
    patients: number
    beds_total: number
    beds_free: number
    monitored: number
    open_alarms: number
    unacknowledged: number
    critical: number
    warning: number
    devices_total: number
    devices_offline: number
    devices_low_battery: number
    devices_sensor_issue: number
    devices_available: number
    devices_maintenance: number
  }
  wards: { id: string; code: string; name: string; floor: string | null; beds: OverviewBed[] }[]
  recent_events: EventRow[]
}

export interface Threshold {
  parameter: Parameter
  warn_low: number | null
  warn_high: number | null
  crit_low: number | null
  crit_high: number | null
  enabled: boolean
  source?: 'patient' | 'default'
  updated_at?: string | null
  label?: string
  unit?: string
  updated_by_user?: Person | null
  patient?: PatientBrief | null
  bed?: BedRef | null
}

export interface PatientRow {
  id: string
  mrn: string
  first_name: string
  last_name: string
  name: string
  sex: string
  age: number | null
  date_of_birth: string
  diagnosis: string
  acuity: number
  allergies: string[]
  code_status: string
  isolation: string | null
  status: string
  admitted_at: string
  bed: BedRef | null
  attending: Person | null
  primary_nurse: Person | null
  monitor: MonitorLive | null
  alarms: AlarmSummary
}

export interface PatientDetail extends PatientRow {
  baseline: Partial<Record<Parameter, number>>
  thresholds: Threshold[]
  open_alarms: Alarm[]
}

export interface ReadingPoint {
  t: string
  hr: number | null
  spo2: number | null
  rr: number | null
  sys: number | null
  dia: number | null
  map: number | null
}

export interface ReadingsResponse {
  since: string
  until: string
  points: ReadingPoint[]
  stats: Record<Parameter, { min: number; max: number; avg: number } | null>
  count: number
}

export interface Note {
  id: string
  patient_id: string
  author_id: string | null
  author: Person | null
  category: 'general' | 'assessment' | 'medication' | 'handoff' | 'alarm'
  body: string
  created_at: string
}

export interface MaintenanceRecord {
  id: string
  monitor_id: string
  kind: 'preventive' | 'repair' | 'battery_replacement' | 'calibration' | 'inspection'
  kind_label?: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  title: string
  details: string | null
  resolution: string | null
  scheduled_for: string | null
  completed_at: string | null
  technician: Person | null
  created_at: string
  overdue?: boolean
  monitor?: { id: string; serial: string; model: string; status: string }
}

export interface DeviceRow extends MonitorLive {
  patient: PatientBrief | null
  alarms: AlarmSummary
  open_work_orders: number
  service_overdue: boolean
}

export interface DeviceDetail extends DeviceRow {
  assignments: {
    id: string
    assigned_at: string
    unassigned_at: string | null
    bed: BedRef | null
    patient: PatientBrief | null
    assigned_by_user: Person | null
    unassigned_by_user: Person | null
  }[]
  maintenance: MaintenanceRecord[]
  recent_alarms: Alarm[]
}

export interface AvailableBed {
  bed: BedRef
  patient: PatientBrief
}

export interface Report {
  id: string
  kind: 'shift_summary' | 'patient_summary' | 'device_status' | 'alarm_log'
  title: string
  format: 'pdf' | 'csv'
  params: { hours: number; patient_id?: string | null; ward_id?: string | null }
  summary?: Record<string, any>
  kpis?: Record<string, number | null>
  file_path: string | null
  file_size: number | null
  created_at: string
  created_by_user: Person | null
}

export interface Scenario {
  id: string
  label: string
  description: string
  monitors: string[]
}

export interface SimulationOverview {
  state: SimState
  scenarios: Scenario[]
  faults: Fault[]
  monitors: {
    id: string
    serial: string
    status: string
    connection: string
    sensor_status: string
    battery_pct: number
    fault: Fault
    bed: string | null
  }[]
}

export interface AdvanceResult {
  skipped?: boolean
  reason?: string
  ticks?: number
  tick: number
  sim_time: string
  readings?: number
  alarms_raised?: number
  alarms_resolved?: number
  events?: number
  messages?: number
}

export interface IntegrationMessage {
  id: number
  channel: 'pager' | 'email' | 'ehr'
  recipient: string
  subject: string
  body: string
  status: string
  sim_time: string | null
  created_at: string
}

export interface SystemSettings {
  hospital_name: string
  escalation_minutes: number
  ehr_sync_minutes: number
  battery_low_pct: number
  battery_critical_pct: number
  integrations: { pager: boolean; email: boolean; ehr: boolean }
}

export interface Ward {
  id: string
  code: string
  name: string
  floor: string | null
}

export interface SearchResults {
  patients: { id: string; name: string; mrn: string; bed: string | null; diagnosis: string }[]
  monitors: { id: string; serial: string; asset_tag: string; model: string; status: string; bed: string | null }[]
  staff: { id: string; full_name: string; role: Role; title: string | null }[]
}

export interface Waveform {
  monitor_id: string
  fs: number
  start: number
  seconds: number
  online: boolean
  ecg?: number[]
  pleth?: number[]
  resp?: number[]
}
