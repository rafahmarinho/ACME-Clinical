# ACME Clinical

A ward monitoring platform demo. Simulated bedside monitors stream vital signs and synthetic ECG/pleth waveforms for **fictional patients**. Nurses, physicians, biomedical technicians and administrators each get their own navigation and permissions. They respond to alarms, assign monitors to beds, track device maintenance, tune alarm thresholds, generate reports and manage the team.

> **Simulated data only.** Every patient, record number, device and integration is invented. Do not use for clinical purposes.

| Layer | Technology |
| --- | --- |
| Web app | React 19 · Vite 8 · TypeScript 6 · React Router 8 · TanStack Query 5 · Tailwind CSS 4 · Recharts 3 · three.js / React Three Fiber 9 (3D ward) |
| API | Python 3.12+ · FastAPI 0.143 · Pydantic 2.14 · ReportLab 5 (PDF reports) |
| Data | Supabase: PostgreSQL, email + password auth, Storage (avatars, reports), Realtime (live updates) |
| Hosting | Two Vercel projects: static web app + Python serverless API |

---

## Features

- **Sign-in, password recovery and profile.** Email + password via Supabase Auth, "Forgot password" email link, reset page, password change, profile photo upload (Supabase Storage).
- **Role-based navigation.** Menus, actions and API permissions adapt to *nurse*, *physician*, *biomedical technician* and *administrator*. Biomedical technicians never see patient identity.
- **Ward overview.** KPIs, bed grid per ward, recent activity, and an **interactive 3D ward** (orbit/zoom, click beds). Alarm rings pulse on beds, and *nurse* and *biomed* figures walk to the beds that need attention.
- **Patients.** Searchable, filterable list (ward, acuity, monitoring, alarm state, sorting). Detail page with live vitals, trends (1–24 h), open alarms, clinical notes, alarm history, patient-specific alarm limits, record editing and monitor assignment.
- **Live monitoring.** Central-station wall with sweeping synthetic ECG + pleth waveforms and large numerics. Single-monitor view adds respiration and a one-hour trend.
- **Alarms.** Unacknowledged / acknowledged-but-active / resolved tabs, filters, search, acknowledgement with notes, escalation badges and alarm sounds.
  **Acknowledging never clears an alarm.** Only the monitoring engine resolves it once the condition has stopped.
- **Devices and maintenance.** Fleet status (battery, connectivity, sensors, service due), monitor-to-bed assignment and history, out-of-service mode, battery swaps, and work orders (scheduled → in progress → completed).
- **Alarm thresholds.** Ward defaults plus patient-specific overrides, validated on the server.
- **Reports.** Shift summary, patient vitals summary, device status and alarm log, generated in Python as **PDF or CSV**, stored in Supabase Storage, previewed on screen, downloadable through signed URLs, and shareable by (simulated) email.
- **Team management.** Add members with temporary passwords, change roles and titles, deactivate or reactivate accounts (blocked in Supabase Auth too).
- **Simulation console.** Choose scenarios, inject faults per monitor, advance time (+1/5/15/60 min) or run live, inspect the event log, view simulated pager/email/EHR (HL7) messages, and reset the demo data.
- **Settings.** Personal preferences (alarm sound, waveforms, default ward…) and system settings (escalation delay, EHR sync interval, battery thresholds, integration toggles).
- **Global search** (Ctrl K), loading skeletons, empty states, friendly error messages with retry, toasts, and responsive layout.

Everything persists in PostgreSQL and survives page reloads. Changes reach every open browser through Supabase Realtime, with polling as a fallback.

---

## Architecture

