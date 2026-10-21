# CreatorFlow (Phase 2)

A Threads-first content workspace: write posts, save drafts, schedule them on a calendar, and manage everything in one place.
**Phase 2 adds real publishing**: official Threads OAuth, encrypted token storage, and durable scheduled publishing through Inngest. It has been tested against mocks only; run `docs/PHASE2-TESTING.md` with real Meta credentials before relying on it.

## Stack
Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui-style components (hand-written to the shadcn conventions; see `components.json`), Radix Dialog, Lucide, Supabase (Auth, Postgres, RLS), Zod, Vitest + React Testing Library. Package manager: pnpm.

## Setup
1. `pnpm install`
2. Create a Supabase project. In the SQL editor, run `supabase/migrations/0001_init.sql`, then `0002_post_media.sql` (private `post-media` bucket, storage policies, `post_media` table), then `0003_publishing.sql` (token refresh columns, atomic claim functions).
3. Supabase > Authentication > URL Configuration: add `http://localhost:3000/auth/confirm` to redirect URLs (and your production URL later). Email confirmation can stay on; the app handles the confirmation link.
4. `cp .env.example .env.local` and fill in every value (see comments inside). `TOKEN_ENCRYPTION_KEY`: `openssl rand -base64 32`.
5. Meta app setup, redirect URI, and test users: follow section 0 of `docs/PHASE2-TESTING.md`.
6. Terminal 1: `pnpm dev`. Terminal 2: `npx inngest-cli@latest dev` (runs the scheduler locally; `INNGEST_DEV=1` in `.env.local`). Open http://localhost:3000. Without Supabase variables the app shows a setup page.

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

## Publishing (Phase 2)
- **Connect**: Settings > Connect Threads runs Meta's OAuth (`threads_basic`, `threads_content_publish`). A random `state` is stored in an httpOnly cookie and compared in constant time on return; the code is exchanged for a short-lived token, then a 60-day long-lived token (server-side only, using the app secret). Tokens are encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, bound to the user and Threads id) and the ciphertext columns are not readable by the browser role.
- **Refresh**: a daily job refreshes tokens that are at least 24 h old and have under 20 days left (Meta's rules). A rejected refresh flags the account and Settings asks the user to reconnect.
- **Scheduling gate**: scheduling requires a connected, unexpired account. Drafts do not.
- **Durable jobs (Inngest)**: every minute `dispatch-due-posts` calls `claim_due_posts()`, which atomically moves due `scheduled` posts to `publishing` (`FOR UPDATE SKIP LOCKED`), and re-queues posts stuck in `publishing` for 15 minutes. `publish-post` runs one post at a time per user as separate steps (create container, wait, publish, record), with 5 retries and backoff. Scheduled publishing therefore works with the browser closed; expect up to about a minute of delay after the scheduled time.
- **No duplicates**: the Threads container id is saved before publishing and reused on retries; before `threads_publish` the container status is checked and a `PUBLISHED` container is never published again; the final status update only applies while the post is still `publishing`.
- **Cancel / reschedule / delete**: users can only change `scheduled` posts, and a post the user cancelled or moved is no longer `scheduled`, so it cannot be claimed. A post deleted or cancelled mid-run is skipped at every stage.
- **Rate limits**: the 250 posts / 24 h quota is read from Threads before creating a container; when it is used up the post is moved 30 minutes later with a note, not failed. HTTP 429 and 5xx are retried; other 4xx responses fail the post with Meta's message.
- **Failures** are visible in Posts (red reason), the editor, and the Dashboard's publishing activity (`publishing_attempts`). A failed post can be rescheduled.
- **Images** are served to Meta through 1-hour signed URLs from the private bucket, created at publish time.
- **Character counting**: Meta counts emojis as their UTF-8 bytes, so the counter and server validation do too (Phase 1 counted code points; that was wrong). A post may also contain at most 5 unique links.

## Drafts, editing, and images
- **Content Studio** is for new posts only. After "Save draft" or "Schedule post" every field (text, images, schedule) resets so you can start the next post.
- **Posts** is where drafts live. Clicking a post (also from Dashboard or Calendar) opens the same editor in a modal at `/posts?edit=<id>`; filters are preserved. `/studio/<id>` redirects there.
- **Images**: up to 20 per post, JPEG or PNG, 8 MB each, aspect ratio between 0.01:1 and 10:1 (Meta's documented limits; one image posts as a single image, 2 or more as a carousel). Files upload from the browser straight to the private `post-media` bucket under your user id folder (storage policies enforce this); the server re-verifies ownership and that each file exists before saving. Phase 2 will create short-lived signed URLs for Meta to fetch at publish time.
- Not included: alt text, video, reordering. Images uploaded and then abandoned without saving the post, or by closing the tab, can remain as orphan files; a cleanup job belongs in Phase 3.

## Decisions
- **Limits**: 500 characters per text post (emojis as UTF-8 bytes), 250 API posts per rolling 24 hours, 5 links, from Meta's Threads docs.
- **Ownership**: every server action filters by `user_id` and re-checks the session with `auth.getUser()`; RLS enforces the same in the database.
- **Status integrity**: clients cannot write `published`/`publishing`, external IDs, or publishing attempts (RLS `with check` plus column-level grants). Only the Phase 2 server job (service role) can.
- **Timestamps**: `timestamptz` in UTC; each post keeps the timezone it was scheduled in; display uses the profile timezone.
- **Tokens**: encrypted at rest; the service-role client is used only by the OAuth callback, publisher and refresh job, and every query there filters by user.
- **shadcn/ui**: the CLI could not be run offline, so primitives are written by hand in `src/components/ui`. They can be swapped for CLI-generated ones.
- **TypeScript 6** is pinned because `typescript-eslint` does not support TS 7 yet.

## Not verified here
No real Supabase project was available when this was built, so sign-up, sign-in, RLS behavior, and data flows were **not** tested end to end. After step 2-4 above, create an account, then check: draft create/edit/delete, scheduling, rescheduling and cancelling in the calendar, and that a second account cannot see the first account's posts.

## Known gaps and blockers
- Not tested against real Meta or a real Supabase project here. Use `docs/PHASE2-TESTING.md`.
- Meta requires a Deauthorize callback URL and a Data Deletion Requests URL, and App Review for `threads_content_publish`, before users outside your app roles can connect. The two endpoints are not built yet (Phase 3).
- Disconnecting deletes our stored token. Meta's docs describe no revocation endpoint, so users can also remove the app inside Threads.
- Orphaned uploads and Threads containers that expire after 24 h are harmless; a cleanup job is Phase 3.

## Phase 3 (next)
Optional server-side AI assistance (disabled with an explanation when no provider key is set), real Threads insights for Analytics, the deauthorize / data-deletion callbacks, end-to-end smoke tests, security checks, and deployment docs.
