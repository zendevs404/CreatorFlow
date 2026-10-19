import { describe, expect, it } from "vitest";
import { postFormSchema } from "@/lib/posts/schema";
import { countCharacters, THREADS_TEXT_LIMIT } from "@/lib/threads/limits";
import { utcToZonedLocal } from "@/lib/time";

const tz = "Asia/Jakarta";
const future = () => utcToZonedLocal(new Date(Date.now() + 86_400_000), tz);

describe("character counting", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(countCharacters("a😀b")).toBe(3);
  });
});

describe("postFormSchema", () => {
  it("accepts exactly the limit and rejects one over", () => {
    expect(postFormSchema.safeParse({ content: "a".repeat(THREADS_TEXT_LIMIT), intent: "draft", timezone: tz }).success).toBe(true);
    expect(postFormSchema.safeParse({ content: "a".repeat(THREADS_TEXT_LIMIT + 1), intent: "draft", timezone: tz }).success).toBe(false);
  });
  it("allows empty drafts but not empty scheduled posts", () => {
    expect(postFormSchema.safeParse({ content: "", intent: "draft", timezone: tz }).success).toBe(true);
    expect(postFormSchema.safeParse({ content: "  ", intent: "schedule", scheduledLocal: future(), timezone: tz }).success).toBe(false);
  });
  it("requires a future time to schedule", () => {
    expect(postFormSchema.safeParse({ content: "hi", intent: "schedule", timezone: tz }).success).toBe(false);
    expect(postFormSchema.safeParse({ content: "hi", intent: "schedule", scheduledLocal: "2020-01-01T10:00", timezone: tz }).success).toBe(false);
    expect(postFormSchema.safeParse({ content: "hi", intent: "schedule", scheduledLocal: future(), timezone: tz }).success).toBe(true);
  });
  it("rejects unknown timezones", () => {
    expect(postFormSchema.safeParse({ content: "hi", intent: "draft", timezone: "Nowhere/Land" }).success).toBe(false);
  });
});
