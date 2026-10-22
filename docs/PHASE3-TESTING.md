# Phase 3 test procedure

Automated checks (`pnpm check`, `pnpm smoke`) use mocks and need no credentials. The steps below need real accounts.

## AI assist
1. **Off state**: with `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` empty, open the Content Studio and expand "AI assist". It must say AI is off and name the missing key. No Generate button is shown.
2. **On state**: set `GEMINI_API_KEY` (see `docs/GEMINI-SETUP.md`) or `ANTHROPIC_API_KEY`, restart `pnpm dev`. Try Ideas (type a topic), Hooks, Rewrite (pick a tone) and Variations (with text in the editor). Every suggestion must show a count of 500 or less; "Use this" replaces the editor text after confirming.
3. **Bad key**: put a wrong key; expect "The AI provider rejected the server's API key." and no suggestions.
4. **Limit**: after 20 requests within an hour, expect "You reached the limit of 20 AI requests per hour."
5. Confirm the key is not visible in page source or network responses.
6. Check the default model name against your provider's current model list; set `AI_MODEL` if needed. On Gemini, a "free quota is used up" message means the free tier limit was hit; wait or change model.

## Insights
1. In the Meta app, add `threads_manage_insights`. An account connected before this phase must reconnect: Analytics shows "Analytics permission needed" until it does.
2. Analytics > Refresh from Threads. Compare followers, 7-day numbers and per-post numbers with the Threads app. A "—" means Threads returned nothing for that metric.
3. Press Refresh twice quickly: the second shows "refreshed a few minutes ago" (15-minute throttle).
4. Record observed behavior for `shares` (not requested yet) and for `views` (Meta marks it in development).

## Meta callbacks
1. Meta's own test: in Facebook settings > Apps and Websites, remove the app, open "View Removed Apps and Websites", and click Send Request. Expect the status page at `/data-deletion?code=...` to say "Completed" and the Threads connection to disappear from Settings.
2. Without Meta, simulate a request. Replace `<secret>` and `<threads_user_id>`:
   ```
   node -e "const c=require('crypto');const p=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:'<threads_user_id>'})).toString('base64url');console.log(c.createHmac('sha256','<secret>').update(p).digest('base64url')+'.'+p)"
   curl -X POST -F "signed_request=<output>" https://<domain>/api/threads/data-deletion
   ```
   Expect JSON with `url` and `confirmation_code`. A wrong secret must return HTTP 400.
3. Open question: Meta's pages describe `user_id` as an app-scoped id. We match it against the stored Threads user id. If your test request finds no data (`no_data`) for a connected user, tell the maintainer: the id mapping differs.

## Isolation (two accounts)
1. Create accounts A and B. As A: save a draft with an image, connect Threads, publish, refresh analytics.
2. As B: open A's `/posts?edit=<A's post id>` (must say not found); `/posts` and `/analytics` must show only B's data; B's browser cannot download A's image URL path from the `post-media` bucket.
