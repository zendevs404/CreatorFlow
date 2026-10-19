# CreatorFlow (Phase 1)

A Threads-first content workspace: write posts, save drafts, schedule them on a calendar, and manage everything in one place.
**Phase 1 does not publish to Threads.** Scheduled posts are stored and shown, but nothing is sent until Phase 2 (official OAuth + durable jobs).

## Stack
Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui-style components (hand-written to the shadcn conventions; see `components.json`), Radix Dialog, Lucide, Supabase (Auth, Postgres, RLS), Zod, Vitest + React Testing Library. Package manager: pnpm.

## Setup
1. `pnpm install`
2. Create a Supabase project. In the SQL editor, run `supabase/migrations/0001_init.sql`.
3. Supabase > Authentication > URL Configuration: add `http://localhost:3000/auth/confirm` to redirect URLs (and your production URL later). Email confirmation can stay on; the app handles the confirmation link.
4. `cp .env.example .env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
5. `pnpm dev` and open http://localhost:3000. Without Supabase variables the app shows a setup page.

## Scripts
`pnpm dev` | `pnpm lint` | `pnpm typecheck` | `pnpm test` | `pnpm build` | `pnpm check` (all four, in order)

## Structure
- `src/app/(app)/*` dashboard, studio, calendar, posts, analytics, settings (protected, shared glass shell)
- `src/app/(auth)/*` login and signup; `src/app/auth/confirm` email confirmation (same-origin redirects only)
- `src/proxy.ts` session refresh and route protection
- `src/lib/posts/*` schema (Zod), status model, server actions, queries
- `src/lib/threads/*` verified limits and the `ThreadsPublisher` boundary for Phase 2
- `src/lib/time.ts`, `calendar.ts` timezone-aware helpers (Intl only)
- `supabase/migrations` schema, constraints, indexes, RLS, column-level grants

## Decisions
- **Limits**: 500 characters per text post and 250 API posts per rolling 24 hours, from Meta's Threads docs. The docs don't say how emoji or links count; the counter uses Unicode code points. Verify in Phase 2.
- **Ownership**: every server action filters by `user_id` and re-checks the session with `auth.getUser()`; RLS enforces the same in the database.
- **Status integrity**: clients cannot write `published`/`publishing`, external IDs, or publishing attempts (RLS `with check` plus column-level grants). Only the Phase 2 server job (service role) can.
- **Timestamps**: `timestamptz` in UTC; each post keeps the timezone it was scheduled in; display uses the profile timezone.
- **Tokens**: `threads_accounts` has ciphertext columns that the browser role cannot select. Encryption and the service-role client arrive in Phase 2.
- **shadcn/ui**: the CLI could not be run offline, so primitives are written by hand in `src/components/ui`. They can be swapped for CLI-generated ones.
- **TypeScript 6** is pinned because `typescript-eslint` does not support TS 7 yet.

## Not verified here
No real Supabase project was available when this was built, so sign-up, sign-in, RLS behavior, and data flows were **not** tested end to end. After step 2-4 above, create an account, then check: draft create/edit/delete, scheduling, rescheduling and cancelling in the calendar, and that a second account cannot see the first account's posts.

## Phase 2 (next)
Official Threads OAuth with CSRF-protected state, encrypted token storage (server-only key), connect/disconnect, publishing (create container, then `threads_publish`), Inngest scheduled jobs with atomic claiming, idempotency, retries, cancellation, and the 250/24h limit check. Requires a Meta app, Threads permissions (App Review for production), and Inngest keys.
