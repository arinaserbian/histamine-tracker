-- Таблицы и правила доступа для Гистамин-трекера.
-- Запустить один раз в Supabase: SQL Editor → New query → вставить → Run.

-- Схема лечения: одна строка на почту. Видна только тому, кто вошёл с этой почтой.
create table if not exists public.plans (
  email text primary key,
  data jsonb not null
);
alter table public.plans enable row level security;
drop policy if exists "plan by own email" on public.plans;
create policy "plan by own email" on public.plans
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Отметки и съеденные продукты: одна строка на день.
create table if not exists public.days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.days enable row level security;
drop policy if exists "own days" on public.days;
create policy "own days" on public.days
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Личные настройки: курс Исла минт, свои продукты.
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb
);
alter table public.settings enable row level security;
drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.plans to authenticated;
grant select, insert, update, delete on public.days, public.settings to authenticated;
revoke all on public.plans, public.days, public.settings from anon;
