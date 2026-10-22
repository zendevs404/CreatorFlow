"use client";

import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/**
 * The glass panel itself never scrolls (so nothing can slide under its rounded corners). The header stays pinned,
 * and only the body scrolls, in an inset area whose scrollbar stops short of the panel's edges.
 */
export function DialogContent({ title, description, children, size = "md" }: { title: string; description?: string; children: ReactNode; size?: "md" | "lg" }) {
  return (
    <D.Portal>
      <D.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          "glass dialog-content fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-panel",
          size === "lg" ? "w-[min(94vw,42rem)]" : "w-[min(92vw,30rem)]",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div>
            <D.Title className="text-lg font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close aria-label="Close" className="rounded-full p-1.5 text-ink-2 hover:bg-line hover:text-ink">
            <X className="size-4" />
          </D.Close>
        </div>
        {/* pb/pr keep the scrollbar track away from the rounded bottom and right edges */}
        <div className="flex min-h-0 flex-1 flex-col pb-3 pr-1.5">
          <div className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 pt-4 sm:px-6">{children}</div>
        </div>
      </D.Content>
    </D.Portal>
  );
}
