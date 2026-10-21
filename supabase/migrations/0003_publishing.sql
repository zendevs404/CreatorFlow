-- Phase 2: publishing support. Run after 0001 and 0002.

alter table public.threads_accounts
  add column token_refreshed_at timestamptz,
  add column needs_reauth boolean not null default false,
  add column last_error text;

alter table public.posts add column claimed_at timestamptz;
create index posts_stale_publishing_idx on public.posts (claimed_at) where status = 'publishing';

-- Browsers may see (but not write) the new account columns.
grant select (token_refreshed_at, needs_reauth, last_error) on public.threads_accounts to authenticated;

-- Atomically claim due posts. FOR UPDATE SKIP LOCKED means two workers can never claim the same row,
-- and a post the user cancelled or rescheduled a moment earlier is simply no longer 'scheduled'.
create or replace function public.claim_due_posts(batch_size int default 25)
returns table (id uuid, user_id uuid)
language sql security definer set search_path = public as $$
  with due as (
    select p.id from public.posts p
    where p.status = 'scheduled' and p.scheduled_at <= now()
    order by p.scheduled_at
    limit greatest(batch_size, 1)
    for update skip locked
  )
  update public.posts p
     set status = 'publishing', claimed_at = now()
    from due
   where p.id = due.id
  returning p.id, p.user_id;
$$;

-- Posts stuck in 'publishing' (worker died, event lost) are handed out again. The publisher is idempotent:
-- it reuses the stored container id and checks the container status before publishing.
create or replace function public.requeue_stale_publishing(stale_after interval default interval '15 minutes')
returns table (id uuid, user_id uuid, claimed_at timestamptz)
language sql security definer set search_path = public as $$
  with stale as (
    select p.id from public.posts p
    where p.status = 'publishing' and p.claimed_at < now() - stale_after
    for update skip locked
  )
  update public.posts p set claimed_at = now()
    from stale
   where p.id = stale.id
  returning p.id, p.user_id, p.claimed_at;
$$;

revoke all on function public.claim_due_posts(int) from public, anon, authenticated;
revoke all on function public.requeue_stale_publishing(interval) from public, anon, authenticated;
grant execute on function public.claim_due_posts(int) to service_role;
grant execute on function public.requeue_stale_publishing(interval) to service_role;
