import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the Supabase query builder paths used by the server services. */
export function fakeAdmin(tables: Record<string, Row[]>) {
  const calls = {
    upserts: [] as { table: string; row: Row }[],
    updates: [] as { table: string; patch: Row }[],
    deletes: [] as string[],
    inserts: [] as { table: string; row: Row }[],
  };
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), b),
      neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), b),
      is: (c: string, v: unknown) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), b),
      not: (c: string, _op: string, v: unknown) => ((rows = rows.filter((r) => (r[c] ?? null) !== v)), b),
      order: () => b,
      limit: (n: number) => ((rows = rows.slice(0, n)), b),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      upsert: async (row: Row) => (calls.upserts.push({ table, row }), { error: null }),
      insert: async (row: Row) => (calls.inserts.push({ table, row }), { error: null }),
      update: (patch: Row) => (calls.updates.push({ table, patch }), b),
      delete: () => (calls.deletes.push(table), b),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return b;
  };
  return { admin: { from } as unknown as SupabaseClient<Database>, calls };
}
