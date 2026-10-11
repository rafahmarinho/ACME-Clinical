import { useEffect, useRef } from 'react'

let ctx: AudioContext | null = null

function beep(frequency: number, at: number, duration = 0.14) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.18, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + duration + 0.02)
}

/** IEC 60601-1-8 inspired tones: three fast high beeps (critical) or two slower ones (warning). */
function play(kind: 'critical' | 'warning') {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime + 0.02
    if (kind === 'critical') [0, 0.18, 0.36].forEach((d) => beep(988, t + d))
    else [0, 0.3].forEach((d) => beep(660, t + d, 0.2))
  } catch {
    /* audio not available */
  }
}

/** Plays a tone whenever the number of unacknowledged critical/warning alarms increases. */
export function useAlarmSound(enabled: boolean, criticalUnacked: number, totalUnacked: number) {
  const prev = useRef<{ c: number; t: number } | null>(null)
  useEffect(() => {
    const last = prev.current
    prev.current = { c: criticalUnacked, t: totalUnacked }
    if (!enabled || last === null) return
    if (criticalUnacked > last.c) play('critical')
    else if (totalUnacked > last.t) play('warning')
  }, [enabled, criticalUnacked, totalUnacked])
}
