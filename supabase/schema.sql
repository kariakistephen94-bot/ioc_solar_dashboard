-- OIC Solar lead engine. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- The engine uses the service_role key (server only). RLS is enabled with no policies, so the public anon key can read nothing.

create extension if not exists pgcrypto;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sector text,                       -- hotel, clinic, cold room, school ...
  power_signal text,                 -- why this business needs backup power
  score int not null default 0,      -- 0-100 fit score
  phone text,                        -- digits only, international: 2348031234567
  phone_type text,                   -- mobile | landline | unknown
  wa_status text not null default 'unknown',  -- unknown | yes | no
  email text,
  website text,
  address text,
  city text,
  state text,
  lat double precision,
  lon double precision,
  source text,                       -- osm | google | csv | manual
  source_id text,
  status text not null default 'new', -- new | contacted | replied | interested | booked | won | lost | opted_out | call_only | needs_human
  account_id text,                   -- WhatsApp account (A-D) that owns this conversation
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,
  last_inbound_at timestamptz,
  followups_sent int not null default 0,
  next_followup_at timestamptz,
  agent_paused boolean not null default false,
  contact_name text,
  booking_at timestamptz,
  booking_note text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists leads_source_idx on leads (source, source_id);
-- Plain unique constraint so the engine can upsert with on_conflict=phone. Several NULL phones are allowed.
create unique index if not exists leads_phone_uniq on leads (phone);
create index if not exists leads_status_idx on leads (status, score desc);
create index if not exists leads_followup_idx on leads (next_followup_at) where next_followup_at is not null;

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  account_id text,
  direction text not null,           -- out | in
  kind text not null default 'reply',-- first | followup | nudge | reply | manual | inbound | auto (automatic reply, not a person)
  body text not null,
  wa_id text,
  status text not null default 'sent', -- sent | delivered | read | failed
  created_at timestamptz not null default now()
);
create index if not exists messages_lead_idx on messages (lead_id, created_at);
create index if not exists messages_wa_idx on messages (wa_id);

create table if not exists accounts (
  id text primary key,               -- A, B, C, D
  label text,
  phone text,
  paused boolean not null default false,
  daily_cap int not null default 60,
  warmup_started_on date,
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  price_ngn bigint,
  in_stock boolean not null default true
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,
  detail text
);

alter table leads enable row level security;
alter table messages enable row level security;
alter table accounts enable row level security;
alter table products enable row level security;
alter table settings enable row level security;
alter table activity enable row level security;

-- Dashboard staff and their access level. Accounts live in Supabase Auth; this table holds the role.
-- user = signed up, waiting for approval (no dashboard access) · admin = full access · blocked = refused.
-- No database trigger: the dashboard writes the row (through the engine) the moment someone signs up or signs in.
create table if not exists staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text,
  role text not null default 'user' check (role in ('user', 'admin', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table staff enable row level security;

-- If you ran an earlier version of this file, this removes its sign-up trigger (harmless if it never existed).
drop trigger if exists on_auth_user_created_staff on auth.users;
drop function if exists public.handle_new_staff();
