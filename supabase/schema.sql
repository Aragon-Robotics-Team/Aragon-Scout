-- Aragon Scout database schema.
-- Run once in Supabase → SQL Editor → New query. Safe to re-run.
--
-- Model: one account per FTC team. Every report/tournament is a JSON document
-- (`data jsonb`) owned by that account. Row Level Security enforces:
--   * only the owning team's signed-in scouts can create, edit or delete rows,
--     and reports must be tagged with the owner's own team number;
--   * reads are private to the team unless the team turns on public sharing.

-- ─── Profiles (one per team account) ────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  team_number integer not null unique check (team_number > 0),
  team_name   text not null default '',
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own or public" on public.profiles;
create policy "profiles: read own or public" on public.profiles
  for select using (id = auth.uid() or is_public);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Team number is fixed at sign-up; only name and sharing can change.
revoke update on public.profiles from anon, authenticated;
grant update (team_name, is_public) on public.profiles to authenticated;
grant select on public.profiles to anon, authenticated;

-- Create the profile from sign-up metadata. A duplicate team number makes
-- sign-up fail (unique constraint), so one account per team.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, team_number, team_name)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'team_number')::integer,
    coalesce(new.raw_user_meta_data ->> 'team_name', '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the sign-up form check a team number before submitting.
create or replace function public.team_number_available(n integer)
returns boolean language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.profiles where team_number = n);
$$;
grant execute on function public.team_number_available(integer) to anon, authenticated;

-- ─── Sync helpers ───────────────────────────────────────────────────────────
-- `updated_at` is the client's edit time (ms). The guard makes sync
-- last-write-wins: an older edit arriving late never overwrites a newer one.
-- `server_updated_at` is stamped by the server and used as the pull cursor.
create or replace function public.sync_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null;
    end if;
    new.owner := old.owner;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

-- ─── Tournaments ────────────────────────────────────────────────────────────
create table if not exists public.tournaments (
  id                uuid primary key,
  owner             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data              jsonb not null,
  deleted           boolean not null default false,
  updated_at        bigint not null,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists tournaments_owner_sync on public.tournaments (owner, server_updated_at);

drop trigger if exists tournaments_sync_guard on public.tournaments;
create trigger tournaments_sync_guard
  before insert or update on public.tournaments
  for each row execute function public.sync_guard();

alter table public.tournaments enable row level security;

drop policy if exists "tournaments: read own or public" on public.tournaments;
create policy "tournaments: read own or public" on public.tournaments
  for select using (
    owner = auth.uid()
    or exists (select 1 from public.profiles p where p.id = owner and p.is_public)
  );

drop policy if exists "tournaments: insert own" on public.tournaments;
create policy "tournaments: insert own" on public.tournaments
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists "tournaments: update own" on public.tournaments;
create policy "tournaments: update own" on public.tournaments
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "tournaments: delete own" on public.tournaments;
create policy "tournaments: delete own" on public.tournaments
  for delete to authenticated using (owner = auth.uid());

grant select on public.tournaments to anon, authenticated;
grant insert, update, delete on public.tournaments to authenticated;

-- ─── Reports (one recording = one match, one robot) ─────────────────────────
create table if not exists public.reports (
  id                uuid primary key,
  owner             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The scouting team's own number; must match the owner's profile.
  team_number       integer not null,
  tournament_id     uuid,
  match_number      integer,
  scouted_team      integer,
  data              jsonb not null,
  deleted           boolean not null default false,
  updated_at        bigint not null,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists reports_owner_sync on public.reports (owner, server_updated_at);
create index if not exists reports_tournament on public.reports (tournament_id, match_number);

drop trigger if exists reports_sync_guard on public.reports;
create trigger reports_sync_guard
  before insert or update on public.reports
  for each row execute function public.sync_guard();

alter table public.reports enable row level security;

drop policy if exists "reports: read own or public" on public.reports;
create policy "reports: read own or public" on public.reports
  for select using (
    owner = auth.uid()
    or exists (select 1 from public.profiles p where p.id = owner and p.is_public)
  );

drop policy if exists "reports: insert own team" on public.reports;
create policy "reports: insert own team" on public.reports
  for insert to authenticated with check (
    owner = auth.uid()
    and team_number = (select team_number from public.profiles where id = auth.uid())
  );

drop policy if exists "reports: update own team" on public.reports;
create policy "reports: update own team" on public.reports
  for update to authenticated using (owner = auth.uid()) with check (
    owner = auth.uid()
    and team_number = (select team_number from public.profiles where id = auth.uid())
  );

drop policy if exists "reports: delete own" on public.reports;
create policy "reports: delete own" on public.reports
  for delete to authenticated using (owner = auth.uid());

grant select on public.reports to anon, authenticated;
grant insert, update, delete on public.reports to authenticated;
