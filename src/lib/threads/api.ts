/**
 * Thin client for the official Threads API (Meta). Endpoints, parameters and token rules follow
 * developers.facebook.com/documentation/threads (get-started, long-lived-tokens, posts, troubleshooting).
 * Secrets travel only in request bodies or the documented query parameters and are never put in error
 * messages. `fetch` is injectable so tests can mock Meta without any network.
 */

export type ThreadsErrorKind = "unauthorized" | "rate_limited" | "provider_error" | "invalid_request" | "network";

export type ThreadsErrorDetail = { operation?: string; code?: number; subcode?: number; fbtraceId?: string };

export class ThreadsApiError extends Error {
  constructor(
    readonly kind: ThreadsErrorKind,
    message: string,
    readonly status?: number,
    readonly detail: ThreadsErrorDetail = {},
  ) {
    super(message);
    this.name = "ThreadsApiError";
  }
  /** Worth retrying later without changing the request. */
  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "provider_error" || this.kind === "network";
  }
}

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED";

export type CreateContainerParams =
  | { mediaType: "TEXT"; text: string }
  | { mediaType: "IMAGE"; imageUrl: string; text?: string; isCarouselItem?: boolean }
  | { mediaType: "CAROUSEL"; children: string[]; text?: string };

type Options = { fetch?: typeof fetch; graphBase?: string; oauthBase?: string; version?: string; timeoutMs?: number };

const CONTAINER_STATUSES: readonly string[] = ["IN_PROGRESS", "FINISHED", "PUBLISHED", "ERROR", "EXPIRED"];

