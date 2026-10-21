import { describe, expect, it } from "vitest";
import { mediaItemSchema, postFormSchema } from "@/lib/posts/schema";
import { THREADS_IMAGE_MAX_BYTES } from "@/lib/threads/limits";
import { validateAspectRatio, validateImageFile } from "@/lib/threads/media-validation";
import { utcToZonedLocal } from "@/lib/time";

const UID = "11111111-1111-4111-8111-111111111111";
const FID = "22222222-2222-4222-8222-222222222222";
const item = (over = {}) => ({ path: `${UID}/${FID}.png`, mime: "image/png" as const, size: 1000, width: 1080, height: 1350, ...over });

describe("validateImageFile", () => {
  it("accepts JPEG and PNG within 8 MB", () => {
    expect(validateImageFile({ name: "a.jpg", type: "image/jpeg", size: 1000 }, 0)).toBeNull();
    expect(validateImageFile({ name: "a.png", type: "image/png", size: THREADS_IMAGE_MAX_BYTES }, 0)).toBeNull();
  });
  it("rejects other formats, oversize files, and a 21st image", () => {
    expect(validateImageFile({ name: "a.gif", type: "image/gif", size: 10 }, 0)).toMatch(/JPEG and PNG/);
    expect(validateImageFile({ name: "a.webp", type: "image/webp", size: 10 }, 0)).toMatch(/JPEG and PNG/);
    expect(validateImageFile({ name: "a.png", type: "image/png", size: THREADS_IMAGE_MAX_BYTES + 1 }, 0)).toMatch(/8 MB/);
    expect(validateImageFile({ name: "a.png", type: "image/png", size: 10 }, 20)).toMatch(/up to 20/);
  });
});

describe("validateAspectRatio", () => {
  it("allows ratios up to 10:1 and rejects beyond", () => {
    expect(validateAspectRatio(1000, 100)).toBeNull();
    expect(validateAspectRatio(1001, 100)).not.toBeNull();
    expect(validateAspectRatio(0, 100)).not.toBeNull();
  });
});

describe("media in the post schema", () => {
  const base = { content: "", intent: "schedule" as const, timezone: "Asia/Jakarta", scheduledLocal: utcToZonedLocal(new Date(Date.now() + 86_400_000), "Asia/Jakarta") };
  it("rejects malformed paths", () => {
    expect(mediaItemSchema.safeParse(item({ path: "../../etc/passwd" })).success).toBe(false);
    expect(mediaItemSchema.safeParse(item()).success).toBe(true);
  });
  it("allows an image-only post to be scheduled", () => {
    expect(postFormSchema.safeParse({ ...base, media: [item()] }).success).toBe(true);
    expect(postFormSchema.safeParse({ ...base, media: [] }).success).toBe(false);
  });
  it("limits a post to 20 images", () => {
    const many = Array.from({ length: 21 }, () => item());
    expect(postFormSchema.safeParse({ ...base, intent: "draft", media: many }).success).toBe(false);
  });
});
