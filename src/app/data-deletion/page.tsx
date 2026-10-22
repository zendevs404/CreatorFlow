import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Data deletion status" };
export const dynamic = "force-dynamic";

async function lookup(code: string) {
  try {
    const { data, error } = await createAdminClient().from("data_deletion_requests").select("status,requested_at").eq("confirmation_code", code).maybeSingle();
    if (error) return "unavailable" as const;
    return data;
  } catch {
    return "unavailable" as const;
  }
}

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const valid = typeof code === "string" && /^[0-9a-f]{24}$/.test(code);
  const result = valid ? await lookup(code) : null;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Data deletion status</h1>
      {!valid ? (
        <p className="mt-4 text-ink-2">
          To check a deletion request, open the link Threads gave you (it includes a confirmation code). To ask for deletion yourself, remove CreatorFlow in your Threads settings under Website permissions, or contact the service operator.
        </p>
      ) : result === "unavailable" ? (
        <p className="mt-4 text-ink-2">The status could not be loaded right now. Please try again later.</p>
      ) : result === null ? (
        <p className="mt-4 text-ink-2">No request was found for confirmation code <span className="font-mono">{code}</span>.</p>
      ) : (
        <div className="mt-4 space-y-2">
          <p>
            Confirmation code: <span className="font-mono">{code}</span>
          </p>
          <p>
            {result.status === "completed"
              ? "Completed. The Threads access token, account link, insights, and Threads post identifiers linked to this Threads account were deleted."
              : "Completed. We did not hold any data for this Threads account."}
          </p>
          <p className="text-sm text-ink-2">Received {new Date(result.requested_at).toUTCString()}.</p>
        </div>
      )}
    </main>
  );
}
