# Using Google Gemini (free tier) for AI assist

## 1. Get a key
1. Open https://aistudio.google.com/apikey and sign in with a Google account.
2. Create an API key. Keep it secret: it is a server-side secret like the Supabase service-role key.

## 2. Configure the app
In `.env.local`:

```
GEMINI_API_KEY=your-key
# optional: AI_MODEL=gemini-3.8-flash
```

Restart `pnpm dev`. Open the Content Studio, expand **AI assist**: the Generate button should now be available and the note under it should mention Google Gemini.

Do not set `AI_PROVIDER` unless you also have an Anthropic key and want to choose; with only a Gemini key it is picked automatically.

## 3. Which model
Google's pricing page (checked 2026-10-21) lists these text models as **free of charge** on the Free tier: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview` and `gemini-2.5-pro`. `gemini-4-argon` and `gemini-3.1-pro-preview` are not on the free tier. The app defaults to `gemini-3.5-flash-lite`, which Google describes as cost-efficient and is plenty for short posts. Use `AI_MODEL=gemini-3.8-flash` if you want higher quality. Preview models can change or be retired, and Google updates this list, so re-check https://ai.google.dev/gemini-api/docs/pricing before relying on a model.

## 4. Free-tier limits and privacy
- Exact free-tier request limits per model are not published in Google's docs; they are shown in AI Studio (https://aistudio.google.com/rate-limit) and apply **per Google project**, so every user of your app shares them. When the quota runs out the editor says "Gemini's free quota is used up for now". The app's own limit of 20 AI requests per user per hour is separate and does not protect Google's quota.
- **On the free tier, Google may use the content you send to improve its products** (pricing page: "Used to improve our products: Yes"). Posts a user sends to AI assist are sent to Google. The paid tier does not use content for that. If this is not acceptable for your users, switch to a paid key or another provider. The app shows this notice in the AI panel and in `/privacy`.
- The app asks Google not to store each interaction (`store: false`).

## 5. Test the key outside the app
macOS / Linux:
```
curl -X POST "https://generativelanguage.googleapis.com/v1beta/interactions" \
  -H "x-goog-api-key: $GEMINI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gemini-3.5-flash-lite","input":"Say hello in five words"}'
```
Windows PowerShell (replace YOUR_KEY):
```
curl.exe -X POST "https://generativelanguage.googleapis.com/v1beta/interactions" -H "x-goog-api-key: YOUR_KEY" -H "Content-Type: application/json" -d "{\"model\":\"gemini-3.5-flash-lite\",\"input\":\"Say hello in five words\"}"
```
A JSON reply with text means the key and model work. Common errors: `API key not valid` (wrong key), `404` (model name not available to you), `429` (free quota used up).

## 6. Troubleshooting
- Panel says AI is off: `GEMINI_API_KEY` is empty or the server was not restarted.
- The terminal running `pnpm dev` prints `Gemini API error { status, googleStatus, message }` for every failed call (never the key). Send that line if you need help.
- Replies "not in the expected format": the model returned text that was not JSON; press Generate again, or try `gemini-3.8-flash`.
