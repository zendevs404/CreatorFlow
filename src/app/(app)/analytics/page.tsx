import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" description="Performance data comes straight from the Threads API." />
      <EmptyState
        title="Connect Threads to see analytics"
        action={
          <Button asChild>
            <Link href="/settings">Integration settings</Link>
          </Button>
        }
      >
        No metrics are shown until a Threads account is connected and the API returns real data. Account connection arrives in Phase 2, and insights in Phase 3.
      </EmptyState>
    </>
  );
}
