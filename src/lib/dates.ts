import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";

/** Business time zone. Fixed for v1; settings.timezone is display only. */
export const TZ = "Asia/Manila";

/** "YYYY-MM-DD" string for date-only fields, always in Asia/Manila. */
export type IsoDate = string;
/** "YYYY-MM" month bucket in Asia/Manila. */
export type MonthKey = string;

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid date");

export function todayIso(now: Date = new Date()): IsoDate {
  return formatInTimeZone(now, TZ, "yyyy-MM-dd");
}

export function monthKeyOf(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

export function monthKeyOfInstant(instant: Date): MonthKey {
  return formatInTimeZone(instant, TZ, "yyyy-MM");
}

export function isoDateOfInstant(instant: Date): IsoDate {
  return formatInTimeZone(instant, TZ, "yyyy-MM-dd");
}

/** The last n month keys ending with the current Manila month, oldest first. */
export function lastNMonths(n: number, now: Date = new Date()): MonthKey[] {
  const [y, m] = formatInTimeZone(now, TZ, "yyyy-MM").split("-").map(Number);
  const out: MonthKey[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Add whole days to an IsoDate (calendar arithmetic, no time zone involved). */
export function addDaysIso(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Start of a Manila calendar day as an instant. */
export function startOfManilaDay(date: IsoDate): Date {
  return fromZonedTime(`${date}T00:00:00`, TZ);
}

export function formatIsoDate(date: IsoDate): string {
  return formatInTimeZone(new Date(`${date}T12:00:00Z`), "UTC", "d MMM yyyy");
}

export function formatMonthKey(month: MonthKey, pattern = "MMM yyyy"): string {
  return formatInTimeZone(new Date(`${month}-15T12:00:00Z`), "UTC", pattern);
}

export function formatInstant(instant: Date, pattern = "d MMM yyyy, HH:mm"): string {
  return formatInTimeZone(instant, TZ, pattern);
}
