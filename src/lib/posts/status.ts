export const POST_STATUSES = ["draft", "scheduled", "publishing", "published", "failed", "cancelled"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Transitions a user may trigger. `publishing` and `published` are reserved for the Phase 2 publisher. */
const USER_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  draft: ["draft", "scheduled"],
  scheduled: ["draft", "scheduled", "cancelled"],
  publishing: [],
  published: [],
  failed: ["draft", "scheduled"],
  cancelled: ["draft", "scheduled"],
};

export function canUserTransition(from: PostStatus, to: PostStatus): boolean {
  return USER_TRANSITIONS[from].includes(to);
}

export function isUserEditable(status: PostStatus): boolean {
  return status !== "publishing" && status !== "published";
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
};
