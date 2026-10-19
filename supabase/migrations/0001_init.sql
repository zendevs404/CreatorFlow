-- CreatorFlow Phase 1 schema. All timestamps are timestamptz (stored in UTC).

create extension if not exists pgcrypto;

create type public.post_status as enum ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled');
create type public.attempt_outcome as enum ('started', 'succeeded', 'failed');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Connected Threads accounts (populated in Phase 2) --------------------------
-- Token columns hold ciphertext only, written by server code with a server-only key.
-- No policy lets the browser role read them (see column-level revoke below).
create table public.threads_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  threads_user_id text not null,
  username text,
  access_token_ciphertext text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, threads_user_id)
);
create index threads_accounts_user_idx on public.threads_accounts (user_id);

-- Posts -----------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  threads_account_id uuid references public.threads_accounts (id) on delete set null,
  content text not null default '' check (char_length(content) <= 2000),
  status public.post_status not null default 'draft',
  scheduled_at timestamptz,
  timezone text not null default 'UTC',
  external_container_id text,
  external_post_id text,
  published_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_needs_time check (status <> 'scheduled' or scheduled_at is not null),
  constraint published_needs_time check (status <> 'published' or published_at is not null)
);
create trigger posts_updated before update on public.posts
  for each row execute function public.set_updated_at();
create index posts_user_status_idx on public.posts (user_id, status);
create index posts_user_scheduled_idx on public.posts (user_id, scheduled_at) where scheduled_at is not null;
create index posts_due_idx on public.posts (scheduled_at) where status = 'scheduled';
create unique index posts_external_post_uidx on public.posts (external_post_id) where external_post_id is not null;

-- Publishing attempts (written by server jobs in Phase 2) ---------------------
create table public.publishing_attempts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempt_number int not null check (attempt_number > 0),
  outcome public.attempt_outcome not null default 'started',
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (post_id, attempt_number)
);
create index publishing_attempts_post_idx on public.publishing_attempts (post_id);
create index publishing_attempts_user_idx on public.publishing_attempts (user_id, started_at desc);

-- Row Level Security ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.threads_accounts enable row level security;
alter table public.posts enable row level security;
alter table public.publishing_attempts enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy threads_accounts_select on public.threads_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy threads_accounts_delete on public.threads_accounts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy posts_select on public.posts for select to authenticated using (user_id = (select auth.uid()));
create policy posts_insert on public.posts for insert to authenticated with check (
  user_id = (select auth.uid()) and status in ('draft', 'scheduled')
);
create policy posts_update on public.posts for update to authenticated
  using (user_id = (select auth.uid()) and status in ('draft', 'scheduled', 'failed', 'cancelled'))
  with check (user_id = (select auth.uid()) and status in ('draft', 'scheduled', 'failed', 'cancelled'));
create policy posts_delete on public.posts for delete to authenticated
  using (user_id = (select auth.uid()) and status in ('draft', 'scheduled', 'failed', 'cancelled'));

create policy attempts_select on public.publishing_attempts for select to authenticated
  using (user_id = (select auth.uid()));

-- Browsers never read token ciphertext, and clients cannot forge publishing results.
revoke all on public.threads_accounts from anon, authenticated;
grant select (id, user_id, threads_user_id, username, token_expires_at, connected_at, revoked_at)
  on public.threads_accounts to authenticated;
grant delete on public.threads_accounts to authenticated;

revoke all on public.posts from anon, authenticated;
grant select on public.posts to authenticated;
grant insert (content, status, scheduled_at, timezone, user_id) on public.posts to authenticated;
grant update (content, status, scheduled_at, timezone, failure_reason) on public.posts to authenticated;
grant delete on public.posts to authenticated;

revoke all on public.publishing_attempts from anon, authenticated;
grant select on public.publishing_attempts to authenticated;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
