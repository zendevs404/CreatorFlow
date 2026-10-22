import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicOrigin } from "@/lib/site-url";
import { handleDataDeletion } from "@/lib/threads/deletion";
import { parseSignedRequest } from "@/lib/threads/signed-request";

/**
 * Meta's Data Deletion Request callback. Verifies the signed_request, deletes Threads-derived data, and replies
 * with a status URL and confirmation code in the JSON shape Meta requires.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.THREADS_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const parsed = typeof signed === "string" ? parseSignedRequest(signed, secret) : null;
  if (!parsed) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  try {
    const { confirmationCode } = await handleDataDeletion(createAdminClient(), parsed.userId);
    return NextResponse.json({ url: `${publicOrigin(request.url)}/data-deletion?code=${confirmationCode}`, confirmation_code: confirmationCode });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
