import type { Role } from '../types'

/** Mirrors the API's permission rules so the UI only offers actions a role can perform. */
export const can = {
  viewPatients: (r: Role) => r === 'nurse' || r === 'physician' || r === 'admin',
  writeNotes: (r: Role) => r === 'nurse' || r === 'physician' || r === 'admin',
  editPatient: (r: Role) => r === 'physician' || r === 'admin',
  editPatientThresholds: (r: Role) => r === 'physician' || r === 'admin',
  editDefaultThresholds: (r: Role) => r === 'physician' || r === 'admin',
  acknowledge: (r: Role, category: 'clinical' | 'technical') =>
    r === 'nurse' || r === 'physician' || r === 'admin' || (r === 'biomed' && category === 'technical'),
  assignMonitors: (r: Role) => r === 'nurse' || r === 'biomed' || r === 'admin',
  manageDevices: (r: Role) => r === 'biomed' || r === 'admin',
  replaceBattery: (r: Role) => r === 'biomed' || r === 'admin' || r === 'nurse',
  runSimulation: (r: Role) => r === 'admin' || r === 'biomed',
  resetDemo: (r: Role) => r === 'admin',
  manageTeam: (r: Role) => r === 'admin',
  editSystemSettings: (r: Role) => r === 'admin',
}
