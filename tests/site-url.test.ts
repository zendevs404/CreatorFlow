import { describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/site-url";

describe("publicOrigin", () => {
  it("prefers the configured public address over the internal request host", () => {
    expect(publicOrigin("http://localhost:3000/api/threads/callback?code=x", "https://abc.trycloudflare.com")).toBe("https://abc.trycloudflare.com");
  });
  it("ignores any path in the configured address", () => {
    expect(publicOrigin("http://localhost:3000/x", "https://abc.trycloudflare.com/api/threads/callback")).toBe("https://abc.trycloudflare.com");
  });
  it("falls back to the request origin when unset or invalid", () => {
    expect(publicOrigin("http://localhost:3000/x", undefined)).toBe("http://localhost:3000");
    expect(publicOrigin("http://localhost:3000/x", "not a url")).toBe("http://localhost:3000");
  });
});
