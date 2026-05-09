export function ErrorPanel({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-reject/30 bg-reject/10 p-4 text-sm text-ink shadow-panel">
      <div className="font-semibold text-reject">Data source unavailable</div>
      <div className="mt-1 text-muted">{message}</div>
    </div>
  );
}
