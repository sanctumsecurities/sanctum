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

create policy "Anyone can read reports"
  on reports for select
  using (true);

create policy "Authenticated users can insert reports"
  on reports for insert
  with check (auth.uid() is not null);

create policy "Authenticated users can delete reports"
  on reports for delete
  using (auth.uid() is not null);
