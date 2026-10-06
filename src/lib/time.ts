import { addDays, differenceInCalendarDays, format, parse } from "date-fns";
import type { SleepSchedule, Weekday } from "../types";

export const MINUTES_IN_DAY = 24 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** yyyy-MM-dd key for a Date (local time). */
export function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateKey(key: string): Date {
  return parse(key, "yyyy-MM-dd", new Date());
}

/** Noon of the given day key — safe against DST edges when doing day math. */
export function dayFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

export function addDaysKey(key: string, days: number): string {
  return dateKey(addDays(dayFromKey(key), days));
}

export function diffDaysKey(from: string, to: string): number {
  return differenceInCalendarDays(dayFromKey(to), dayFromKey(from));
}

/** "HH:mm" -> minutes from midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** minutes from midnight -> "HH:mm". */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_IN_DAY - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function nowMinutes(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** ms epoch of local midnight for a day key. */
export function dayStartMs(key: string): number {
  return parseDateKey(key).getTime();
}

/** ms epoch at `minute` of the day `key` (local time). */
export function msAt(key: string, minute: number): number {
  const d = parseDateKey(key);
  d.setMinutes(minute);
  return d.getTime();
}

/** Minute of the day (local) for a ms epoch. */
export function minuteOfDay(ms: number): number {
  return nowMinutes(new Date(ms));
}

export function dayKeyOfMs(ms: number): string {
  return dateKey(new Date(ms));
}

export { DAY_MS };

/** 95 -> "1h35", 45 -> "45min", 120 -> "2h". */
export function formatMinutes(total: number): string {
  const rounded = Math.max(0, Math.round(total));
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) {
    return `${m}min`;
  }

  if (m === 0) {
    return `${h}h`;
  }

  return `${h}h${String(m).padStart(2, "0")}`;
}

/** ms -> "HH:MM:SS". */
export function formatHms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

/** ms -> "1:05:09" / "5:09" — compact clock for tight spaces. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${sec}`;
  }

  return `${m}:${sec}`;
}

/** Do two [start, end) intervals overlap? */
export function intervalsOverlap(
  aStart: number,
  aEnd: number | null,
  bStart: number,
  bEnd: number | null,
): boolean {
  const ae = aEnd ?? MINUTES_IN_DAY;
  const be = bEnd ?? MINUTES_IN_DAY;
  return aStart < be && bStart < ae;
}

/** The bedtime/wake pair that *starts* on the given weekday. */
export function sleepForWeekday(
  sleep: SleepSchedule,
  weekday: Weekday,
): { bedtime: number; wakeTime: number } {
  return (
    sleep.perDay?.[weekday] ?? { bedtime: sleep.bedtime, wakeTime: sleep.wakeTime }
  );
}

export interface SleepSegment {
  startMinute: number;
  endMinute: number;
  part: "evening" | "morning";
}

/**
 * Sleep band segment(s) visible on `day`: the morning tail of last night
 * (00:00 → wake) and the start of tonight (bedtime → 24:00), or a single band
 * when the window doesn't cross midnight.
 */
export function sleepSegments(sleep: SleepSchedule, day: Date): SleepSegment[] {
  if (!sleep.enabled) {
    return [];
  }

  const weekday = day.getDay() as Weekday;
  const today = sleepForWeekday(sleep, weekday);
  const segments: SleepSegment[] = [];

  if (today.bedtime < today.wakeTime) {
    segments.push({ startMinute: today.bedtime, endMinute: today.wakeTime, part: "evening" });
    return segments;
  }

  if (today.bedtime < MINUTES_IN_DAY) {
    segments.push({ startMinute: today.bedtime, endMinute: MINUTES_IN_DAY, part: "evening" });
  }

  const prevWeekday = ((weekday + 6) % 7) as Weekday;
  const prev = sleepForWeekday(sleep, prevWeekday);
  if (prev.bedtime >= prev.wakeTime && prev.wakeTime > 0) {
    segments.push({ startMinute: 0, endMinute: prev.wakeTime, part: "morning" });
  }

  return segments;
}
