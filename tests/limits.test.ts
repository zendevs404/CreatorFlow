import { describe, expect, it } from "vitest";
import { postFormSchema } from "@/lib/posts/schema";
import { countCharacters, countLinks } from "@/lib/threads/limits";

describe("countCharacters (Threads: emojis count as UTF-8 bytes)", () => {
  it("counts plain text per character, including accents", () => {
    expect(countCharacters("hello")).toBe(5);
    expect(countCharacters("café")).toBe(4);
  });
  it("counts simple emoji as 4 bytes", () => {
    expect(countCharacters("😀")).toBe(4);
  });
  it("counts a whole ZWJ sequence as its byte length, not per piece twice", () => {
    expect(countCharacters("👨‍👩‍👧")).toBe(18);
  });
  it("counts flags and emoji with skin tone as one emoji each", () => {
    expect(countCharacters("🇮🇩")).toBe(8);
    expect(countCharacters("👍🏽")).toBe(8);
  });
  it("makes 125 emoji exactly fill the 500 limit", () => {
    const base = { intent: "draft" as const, media: [], timezone: "UTC" };
    expect(postFormSchema.safeParse({ ...base, content: "😀".repeat(125) }).success).toBe(true);
    expect(postFormSchema.safeParse({ ...base, content: "😀".repeat(126) }).success).toBe(false);
  });
});

describe("countLinks", () => {
  it("counts unique links only", () => {
    expect(countLinks("see https://a.com and https://a.com. also www.b.com!")).toBe(2);
    expect(countLinks("no links here")).toBe(0);
  });
  it("rejects more than 5 unique links in the schema", () => {
    const links = Array.from({ length: 6 }, (_, i) => `https://site${i}.com`).join(" ");
    expect(postFormSchema.safeParse({ content: links, intent: "draft", media: [], timezone: "UTC" }).success).toBe(false);
    expect(postFormSchema.safeParse({ content: links.split(" ").slice(0, 5).join(" "), intent: "draft", media: [], timezone: "UTC" }).success).toBe(true);
  });
});
