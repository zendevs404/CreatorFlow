import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 text-sm text-ink-2">Sign in to plan and schedule your Threads posts.</p>
      <AuthForm mode="login" notice={error === "confirm" ? "That confirmation link is invalid or has expired. Sign in, or create the account again." : undefined} />
    </>
  );
}
