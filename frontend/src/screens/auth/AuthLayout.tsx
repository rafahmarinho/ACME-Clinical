import type { ReactNode } from 'react'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 64 64" className="size-11" aria-hidden>
            <rect width="64" height="64" rx="14" fill="#fff" fillOpacity="0.08" />
            <path d="M10 35h12l5-12 8 22 6-14 3 4h10" fill="none" stroke="#5EEAD4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="text-xl font-bold tracking-tight">ACME Clinical</div>
            <div className="text-sm text-navy-200">Ward monitoring platform</div>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="text-[34px] leading-tight font-bold tracking-tight">Every bed, every alarm, one calm view.</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-navy-200">
            Live vital signs, alarm response, device health and reporting for nurses, physicians, biomedical technicians and administrators.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              ['78', 'HR bpm', '#5EEAD4'],
              ['97', 'SpO₂ %', '#7DD3FC'],
              ['16', 'RR /min', '#FCD34D'],
            ].map(([v, l, c]) => (
              <div key={l} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="num text-4xl font-bold" style={{ color: c }}>
                  {v}
                </div>
                <div className="mt-1 text-xs font-semibold tracking-wider text-navy-200 uppercase">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <svg className="absolute -right-24 bottom-28 w-[620px] opacity-20" viewBox="0 0 600 120" aria-hidden>
          <path d="M0 70 H140 l14-34 22 70 18-56 10 20 H330 l14-34 22 70 18-56 10 20 H600" fill="none" stroke="#5EEAD4" strokeWidth="3" />
        </svg>
        <p className="relative z-10 text-xs text-navy-200">Demonstration system with fictional patients and simulated devices. Not for clinical use.</p>
      </div>
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <div className="text-xl font-bold">ACME Clinical</div>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  )
}
