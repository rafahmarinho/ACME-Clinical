import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import { AppShell } from './components/layout/AppShell'
import { Button, ErrorState, PageLoader } from './components/ui/primitives'
import { isSupabaseConfigured } from './lib/supabase'
import { ForgotPasswordScreen } from './screens/auth/ForgotPasswordScreen'
import { LoginScreen } from './screens/auth/LoginScreen'
import { ResetPasswordScreen } from './screens/auth/ResetPasswordScreen'

const OverviewScreen = lazy(() => import('./screens/OverviewScreen'))
const PatientListScreen = lazy(() => import('./screens/patients/PatientListScreen'))
const PatientDetailScreen = lazy(() => import('./screens/patients/PatientDetailScreen'))
const LiveMonitoringScreen = lazy(() => import('./screens/monitoring/LiveMonitoringScreen'))
const MonitorDetailScreen = lazy(() => import('./screens/monitoring/MonitorDetailScreen'))
const AlarmsScreen = lazy(() => import('./screens/AlarmsScreen'))
const DeviceListScreen = lazy(() => import('./screens/devices/DeviceListScreen'))
const DeviceDetailScreen = lazy(() => import('./screens/devices/DeviceDetailScreen'))
const MaintenanceScreen = lazy(() => import('./screens/MaintenanceScreen'))
const ThresholdsScreen = lazy(() => import('./screens/ThresholdsScreen'))
const ReportsScreen = lazy(() => import('./screens/ReportsScreen'))
const TeamScreen = lazy(() => import('./screens/TeamScreen'))
const SimulationScreen = lazy(() => import('./screens/SimulationScreen'))
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'))
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'))
const NotFoundScreen = lazy(() => import('./screens/NotFoundScreen'))

function RequireAuth() {
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader label="Starting ACME Clinical…" />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile) {
    if (!profileError) return <PageLoader label="Loading your profile…" />
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="card w-full max-w-lg">
          <ErrorState message={profileError} onRetry={() => void refreshProfile()} />
          <div className="flex justify-center pb-8">
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    )
  }
  return <AppShell />
}

export function App() {
  const { recoveryMode } = useAuth()
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="card max-w-lg p-8">
          <h1 className="text-xl font-bold">Configuration required</h1>
          <p className="mt-2 text-sm text-muted">
            Set <code className="rounded bg-soft px-1">VITE_SUPABASE_URL</code>, <code className="rounded bg-soft px-1">VITE_SUPABASE_ANON_KEY</code> and{' '}
            <code className="rounded bg-soft px-1">VITE_API_URL</code> in <code className="rounded bg-soft px-1">frontend/.env.local</code> (or in your Vercel project), then restart.
          </p>
        </div>
      </div>
    )
  }
  if (recoveryMode) return <ResetPasswordScreen />
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
        <Route path="/reset-password" element={<ResetPasswordScreen />} />
        <Route element={<RequireAuth />}>
          <Route index element={<OverviewScreen />} />
          <Route path="patients" element={<PatientListScreen />} />
          <Route path="patients/:id" element={<PatientDetailScreen />} />
          <Route path="monitoring" element={<LiveMonitoringScreen />} />
          <Route path="monitoring/:id" element={<MonitorDetailScreen />} />
          <Route path="alarms" element={<AlarmsScreen />} />
          <Route path="devices" element={<DeviceListScreen />} />
          <Route path="devices/:id" element={<DeviceDetailScreen />} />
          <Route path="maintenance" element={<MaintenanceScreen />} />
          <Route path="thresholds" element={<ThresholdsScreen />} />
          <Route path="reports" element={<ReportsScreen />} />
          <Route path="team" element={<TeamScreen />} />
          <Route path="simulation" element={<SimulationScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
