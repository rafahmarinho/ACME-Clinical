-- =============================================================================
-- ACME Clinical — database schema
-- Tables, triggers, row level security, realtime publication and storage.
-- Run this once on a new Supabase project (SQL editor or `supabase db push`).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('nurse', 'physician', 'biomed', 'admin');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Profiles (one per auth user)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  role          public.user_role not null default 'nurse',
  title         text,
  phone         text,
  avatar_url    text,
  is_active     boolean not null default true,
  preferences   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a profile automatically when an auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'nurse');
begin
  if requested_role not in ('nurse', 'physician', 'biomed', 'admin') then
    requested_role := 'nurse';
  end if;
  insert into public.profiles (id, email, full_name, role, title)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    requested_role::public.user_role,
    new.raw_user_meta_data ->> 'title'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role of the signed-in user (used by RLS policies).
create or replace function public.current_app_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

-- -----------------------------------------------------------------------------
-- Wards and beds
-- -----------------------------------------------------------------------------
create table if not exists public.wards (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  floor       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.beds (
  id          uuid primary key default gen_random_uuid(),
  ward_id     uuid not null references public.wards (id) on delete cascade,
  label       text not null,
  position_x  real not null default 0,
  position_z  real not null default 0,
  created_at  timestamptz not null default now(),
  unique (ward_id, label)
);

-- -----------------------------------------------------------------------------
-- Patients (fictional demo data only)
-- -----------------------------------------------------------------------------
create table if not exists public.patients (
  id                uuid primary key default gen_random_uuid(),
  mrn               text not null unique,
  first_name        text not null,
  last_name         text not null,
  date_of_birth     date not null,
  sex               text not null check (sex in ('F', 'M', 'X')),
  bed_id            uuid unique references public.beds (id) on delete set null,
  attending_id      uuid references public.profiles (id) on delete set null,
  primary_nurse_id  uuid references public.profiles (id) on delete set null,
  diagnosis         text not null default '',
  acuity            smallint not null default 3 check (acuity between 1 and 5),
  allergies         text[] not null default '{}',
  code_status       text not null default 'Full code',
  isolation         text,
  baseline          jsonb not null default '{}'::jsonb,
  status            text not null default 'admitted' check (status in ('admitted', 'discharged')),
  admitted_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger patients_touch before update on public.patients
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Monitors (simulated bedside devices)
-- -----------------------------------------------------------------------------
create table if not exists public.monitors (
  id                  uuid primary key default gen_random_uuid(),
  serial              text not null unique,
  asset_tag           text not null unique,
  model               text not null,
  firmware            text not null,
  bed_id              uuid unique references public.beds (id) on delete set null,
  status              text not null default 'available'
                        check (status in ('available', 'in_use', 'maintenance')),
  connection          text not null default 'connected' check (connection in ('connected', 'lost')),
  sensor_status       text not null default 'ok'
                        check (sensor_status in ('ok', 'spo2_probe_off', 'ecg_leads_off')),
  battery_pct         real not null default 100,
  signal_quality      smallint not null default 100,
  fault               text not null default 'none'
                        check (fault in ('none', 'desaturation', 'low_battery', 'sensor', 'disconnect')),
  fault_started_tick  integer,
  latest              jsonb not null default '{}'::jsonb,
  last_seen_at        timestamptz,
  last_service_at     date,
  next_service_due    date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger monitors_touch before update on public.monitors
  for each row execute function public.touch_updated_at();

create table if not exists public.monitor_assignments (
  id             uuid primary key default gen_random_uuid(),
  monitor_id     uuid not null references public.monitors (id) on delete cascade,
  bed_id         uuid references public.beds (id) on delete set null,
  patient_id     uuid references public.patients (id) on delete set null,
  assigned_by    uuid references public.profiles (id) on delete set null,
  assigned_at    timestamptz not null default now(),
  unassigned_at  timestamptz,
  unassigned_by  uuid references public.profiles (id) on delete set null
);
create index if not exists monitor_assignments_monitor_idx on public.monitor_assignments (monitor_id, assigned_at desc);

-- -----------------------------------------------------------------------------
-- Readings (one row per monitor per simulation tick)
-- -----------------------------------------------------------------------------
create table if not exists public.readings (
  id              bigint generated always as identity primary key,
  monitor_id      uuid not null references public.monitors (id) on delete cascade,
  patient_id      uuid references public.patients (id) on delete cascade,
  recorded_at     timestamptz not null,
  tick            integer not null,
  hr              smallint,
  spo2            smallint,
  rr              smallint,
  sys             smallint,
  dia             smallint,
  map             smallint,
  battery_pct     real,
  signal_quality  smallint
);
create index if not exists readings_patient_time_idx on public.readings (patient_id, recorded_at desc);
create index if not exists readings_monitor_time_idx on public.readings (monitor_id, recorded_at desc);

-- -----------------------------------------------------------------------------
-- Alarm thresholds (patient_id null = ward default)
-- -----------------------------------------------------------------------------
create table if not exists public.thresholds (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid references public.patients (id) on delete cascade,
  parameter   text not null check (parameter in ('hr', 'spo2', 'rr', 'sys', 'dia')),
  warn_low    numeric,
  warn_high   numeric,
  crit_low    numeric,
  crit_high   numeric,
  enabled     boolean not null default true,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (patient_id, parameter)
);

-- -----------------------------------------------------------------------------
-- Alarms. Acknowledging never clears an alarm: only the simulation engine sets
-- condition_active = false once the underlying condition has stopped.
-- -----------------------------------------------------------------------------
create table if not exists public.alarms (
  id               uuid primary key default gen_random_uuid(),
  monitor_id       uuid references public.monitors (id) on delete set null,
  patient_id       uuid references public.patients (id) on delete set null,
  bed_id           uuid references public.beds (id) on delete set null,
  type             text not null,
  category         text not null check (category in ('clinical', 'technical')),
  severity         text not null check (severity in ('critical', 'warning', 'advisory')),
  parameter        text,
  message          text not null,
  value            numeric,
  limit_value      numeric,
  condition_active boolean not null default true,
  started_at       timestamptz not null,
  last_seen_at     timestamptz not null,
  resolved_at      timestamptz,
  resolution       text,
  acknowledged_at  timestamptz,
  acknowledged_by  uuid references public.profiles (id) on delete set null,
  ack_note         text,
  escalated_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists alarms_active_idx on public.alarms (condition_active, started_at desc);
create index if not exists alarms_patient_idx on public.alarms (patient_id, started_at desc);
create unique index if not exists alarms_one_active_per_type
  on public.alarms (monitor_id, type) where condition_active;

-- -----------------------------------------------------------------------------
-- Clinical notes
-- -----------------------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  category    text not null default 'general'
                check (category in ('general', 'assessment', 'medication', 'handoff', 'alarm')),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists notes_patient_idx on public.notes (patient_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Device maintenance
-- -----------------------------------------------------------------------------
create table if not exists public.maintenance_records (
  id             uuid primary key default gen_random_uuid(),
  monitor_id     uuid not null references public.monitors (id) on delete cascade,
  kind           text not null
                   check (kind in ('preventive', 'repair', 'battery_replacement', 'calibration', 'inspection')),
  status         text not null default 'scheduled'
                   check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  title          text not null,
  details        text,
  resolution     text,
  scheduled_for  date,
  completed_at   timestamptz,
  technician_id  uuid references public.profiles (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger maintenance_touch before update on public.maintenance_records
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Event log (simulation + audit trail)
-- -----------------------------------------------------------------------------
create table if not exists public.events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null,
  tick         integer,
  kind         text not null,
  severity     text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  entity_type  text,
  entity_id    uuid,
  message      text not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists events_time_idx on public.events (id desc);

-- -----------------------------------------------------------------------------
-- Simulation state (single row)
-- -----------------------------------------------------------------------------
create table if not exists public.sim_state (
  id            smallint primary key default 1 check (id = 1),
  tick          integer not null default 0,
  sim_time      timestamptz not null default now(),
  scenario      text not null default 'normal',
  auto_run      boolean not null default false,
  tick_seconds  integer not null default 60,
  seed          integer not null default 2026,
  last_tick_at  timestamptz,
  updated_at    timestamptz not null default now()
);
create trigger sim_state_touch before update on public.sim_state
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Generated reports (files live in the private "reports" storage bucket)
-- -----------------------------------------------------------------------------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  title       text not null,
  format      text not null check (format in ('pdf', 'csv')),
  params      jsonb not null default '{}'::jsonb,
  summary     jsonb not null default '{}'::jsonb,
  file_path   text,
  file_size   integer,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Simulated external integrations (pager, email, EHR)
-- -----------------------------------------------------------------------------
create table if not exists public.integration_messages (
  id            bigint generated always as identity primary key,
  channel       text not null check (channel in ('pager', 'email', 'ehr')),
  recipient     text not null,
  subject       text not null,
  body          text not null default '',
  status        text not null default 'delivered' check (status in ('queued', 'delivered', 'failed')),
  related_type  text,
  related_id    uuid,
  sim_time      timestamptz,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- System settings (key/value)
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Demo reset helper (service role only)
-- -----------------------------------------------------------------------------
create or replace function public.acme_reset_demo()
returns void language plpgsql security definer set search_path = public as $$
begin
  truncate table
    public.readings, public.alarms, public.notes, public.maintenance_records,
    public.events, public.monitor_assignments, public.reports,
    public.integration_messages, public.thresholds,
    public.monitors, public.patients, public.beds, public.wards
  restart identity cascade;
end $$;
revoke execute on function public.acme_reset_demo() from public, anon, authenticated;
grant execute on function public.acme_reset_demo() to service_role;

-- -----------------------------------------------------------------------------
-- Row level security. The API (service role) performs every write; signed-in
-- users may read so the web app can receive realtime change notifications.
-- Patient-identifiable tables are limited to clinical roles and admins.
-- -----------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.wards                enable row level security;
alter table public.beds                 enable row level security;
alter table public.patients             enable row level security;
alter table public.monitors             enable row level security;
alter table public.monitor_assignments  enable row level security;
alter table public.readings             enable row level security;
alter table public.thresholds           enable row level security;
alter table public.alarms               enable row level security;
alter table public.notes                enable row level security;
alter table public.maintenance_records  enable row level security;
alter table public.events               enable row level security;
alter table public.sim_state            enable row level security;
alter table public.reports              enable row level security;
alter table public.integration_messages enable row level security;
alter table public.app_settings         enable row level security;

create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "read wards" on public.wards for select to authenticated using (true);
create policy "read beds" on public.beds for select to authenticated using (true);
create policy "read monitors" on public.monitors for select to authenticated using (true);
create policy "read assignments" on public.monitor_assignments for select to authenticated using (true);
create policy "read thresholds" on public.thresholds for select to authenticated using (true);
create policy "read alarms" on public.alarms for select to authenticated using (true);
create policy "read maintenance" on public.maintenance_records for select to authenticated using (true);
create policy "read events" on public.events for select to authenticated using (true);
create policy "read sim state" on public.sim_state for select to authenticated using (true);
create policy "read reports" on public.reports for select to authenticated using (true);
create policy "read settings" on public.app_settings for select to authenticated using (true);
create policy "read integrations" on public.integration_messages for select to authenticated
  using (public.current_app_role() in ('admin', 'biomed'));
create policy "clinical read patients" on public.patients for select to authenticated
  using (public.current_app_role() in ('nurse', 'physician', 'admin'));
create policy "clinical read readings" on public.readings for select to authenticated
  using (public.current_app_role() in ('nurse', 'physician', 'admin'));
create policy "clinical read notes" on public.notes for select to authenticated
  using (public.current_app_role() in ('nurse', 'physician', 'admin'));

-- -----------------------------------------------------------------------------
-- Realtime: broadcast row changes the web app listens to.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'monitors', 'alarms', 'events', 'sim_state', 'patients', 'notes',
    'maintenance_records', 'thresholds', 'reports', 'profiles', 'integration_messages'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Storage buckets: public avatars, private reports. Uploads go through the API.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('reports', 'reports', false)
on conflict (id) do nothing;
