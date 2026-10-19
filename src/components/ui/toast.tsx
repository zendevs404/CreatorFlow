"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; kind: "success" | "error"; message: string };
const Ctx = createContext<{ notify: (kind: Toast["kind"], message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const notify = useCallback((kind: Toast["kind"], message: string) => {
    const id = next.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="glass pop-in pointer-events-auto flex max-w-md items-center gap-2 rounded-full px-4 py-2 text-sm">
            {t.kind === "success" ? <CheckCircle2 className="size-4 text-ok" /> : <CircleAlert className="size-4 text-bad" />}
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
