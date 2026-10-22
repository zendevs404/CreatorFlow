-- Phase 3: insights cache, AI usage log, Meta data-deletion log. Run after 0001-0003.

alter table public.threads_accounts add column insights_enabled boolean not null default false;
grant select (insights_enabled) on public.threads_accounts to authenticated;

-- Latest insights snapshot per published post. NULL means "Threads did not return this metric".
create table public.post_insights (
  post_id uuid primary key references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  views int, likes int, replies int, reposts int, quotes int, shares int,
  fetched_at timestamptz not null default now()
);
create index post_insights_user_idx on public.post_insights (user_id);

-- Latest account-level snapshot (7-day totals plus follower count).
create table public.account_insights (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  threads_account_id uuid references public.threads_accounts (id) on delete set null,
  followers_count int,
  views_7d int, likes_7d int, replies_7d int, reposts_7d int, quotes_7d int,
  range_start timestamptz,
  range_end timestamptz,
  fetched_at timestamptz not null default now()
);

alter table public.post_insights enable row level security;
alter table public.account_insights enable row level security;
create policy post_insights_select on public.post_insights for select to authenticated using (user_id = (select auth.uid()));
create policy account_insights_select on public.account_insights for select to authenticated using (user_id = (select auth.uid()));
-- Only the server (service role) writes insights.
revoke all on public.post_insights, public.account_insights from anon, authenticated;
grant select on public.post_insights, public.account_insights to authenticated;

-- AI usage log, used for per-user rate limiting.
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('ideas', 'hooks', 'rewrite', 'variations')),
  created_at timestamptz not null default now()
);
create index ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
create policy ai_usage_insert on public.ai_usage for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant insert (user_id, action) on public.ai_usage to authenticated;

-- Meta data-deletion requests (server only; the public status page reads it with the service role).
create table public.data_deletion_requests (
  confirmation_code text primary key,
  threads_user_id text not null,
  status text not null check (status in ('completed', 'no_data')),
  requested_at timestamptz not null default now()
);
alter table public.data_deletion_requests enable row level security;
revoke all on public.data_deletion_requests from anon, authenticated;
