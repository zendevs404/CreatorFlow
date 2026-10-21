import { z } from "zod";
import { countCharacters, countLinks, THREADS_IMAGE_MAX_BYTES, THREADS_MAX_LINKS, THREADS_MEDIA_MAX_ITEMS, THREADS_TEXT_LIMIT } from "@/lib/threads/limits";
import { validateAspectRatio } from "@/lib/threads/media-validation";
import { isValidTimeZone, zonedLocalToUtc } from "@/lib/time";

const content = z
  .string()
  .max(10_000)
  .refine((v) => countCharacters(v) <= THREADS_TEXT_LIMIT, {
    message: `Posts can have at most ${THREADS_TEXT_LIMIT} characters (emojis count as their UTF-8 size).`,
  })
  .refine((v) => countLinks(v) <= THREADS_MAX_LINKS, { message: `Threads allows at most ${THREADS_MAX_LINKS} unique links in a post.` });

export const mediaItemSchema = z
  .object({
    path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png)$/, "Invalid image reference."),
    mime: z.enum(["image/jpeg", "image/png"]),
    size: z.number().int().positive().max(THREADS_IMAGE_MAX_BYTES, "Images can be at most 8 MB."),
    width: z.number().int().positive().max(30_000),
    height: z.number().int().positive().max(30_000),
  })
  .refine((m) => validateAspectRatio(m.width, m.height) === null, { message: "Threads accepts aspect ratios between 0.01:1 and 10:1." });

export type MediaInput = z.infer<typeof mediaItemSchema>;

export const postFormSchema = z
  .object({
    id: z.uuid().optional(),
    content,
    media: z.array(mediaItemSchema).max(THREADS_MEDIA_MAX_ITEMS, `You can attach up to ${THREADS_MEDIA_MAX_ITEMS} images.`),
    intent: z.enum(["draft", "schedule"]),
    /** Wall-clock "YYYY-MM-DDTHH:mm" in `timezone`. */
    scheduledLocal: z.string().optional(),
    timezone: z.string().refine(isValidTimeZone, "Unknown timezone."),
  })
  .superRefine((v, ctx) => {
    if (v.intent !== "schedule") return;
    if (v.content.trim().length === 0 && v.media.length === 0) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Add text or an image before scheduling." });
    }
    if (!v.scheduledLocal) {
      ctx.addIssue({ code: "custom", path: ["scheduledLocal"], message: "Pick a date and time." });
      return;
    }
    const utc = zonedLocalToUtc(v.scheduledLocal, v.timezone);
    if (!utc) {
      ctx.addIssue({ code: "custom", path: ["scheduledLocal"], message: "That date and time does not exist." });
    } else if (utc.getTime() < Date.now() + 60_000) {
      ctx.addIssue({ code: "custom", path: ["scheduledLocal"], message: "Pick a time at least one minute from now." });
    }
  });

export type PostFormInput = z.infer<typeof postFormSchema>;

export const rescheduleSchema = z.object({
  id: z.uuid(),
  scheduledLocal: z.string(),
  timezone: z.string().refine(isValidTimeZone),
});

export const settingsSchema = z.object({
  displayName: z.string().trim().max(80),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone."),
});

export const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});
