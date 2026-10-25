/** Time helpers — everything internal is ISO 8601 UTC. */

export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export function toIso(date: Date): string {
  return date.toISOString();
}

export function hoursBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / 3_600_000;
}

/** Parse an ISO timestamp from an artifact; returns undefined for junk. */
export function parseIso(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** `YYYY-MM-DD` in UTC for usage bucketing. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(clock: Clock, days: number): Date {
  const now = clock();
  return new Date(now.getTime() - days * 86_400_000);
}
