import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { cx } from '../../lib/format'

type ToastTone = 'success' | 'error' | 'info' | 'warning'
interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

const ToastContext = createContext<((t: Omit<ToastItem, 'id'>) => void) | null>(null)

let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = (id: number) => setItems((all) => all.filter((t) => t.id !== id))
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++counter
    setItems((all) => [...all.slice(-3), { ...t, id }])
    window.setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4500)
  }, [])

  const icons = {
    success: <CheckCircle2 className="size-5 text-ok" />,
    error: <XCircle className="size-5 text-crit" />,
    info: <Info className="size-5 text-info" />,
    warning: <TriangleAlert className="size-5 text-warn" />,
  }
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx('animate-slide-up pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-(--shadow-pop)', t.tone === 'error' ? 'border-crit-line' : 'border-line')}
          >
            {icons[t.tone]}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              {t.description && <div className="mt-0.5 text-[13px] text-muted">{t.description}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-faint hover:text-ink" aria-label="Dismiss notification">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const push = useContext(ToastContext)
  if (!push) throw new Error('useToast must be used inside ToastProvider')
  return {
    success: (title: string, description?: string) => push({ tone: 'success', title, description }),
    error: (title: string, description?: string) => push({ tone: 'error', title, description }),
    info: (title: string, description?: string) => push({ tone: 'info', title, description }),
    warning: (title: string, description?: string) => push({ tone: 'warning', title, description }),
  }
}
