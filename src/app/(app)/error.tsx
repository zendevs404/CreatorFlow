"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-panel bg-surface p-8 ring-1 ring-line">
      <h1 className="text-lg font-semibold">This page could not load</h1>
      <p className="mt-1 text-sm text-ink-2">{error.message || "Something went wrong."}</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
