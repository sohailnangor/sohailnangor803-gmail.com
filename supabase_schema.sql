-- FilmDrama Box — Supabase PostgreSQL Schema
-- Run this script once in your Supabase SQL Editor.

create table if not exists public.folders (
  id text primary key,
  title text not null,
  category text not null check (category in ('Film', 'Drama', 'Story')),
  thumbnail text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id text primary key,
  youtube_id text not null,
  title text not null,
  category text not null check (category in ('Film', 'Drama', 'Story')),
  folder_id text not null default '',
  duration text not null default 'HD',
  views text not null default 'New',
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id text primary key,
  first_name text not null,
  last_name text not null,
  password_hash text not null,
  subscribed_folders jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ad_config (
  id text primary key,
  top_code text not null default '',
  feed_code text not null default '',
  bottom_code text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security (optional: if using anon key from server, create appropriate policies)
alter table public.folders enable row level security;
alter table public.videos enable row level security;
alter table public.user_profiles enable row level security;
alter table public.ad_config enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "Allow app read/write folders" on public.folders for all using (true) with check (true);
create policy "Allow app read/write videos" on public.videos for all using (true) with check (true);
create policy "Allow app read/write user_profiles" on public.user_profiles for all using (true) with check (true);
create policy "Allow app read/write ad_config" on public.ad_config for all using (true) with check (true);
create policy "Allow app read/write push_subscriptions" on public.push_subscriptions for all using (true) with check (true);

