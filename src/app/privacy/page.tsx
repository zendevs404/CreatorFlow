import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="rounded-control bg-warn/10 px-3 py-2 text-sm text-warn">
        Starter text that describes what this app actually stores. The operator must review it (and add their identity and contact details) before publishing the app.
      </p>
      <h2 className="pt-2 text-lg font-semibold">What we store</h2>
      <ul className="list-disc space-y-1 pl-5 text-ink-2">
        <li>Your account email, display name and timezone.</li>
        <li>The posts, drafts and images you create, and their schedule and publishing status.</li>
        <li>If you connect Threads: your Threads user id and username, and an encrypted access token. We also store the performance numbers Threads returns for your posts and account.</li>
        <li>A short log of AI-assist requests (type and time only, not your text) to limit usage.</li>
      </ul>
      <h2 className="pt-2 text-lg font-semibold">How it is used</h2>
      <p className="text-ink-2">
        Only to provide the features you use: saving drafts, publishing the posts you schedule to your own Threads account, and showing your analytics. If you use AI assist, the text you submit is sent to the configured AI provider (Google Gemini or Anthropic) to generate suggestions. On Google\u2019s free Gemini tier, Google may use submitted content to improve its products; the operator can switch to a paid tier or another provider.
      </p>
      <h2 className="pt-2 text-lg font-semibold">Deleting your data</h2>
      <p className="text-ink-2">
        Disconnect Threads in Settings to delete the stored token. Remove CreatorFlow in your Threads settings (Website permissions) and request data deletion to have everything we hold from Threads deleted; you can check the request on the data deletion status page. To delete your CreatorFlow account and posts, contact the operator.
      </p>
    </main>
  );
}
