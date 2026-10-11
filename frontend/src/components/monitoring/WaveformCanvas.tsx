import { useEffect, useRef } from 'react'
import { sampleAt } from './waveformStore'

interface Props {
  monitorId: string
  channel: 'ecg' | 'pleth' | 'resp'
  color: string
  height?: number
  /** Sweep speed in pixels per second (a bedside monitor sweeps at a fixed paper speed). */
  speed?: number
  range: [number, number]
  label?: string
  muted?: boolean
}

/** Canvas cannot use CSS variables, so resolve `var(--x)` to its computed value. */
function resolveColor(color: string): string {
  const m = color.match(/^var\((--[\w-]+)\)$/)
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#0b1f3a' : color
}

/**
 * Bedside-monitor style sweep: the trace is drawn left to right in real time
 * with a small erase gap ahead of the cursor.
 */
export function WaveformCanvas({ monitorId, channel, color, height = 64, speed = 45, range, label, muted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let width = 0
    let span = 5
    let lastX = -1
    const stroke = muted ? '#b6c2d2' : resolveColor(color)
    let raf = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      width = wrap.clientWidth
      span = Math.max(2, width / speed)
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      lastX = -1
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const [lo, hi] = range
    const pad = 4
    const y = (v: number) => height - pad - ((v - lo) / (hi - lo)) * (height - pad * 2)

    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (width <= 0) return
      const now = Date.now() / 1000
      const x = ((now % span) / span) * width
      if (lastX < 0) {
        lastX = x
        return
      }
      const segments: [number, number][] = x >= lastX ? [[lastX, x]] : [[lastX, width], [0, x]]
      ctx.lineWidth = 1.8
      ctx.lineJoin = 'round'
      ctx.strokeStyle = stroke
      for (const [from, to] of segments) {
        ctx.clearRect(from, 0, Math.min(14, width - from) + (to - from), height)
        ctx.beginPath()
        let started = false
        for (let px = Math.floor(from); px <= to; px++) {
          const t = now - ((x - px + (px > x ? width : 0)) / width) * span
          const v = sampleAt(monitorId, channel, t)
          if (v === null) {
            started = false
            continue
          }
          const py = y(v)
          if (!started) {
            ctx.moveTo(px, py)
            started = true
          } else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
      // Erase gap ahead of the cursor.
      ctx.clearRect(x + 1, 0, 12, height)
      lastX = x
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [monitorId, channel, color, height, speed, range, muted])

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      {label && <span className="absolute top-0 left-0 text-[10px] font-bold tracking-wider" style={{ color }}>{label}</span>}
      <canvas ref={canvasRef} className="block" aria-label={`${label ?? channel} waveform`} role="img" />
    </div>
  )
}
