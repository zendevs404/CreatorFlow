"use client";

/** Last-resort boundary for errors in the root layout. Shows no internal details. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", maxWidth: "36rem", margin: "0 auto" }}>
        <h1>Something went wrong</h1>
        <p>An unexpected error occurred. Your drafts are safe. Please try again.</p>
        <button type="button" onClick={reset} style={{ padding: "0.5rem 1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
