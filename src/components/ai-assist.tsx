"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { generateSuggestions } from "@/lib/ai/actions";
import { AI_TONES, type AssistInput } from "@/lib/ai/assist";
import { countCharacters } from "@/lib/threads/limits";
import { cn } from "@/lib/utils";

type Props = { enabled: boolean; reason: string | null; notice: string | null; draft: string; disabled: boolean; onUse: (text: string) => void };

const TABS: { id: AssistInput["action"]; label: string; needs: "topic" | "draft" }[] = [
  { id: "ideas", label: "Ideas", needs: "topic" },
  { id: "hooks", label: "Hooks", needs: "draft" },
  { id: "rewrite", label: "Rewrite", needs: "draft" },
  { id: "variations", label: "Variations", needs: "draft" },
];

export function AiAssist({ enabled, reason, notice, draft, disabled, onUse }: Props) {
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AssistInput["action"]>("ideas");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<(typeof AI_TONES)[number]>("friendly");
  const [results, setResults] = useState<string[]>([]);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0]!;
  const source = current.needs === "topic" ? topic : draft;

  function generate() {
    start(async () => {
      const r = await generateSuggestions({ action: tab, text: source, tone: tab === "rewrite" ? tone : undefined });
      if (!r.ok) {
        setResults([]);
        notify("error", r.error);
        return;
      }
      setResults(r.data?.suggestions ?? []);
    });
  }

  return (
    <div className="rounded-control bg-surface-2 ring-1 ring-line">
      <button type="button" aria-expanded={open} aria-controls="ai-assist-panel" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm font-medium">
        <Sparkles className="size-4 text-accent" aria-hidden /> AI assist
        {!enabled ? <span className="ml-auto text-xs font-normal text-ink-2">Off</span> : null}
        <ChevronDown aria-hidden className={cn("size-4 text-ink-2 transition-transform duration-200", enabled ? "ml-auto" : "", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="ai-assist-panel"
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
      <div className="space-y-3 border-t border-line p-3">
        {!enabled ? (
          <p role="status" className="text-sm text-ink-2">
            {reason}
          </p>
        ) : (
          <>
            <div role="tablist" aria-label="AI assist type" className="flex flex-wrap gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => {
                    setTab(t.id);
                    setResults([]);
                  }}
                  className={cn("rounded-full px-3 py-1 text-sm", tab === t.id ? "bg-accent/15 font-medium text-accent" : "text-ink-2 hover:bg-line")}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {current.needs === "topic" ? (
              <Input aria-label="Topic" placeholder="What should the post be about?" value={topic} maxLength={300} onChange={(e) => setTopic(e.target.value)} />
            ) : (
              <p className="text-xs text-ink-2">Works from the text in the editor{draft.trim() ? "" : " (write something first)"}.</p>
            )}
            {tab === "rewrite" ? (
              <Dropdown
                aria-label="Tone"
                value={tone}
                onValueChange={(v) => setTone(AI_TONES.find((t) => t === v) ?? "friendly")}
                options={AI_TONES.map((t) => ({ value: t, label: `${t[0]?.toUpperCase() ?? ""}${t.slice(1)}` }))}
              />
            ) : null}
            <Button size="sm" variant="primary" onClick={generate} disabled={pending || disabled || source.trim().length === 0}>
              <Sparkles /> {pending ? "Generating…" : "Generate"}
            </Button>
            {results.length > 0 ? (
              <ul className="space-y-2" aria-label="Suggestions">
                {results.map((text, i) => (
                  <motion.li key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }} className="rounded-control bg-surface p-3 text-sm ring-1 ring-line">
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-ink-2">{countCharacters(text)} / 500</span>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (draft.trim() && !window.confirm("Replace the text in the editor with this suggestion?")) return;
                          onUse(text);
                        }}
                        disabled={disabled}
                      >
                        Use this
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-ink-2">Suggestions come from an AI model and can be wrong. Check facts before posting. {notice}</p>
          </>
        )}
      </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
