-- Aragon Scout database schema (v2: individual accounts + organizations).
-- Run in Supabase → SQL Editor → New query. Safe to re-run.
--
-- Model:
--   * every person has their own login and a profile with a unique @username;
--   * an organization is one FTC team (unique team number + name). A person
--     belongs to at most one, as owner, admin or member;
--   * every tournament and recording belongs to an organization, so the whole
--     team shares them, and recordings stay when the person who made them leaves;
--   * reads are private to the organization unless it turns on public sharing.
--
-- Upgrading from v1 (one shared login per team) starts fresh: the block below
-- deletes the old team logins and all of their data. There is no undo.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'team_number'
  ) then
    delete from auth.users where id in (select id from public.profiles);
    drop table if exists public.reports cascade;
    drop table if exists public.tournaments cascade;
    drop table if exists public.profiles cascade;
    drop function if exists public.team_number_available(integer);
  end if;
end $$;

create extension if not exists citext;

-- ─── People ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   citext not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  -- Appearance settings that follow the person to every device.
  theme      jsonb,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ─── Organizations ──────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  team_number integer not null unique check (team_number > 0),
  name        text not null default '',
  is_public   boolean not null default false,
  join_code   text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at  timestamptz not null default now()
);
alter table public.organizations enable row level security;

create table if not exists public.memberships (
  org_id    uuid not null references public.organizations (id) on delete cascade,
  -- Unique: one organization per person.
  user_id   uuid not null unique references auth.users (id) on delete cascade,
  role      text not null check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.memberships enable row level security;

create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  -- By username (an existing person) or by email (may not have signed up yet).
  user_id    uuid references auth.users (id) on delete cascade,
  email      citext,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (user_id is not null or email is not null)
);
alter table public.invites enable row level security;
create unique index if not exists invites_org_user on public.invites (org_id, user_id) where user_id is not null;
create unique index if not exists invites_org_email on public.invites (org_id, email) where email is not null;

-- ─── Membership helpers (security definer so policies can call them) ────────
create or replace function public.my_org()
returns uuid language sql security definer set search_path = public stable as $$
  select org_id from public.memberships where user_id = auth.uid();
$$;

create or replace function public.my_role()
returns text language sql security definer set search_path = public stable as $$
  select role from public.memberships where user_id = auth.uid();
$$;

create or replace function public.my_email()
returns citext language sql security definer set search_path = public, auth stable as $$
  select email::citext from auth.users where id = auth.uid();
$$;

-- Invited to this organization (by account or by email)?
create or replace function public.invited_to(org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.invites
    where org_id = org and (user_id = auth.uid() or email = public.my_email())
  );
$$;

create or replace function public.is_public_org(org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select is_public from public.organizations where id = org), false);
$$;

grant execute on function public.my_org(), public.my_role(), public.my_email(), public.invited_to(uuid), public.is_public_org(uuid)
  to anon, authenticated;

-- ─── Read policies ──────────────────────────────────────────────────────────
drop policy if exists "profiles: read self and teammates" on public.profiles;
create policy "profiles: read self and teammates" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or id in (select user_id from public.memberships where org_id = public.my_org())
    -- so owners and admins can see who they've invited
    or id in (select user_id from public.invites where org_id = public.my_org())
  );

drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "organizations: read own or public" on public.organizations;
create policy "organizations: read own or public" on public.organizations
  for select using (
    -- invited: so someone can see which team invited them
    id = public.my_org() or is_public or public.invited_to(id)
  );

drop policy if exists "memberships: read own org" on public.memberships;
create policy "memberships: read own org" on public.memberships
  for select to authenticated using (org_id = public.my_org());

drop policy if exists "invites: read sent or received" on public.invites;
create policy "invites: read sent or received" on public.invites
  for select to authenticated using (
    (org_id = public.my_org() and public.my_role() in ('owner', 'admin'))
    or user_id = auth.uid()
    or email = public.my_email()
  );

