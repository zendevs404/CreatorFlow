import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="rounded-panel bg-surface p-8 ring-1 ring-line">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-1 text-sm text-ink-2">This page or post does not exist, or it belongs to another account.</p>
      <Button asChild className="mt-4">
        <Link href="/posts">Back to posts</Link>
      </Button>
    </div>
  );
}
