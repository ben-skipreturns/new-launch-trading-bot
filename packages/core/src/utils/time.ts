export function toDate(value: Date | string | number | undefined): Date {
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value > 10_000_000_000 ? value : value * 1000)
        : typeof value === "string"
          ? new Date(value)
          : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function secondsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
