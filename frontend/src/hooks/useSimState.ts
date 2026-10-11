import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { simulationService } from '../services/admin'

export function useSimState(realtimeLive = true) {
  return useQuery({
    queryKey: ['sim-state'],
    queryFn: simulationService.state,
    // Realtime normally pushes updates; poll as a fallback when the socket is down.
    refetchInterval: realtimeLive ? 30_000 : 5_000,
  })
}

/**
 * While auto-run is on, every open browser asks the API to advance the simulation.
 * The API rate-limits ticks, so several open tabs do not speed it up.
 */
export function useAutoTick(autoRun: boolean | undefined, intervalMs = 5000) {
  const queryClient = useQueryClient()
  const busy = useRef(false)
  useEffect(() => {
    if (!autoRun) return
    const id = window.setInterval(async () => {
      if (busy.current || document.hidden) return
      busy.current = true
      try {
        const res = await simulationService.tick()
        if (!res.skipped) void queryClient.invalidateQueries({ queryKey: ['sim-state'] })
      } catch {
        /* transient errors are ignored; the next tick retries */
      } finally {
        busy.current = false
      }
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [autoRun, intervalMs, queryClient])
}

export function useToggleAutoRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (on: boolean) => simulationService.setAutoRun(on),
    onSuccess: (state) => queryClient.setQueryData(['sim-state'], state),
  })
}
