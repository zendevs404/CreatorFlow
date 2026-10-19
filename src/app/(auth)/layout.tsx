export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
      <div className="glass relative w-full max-w-sm rounded-panel p-8">{children}</div>
    </main>
  );
}