```
┌────────────────────────┐   REST (Bearer JWT)    ┌───────────────────────────┐
│  React web app (Vite)  │ ─────────────────────▶ │  FastAPI (Vercel Python)  │
│  screens · components  │                        │  routers → services →     │
│  services · hooks      │ ◀── Realtime changes ─ │  repositories             │
└──────────┬─────────────┘         │              │  simulation engine,       │
           │ email+password auth   │              │  waveforms, PDF/CSV       │
           ▼                       │              └─────────────┬─────────────┘
┌──────────────────────────────────┴───────────────────────────▼─────────────┐
│ Supabase: Auth · PostgreSQL (RLS) · Storage (avatars, reports) · Realtime  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- The **browser** signs in with Supabase Auth and calls the API with its access token. It subscribes to Realtime row changes only to know *when* to refetch.
- The **API** validates the token with Supabase Auth, loads the user's role, enforces permissions, and performs every write with the service-role key.
- **Row Level Security** allows signed-in users to read. Patient tables are readable only by clinical roles. Nothing can be written from the browser.
- **Python generates everything simulated:** readings, alarms, escalations, HL7 messages, waveforms and reports.

### Project structure

```
ACME Clinical/
├── supabase/
│   ├── migrations/…_acme_clinical_schema.sql   # tables, RLS, realtime, storage buckets, reset function
│   ├── config.toml                             # Supabase CLI (local development)
│   └── seed.sql                                # points to the Python seed script
├── backend/
│   ├── api/index.py            # Vercel entry point
│   ├── app/
│   │   ├── main.py             # FastAPI app, CORS, error handling
│   │   ├── core/               # settings, auth & role checks, errors
│   │   ├── db/                 # Supabase client factory
│   │   ├── repositories/       # database access (one module per table)
│   │   ├── schemas/            # Pydantic request models
│   │   ├── routers/            # HTTP endpoints
│   │   └── services/           # business logic: engine.py (simulation), waveform.py,
│   │                           # reports.py + report_render.py, devices, alarms, demo.py …
│   ├── scripts/seed.py         # creates demo accounts + loads demo data
│   ├── tests/                  # pytest suite (in-memory Supabase fake)
│   ├── requirements.txt · requirements-dev.txt · vercel.json · .env.example
└── frontend/
    ├── src/
    │   ├── screens/            # pages (auth, overview, patients, monitoring, devices, …)
    │   ├── components/         # ui primitives, layout, monitoring, alarms, ward (2D + 3D)
    │   ├── services/           # API calls per domain
    │   ├── hooks/              # realtime sync, simulation clock, alarm sound, debounce
    │   ├── auth/ · config/ · lib/ · types.ts
    ├── package.json · vite.config.ts · vercel.json · .env.example
```

---

## Run locally

### Prerequisites

- **Node.js 22.22+ or 24** and npm
- **Python 3.12+**
- **Supabase:** either the [Supabase CLI](https://supabase.com/docs/guides/local-development) with Docker (recommended for development), or a free hosted project at [supabase.com](https://supabase.com)

### 1. Database (choose one)

**A. Local Supabase (CLI + Docker)**

```bash
supabase start
```

The first start applies `supabase/migrations/` automatically. Run `supabase status` to see the API URL (`http://127.0.0.1:54321`), the **anon key** and the **service_role key**. Password-reset emails are captured by Mailpit at <http://127.0.0.1:54324>.

**B. Hosted Supabase project**

1. Create a project, open **SQL Editor**, paste the contents of `supabase/migrations/20261011000000_acme_clinical_schema.sql` and run it. Or link the CLI and run `supabase db push`.
2. **Authentication → URL Configuration:** set **Site URL** to your web app URL (e.g. `http://localhost:5173`). Add `http://localhost:5173/reset-password` (and later your Vercel URL + `/reset-password`) to **Redirect URLs**.
3. **Project Settings → API:** copy the project URL, the `anon` (publishable) key and the `service_role` (secret) key.

> Hosted projects send auth emails only to team members unless you configure custom SMTP (Authentication → Emails). The demo accounts use the reserved `.test` domain, so try password recovery with an account that has a real email address (add one from **Team**).

### 2. API

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
python -m scripts.seed        # demo accounts + demo data (safe to re-run)
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: <http://localhost:8000/api/docs> · health check: <http://localhost:8000/api/health>

### 3. Web app

```bash
cd frontend
npm install
cp .env.example .env.local    # fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm run dev
```

Open <http://localhost:5173>.

### Demo accounts

All accounts use the password from `DEMO_PASSWORD` (default **`AcmeDemo!2026`**).