-- Every change to people, organizations, memberships and invites goes through
-- the functions below, which check roles. Only a few profile/org columns are
-- directly writable.
revoke all on public.profiles, public.organizations, public.memberships, public.invites from anon, authenticated;
grant select on public.profiles, public.memberships, public.invites to authenticated;
grant select on public.organizations to anon, authenticated;
grant update (username, theme) on public.profiles to authenticated;

-- The column list shown to anyone who can read an organization; the join code
-- is only for its owner and admins (see org_join_code below).
revoke select on public.organizations from anon, authenticated;
grant select (id, team_number, name, is_public, created_at) on public.organizations to anon, authenticated;

-- ─── Account functions ──────────────────────────────────────────────────────
create or replace function public.username_available(name text)
returns boolean language sql security definer set search_path = public stable as $$
  select name ~ '^[A-Za-z0-9_]{3,20}$' and not exists (select 1 from public.profiles where username = name::citext);
$$;

create or replace function public.team_number_available(n integer)
returns boolean language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.organizations where team_number = n);
$$;

-- The profile is created from the username given at sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username) values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_organization(n integer, org_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if public.my_org() is not null then raise exception 'You''re already in an organization. Leave it first.'; end if;
  if exists (select 1 from public.organizations where team_number = n) then
    raise exception 'Team % already has an organization. Ask its owner for an invite or the join code.', n;
  end if;
  insert into public.organizations (team_number, name) values (n, coalesce(org_name, '')) returning id into new_id;
  insert into public.memberships (org_id, user_id, role) values (new_id, auth.uid(), 'owner');
  delete from public.invites where user_id = auth.uid() or email = public.my_email();
  return new_id;
end $$;

create or replace function public.join_with_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if public.my_org() is not null then raise exception 'You''re already in an organization. Leave it first.'; end if;
  select id into target from public.organizations where join_code = upper(trim(code));
  if target is null then raise exception 'That join code doesn''t match any team.'; end if;
  insert into public.memberships (org_id, user_id, role) values (target, auth.uid(), 'member');
  delete from public.invites where user_id = auth.uid() or email = public.my_email();
  return target;
end $$;

create or replace function public.accept_invite(invite uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if public.my_org() is not null then raise exception 'You''re already in an organization. Leave it first.'; end if;
  select org_id into target from public.invites
  where id = invite and (user_id = auth.uid() or email = public.my_email());
  if target is null then raise exception 'That invite is no longer available.'; end if;
  insert into public.memberships (org_id, user_id, role) values (target, auth.uid(), 'member');
  delete from public.invites where user_id = auth.uid() or email = public.my_email();
  return target;
end $$;

create or replace function public.decline_invite(invite uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.invites where id = invite and (user_id = auth.uid() or email = public.my_email());
$$;

-- `target` is a username (with or without @) or an email address.
create or replace function public.invite_member(target text)
returns void language plpgsql security definer set search_path = public as $$
declare
  org uuid := public.my_org();
  person uuid;
  t text := trim(target);
begin
  if public.my_role() not in ('owner', 'admin') then raise exception 'Only owners and admins can invite.'; end if;
  if position('@' in t) > 1 then
    insert into public.invites (org_id, email, invited_by) values (org, t::citext, auth.uid())
    on conflict do nothing;
    return;
  end if;
  select id into person from public.profiles where username = ltrim(t, '@')::citext;
  if person is null then raise exception 'No one has the username %.', ltrim(t, '@'); end if;
  if exists (select 1 from public.memberships where user_id = person and org_id = org) then
    raise exception '@% is already on the team.', ltrim(t, '@');
  end if;
  insert into public.invites (org_id, user_id, invited_by) values (org, person, auth.uid())
  on conflict do nothing;
end $$;

create or replace function public.cancel_invite(invite uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('owner', 'admin') then raise exception 'Only owners and admins can cancel invites.'; end if;
  delete from public.invites where id = invite and org_id = public.my_org();
end $$;

create or replace function public.org_join_code()
returns text language plpgsql security definer set search_path = public stable as $$
begin
  if public.my_role() not in ('owner', 'admin') then return null; end if;
  return (select join_code from public.organizations where id = public.my_org());
end $$;

create or replace function public.new_join_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  code text := upper(substr(md5(gen_random_uuid()::text), 1, 8));
begin
  if public.my_role() not in ('owner', 'admin') then raise exception 'Only owners and admins can change the join code.'; end if;
  update public.organizations set join_code = code where id = public.my_org();
  return code;
end $$;

create or replace function public.update_organization(org_name text, public_sharing boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('owner', 'admin') then raise exception 'Only owners and admins can change team settings.'; end if;
  update public.organizations set name = coalesce(org_name, name), is_public = coalesce(public_sharing, is_public)
  where id = public.my_org();
end $$;

-- Owners and admins promote members to admin; only the owner demotes an admin.
create or replace function public.set_member_role(person uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  their_role text;
begin
  if new_role not in ('admin', 'member') then raise exception 'Use transfer_ownership to change the owner.'; end if;
  select role into their_role from public.memberships where user_id = person and org_id = public.my_org();
  if their_role is null then raise exception 'That person isn''t on your team.'; end if;
  if their_role = 'owner' then raise exception 'The owner''s role can''t be changed.'; end if;
  if public.my_role() = 'owner' or (public.my_role() = 'admin' and their_role = 'member') then
    update public.memberships set role = new_role where user_id = person;
  else
    raise exception 'You don''t have permission to do that.';
  end if;
end $$;

create or replace function public.remove_member(person uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  their_role text;
begin
  select role into their_role from public.memberships where user_id = person and org_id = public.my_org();
  if their_role is null then raise exception 'That person isn''t on your team.'; end if;
  if person = auth.uid() then raise exception 'Use leave_organization to leave.'; end if;
  if public.my_role() = 'owner' or (public.my_role() = 'admin' and their_role = 'member') then
    delete from public.memberships where user_id = person;
  else
    raise exception 'You don''t have permission to do that.';
  end if;
end $$;

create or replace function public.transfer_ownership(person uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'owner' then raise exception 'Only the owner can hand over ownership.'; end if;
  if not exists (select 1 from public.memberships where user_id = person and org_id = public.my_org() and role = 'admin') then
    raise exception 'Make them an admin first.';
  end if;
  update public.memberships set role = 'owner' where user_id = person;
  update public.memberships set role = 'admin' where user_id = auth.uid();
end $$;

create or replace function public.leave_organization()
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() = 'owner' then raise exception 'Hand ownership to an admin before leaving.'; end if;
  delete from public.memberships where user_id = auth.uid();
end $$;

create or replace function public.delete_organization(confirm_team_number integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'owner' then raise exception 'Only the owner can delete the team.'; end if;
  if not exists (select 1 from public.organizations where id = public.my_org() and team_number = confirm_team_number) then
    raise exception 'Type your team number to confirm.';
  end if;
  delete from public.organizations where id = public.my_org();
end $$;

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
    new.org_id := old.org_id;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

-- ─── Tournaments and recordings ─────────────────────────────────────────────
create table if not exists public.tournaments (
  id                uuid primary key,
  org_id            uuid not null references public.organizations (id) on delete cascade,
  data              jsonb not null,
  deleted           boolean not null default false,
  updated_at        bigint not null,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists tournaments_org_sync on public.tournaments (org_id, server_updated_at);

create table if not exists public.reports (
  id                uuid primary key,
  org_id            uuid not null references public.organizations (id) on delete cascade,
  -- Kept when the scout leaves the team; cleared only if their account is deleted.
  recorded_by       uuid references auth.users (id) on delete set null,
  tournament_id     uuid,
  match_number      integer,
  scouted_team      integer,
  data              jsonb not null,
  deleted           boolean not null default false,
  updated_at        bigint not null,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists reports_org_sync on public.reports (org_id, server_updated_at);
create index if not exists reports_tournament on public.reports (tournament_id, match_number);

-- Pre-match / pit scouting: one per team per tournament (the id is derived from both on the device).
-- Never readable through public sharing.
create table if not exists public.pit_reports (
  id                uuid primary key,
  org_id            uuid not null references public.organizations (id) on delete cascade,
  tournament_id     uuid,
  team_number       integer,
  data              jsonb not null,
  deleted           boolean not null default false,
  updated_at        bigint not null,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists pit_reports_org_sync on public.pit_reports (org_id, server_updated_at);

drop trigger if exists tournaments_sync_guard on public.tournaments;
create trigger tournaments_sync_guard before insert or update on public.tournaments
  for each row execute function public.sync_guard();
drop trigger if exists reports_sync_guard on public.reports;
create trigger reports_sync_guard before insert or update on public.reports
  for each row execute function public.sync_guard();
drop trigger if exists pit_reports_sync_guard on public.pit_reports;
create trigger pit_reports_sync_guard before insert or update on public.pit_reports
  for each row execute function public.sync_guard();

alter table public.tournaments enable row level security;
alter table public.reports enable row level security;
alter table public.pit_reports enable row level security;

-- Everyone on the team reads and writes the team's tournaments and recordings
-- (deleting is a soft delete through `deleted`); public teams are readable by anyone.
drop policy if exists "tournaments: read" on public.tournaments;
create policy "tournaments: read" on public.tournaments for select using (
  org_id = public.my_org() or public.is_public_org(org_id)
);
drop policy if exists "tournaments: write" on public.tournaments;
create policy "tournaments: write" on public.tournaments for insert to authenticated with check (org_id = public.my_org());
drop policy if exists "tournaments: update" on public.tournaments;
create policy "tournaments: update" on public.tournaments for update to authenticated
  using (org_id = public.my_org()) with check (org_id = public.my_org());

drop policy if exists "reports: read" on public.reports;
create policy "reports: read" on public.reports for select using (
  org_id = public.my_org() or public.is_public_org(org_id)
);
drop policy if exists "reports: write" on public.reports;
create policy "reports: write" on public.reports for insert to authenticated with check (org_id = public.my_org());
drop policy if exists "reports: update" on public.reports;
create policy "reports: update" on public.reports for update to authenticated
  using (org_id = public.my_org()) with check (org_id = public.my_org());

drop policy if exists "pit_reports: read" on public.pit_reports;
create policy "pit_reports: read" on public.pit_reports for select to authenticated using (org_id = public.my_org());
drop policy if exists "pit_reports: write" on public.pit_reports;
create policy "pit_reports: write" on public.pit_reports for insert to authenticated with check (org_id = public.my_org());
drop policy if exists "pit_reports: update" on public.pit_reports;
create policy "pit_reports: update" on public.pit_reports for update to authenticated
  using (org_id = public.my_org()) with check (org_id = public.my_org());

revoke all on public.pit_reports from anon, authenticated;
grant select, insert, update on public.pit_reports to authenticated;

revoke all on public.tournaments, public.reports from anon, authenticated;
grant select on public.tournaments, public.reports to anon, authenticated;
grant insert, update on public.tournaments, public.reports to authenticated;

grant execute on function public.username_available(text), public.team_number_available(integer) to anon, authenticated;
grant execute on function
  public.create_organization(integer, text), public.join_with_code(text), public.accept_invite(uuid),
  public.decline_invite(uuid), public.invite_member(text), public.cancel_invite(uuid), public.org_join_code(),
  public.new_join_code(), public.update_organization(text, boolean), public.set_member_role(uuid, text),
  public.remove_member(uuid), public.transfer_ownership(uuid), public.leave_organization(),
  public.delete_organization(integer)
to authenticated;
