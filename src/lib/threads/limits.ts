/**
 * Limits verified against Meta's official Threads API documentation
 * (developers.facebook.com/documentation/threads/overview and /posts):
 *  - Text posts are limited to 500 characters.
 *  - A profile may publish at most 250 posts per rolling 24 hours via the API.
 * The docs do not say how emoji or links are counted, so the counter uses Unicode
 * code points and the server re-validates with the same function. Phase 2 must confirm
 * edge cases against the real API.
 */
export const THREADS_TEXT_LIMIT = 500;
export const THREADS_API_POSTS_PER_24H = 250;

export function countCharacters(text: string): number {
  return Array.from(text).length;
}
