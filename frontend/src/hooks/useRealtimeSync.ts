import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

/** Which cached queries become stale when a table changes. */
const TABLE_KEYS: Record<string, string[]> = {
  monitors: ['overview', 'live', 'devices', 'device', 'patients', 'patient', 'simulation'],
  alarms: ['alarms', 'alarm-summary', 'overview', 'live', 'patients', 'patient', 'devices', 'device'],
  events: ['events', 'overview'],
  sim_state: ['sim-state', 'simulation', 'overview', 'live', 'patients', 'patient', 'readings', 'alarms', 'alarm-summary'],
  patients: ['patients', 'patient', 'overview'],
  notes: ['notes'],
  maintenance_records: ['maintenance', 'device', 'devices'],
  thresholds: ['thresholds', 'patient'],
  reports: ['reports'],
  profiles: ['team', 'me'],
  integration_messages: ['integrations'],
}

/**
 * Subscribes to Supabase Realtime row changes and invalidates the matching
 * React Query caches (debounced), so every screen updates without reloading.
 */
export function useRealtimeSync(enabled: boolean): RealtimeStatus {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const pending = useRef(new Set<string>())
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const flush = () => {
      timer.current = null
      const keys = [...pending.current]
      pending.current.clear()
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] })
    }
    const channel = supabase.channel('acme-clinical-sync')
    for (const table of Object.keys(TABLE_KEYS)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        for (const key of TABLE_KEYS[table]) pending.current.add(key)
        if (timer.current === null) timer.current = window.setTimeout(flush, 350)
      })
    }
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') setStatus('live')
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline')
    })
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [enabled, queryClient])

  return status
}
