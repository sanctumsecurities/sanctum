-- Run this in your Supabase SQL Editor

create table if not exists reports (
  id uuid default gen_random_uuid() primary key,
  ticker text not null,
  data jsonb not null,
  ai jsonb not null,
  created_by uuid not null,
  created_by_email text,
  created_at timestamp with time zone default now()
);

-- Allow authenticated users to insert and read all reports
alter table reports enable row level security;

-- Drop existing policies if they exist (prevents error 42710)
drop policy if exists "Anyone can read reports" on reports;
drop policy if exists "Authenticated users can insert reports" on reports;
drop policy if exists "Authenticated users can delete reports" on reports;

-- Recreate policies
create policy "Anyone can read reports"
  on reports for select
  using (true);

create policy "Authenticated users can insert reports"
  on reports for insert
  with check (auth.uid() is not null and auth.uid() = created_by);

create policy "Authenticated users can delete reports"
  on reports for delete
  using (auth.uid() = created_by);

-- ── User Settings ──

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default now()
);

alter table user_settings enable row level security;

drop policy if exists "Users can read own settings" on user_settings;
drop policy if exists "Users can upsert own settings" on user_settings;

create policy "Users can read own settings"
  on user_settings for select
  using (auth.uid() = user_id);

create policy "Users can upsert own settings"
  on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Portfolio Holdings ──

create table if not exists holdings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  shares numeric not null check (shares > 0),
  avg_cost numeric not null check (avg_cost > 0),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists holdings_user_id_idx on holdings(user_id);
create unique index if not exists holdings_user_ticker_idx on holdings(user_id, ticker);

alter table holdings enable row level security;

drop policy if exists "Users can read own holdings" on holdings;
drop policy if exists "Users can insert own holdings" on holdings;
drop policy if exists "Users can update own holdings" on holdings;
drop policy if exists "Users can delete own holdings" on holdings;

create policy "Users can read own holdings"
  on holdings for select
  using (auth.uid() = user_id);

create policy "Users can insert own holdings"
  on holdings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own holdings"
  on holdings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own holdings"
  on holdings for delete
  using (auth.uid() = user_id);