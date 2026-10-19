import { describe, expect, it } from "vitest";
import { canUserTransition, isUserEditable } from "@/lib/posts/status";

describe("post status model", () => {
  it("lets users schedule, unschedule, and cancel", () => {
    expect(canUserTransition("draft", "scheduled")).toBe(true);
    expect(canUserTransition("scheduled", "cancelled")).toBe(true);
    expect(canUserTransition("cancelled", "scheduled")).toBe(true);
  });
  it("never lets users set publishing or published", () => {
    for (const from of ["draft", "scheduled", "failed", "cancelled"] as const) {
      expect(canUserTransition(from, "published")).toBe(false);
      expect(canUserTransition(from, "publishing")).toBe(false);
    }
  });
  it("locks publishing and published posts", () => {
    expect(isUserEditable("published")).toBe(false);
    expect(isUserEditable("publishing")).toBe(false);
    expect(canUserTransition("published", "draft")).toBe(false);
    expect(isUserEditable("failed")).toBe(true);
  });
});
