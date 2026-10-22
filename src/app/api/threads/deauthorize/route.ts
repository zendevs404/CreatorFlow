import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleDeauthorize } from "@/lib/threads/deletion";
import { parseSignedRequest } from "@/lib/threads/signed-request";

/** Meta pings this when a user removes the app in Threads. Authenticated only by the signed_request signature. */
export async function POST(request: NextRequest) {
  const secret = process.env.THREADS_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const parsed = typeof signed === "string" ? parseSignedRequest(signed, secret) : null;
  if (!parsed) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  try {
    await handleDeauthorize(createAdminClient(), parsed.userId);
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
