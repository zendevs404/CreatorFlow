import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/database.types";

/** Verifies the session with the Auth server (not just the cookie) and loads the profile. */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) {
    throw new Error("Your profile could not be loaded. Check that the database migration has been applied.");
  }
  return { supabase, user: data.user, profile: profile satisfies ProfileRow };
}