/** User ids can exceed 2^53, so numeric ids are quoted before JSON.parse to avoid silent rounding. */
export function parseJsonKeepingIds(text: string): unknown {
  return JSON.parse(text.replace(/"(user_id|id)"\s*:\s*(\d{15,})/g, '"$1":"$2"'));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function createThreadsApi(options: Options = {}) {
  const doFetch = options.fetch ?? fetch;
  const graph = options.graphBase ?? "https://graph.threads.net";
  const oauth = options.oauthBase ?? "https://graph.threads.com";
  const v = options.version ?? "v1.0";
  const timeoutMs = options.timeoutMs ?? 20_000;

  async function call(operation: string, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new ThreadsApiError("network", "Could not reach Threads.", undefined, { operation });
    }
    const raw = await res.text();
    let body: unknown;
    try {
      body = raw ? parseJsonKeepingIds(raw) : {};
    } catch {
      body = {};
    }
    if (res.ok && isRecord(body) && !("error" in body)) return body;
    throw classify(operation, res.status, body);
  }

  function classify(operation: string, status: number, body: unknown): ThreadsApiError {
    const err = isRecord(body) ? body : {};
    const nested = isRecord(err.error) ? err.error : {};
    const base = String(nested.message ?? err.error_message ?? err.message ?? `Threads returned HTTP ${status}.`);
    const userMessage = typeof nested.error_user_msg === "string" ? nested.error_user_msg : typeof err.error_user_msg === "string" ? err.error_user_msg : "";
    const message = (userMessage && !base.includes(userMessage) ? `${base} (${userMessage})` : base).slice(0, 300);
    const type = String(nested.type ?? err.error_type ?? "");
    const code = Number(nested.code ?? err.code);
    const subcode = Number(nested.error_subcode ?? err.error_subcode);
    const detail: ThreadsErrorDetail = {
      operation,
      ...(Number.isFinite(code) ? { code } : {}),
      ...(Number.isFinite(subcode) ? { subcode } : {}),
      ...(typeof nested.fbtrace_id === "string" ? { fbtraceId: nested.fbtrace_id } : {}),
    };
    // Code 190 is the Graph API's "invalid or expired access token"; confirm against live responses.
    if (status === 401 || code === 190 || (type === "OAuthException" && status !== 400)) return new ThreadsApiError("unauthorized", message, status, detail);
    if (status === 429) return new ThreadsApiError("rate_limited", message, status, detail);
    if (status >= 500) return new ThreadsApiError("provider_error", message, status, detail);
    return new ThreadsApiError("invalid_request", message, status, detail);
  }

  /** The token exchange is documented with multipart (-F). */
  const form = (data: Record<string, string>) => {
    const f = new FormData();
    for (const [k, val] of Object.entries(data)) f.append(k, val);
    return f;
  };
  /** Publishing requests are documented with form-encoded bodies (-d). */
  const encoded = (data: Record<string, string>) => new URLSearchParams(data);
  const str = (b: Record<string, unknown>, key: string): string => {
    const value = b[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
    throw new ThreadsApiError("provider_error", `Unexpected response from Threads (missing ${key}).`);
  };

  return {
    /** Step 2 of OAuth: authorization code -> short-lived token (valid 1 hour). */
    async exchangeCode(p: { appId: string; appSecret: string; code: string; redirectUri: string }) {
      const b = await call("exchange the authorization code", `${oauth}/oauth/access_token`, {
        method: "POST",
        body: form({ client_id: p.appId, client_secret: p.appSecret, grant_type: "authorization_code", redirect_uri: p.redirectUri, code: p.code }),
      });
      return { accessToken: str(b, "access_token"), userId: str(b, "user_id") };
    },

    /** Short-lived -> long-lived token (60 days). Server-side only: it sends the app secret. */
    async exchangeForLongLived(p: { appSecret: string; shortLivedToken: string }) {
      const q = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: p.appSecret, access_token: p.shortLivedToken });
      const b = await call("exchange for a long-lived token", `${graph}/access_token?${q}`);
      return { accessToken: str(b, "access_token"), expiresInSeconds: Number(b.expires_in) };
    },

    /** Long-lived tokens can be refreshed once they are 24h old and before they expire. */
    async refreshLongLived(token: string) {
      const q = new URLSearchParams({ grant_type: "th_refresh_token", access_token: token });
      const b = await call("refresh the token", `${graph}/refresh_access_token?${q}`);
      return { accessToken: str(b, "access_token"), expiresInSeconds: Number(b.expires_in) };
    },

    async getProfile(token: string) {
      const q = new URLSearchParams({ fields: "id,username", access_token: token });
      const b = await call("read the profile", `${graph}/${v}/me?${q}`);
      return { id: str(b, "id"), username: typeof b.username === "string" ? b.username : null };
    },

    /** Publishing quota: 250 API posts per rolling 24h (carousels count once). */
    async getPublishingLimit(token: string, userId: string) {
      const q = new URLSearchParams({ fields: "quota_usage,config", access_token: token });
      const b = await call("check the publishing limit", `${graph}/${v}/${encodeURIComponent(userId)}/threads_publishing_limit?${q}`);
      const first = Array.isArray(b.data) && isRecord(b.data[0]) ? b.data[0] : null;
      const config = first && isRecord(first.config) ? first.config : null;
      if (!first || !config) throw new ThreadsApiError("provider_error", "Unexpected response from Threads (publishing limit).");
      return { used: Number(first.quota_usage), total: Number(config.quota_total) };
    },

    async createContainer(token: string, userId: string, p: CreateContainerParams): Promise<string> {
      const data: Record<string, string> = { media_type: p.mediaType, access_token: token };
      if (p.mediaType === "TEXT") data.text = p.text;
      if (p.mediaType === "IMAGE") {
        data.image_url = p.imageUrl;
        if (p.isCarouselItem) data.is_carousel_item = "true";
        if (p.text) data.text = p.text;
      }
      if (p.mediaType === "CAROUSEL") {
        data.children = p.children.join(",");
        if (p.text) data.text = p.text;
      }
      const label = p.mediaType === "CAROUSEL" ? "create the carousel container" : p.mediaType === "IMAGE" ? (p.isCarouselItem ? "create a carousel image container" : "create the image container") : "create the text container";
      const b = await call(label, `${graph}/${v}/${encodeURIComponent(userId)}/threads`, { method: "POST", body: encoded(data) });
      return str(b, "id");
    },

    async getContainerStatus(token: string, containerId: string): Promise<{ status: ContainerStatus; errorMessage: string | null }> {
      const q = new URLSearchParams({ fields: "status,error_message", access_token: token });
      const b = await call("check the container status", `${graph}/${v}/${encodeURIComponent(containerId)}?${q}`);
      const status = str(b, "status");
      if (!CONTAINER_STATUSES.includes(status)) throw new ThreadsApiError("provider_error", `Unknown container status: ${status.slice(0, 40)}`);
      return { status: status as ContainerStatus, errorMessage: typeof b.error_message === "string" ? b.error_message : null };
    },

    async publishContainer(token: string, userId: string, containerId: string): Promise<string> {
      const b = await call("publish the container", `${graph}/${v}/${encodeURIComponent(userId)}/threads_publish`, {
        method: "POST",
        body: encoded({ creation_id: containerId, access_token: token }),
      });
      return str(b, "id");
    },
  };
}

export type ThreadsApi = ReturnType<typeof createThreadsApi>;
