/**
 * Limits verified against Meta's official Threads API documentation
 * (developers.facebook.com/documentation/threads/overview and /posts):
 *  - Text posts are limited to 500 characters, and emojis are counted as their number of UTF-8 bytes.
 *  - A profile may publish at most 250 posts per rolling 24 hours via the API (a carousel counts once).
 *  - A post may contain at most 5 unique links (more fails with THREADS_API__LINK_LIMIT_EXCEEDED).
 */
export const THREADS_TEXT_LIMIT = 500;
export const THREADS_API_POSTS_PER_24H = 250;

export const THREADS_MAX_LINKS = 5;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const encoder = new TextEncoder();
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;

/**
 * Length as Threads counts it: every ordinary character counts 1; an emoji (a whole grapheme, including
 * skin tones, flags and ZWJ sequences) counts as its UTF-8 byte length. The server re-validates with this
 * same function, and Threads remains the final authority.
 */
export function countCharacters(text: string): number {
  let total = 0;
  for (const { segment } of segmenter.segment(text)) {
    total += EMOJI.test(segment) ? encoder.encode(segment).length : Array.from(segment).length;
  }
  return total;
}

/** Number of unique links in the text (Meta counts unique URLs). */
export function countLinks(text: string): number {
  const found = text.match(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi) ?? [];
  return new Set(found.map((u) => u.replace(/[.,;:!?)\]]+$/, "").toLowerCase())).size;
}

/**
 * Image limits from Meta's Threads docs (overview > Image Specifications):
 * JPEG and PNG are the officially supported formats, 8 MB maximum, aspect ratio between
 * 0.01:1 and 10:1, and a carousel takes 2 to 20 items (a single image is one item).
 */
export const THREADS_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const THREADS_MEDIA_MAX_ITEMS = 20;
export const THREADS_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export const THREADS_ASPECT_MIN = 0.01;
export const THREADS_ASPECT_MAX = 10;