| Role | Email | Name |
| --- | --- | --- |
| Nurse | `nurse@acme-clinical.test` | Olivia Bennett |
| Physician | `physician@acme-clinical.test` | Dr. Marcus Hale |
| Biomedical technician | `biomed@acme-clinical.test` | Priya Raman |
| Administrator | `admin@acme-clinical.test` | Daniel Okafor |
| Nurse | `sofia.alvarez@acme-clinical.test` | Sofia Alvarez |
| Physician | `hannah.cho@acme-clinical.test` | Dr. Hannah Cho |
| Biomedical technician | `leo.martins@acme-clinical.test` | Leo Martins |

### Demo data

- 2 wards (4 West Cardiac Step-Down with 8 beds, 5 East Medical-Surgical with 6 beds) and **12 fictional patients**.
- **10 simulated monitors:** 8 at the bedside, 1 spare (`VX5-1009`, docked) and 1 in repair (`VX5-1010`).
- Ward default thresholds, 4 patient-specific overrides, 5 work orders, sample clinical notes.
- Two hours of simulated history, including a resolved desaturation, a detached ECG lead and a short connection loss.

### Permissions by role

| | Nurse | Physician | Biomed | Admin |
| --- | :-: | :-: | :-: | :-: |
| Ward overview / alarms | ✓ | ✓ | ✓ (technical, no patient identity) | ✓ |
| Patients, live monitoring, notes | ✓ | ✓ | – | ✓ |
| Acknowledge clinical alarms | ✓ | ✓ | – | ✓ |
| Acknowledge technical alarms | ✓ | ✓ | ✓ | ✓ |
| Edit thresholds / patient record | view | ✓ | – | ✓ |
| Assign monitors to beds | ✓ | – | ✓ | ✓ |
| Maintenance, out-of-service | – | – | ✓ | ✓ |
| Reports | shift, patient, alarm log | shift, patient, alarm log | device status, technical alarm log | all |
| Simulation console | – | – | ✓ (no reset) | ✓ |
| Team & system settings | – | – | – | ✓ |

---

## How the simulation works

- One **tick = one simulated minute**. The simulation clock is shown in the top bar.
  - **Live** (play button, any role): open browsers ask the API to advance one tick every 5 seconds. The API rate-limits ticks, so several open tabs don't speed it up.
  - **Advance** buttons (Simulation console, or ⏩ in the top bar for admins and technicians) jump ahead instantly.
- On each tick, every bedside monitor produces HR, SpO₂, RR and NIBP readings around the patient's baseline, with natural drift and noise. NIBP cycles every 5 minutes. Batteries drain while in use and charge while docked.
- **Scenarios:**

  | Scenario | What happens |
  | --- | --- |
  | Normal shift | Clears all faults and swaps weak batteries |
  | Low oxygen saturation | SpO₂ falls towards 83% on two patients, with rising HR and RR |
  | Weak batteries | Three monitors drain fast and eventually go offline |
  | Sensor issues | ECG leads off on one monitor, SpO₂ probe off on another |
  | Lost connections | Two monitors stop transmitting |
  | Busy shift | One of each |

  Faults can also be injected per monitor from the console.
- **Alarm lifecycle.** Values are compared with the patient's limits (patient override, else ward default).
  - A condition raises a **warning** or **critical** alarm.
  - The alarm stays open while the condition persists, with hysteresis to avoid flapping.
  - **Acknowledging records who responded and never closes the alarm.** It is resolved only when the engine observes the condition has stopped. If the data is missing (probe off, monitor offline), the alarm stays open.
  - A warning that worsens to critical re-alarms.
- **Escalation and integrations (simulated).**
  - Critical alarms page the patient's primary nurse.
  - Critical alarms still unacknowledged after *N* minutes (System settings) escalate to the attending physician's pager.
  - Vitals are sent to the "EHR" as HL7 ORU^R01 batches.
  - Shared reports and new-member invitations go through the email gateway.
  - All of these appear in **Simulation → Simulated integrations**. Nothing leaves the system.
- **Waveforms.** The API generates the synthetic ECG (sum of Gaussian P-QRS-T waves with mild heart-rate variability), pleth and respiration signals. They are anchored to absolute time, so consecutive chunks join seamlessly on the sweeping canvas.
- **Reset.** **Simulation → Reset demo data** (admin) restores the initial dataset and replays two hours of history. User accounts are kept.

