/**
 * Server-side AI provider adapters (Google Gemini and Anthropic). API keys never leave the server. Another provider only
 * needs to implement `AiProvider`. With no key configured, AI is off and the UI says why:
 * nothing is ever generated locally or faked.
 */
export type AiErrorKind = "not_configured" | "unauthorized" | "rate_limited" | "unavailable" | "bad_output";

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface AiProvider {
  readonly name: string;
  generate(req: { system: string; prompt: string; maxTokens: number }): Promise<string>;
}

export const DEFAULT_AI_MODEL = "claude-sonnet-5-5";

export function createAnthropicProvider(opts: { apiKey: string; model?: string; fetch?: typeof fetch; timeoutMs?: number }): AiProvider {
  const doFetch = opts.fetch ?? fetch;
  const model = opts.model || DEFAULT_AI_MODEL;
  return {
    name: "anthropic",
    async generate({ system, prompt, maxTokens }) {
      let res: Response;
      try {
        res = await doFetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });
      } catch {
        throw new AiError("unavailable", "The AI provider could not be reached.");
      }
      if (res.status === 401 || res.status === 403) throw new AiError("unauthorized", "The AI provider rejected the server's API key.");
      if (res.status === 429) throw new AiError("rate_limited", "The AI provider is rate limiting requests. Try again shortly.");
      if (!res.ok) throw new AiError("unavailable", `The AI provider returned an error (HTTP ${res.status}).`);
      const body: unknown = await res.json().catch(() => null);
      const content = typeof body === "object" && body !== null && "content" in body ? (body as { content: unknown }).content : null;
      const text = Array.isArray(content)
        ? content.flatMap((c) => (typeof c === "object" && c !== null && (c as { type?: unknown }).type === "text" && typeof (c as { text?: unknown }).text === "string" ? [(c as { text: string }).text] : [])).join("")
        : "";
      if (!text) throw new AiError("bad_output", "The AI provider returned an empty response.");
      return text;
    },
  };
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Pull the model's text out of an Interactions API reply (steps[] of type "model_output"; thoughts are skipped). */
export function extractGeminiText(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const record = body as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text) return record.output_text;
  const steps = Array.isArray(record.steps) ? record.steps : [];
  const parts: string[] = [];
  for (const step of steps) {
    if (typeof step !== "object" || step === null || (step as { type?: unknown }).type !== "model_output") continue;
    const content = (step as { content?: unknown }).content;
    if (typeof content === "string") parts.push(content);
    else if (Array.isArray(content)) {
      for (const c of content) {
        if (typeof c === "object" && c !== null && (c as { type?: unknown }).type === "text" && typeof (c as { text?: unknown }).text === "string") parts.push((c as { text: string }).text);
      }
    }
  }
  return parts.join("");
}

/**
 * Google Gemini adapter (Interactions API, https://ai.google.dev/gemini-api/docs/text-generation). The key is sent in the
 * x-goog-api-key header, never in the URL. `store: false` asks Google not to keep the interaction server-side.
 */
export function createGeminiProvider(opts: { apiKey: string; model?: string; fetch?: typeof fetch; timeoutMs?: number }): AiProvider {
  const doFetch = opts.fetch ?? fetch;
  const model = opts.model || DEFAULT_GEMINI_MODEL;
  return {
    name: "gemini",
    async generate({ system, prompt, maxTokens }) {
      let res: Response;
      try {
        res = await doFetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
          body: JSON.stringify({
            model,
            input: prompt,
            system_instruction: system,
            store: false,
            // Thinking tokens may count toward this limit, so leave generous room beyond the visible reply.
            generation_config: { max_output_tokens: Math.max(maxTokens, 4096) },
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
        });
      } catch {
        throw new AiError("unavailable", "The AI provider could not be reached.");
      }
      if (!res.ok) {
        const errBody: unknown = await res.json().catch(() => null);
        const err = typeof errBody === "object" && errBody !== null && "error" in errBody ? (errBody as { error?: { status?: unknown; message?: unknown } }).error : undefined;
        const message = typeof err?.message === "string" ? err.message : "";
        // Safe to log: Google's error text does not contain the key. Never log request headers.
        console.error("Gemini API error", { status: res.status, googleStatus: err?.status, message: message.slice(0, 200) });
        if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(message))) {
          throw new AiError("unauthorized", "Gemini rejected the server's API key. Check GEMINI_API_KEY.");
        }
        if (res.status === 429) throw new AiError("rate_limited", "Gemini's free quota is used up for now (it is shared by everyone using this app). Try again later.");
        if (res.status === 404) throw new AiError("unavailable", "The configured Gemini model was not found. Check AI_MODEL.");
        throw new AiError("unavailable", `The AI provider returned an error (HTTP ${res.status}).`);
      }
      const text = extractGeminiText(await res.json().catch(() => null));
      if (!text) throw new AiError("bad_output", "The AI provider returned an empty response.");
      return text;
    },
  };
}

type Choice = { provider: "gemini" | "anthropic" } | { error: string };

/** AI_PROVIDER picks explicitly; otherwise Gemini is used when GEMINI_API_KEY is set, else Anthropic. */
function chooseProvider(): Choice | null {
  const gemini = process.env.GEMINI_API_KEY?.trim();
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    if (explicit !== "gemini" && explicit !== "anthropic") return { error: "AI assistance is off because AI_PROVIDER must be \"gemini\" or \"anthropic\"." };
    const key = explicit === "gemini" ? gemini : anthropic;
    if (!key) return { error: `AI assistance is off because AI_PROVIDER is "${explicit}" but ${explicit === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"} is empty.` };
    return { provider: explicit };
  }
  if (gemini) return { provider: "gemini" };
  if (anthropic) return { provider: "anthropic" };
  return null;
}

/** Provider for this server, or null when AI is not configured. */
export function getAiProvider(): AiProvider | null {
  const choice = chooseProvider();
  if (!choice || "error" in choice) return null;
  const model = process.env.AI_MODEL?.trim() || undefined;
  return choice.provider === "gemini"
    ? createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY?.trim() ?? "", model })
    : createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() ?? "", model });
}

export type AiStatus = { enabled: true; provider: "gemini" | "anthropic"; notice: string } | { enabled: false; reason: string };

const NOTICES = {
  gemini: "Your text is sent to Google Gemini. On Gemini's free tier, Google may use submitted content to improve its products.",
  anthropic: "Your text is sent to the configured AI provider (Anthropic).",
} as const;

export function getAiStatus(): AiStatus {
  const choice = chooseProvider();
  if (!choice) {
    return { enabled: false, reason: "AI assistance is off because no AI provider key is configured on the server. Set GEMINI_API_KEY (a free tier is available) or ANTHROPIC_API_KEY (see .env.example) and restart." };
  }
  if ("error" in choice) return { enabled: false, reason: choice.error };
  return { enabled: true, provider: choice.provider, notice: NOTICES[choice.provider] };
}

/** Serializable shape for the UI (never includes keys). */
export function getAiUiProps(): { enabled: boolean; reason: string | null; notice: string | null } {
  const status = getAiStatus();
  return status.enabled ? { enabled: true, reason: null, notice: status.notice } : { enabled: false, reason: status.reason, notice: null };
}
