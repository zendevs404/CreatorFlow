# Deployment guide

Target setup: **Vercel** (app) + **Supabase** (auth, database, storage) + **Inngest Cloud** (scheduler). Any Node 22 host works the same way. Nothing here has been run against your accounts; follow it in order and use the checklist at the end.

## 1. Supabase
1. Create a project. In the SQL Editor run, in order: `0001_init.sql`, `0002_post_media.sql`, `0003_publishing.sql`, `0004_insights_ai_deletion.sql`.
2. Authentication > URL Configuration: set **Site URL** to your production URL and add `https://<domain>/auth/confirm` to **Redirect URLs**. Keep email confirmation on.
3. Copy the project URL, `anon` key, and `service_role` key (the service-role key is a secret that bypasses RLS: server only).
4. Storage: confirm bucket `post-media` exists and is **private**.
5. Enable backups (Project Settings > Database) before real users arrive.

## 2. Inngest Cloud
1. Create an app, then copy the **Event key** and **Signing key**.
2. After the first deploy, sync the app: Inngest dashboard > Apps > Sync new app > `https://<domain>/api/inngest`.
3. You should see 5 entries: `dispatch-due-posts`, `publish-post` (and its failure handler), `refresh-threads-tokens`, `refresh-insights`.
4. Do **not** set `INNGEST_DEV` in production.

## 3. Meta app (Threads)
1. Use case **Access the Threads API**: add permissions `threads_basic`, `threads_content_publish`, and `threads_manage_insights`.
2. Settings, add exactly these (HTTPS, no trailing slashes):
   - Valid OAuth redirect URI: `https://<domain>/api/threads/callback`
   - Deauthorize callback URL: `https://<domain>/api/threads/deauthorize`
   - Data Deletion Requests URL: `https://<domain>/api/threads/data-deletion`
3. Publishing the app needs a privacy policy URL (`https://<domain>/privacy`, a starter you must review and complete), an app icon, and a data-deletion URL (above). Follow Meta's App Review documentation for `threads_content_publish` and `threads_manage_insights`. Until the app is published and reviewed, only people with an app role (for example Threads Tester) can connect.

## 4. Vercel
1. Import the repository. Framework preset: Next.js. Package manager: pnpm.
2. Environment variables (Production): every name in `.env.example` without a leading `#`, plus `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`. Set `NEXT_PUBLIC_SITE_URL` to the bare production origin (no path). `TOKEN_ENCRYPTION_KEY`: `openssl rand -base64 32`, generated once and stored in a secret manager.
3. Deploy, then sync Inngest (section 2).

## 5. Operating notes
- **Rotating `TOKEN_ENCRYPTION_KEY`** makes stored tokens unreadable. Users must reconnect Threads. There is no in-place re-encryption tool.
- **Delivery delay**: scheduled posts go out within about a minute of their time (the dispatcher runs every minute).
- **Rate limits**: Threads allows 250 API posts per 24 h per profile; the app defers rather than fails when reached. AI assist is limited to 20 requests per user per hour.
- **Monitoring**: watch the Inngest dashboard for failed `publish-post` runs. Failed posts show a reason to the user in Posts.
- **Auth abuse**: Supabase Auth applies its own rate limits to sign-in and sign-up; review them under Authentication > Rate Limits.

## 6. Launch checklist
- [ ] All four migrations ran without errors.
- [ ] Two test accounts: account B cannot see account A's posts, images, analytics, or Threads connection (try opening A's `/posts?edit=<id>` as B: it must say not found).
- [ ] `pnpm check` is green locally; `BASE_URL=https://<domain> pnpm smoke` passes against production.
- [ ] Connect Threads, publish a text post, an image post, and a 3-image carousel (see `docs/PHASE2-TESTING.md`).
- [ ] Cancel, reschedule and delete a scheduled post; none publishes.
- [ ] Refresh Analytics and compare a post's numbers with the Threads app.
- [ ] Use Meta's data-deletion test (`docs/PHASE3-TESTING.md`) and confirm the status page.
- [ ] Browser devtools: no secret values appear in page source or network responses.
- [ ] `.env.local` is not in git; secrets exist only in the host's secret store.
