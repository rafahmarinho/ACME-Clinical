import { useQuery } from '@tanstack/react-query'
import { Cpu, Search, User, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDebounce } from '../../hooks/useDebounce'
import { ROLE_LABELS } from '../../lib/format'
import { overviewService } from '../../services/clinical'
import { Spinner } from '../ui/primitives'

export function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const debounced = useDebounce(q.trim(), 250)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isFetching, isError } = useQuery({
    queryKey: ['search', debounced],
    queryFn: ({ signal }) => overviewService.search(debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 10_000,
  })

  useEffect(() => {
    const onClick = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const go = (path: string) => {
    setOpen(false)
    setQ('')
    navigate(path)
  }
  const total = data ? data.patients.length + data.monitors.length + data.staff.length : 0

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="Search patients, MRN, beds, monitors…"
        aria-label="Global search"
        className="h-10 w-full rounded-lg border border-line bg-soft pr-14 pl-9 text-sm placeholder:text-faint focus:border-navy-500 focus:bg-white focus:ring-3 focus:ring-navy-100 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-faint sm:block">Ctrl K</kbd>
      {open && debounced.length >= 2 && (
        <div className="animate-fade-in absolute top-12 right-0 left-0 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-white py-2 shadow-(--shadow-pop)">
          {isFetching && !data && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
              <Spinner className="size-4" /> Searching…
            </div>
          )}
          {isError && <div className="px-4 py-3 text-sm text-crit">Search is unavailable right now.</div>}
          {data && total === 0 && <div className="px-4 py-3 text-sm text-muted">No results for “{debounced}”.</div>}
          {data && data.patients.length > 0 && (
            <Section title="Patients">
              {data.patients.map((p) => (
                <Item key={p.id} icon={<UserRound className="size-4" />} title={p.name} subtitle={`${p.mrn} · ${p.bed ?? 'No bed'} · ${p.diagnosis}`} onClick={() => go(`/patients/${p.id}`)} />
              ))}
            </Section>
          )}
          {data && data.monitors.length > 0 && (
            <Section title="Monitors">
              {data.monitors.map((m) => (
                <Item key={m.id} icon={<Cpu className="size-4" />} title={m.serial} subtitle={`${m.model} · ${m.asset_tag} · ${m.bed ?? m.status.replace('_', ' ')}`} onClick={() => go(`/devices/${m.id}`)} />
              ))}
            </Section>
          )}
          {data && data.staff.length > 0 && (
            <Section title="Team">
              {data.staff.map((s) => (
                <Item key={s.id} icon={<User className="size-4" />} title={s.full_name} subtitle={s.title ?? ROLE_LABELS[s.role]} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="label px-4 py-1">{title}</div>
      {children}
    </div>
  )
}

function Item({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-soft disabled:cursor-default">
      <span className="flex size-8 items-center justify-center rounded-lg bg-navy-50 text-navy-600">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-[12.5px] text-muted">{subtitle}</span>
      </span>
    </button>
  )
}
