import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSignedRequest } from "@/lib/threads/signed-request";

const SECRET = "app-secret-for-tests";
function sign(payload: object, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${sig}.${body}`;
}

describe("parseSignedRequest (Meta signed_request)", () => {
  it("returns the user id for a correctly signed request", () => {
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA256", issued_at: 1, user_id: "218471" }), SECRET)).toEqual({ userId: "218471" });
  });
  it("accepts numeric ids and a missing algorithm field", () => {
    expect(parseSignedRequest(sign({ user_id: 17841405793187218 }), SECRET)?.userId).toBeTruthy();
  });
  it("rejects a wrong secret, a tampered payload, and a swapped signature", () => {
    expect(parseSignedRequest(sign({ user_id: "1" }, "other-secret"), SECRET)).toBeNull();
    const [sig] = sign({ user_id: "1" }).split(".");
    const forgedBody = Buffer.from(JSON.stringify({ user_id: "2" })).toString("base64url");
    expect(parseSignedRequest(`${sig}.${forgedBody}`, SECRET)).toBeNull();
  });
  it("rejects malformed input and other algorithms", () => {
    for (const bad of ["", "abc", "a.b.c", ".", "x."]) expect(parseSignedRequest(bad, SECRET)).toBeNull();
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA1", user_id: "1" }), SECRET)).toBeNull();
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA256" }), SECRET)).toBeNull();
  });
});
