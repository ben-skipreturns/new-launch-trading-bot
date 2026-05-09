export function formatSol(value: number | undefined, digits = 4): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)} SOL`;
}

export function formatPct(value: number | undefined, digits = 1): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

export function formatScore(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(3);
}

export function formatDate(value: Date | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

export function formatAge(value: Date | undefined, now = new Date()): string {
  if (!value) return "unknown";
  const seconds = Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function shortMint(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}
