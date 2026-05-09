export function toDate(value: Date | string | number | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value > 10_000_000_000 ? value : value * 1000);
  if (typeof value === "string") return new Date(value);
  return new Date();
}

export function secondsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
