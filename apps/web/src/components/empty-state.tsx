export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel rounded-md p-6 text-sm">
      <div className="font-semibold text-ink">{title}</div>
      <div className="mt-1 text-muted">{body}</div>
    </div>
  );
}
