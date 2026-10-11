import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { errorMessage } from '../lib/api'
import { supabase } from '../lib/supabase'
import { profileService } from '../services/admin'
import type { Profile } from '../types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileError: string | null
  recoveryMode: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  setProfile: (p: Profile) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(false)

  const loadProfile = useCallback(async () => {
    try {
      setProfileError(null)
      setProfile(await profileService.me())
    } catch (err) {
      setProfile(null)
      setProfileError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) await loadProfile()
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        queryClient.clear()
      }
      if (event === 'SIGNED_IN' && next) {
        // Defer to avoid calling Supabase inside its own auth callback.
        setTimeout(() => void loadProfile(), 0)
      }
    })
    const onUnauthorized = () => void supabase.auth.signOut()
    window.addEventListener('acme:unauthorized', onUnauthorized)
    return () => {
      active = false
      sub.subscription.unsubscribe()
      window.removeEventListener('acme:unauthorized', onUnauthorized)
    }
  }, [loadProfile, queryClient])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message)
      }
      await loadProfile()
    },
    [loadProfile],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setRecoveryMode(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, profile, loading, profileError, recoveryMode, signIn, signOut, refreshProfile: loadProfile, setProfile }),
    [session, profile, loading, profileError, recoveryMode, signIn, signOut, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** For screens rendered inside the authenticated shell, where a profile is guaranteed. */
export function useProfile(): Profile {
  const { profile } = useAuth()
  if (!profile) throw new Error('Profile not loaded')
  return profile
}
