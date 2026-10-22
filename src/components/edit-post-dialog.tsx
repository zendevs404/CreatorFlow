"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PostEditor } from "@/components/post-editor";
import type { EditorMedia } from "@/lib/posts/media";
import type { PostStatus } from "@/lib/posts/status";

type Props = {
  post: { id: string; content: string; status: PostStatus; scheduled_at: string | null; failure_reason: string | null };
  media: EditorMedia[];
  timezone: string;
  displayName: string;
  userId: string;
  threadsReady: boolean;
  ai: { enabled: boolean; reason: string | null; notice: string | null };
  closeHref: string;
};

/** The same editor as the Content Studio, opened as a modal over the Posts list. */
export function EditPostDialog({ post, media, timezone, displayName, userId, threadsReady, ai, closeHref }: Props) {
  const router = useRouter();
  const close = () => {
    router.replace(closeHref);
    router.refresh();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="lg" title="Edit post" description="Changes here work the same as in the Content Studio.">
        <PostEditor mode="edit" compact post={post} initialMedia={media} timezone={timezone} displayName={displayName} userId={userId} threadsReady={threadsReady} ai={ai} onDone={close} />
      </DialogContent>
    </Dialog>
  );
}
