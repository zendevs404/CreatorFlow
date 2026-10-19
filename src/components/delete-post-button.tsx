"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { deletePost } from "@/lib/posts/actions";

export function DeletePostButton({ id }: { id: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label="Delete post"
      onClick={() => {
        if (!window.confirm("Delete this post? This cannot be undone.")) return;
        start(async () => {
          const r = await deletePost(id);
          notify(r.ok ? "success" : "error", r.ok ? r.message : r.error);
          if (r.ok) router.refresh();
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}
