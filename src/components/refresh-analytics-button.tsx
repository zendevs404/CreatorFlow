"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { refreshAnalytics } from "@/lib/insights/actions";

export function RefreshAnalyticsButton() {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await refreshAnalytics();
          notify(r.ok ? "success" : "error", r.ok ? r.message : r.error);
          router.refresh();
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} /> {pending ? "Refreshing…" : "Refresh from Threads"}
    </Button>
  );
}
