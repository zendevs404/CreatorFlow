"use client";

import * as S from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type DropdownOption = { value: string; label: string };

type Props = {
  options: DropdownOption[];
  /** Radix does not allow an empty-string value; use a sentinel such as "all". */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Submits the value with the surrounding <form>, like a native select. */
  name?: string;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Slightly denser, lightly tinted glass for long lists where the text must stand out. */
  tinted?: boolean;
};

/** Animated, keyboard-accessible replacement for <select>. Open/close animations live in globals.css. */
export function Dropdown({ options, placeholder, className, id, tinted = false, "aria-label": ariaLabel, ...root }: Props) {
  return (
    <S.Root {...root}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "group flex h-10 w-full items-center justify-between gap-2 rounded-control bg-surface px-3 text-left text-sm text-ink ring-1 ring-line transition-shadow",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60 data-[placeholder]:text-ink-2/70",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon asChild>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-2 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className={cn("glass dropdown-content z-[65] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control p-1", tinted && "glass-tinted")}>
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-[0.55rem] py-2 pl-8 pr-3 text-sm text-ink outline-none data-[highlighted]:bg-accent/16 data-[state=checked]:font-medium"
              >
                <S.ItemIndicator className="absolute left-2 inline-flex items-center text-accent">
                  <Check className="size-4" aria-hidden />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
