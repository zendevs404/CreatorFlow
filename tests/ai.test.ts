import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assistInputSchema, parseSuggestions, runAssist } from "@/lib/ai/assist";
import { AiError, createAnthropicProvider, createGeminiProvider, DEFAULT_GEMINI_MODEL, extractGeminiText, getAiProvider, getAiStatus, getAiUiProps, type AiProvider } from "@/lib/ai/provider";

const reply = (status: number, body: unknown) => vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => new Response(JSON.stringify(body), { status }));
const provider = (raw: string): AiProvider => ({ name: "fake", generate: vi.fn(async () => raw) });

describe("AI configuration", () => {
  beforeEach(() => {
    for (const name of ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "AI_PROVIDER", "AI_MODEL"]) vi.stubEnv(name, "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is off with a clear explanation when no key is set", () => {
    const s = getAiStatus();
    expect(s.enabled).toBe(false);
    expect(s.enabled === false && s.reason).toContain("GEMINI_API_KEY");
    expect(s.enabled === false && s.reason).toContain("ANTHROPIC_API_KEY");
    expect(getAiProvider()).toBeNull();
    expect(getAiUiProps()).toMatchObject({ enabled: false, notice: null });
  });
  it("uses Gemini when only GEMINI_API_KEY is set, and tells users how their text is handled", () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    const s = getAiStatus();
    expect(s).toMatchObject({ enabled: true, provider: "gemini" });
    expect(s.enabled && s.notice).toContain("free tier");
    expect(getAiProvider()?.name).toBe("gemini");
  });
  it("uses Anthropic when only ANTHROPIC_API_KEY is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(getAiStatus()).toMatchObject({ enabled: true, provider: "anthropic" });
    expect(getAiProvider()?.name).toBe("anthropic");
  });
  it("prefers Gemini when both keys exist, unless AI_PROVIDER says otherwise", () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    expect(getAiProvider()?.name).toBe("gemini");
    vi.stubEnv("AI_PROVIDER", "anthropic");
    expect(getAiProvider()?.name).toBe("anthropic");
  });
  it("explains a mismatched or invalid AI_PROVIDER instead of silently picking one", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    const missing = getAiStatus();
    expect(missing.enabled === false && missing.reason).toContain("GEMINI_API_KEY is empty");
    vi.stubEnv("AI_PROVIDER", "openai");
    const invalid = getAiStatus();
    expect(invalid.enabled === false && invalid.reason).toContain("must be");
    expect(getAiProvider()).toBeNull();
  });
});

