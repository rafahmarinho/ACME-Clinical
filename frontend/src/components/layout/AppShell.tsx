import { useQuery } from '@tanstack/react-query'
import { BellRing, ChevronDown, Clock, FastForward, LogOut, Menu, Pause, Play, Settings, UserCircle, X } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth, useProfile } from '../../auth/AuthProvider'
import { canAccess, navFor } from '../../config/navigation'
import { can } from '../../config/permissions'
import { useAlarmSound } from '../../hooks/useAlarmSound'
import { useRealtimeSync, type RealtimeStatus } from '../../hooks/useRealtimeSync'
import { useAutoTick, useSimState, useToggleAutoRun } from '../../hooks/useSimState'
import { errorMessage } from '../../lib/api'
import { cx, fmtTimeSec, ROLE_LABELS } from '../../lib/format'
import { simulationService } from '../../services/admin'
import { alarmsService } from '../../services/clinical'
import { Avatar, PageLoader } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { GlobalSearch } from './GlobalSearch'

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-9" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#0B1F3A" />
        <path d="M10 35h12l5-12 8 22 6-14 3 4h10" fill="none" stroke="#5EEAD4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-ink">ACME Clinical</div>
        <div className="text-[11px] font-medium text-muted">Ward monitoring</div>
      </div>
    </Link>
  )
}

export function AppShell() {
  const profile = useProfile()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const realtime = useRealtimeSync(true)
  const sim = useSimState(realtime === 'live')
  useAutoTick(sim.data?.auto_run)

  const summary = useQuery({ queryKey: ['alarm-summary'], queryFn: alarmsService.summary, refetchInterval: realtime === 'live' ? 30_000 : 8_000 })
  useAlarmSound(profile.preferences.alarm_sound, summary.data?.critical_unacknowledged ?? 0, summary.data?.unacknowledged ?? 0)

  useEffect(() => setMobileOpen(false), [location.pathname])

  if (!canAccess(profile.role, location.pathname)) return <Navigate to="/" replace />

  const nav = navFor(profile.role)
  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition',
                isActive ? 'bg-navy-900 text-white shadow-sm' : 'text-muted hover:bg-navy-50 hover:text-ink',
              )
            }
          >
            <item.icon className="size-[18px]" />
            <span className="flex-1">{item.label}</span>
            {item.badge === 'alarms' && (summary.data?.unacknowledged ?? 0) > 0 && (
              <span className={cx('num rounded-full px-1.5 py-px text-[11px] font-bold', (summary.data?.critical_unacknowledged ?? 0) > 0 ? 'bg-crit text-white' : 'bg-warn-soft text-warn')}>
                {summary.data?.unacknowledged}
              </span>
            )}
          </NavLink>
        ))}
      </div>
      <div className="border-t border-line p-4">
        <div className="rounded-lg bg-soft p-3 text-[12px] text-muted">
          <div className="font-semibold text-ink">Simulated environment</div>
          Fictional patients and devices. Not for clinical use.
        </div>
      </div>
    </nav>
  )

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/40" onClick={() => setMobileOpen(false)} />
          <aside className="animate-slide-up absolute inset-y-0 left-0 w-72 bg-white shadow-(--shadow-pop)">
            <button className="absolute top-4 right-3 p-1 text-muted" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
        <button className="rounded-md p-1.5 text-muted hover:bg-soft lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <div className="hidden flex-1 sm:block">
          <GlobalSearch />
        </div>
        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none sm:gap-3">
          <SimClock realtime={realtime} />
          <Link
            to="/alarms"
            className={cx(
              'relative flex size-10 items-center justify-center rounded-lg border transition',
              (summary.data?.critical_unacknowledged ?? 0) > 0
                ? cx('border-crit-line bg-crit-soft text-crit', profile.preferences.notify_critical && 'animate-pulse-crit')
                : 'border-line text-muted hover:bg-soft',
            )}
            aria-label={`${summary.data?.unacknowledged ?? 0} unacknowledged alarms`}
          >
            <BellRing className="size-[18px]" />
            {(summary.data?.unacknowledged ?? 0) > 0 && (
              <span className="num absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-crit px-1 text-center text-[11px] leading-5 font-bold text-white">{summary.data?.unacknowledged}</span>
            )}
          </Link>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

