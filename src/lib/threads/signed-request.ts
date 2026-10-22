import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta's signed_request: "<base64url signature>.<base64url JSON payload>", HMAC-SHA256 over the payload
 * with the app secret (developers.facebook.com/documentation/development/.../data-deletion-callback).
 * Returns the Meta user id, or null when the request is malformed or the signature is wrong.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): { userId: string } | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encodedSig, payload] = parts as [string, string];
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(encodedSig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data !== "object" || data === null) return null;
    const record = data as Record<string, unknown>;
    if (record.algorithm !== undefined && String(record.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    const id = record.user_id;
    if ((typeof id !== "string" && typeof id !== "number") || String(id).length === 0) return null;
    return { userId: String(id) };
  } catch {
    return null;
  }
}
