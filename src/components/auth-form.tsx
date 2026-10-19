"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signIn, signUp } from "@/lib/auth-actions";

export function AuthForm({ mode, notice }: { mode: "login" | "signup"; notice?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>(notice);
  const [info, setInfo] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isLogin = mode === "login";

  function onSubmit(formData: FormData) {
    const input = { email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? "") };
    setError(undefined);
    setInfo(undefined);
    setFieldErrors({});
    start(async () => {
      const result = await (isLogin ? signIn(input) : signUp(input));
      // Successful sign-in redirects on the server, so a result only arrives on failure or for "check your email".
      if (!result) return;
      if (result.ok) setInfo(result.message);
      else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} />
      </Field>
      <Field label="Password" htmlFor="password" error={fieldErrors.password} hint={isLogin ? undefined : "At least 8 characters."}>
        <Input id="password" name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} />
      </Field>
      {error ? (
        <p role="alert" className="rounded-control bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="rounded-control bg-ok/10 px-3 py-2 text-sm text-ok">
          {info}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-ink-2">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link href={isLogin ? "/signup" : "/login"} className="font-medium text-accent underline-offset-4 hover:underline">
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
