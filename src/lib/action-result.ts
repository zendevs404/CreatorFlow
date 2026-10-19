export type ActionResult<T = undefined> =
  | { ok: true; message: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fieldErrorsFrom(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
