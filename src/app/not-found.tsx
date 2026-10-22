import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-ink-2">That page does not exist.</p>
        <Link href="/dashboard" className="mt-4 inline-block font-medium text-accent hover:underline">
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
