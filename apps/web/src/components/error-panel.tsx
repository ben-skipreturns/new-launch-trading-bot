export function ErrorPanel({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="panel rounded-md border-reject/30 bg-reject/5 p-4 text-sm text-ink">
      <div className="font-semibold text-reject">Data source unavailable</div>
      <div className="mt-1 text-muted">{message}</div>
    </div>
  );
}