function SimClock({ realtime }: { realtime: RealtimeStatus }) {
  const profile = useProfile()
  const toast = useToast()
  const { data, isError } = useSimState(realtime === 'live')
  const toggle = useToggleAutoRun()
  const [advancing, setAdvancing] = useState(false)
  const statusDot = { live: 'bg-ok', connecting: 'bg-warn', offline: 'bg-crit' }[realtime]
  const statusLabel = { live: 'Live updates on', connecting: 'Connecting to live updates…', offline: 'Live updates unavailable — refreshing periodically' }[realtime]

  const step = async () => {
    setAdvancing(true)
    try {
      await simulationService.advance(1)
    } catch (err) {
      toast.error('Could not advance the simulation', errorMessage(err))
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-white py-1 pr-1 pl-3">
      <span className={cx('size-2 rounded-full', statusDot, realtime === 'live' && data?.auto_run && 'animate-pulse')} title={statusLabel} aria-label={statusLabel} />
      <div className="hidden items-center gap-1.5 pl-1 md:flex" title="Simulation clock">
        <Clock className="size-3.5 text-faint" />
        <span className="num text-[13px] font-semibold text-ink">{isError ? '—' : fmtTimeSec(data?.sim_time)}</span>
        {data?.scenario && data.scenario !== 'normal' && <span className="rounded bg-warn-soft px-1.5 py-px text-[10.5px] font-bold text-warn uppercase">{data.scenario.replace('_', ' ')}</span>}
      </div>
      <button
        onClick={() => data && toggle.mutate(!data.auto_run, { onError: (e) => toast.error('Could not change auto-run', errorMessage(e)) })}
        disabled={!data || toggle.isPending}
        className={cx('ml-1 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-semibold transition', data?.auto_run ? 'bg-ok-soft text-ok hover:bg-ok-line/40' : 'bg-soft text-muted hover:text-ink')}
        title={data?.auto_run ? 'Pause the simulation' : 'Run the simulation in real time (1 simulated minute every 5 s)'}
      >
        {data?.auto_run ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        <span className="hidden sm:inline">{data?.auto_run ? 'Live' : 'Paused'}</span>
      </button>
      {can.runSimulation(profile.role) && (
        <button onClick={step} disabled={advancing} className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-soft hover:text-ink disabled:opacity-50" title="Advance 1 simulated minute" aria-label="Advance 1 simulated minute">
          <FastForward className="size-4" />
        </button>
      )}
    </div>
  )
}

function UserMenu() {
  const profile = useProfile()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg py-1 pr-1.5 pl-1 hover:bg-soft" aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={profile.full_name} url={profile.avatar_url} size={34} />
        <div className="hidden text-left leading-tight xl:block">
          <div className="text-[13px] font-semibold text-ink">{profile.full_name}</div>
          <div className="text-[11.5px] text-muted">{ROLE_LABELS[profile.role]}</div>
        </div>
        <ChevronDown className="hidden size-4 text-faint xl:block" />
      </button>
      {open && (
        <div className="animate-fade-in absolute right-0 z-40 mt-2 w-60 rounded-xl border border-line bg-white py-1.5 shadow-(--shadow-pop)" role="menu">
          <div className="border-b border-line px-4 py-2.5">
            <div className="truncate text-sm font-semibold text-ink">{profile.full_name}</div>
            <div className="truncate text-[12.5px] text-muted">{profile.email}</div>
          </div>
          <MenuItem icon={<UserCircle className="size-4" />} label="Profile" onClick={() => { setOpen(false); navigate('/profile') }} />
          <MenuItem icon={<Settings className="size-4" />} label="Settings" onClick={() => { setOpen(false); navigate('/settings') }} />
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<LogOut className="size-4" />} label="Sign out" onClick={() => void signOut()} />
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-soft" role="menuitem">
      <span className="text-muted">{icon}</span>
      {label}
    </button>
  )
}
