import type { ComponentProps, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-control bg-surface text-ink ring-1 ring-line placeholder:text-ink-2/70 px-3 text-sm transition-shadow focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60 aria-[invalid=true]:ring-bad";

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "py-3 leading-relaxed", className)} {...p} />;
}
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-10", className)} {...p} />;
}

export function Field({ label, htmlFor, error, hint, labelClassName, children }: { label: string; htmlFor: string; error?: string; hint?: string; labelClassName?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className={cn("block text-sm font-medium", labelClassName)}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-2">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
