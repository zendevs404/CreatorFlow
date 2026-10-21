# Phase 2 integration test procedure (needs real Meta credentials)

Automated tests mock Meta (`pnpm test`). They prove our request shapes and decision logic, **not** that Meta accepts them.
Run this procedure once against a real Threads account before relying on publishing.

## 0. One-time setup
1. Meta for Developers: create an app and add the **Access the Threads API** use case. Add permissions `threads_basic` (required) and `threads_content_publish`.
2. App settings: copy the **Threads app ID** and **Threads app secret** into `.env.local`.
3. Add the OAuth redirect URI shown in CreatorFlow > Settings (it is `<NEXT_PUBLIC_SITE_URL>/api/threads/callback`) to **Valid OAuth redirect URIs**. It must match exactly. Meta may require HTTPS; if `http://localhost:3000` is rejected, run a tunnel (for example ngrok or cloudflared) and set `NEXT_PUBLIC_SITE_URL` to the tunnel's HTTPS URL.
4. App roles: add the Threads account you will test with as a **Threads Tester** and accept the invitation in the Threads app. Apps in development mode only work for people with an app role.
5. Run all three SQL migrations in Supabase (`0001`, `0002`, `0003`).
6. `.env.local`: set every variable in `.env.example`. Generate `TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32`.
7. Terminal 1: `pnpm dev`. Terminal 2: `npx inngest-cli@latest dev` (dashboard at http://localhost:8288 should list 4 functions: dispatch-due-posts, publish-post, its failure handler, refresh-threads-tokens).

## 1. Connect
- Settings > Connect Threads > approve. Expect the green "Threads connected." banner and your @username.
- Supabase table `threads_accounts`: `access_token_ciphertext` starts with `v1.` (never a raw token), `token_expires_at` is about 60 days out.
- Cancel the Meta dialog: expect the "permission was not granted" banner and no row.
- Open `/api/threads/callback?code=x&state=bad` while signed in: expect the "could not be verified" banner.

## 2. Publish immediately-due text post
1. Content Studio: write a short text post, schedule it 2 minutes ahead.
2. Within about a minute of the time: Inngest shows `dispatch-due-posts` claiming it, then a `publish-post` run. The post status goes scheduled > publishing > published; `external_post_id` is set; the post appears on your Threads profile **once**.
3. `publishing_attempts` has one row, outcome `succeeded`.

## 3. Images
- One image + caption: should publish as a single image post.
- Three images: should publish as a carousel. Expect a ~30 s wait step before publishing.
- Image-only (no text): should publish.
- Image over 8 MB or aspect ratio beyond 10:1 is rejected in the editor. If you can get one past it, expect a failed post with Threads' reason.

## 4. Safety checks
- **Cancel**: schedule 3 minutes ahead, cancel in the Calendar. Nothing publishes; the post stays `cancelled`.
- **Reschedule**: schedule, then move it later in the Calendar. It publishes at the new time only.
- **Delete before due**: schedule then delete. No run publishes anything.
- **Duplicate guard**: in the Inngest dashboard, re-send a completed `post/publish.requested` event. The run must report "skipped" and nothing new appears on Threads.
- **Offline**: schedule, close the browser, wait. It still publishes.
- **Disconnect**: schedule a post, disconnect Threads before it is due. Expect status `failed` with "No Threads account is connected".
- **Bad token**: edit the row's `needs_reauth` to true (SQL editor). Scheduling in the UI is blocked and Settings shows "Reconnect".

## 5. Things the docs leave open (record what you observe)
- How Meta counts links and emoji at the 500 limit (we count emojis as UTF-8 bytes, per the docs).
- The exact error body Meta returns for an expired/revoked token (we treat HTTP 401 and OAuth error code 190 as "reconnect").
- Whether a container in `PUBLISHED` state exposes the media id (we record the post as published without an id if a previous response was lost).
- Token refresh: after 24 h, trigger the `refresh-threads-tokens` function from the Inngest dashboard with an account whose token is within 20 days of expiry, and confirm `token_expires_at` moves out.

## Known blocker for a public launch
Meta requires a **Deauthorize callback URL** and a **Data Deletion Requests URL** in the app settings, plus App Review for `threads_content_publish` before anyone outside your app roles can connect. Those endpoints are not implemented yet; they are planned for Phase 3 hardening.
