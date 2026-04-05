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
  using (auth.uid() is not null);

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