describe("Gemini adapter (mocked)", () => {
  const ok = { steps: [{ type: "thought", content: [{ type: "text", text: "hidden reasoning" }] }, { type: "model_output", content: [{ type: "text", text: '{"suggestions":["hi"]}' }] }] };

  it("calls the Interactions endpoint with the key in a header, not the URL, and asks Google not to store it", async () => {
    const f = reply(200, ok);
    const text = await createGeminiProvider({ apiKey: "g-secret", model: "gemini-x", fetch: f as unknown as typeof fetch }).generate({ system: "sys", prompt: "prompt", maxTokens: 1200 });
    expect(text).toBe('{"suggestions":["hi"]}');
    const [url, init] = f.mock.calls[0] ?? [];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(String(url)).not.toContain("g-secret");
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-secret");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "gemini-x", input: "prompt", system_instruction: "sys", store: false });
    expect(body.generation_config.max_output_tokens).toBeGreaterThanOrEqual(4096);
    expect(body).not.toHaveProperty("temperature");
  });
  it("uses a free-tier model by default", async () => {
    const f = reply(200, ok);
    await createGeminiProvider({ apiKey: "k", fetch: f as unknown as typeof fetch }).generate({ system: "", prompt: "", maxTokens: 1 });
    expect(JSON.parse(String(f.mock.calls[0]?.[1]?.body)).model).toBe(DEFAULT_GEMINI_MODEL);
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
  });
  it("ignores thought steps and reads output_text when present", () => {
    expect(extractGeminiText(ok)).toBe('{"suggestions":["hi"]}');
    expect(extractGeminiText({ output_text: "direct" })).toBe("direct");
    expect(extractGeminiText({ steps: [{ type: "model_output", content: "plain string" }] })).toBe("plain string");
    expect(extractGeminiText(null)).toBe("");
    expect(extractGeminiText({ steps: [] })).toBe("");
  });
  it.each([
    [403, {}, "unauthorized"],
    [400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }, "unauthorized"],
    [400, { error: { status: "INVALID_ARGUMENT", message: "Unsupported config" } }, "unavailable"],
    [404, {}, "unavailable"],
    [429, { error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }, "rate_limited"],
    [503, {}, "unavailable"],
  ])("maps HTTP %i to %s without leaking the key", async (status, body, kind) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = await createGeminiProvider({ apiKey: "g-secret", fetch: reply(status, body) as unknown as typeof fetch }).generate({ system: "", prompt: "", maxTokens: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err).toMatchObject({ kind });
    expect((err as Error).message).not.toContain("g-secret");
  });
  it("explains a used-up free quota and a missing model in actionable words", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const quota = await createGeminiProvider({ apiKey: "k", fetch: reply(429, {}) as unknown as typeof fetch }).generate({ system: "", prompt: "", maxTokens: 1 }).catch((e: Error) => e);
    expect((quota as Error).message).toContain("free quota");
    const missing = await createGeminiProvider({ apiKey: "k", fetch: reply(404, {}) as unknown as typeof fetch }).generate({ system: "", prompt: "", maxTokens: 1 }).catch((e: Error) => e);
    expect((missing as Error).message).toContain("AI_MODEL");
  });
  it("treats an empty reply as bad output and network failure as unavailable", async () => {
    await expect(createGeminiProvider({ apiKey: "k", fetch: reply(200, { steps: [] }) as unknown as typeof fetch }).generate({ system: "", prompt: "", maxTokens: 1 })).rejects.toMatchObject({ kind: "bad_output" });
    const down = vi.fn(async () => {
      throw new TypeError("boom");
    });
    await expect(createGeminiProvider({ apiKey: "k", fetch: down as unknown as typeof fetch }).generate({ system: "", prompt: "", maxTokens: 1 })).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("Anthropic adapter (mocked)", () => {
  it("sends the key in a header and returns the text", async () => {
    const f = reply(200, { content: [{ type: "text", text: '{"suggestions":["hi"]}' }] });
    const text = await createAnthropicProvider({ apiKey: "sk-test", model: "m1", fetch: f as unknown as typeof fetch }).generate({ system: "s", prompt: "p", maxTokens: 50 });
    expect(text).toBe('{"suggestions":["hi"]}');
    const [url, init] = f.mock.calls[0] ?? [];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "m1", max_tokens: 50, system: "s", messages: [{ role: "user", content: "p" }] });
  });
  it.each([
    [401, "unauthorized"],
    [429, "rate_limited"],
    [500, "unavailable"],
  ])("maps HTTP %i to %s without leaking the key", async (status, kind) => {
    const err = await createAnthropicProvider({ apiKey: "sk-secret", fetch: reply(status, {}) as unknown as typeof fetch }).generate({ system: "", prompt: "", maxTokens: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err).toMatchObject({ kind });
    expect((err as Error).message).not.toContain("sk-secret");
  });
  it("treats an empty reply as bad output", async () => {
    await expect(createAnthropicProvider({ apiKey: "k", fetch: reply(200, { content: [] }) as unknown as typeof fetch }).generate({ system: "", prompt: "", maxTokens: 1 })).rejects.toMatchObject({ kind: "bad_output" });
  });
});

describe("assist", () => {
  it("parses JSON even with code fences or chatter", () => {
    expect(parseSuggestions('Sure!\n```json\n{"suggestions":["a","b"]}\n```')).toEqual(["a", "b"]);
  });
  it("rejects replies that are not the expected JSON", () => {
    for (const bad of ["no json", '{"suggestions":[]}', '{"other":1}', "{broken"]) expect(() => parseSuggestions(bad)).toThrow(AiError);
  });
  it("drops suggestions over 500 characters instead of trimming them", async () => {
    const long = "x".repeat(501);
    const out = await runAssist(provider(JSON.stringify({ suggestions: [long, "short one", "😀".repeat(126), "another"] })), { action: "variations", text: "draft" });
    expect(out).toEqual(["short one", "another"]);
  });
  it("fails honestly when every suggestion is too long (no fabricated fallback)", async () => {
    await expect(runAssist(provider(JSON.stringify({ suggestions: ["y".repeat(600)] })), { action: "ideas", text: "t" })).rejects.toMatchObject({ kind: "bad_output" });
  });
  it("limits the number returned per action and passes the tone for rewrites", async () => {
    const p = provider(JSON.stringify({ suggestions: ["1", "2", "3", "4", "5", "6"] }));
    expect(await runAssist(p, { action: "rewrite", text: "draft", tone: "witty" })).toHaveLength(3);
    expect(vi.mocked(p.generate).mock.calls[0]?.[0].prompt).toContain("witty");
  });
  it("validates input", () => {
    expect(assistInputSchema.safeParse({ action: "ideas", text: "   " }).success).toBe(false);
    expect(assistInputSchema.safeParse({ action: "nope", text: "x" }).success).toBe(false);
    expect(assistInputSchema.safeParse({ action: "ideas", text: "x".repeat(2001) }).success).toBe(false);
  });
});
