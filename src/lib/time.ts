/** Timezone helpers built on Intl only (no date library). Instants are stored as UTC ISO strings. */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function partsInZone(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of f.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a wall-clock "YYYY-MM-DDTHH:mm" in `timeZone` to a UTC instant. */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m || !isValidTimeZone(timeZone)) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone);
  utc = guess - zoneOffsetMs(new Date(utc), timeZone);
  const result = new Date(utc);
  const back = partsInZone(result, timeZone);
  if (back.year !== y || back.month !== mo || back.day !== d || back.hour !== h || back.minute !== mi) return null;
  return result;
}

/** Format a UTC instant as "YYYY-MM-DDTHH:mm" wall-clock in `timeZone` (for datetime-local inputs). */
export function utcToZonedLocal(iso: string | Date, timeZone: string): string {
  const p = partsInZone(typeof iso === "string" ? new Date(iso) : iso, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DD" day key of an instant in a zone. */
export function dayKey(iso: string | Date, timeZone: string): string {
  return utcToZonedLocal(iso, timeZone).slice(0, 10);
}

export function formatInZone(iso: string | Date, timeZone: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
    ...opts,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}
