export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-control bg-line" />
      <div className="h-40 animate-pulse rounded-panel bg-line" />
      <div className="h-40 animate-pulse rounded-panel bg-line" />
    </div>
  );
}
