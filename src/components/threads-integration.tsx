"use client";

import { CheckCircle2, CircleAlert, Plug, Unplug } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { connectThreads, disconnectThreads } from "@/lib/threads/actions";

export type IntegrationView = {
  status: "disconnected" | "connected";
  username: string | null;
  expiresLabel: string | null;
  needsReauth: boolean;
  expired: boolean;
  lastError: string | null;
  /** The stored connection was authorized with the analytics permission. */
  insightsEnabled: boolean;
  /** The server is configured to ask for the analytics permission. */
  insightsConfigured: boolean;
  missingServerSettings: string[];
  redirectUri: string;
};

export function ThreadsIntegration({ view }: { view: IntegrationView }) {
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const connected = view.status === "connected";
  const broken = connected && (view.needsReauth || view.expired);
  const blocked = view.missingServerSettings.length > 0;
  const needsInsights = connected && !broken && view.insightsConfigured && !view.insightsEnabled;

  function connect() {
    start(async () => {
      // On success the action redirects to Threads; a returned value means it failed.
      const r = await connectThreads();
      if (r && !r.ok) notify("error", r.error);
    });
  }
  function disconnect() {
    if (!window.confirm("Disconnect Threads? Posts scheduled for the future will fail to publish until you reconnect.")) return;
    start(async () => {
      const r = await disconnectThreads();
      notify(r.ok ? "success" : "error", r.ok ? r.message : r.error);
    });
  }

  return (
    <div className="space-y-4">
      {connected ? (
        <div className="flex items-start gap-3">
          {broken ? <CircleAlert className="mt-0.5 size-5 text-bad" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-5 text-ok" aria-hidden />}
          <div className="text-sm">
            <p className="font-medium">{view.username ? `@${view.username}` : "Threads account"} {broken ? "needs to be reconnected" : "is connected"}</p>
            {view.expiresLabel ? <p className="text-ink-2">Access renews automatically; current token valid until {view.expiresLabel}.</p> : null}
            {view.lastError ? <p className="mt-1 text-bad">{view.lastError}</p> : null}
            {needsInsights ? <p className="mt-1 text-ink-2">Analytics needs one more permission. Reconnect to grant it (add threads_manage_insights to your Meta app first).</p> : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-2">No account connected. Connecting asks Threads for permission to read your basic profile and publish posts for you.</p>
      )}

      {blocked ? (
        <div role="alert" className="rounded-control bg-warn/10 px-3 py-2 text-sm text-warn">
          Server setup incomplete. Missing or invalid: <span className="font-mono">{view.missingServerSettings.join(", ")}</span>. See the README.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!connected || broken || needsInsights ? (
          <Button variant="primary" onClick={connect} disabled={pending || blocked}>
            <Plug /> {broken ? "Reconnect Threads" : needsInsights ? "Reconnect to enable analytics" : "Connect Threads"}
          </Button>
        ) : null}
        {connected ? (
          <Button variant="danger" onClick={disconnect} disabled={pending}>
            <Unplug /> Disconnect
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-ink-2">
        OAuth redirect URI to register in your Meta app: <span className="break-all font-mono">{view.redirectUri}</span>
      </p>
    </div>
  );
}
