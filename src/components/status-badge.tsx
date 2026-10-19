import { STATUS_LABEL, type PostStatus } from "@/lib/posts/status";
import { cn } from "@/lib/utils";

const tone: Record<PostStatus, string> = {
  draft: "bg-line text-ink-2",
  scheduled: "bg-accent/12 text-accent",
  publishing: "bg-warn/15 text-warn",
  published: "bg-ok/15 text-ok",
  failed: "bg-bad/12 text-bad",
  cancelled: "bg-line text-ink-2 line-through",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", tone[status])}>{STATUS_LABEL[status]}</span>;
}
