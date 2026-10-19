import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/login");
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-items-center px-4">
      <div className="rounded-panel bg-surface p-8 ring-1 ring-line">
        <h1 className="text-2xl font-semibold tracking-tight">Connect Supabase to continue</h1>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink-2">
          <li>Create a Supabase project and run the SQL in <code className="font-mono text-ink">supabase/migrations</code>.</li>
          <li>Copy <code className="font-mono text-ink">.env.example</code> to <code className="font-mono text-ink">.env.local</code>.</li>
          <li>Set <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then restart the dev server.</li>
        </ol>
      </div>
    </main>
  );
}
