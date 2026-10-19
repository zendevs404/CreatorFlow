import { describe, expect, it } from "vitest";
import { dayKey, isValidTimeZone, utcToZonedLocal, zonedLocalToUtc } from "@/lib/time";

describe("timezone helpers", () => {
  it("converts Jakarta wall time (UTC+7) to UTC", () => {
    expect(zonedLocalToUtc("2026-10-20T09:00", "Asia/Jakarta")?.toISOString()).toBe("2026-10-20T02:00:00.000Z");
  });
  it("handles daylight saving offsets", () => {
    expect(zonedLocalToUtc("2026-07-01T12:00", "America/New_York")?.toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedLocalToUtc("2026-12-01T12:00", "America/New_York")?.toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });
  it("rejects wall times that do not exist (spring-forward gap)", () => {
    expect(zonedLocalToUtc("2026-03-08T02:30", "America/New_York")).toBeNull();
  });
  it("rejects malformed input and unknown zones", () => {
    expect(zonedLocalToUtc("2026-10-20 09:00", "Asia/Jakarta")).toBeNull();
    expect(zonedLocalToUtc("2026-10-20T09:00", "Mars/Olympus")).toBeNull();
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
  it("round-trips through utcToZonedLocal", () => {
    const utc = zonedLocalToUtc("2026-10-20T23:45", "Asia/Tokyo");
    expect(utc && utcToZonedLocal(utc, "Asia/Tokyo")).toBe("2026-10-20T23:45");
  });
  it("computes the local day key across the date line", () => {
    expect(dayKey("2026-10-20T20:00:00Z", "Asia/Jakarta")).toBe("2026-10-21");
    expect(dayKey("2026-10-20T20:00:00Z", "UTC")).toBe("2026-10-20");
  });
});
