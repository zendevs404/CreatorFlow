/**
 * Integration boundary for Threads publishing. Phase 1 ships only the contract and a
 * "not connected" implementation; nothing here pretends an external action succeeded.
 * Phase 2 supplies a real implementation backed by the official Threads API
 * (create container -> threads_publish), with encrypted tokens and durable jobs.
 */
export type PublishRequest = { accountId: string; text: string; idempotencyKey: string };
export type PublishResult =
  | { ok: true; containerId: string; externalPostId: string }
  | { ok: false; code: "not_connected" | "unauthorized" | "rate_limited" | "provider_error"; message: string; retryable: boolean };

export interface ThreadsPublisher {
  publish(request: PublishRequest): Promise<PublishResult>;
}

export const notConnectedPublisher: ThreadsPublisher = {
  async publish() {
    return {
      ok: false,
      code: "not_connected",
      message: "Threads publishing is not available yet. Connect an account in Phase 2.",
      retryable: false,
    };
  },
};

export type ConnectionState = { connected: false; reason: "phase_2" } | { connected: true; username: string | null };

export const CONNECTION_NOT_AVAILABLE: ConnectionState = { connected: false, reason: "phase_2" };
