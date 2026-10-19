import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-ink-2">Your drafts and schedule stay private to you.</p>
      <AuthForm mode="signup" />
    </>
  );
}
