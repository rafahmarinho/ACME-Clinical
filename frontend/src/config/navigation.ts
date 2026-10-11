import {
  Activity,
  BellRing,
  Cpu,
  FileBarChart2,
  FlaskConical,
  LayoutDashboard,
  SlidersHorizontal,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
  badge?: 'alarms'
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Ward overview', icon: LayoutDashboard, roles: ['nurse', 'physician', 'biomed', 'admin'] },
  { to: '/patients', label: 'Patients', icon: UsersRound, roles: ['nurse', 'physician', 'admin'] },
  { to: '/monitoring', label: 'Live monitoring', icon: Activity, roles: ['nurse', 'physician', 'admin'] },
  { to: '/alarms', label: 'Alarms', icon: BellRing, roles: ['nurse', 'physician', 'biomed', 'admin'], badge: 'alarms' },
  { to: '/devices', label: 'Devices', icon: Cpu, roles: ['nurse', 'biomed', 'admin'] },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench, roles: ['biomed', 'admin'] },
  { to: '/thresholds', label: 'Alarm thresholds', icon: SlidersHorizontal, roles: ['physician', 'admin', 'nurse'] },
  { to: '/reports', label: 'Reports', icon: FileBarChart2, roles: ['nurse', 'physician', 'biomed', 'admin'] },
  { to: '/team', label: 'Team', icon: Users, roles: ['admin'] },
  { to: '/simulation', label: 'Simulation', icon: FlaskConical, roles: ['admin', 'biomed'] },
]

export const navFor = (role: Role) => NAV_ITEMS.filter((i) => i.roles.includes(role))

export const canAccess = (role: Role, path: string) => {
  const item = [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length).find((i) => (i.to === '/' ? path === '/' : path.startsWith(i.to)))
  return item ? item.roles.includes(role) : true
}