---

## Tests

```bash
cd backend
pytest -q
```

The suite covers the main flows through the real routers, services and repositories, against an in-memory Supabase fake:

- seeded data
- acknowledged alarms stay open until the condition clears
- escalation paging
- device scenarios
- role permissions
- monitor assignment
- maintenance tracking
- threshold validation
- PDF/CSV reports
- notes, search, profile and settings
- team management
- waveforms
- demo reset

```bash
cd frontend
npm run build      # type-checks (tsc -b) and builds
```

---

## Deploy to Vercel

Create **two Vercel projects from the same repository**: one for the API and one for the web app.

### 1. API project

1. **New Project → Import repository → Root Directory: `backend`**. Framework preset: *Other*. `backend/vercel.json` routes every request to the FastAPI app in `api/index.py`, and `requirements.txt` is installed automatically. `.python-version` selects Python 3.12.
2. Environment variables:

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role / secret key (server only) |
   | `CORS_ORIGINS` | your web app URL, e.g. `https://acme-clinical-web.vercel.app` |
   | `CORS_ORIGIN_REGEX` | optional, for preview URLs: `https://acme-clinical-web-.*\.vercel\.app` |
   | `FRONTEND_URL` | your web app URL |
   | `ENVIRONMENT` | `production` |

3. Deploy, then check `https://<api-project>.vercel.app/api/health`.

### 2. Web app project

1. **New Project → same repository → Root Directory: `frontend`**. Framework preset: *Vite* (build `npm run build`, output `dist`). `frontend/vercel.json` adds the SPA fallback so deep links like `/patients/…` work on reload.
2. Environment variables:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key |
   | `VITE_API_URL` | `https://<api-project>.vercel.app` (no trailing slash) |
   | `VITE_SHOW_DEMO_ACCOUNTS` | `true` to list demo accounts on the sign-in page |

3. Deploy.

### 3. Final wiring

- In Supabase **Authentication → URL Configuration**, set the Site URL to the web app URL and add `https://<web-project>.vercel.app/reset-password` to Redirect URLs.
- Seed the hosted database once from your machine. Point `backend/.env` at the hosted project, then run `python -m scripts.seed`.

Using the CLI instead of the dashboard:

```bash
npm i -g vercel
cd backend  && vercel link && vercel env add SUPABASE_URL && vercel env add SUPABASE_SERVICE_ROLE_KEY && vercel --prod
cd ../frontend && vercel link && vercel env add VITE_API_URL && vercel env add VITE_SUPABASE_URL && vercel env add VITE_SUPABASE_ANON_KEY && vercel --prod
```

> **Serverless note:** Vercel functions don't run background loops, so the simulation advances only when someone presses an advance button or keeps the app open in **Live** mode. This keeps the demo free when nobody is watching. Large advances (+60 min) run in one request well within the 60 s `maxDuration`.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Configuration required" screen | `frontend/.env.local` is missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_API_URL`. Restart `npm run dev` after editing. |
| "Cannot reach the ACME Clinical API" | The API isn't running, `VITE_API_URL` is wrong, or the web origin is missing from `CORS_ORIGINS`. |
| "No ACME Clinical profile exists for this account" | The account was created before the migration ran. Re-run `python -m scripts.seed`, or add the user from **Team**. |
| Live badge shows red dot | Realtime isn't reachable. Screens still refresh by polling. Check that the migration's `supabase_realtime` publication step ran. |
| Reset-password link opens sign-in | Add `<web-url>/reset-password` to Supabase Redirect URLs. |
| `SUPABASE_SERVICE_ROLE_KEY is not configured` | Fill in `backend/.env` (local) or the Vercel environment variables. |

## Security notes

- The service-role key is used only by the API and must never be exposed to the browser.
- Every write goes through the API, which checks the caller's role. RLS blocks direct writes from browsers.
- Deactivated users are banned in Supabase Auth and rejected by the API.
- Report files live in a private bucket and are downloaded through short-lived signed URLs.
