import { z } from "zod";
import { countCharacters, THREADS_TEXT_LIMIT } from "@/lib/threads/limits";
import { isValidTimeZone, zonedLocalToUtc } from "@/lib/time";

const content = z
  .string()
  .max(10_000)
  .refine((v) => countCharacters(v) <= THREADS_TEXT_LIMIT, {
    message: `Posts can have at most ${THREADS_TEXT_LIMIT} characters.`,
  });

export const postFormSchema = z
  .object({
    id: z.uuid().optional(),
    content,
    intent: z.enum(["draft", "schedule"]),
    /** Wall-clock "YYYY-MM-DDTHH:mm" in `timezone`. */
    scheduledLocal: z.string().optional(),
    timezone: z.string().refine(isValidTimeZone, "Unknown timezone."),
  })
  .superRefine((v, ctx) => {
    if (v.intent !== "schedule") return;
    if (v.content.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Write something before scheduling." });
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
