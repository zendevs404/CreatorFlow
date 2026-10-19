/** Civil-date helpers on "YYYY-MM-DD" keys; independent of the machine timezone. */

const DAY_MS = 86_400_000;

function toUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDayKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && toKey(toUtc(value)) === value);
}

export function addDays(key: string, n: number): string {
  return toKey(toUtc(key) + n * DAY_MS);
}

export function addMonths(key: string, n: number): string {
  const d = new Date(toUtc(key));
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  return toKey(target.getTime());
}

/** Weekday index with Monday = 0. */
export function weekdayIndex(key: string): number {
  return (new Date(toUtc(key)).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

/** Six full weeks covering the month of `anchor`. */
export function monthGrid(anchor: string): string[] {
  const first = `${anchor.slice(0, 8)}01`;
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekDays(anchor: string): string[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Instant range (ISO) that surely covers the given day keys in any timezone. */
export function paddedRange(days: string[]): { from: string; to: string } {
  const first = days[0] as string;
  const last = days[days.length - 1] as string;
  return {
    from: new Date(toUtc(first) - 14 * 3_600_000).toISOString(),
    to: new Date(toUtc(last) + DAY_MS + 14 * 3_600_000).toISOString(),
  };
}
