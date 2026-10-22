import { PLATFORMS, type PlatformId } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/** Monochrome platform mark (uses the surrounding text colour). The accessible name is the platform name. */
export function PlatformIcon({ platform, size = 14, className }: { platform: PlatformId; size?: number; className?: string }) {
  const { label, path } = PLATFORMS[platform];
  return (
    <svg role="img" aria-label={label} viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={cn("shrink-0", className)}>
      <title>{label}</title>
      <path d={path} />
    </svg>
  );
}

/** Icon plus name, for headers and legends. */
export function PlatformBadge({ platform, className }: { platform: PlatformId; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-ink-2", className)}>
      <svg aria-hidden viewBox="0 0 24 24" width={14} height={14} fill="currentColor">
        <path d={PLATFORMS[platform].path} />
      </svg>
      {PLATFORMS[platform].label}
    </span>
  );
}
