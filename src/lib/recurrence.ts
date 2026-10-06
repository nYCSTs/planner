import { getDaysInMonth } from "date-fns";
import type { Recurrence, Task, Weekday } from "../types";
import { addDaysKey, dateKey, dayFromKey, diffDaysKey } from "./time";

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function isHourly(rec: Recurrence): boolean {
  return rec.everyHour === true && rec.kind !== "once";
}

export function hourlyInterval(rec: Recurrence): number {
  const n = rec.everyHourInterval ?? 1;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function isRecurring(task: Pick<Task, "recurrence">): boolean {
  return task.recurrence.kind !== "once";
}

/** First day the recurrence can occur on. */
export function recurrenceFloor(task: Pick<Task, "recurrence" | "createdAt">): string {
  return task.recurrence.startDate ?? dateKey(new Date(task.createdAt));
}

function intervalOf(rec: Recurrence): number {
  const n = rec.interval ?? 1;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function matchesMonthly(rec: Recurrence, anchor: Date, day: Date): boolean {
  const months =
    (day.getFullYear() - anchor.getFullYear()) * 12 + (day.getMonth() - anchor.getMonth());
  if (months < 0 || months % intervalOf(rec) !== 0) {
    return false;
  }

  if (rec.monthlyBy === "weekday") {
    if (day.getDay() !== anchor.getDay()) {
      return false;
    }

    const nth = Math.ceil(anchor.getDate() / 7);
    if (nth >= 5) {
      return day.getDate() + 7 > getDaysInMonth(day);
    }

    return Math.ceil(day.getDate() / 7) === nth;
  }

  return day.getDate() === Math.min(anchor.getDate(), getDaysInMonth(day));
}

/**
 * Does the recurrence pattern fall on `key`? Ignores "afterDone" (which
 * depends on completion history — see occurrences.ts).
 */
export function patternMatches(task: Pick<Task, "recurrence" | "createdAt" | "date">, key: string): boolean {
  const rec = task.recurrence;
  if (rec.kind === "once") {
    return task.date === key;
  }

  const floor = recurrenceFloor(task);
  if (key < floor) {
    return false;
  }

  if (rec.endDate && key > rec.endDate) {
    return false;
  }

  const day = dayFromKey(key);
  const weekday = day.getDay() as Weekday;

  switch (rec.kind) {
    case "everyday":
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekends":
      return weekday === 0 || weekday === 6;
    case "custom":
      return rec.weekdays?.includes(weekday) ?? false;
    case "interval": {
      const n = intervalOf(rec);
      if (rec.unit === "week") {
        const anchor = dayFromKey(floor);
        const days = rec.weekdays?.length ? rec.weekdays : [anchor.getDay() as Weekday];
        if (!days.includes(weekday)) {
          return false;
        }

        const weekStartAnchor = addDaysKey(floor, -anchor.getDay());
        const weekStartDay = addDaysKey(key, -weekday);
        return (diffDaysKey(weekStartAnchor, weekStartDay) / 7) % n === 0;
      }

      return diffDaysKey(floor, key) % n === 0;
    }
    case "monthly":
      return matchesMonthly(rec, dayFromKey(floor), day);
    case "yearly": {
      const anchor = dayFromKey(floor);
      return (
        day.getMonth() === anchor.getMonth() &&
        day.getDate() === Math.min(anchor.getDate(), getDaysInMonth(day))
      );
    }
    case "afterDone":
      return false;
  }
}

/** Weekdays the simple weekly patterns apply to (empty for others). */
export function recurrenceWeekdays(rec: Recurrence): Weekday[] {
  switch (rec.kind) {
    case "everyday":
      return [0, 1, 2, 3, 4, 5, 6];
    case "weekdays":
      return [1, 2, 3, 4, 5];
    case "weekends":
      return [0, 6];
    case "custom":
      return rec.weekdays ?? [];
    default:
      return [];
  }
}

function joinPt(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Human summary in pt-BR, e.g. "A cada 2 semanas (seg, qua)". */
export function describeRecurrence(rec: Recurrence): string {
  const n = intervalOf(rec);
  const anchor = rec.startDate ? dayFromKey(rec.startDate) : null;
  let base: string;

  switch (rec.kind) {
    case "once":
      base = "Não repete";
      break;
    case "everyday":
      base = "Todos os dias";
      break;
    case "weekdays":
      base = "Dias úteis";
      break;
    case "weekends":
      base = "Fim de semana";
      break;
    case "custom": {
      const days = [...(rec.weekdays ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      base = days.length === 7 ? "Todos os dias" : `Toda ${joinPt(days.map((d) => WEEKDAY_SHORT[d].toLowerCase()))}`;
      break;
    }
    case "interval":
      if (rec.unit === "week") {
        const days = rec.weekdays?.length ? rec.weekdays : anchor ? [anchor.getDay() as Weekday] : [];
        const list = days.length ? ` (${days.map((d) => WEEKDAY_SHORT[d].toLowerCase()).join(", ")})` : "";
        base = n === 1 ? `Toda semana${list}` : `A cada ${n} semanas${list}`;
      } else {
        base = n === 1 ? "Todos os dias" : `A cada ${n} dias`;
      }
      break;
    case "monthly": {
      const every = n === 1 ? "Todo mês" : `A cada ${n} meses`;
      if (!anchor) {
        base = every;
      } else if (rec.monthlyBy === "weekday") {
        const nth = Math.ceil(anchor.getDate() / 7);
        const ord = nth >= 5 ? "última" : `${nth}ª`;
        base = `${every}, ${ord} ${WEEKDAY_LONG[anchor.getDay()]}`;
      } else {
        base = `${every}, dia ${anchor.getDate()}`;
      }
      break;
    }
    case "yearly":
      base = anchor
        ? `Todo ano, ${anchor.getDate()}/${String(anchor.getMonth() + 1).padStart(2, "0")}`
        : "Todo ano";
      break;
    case "afterDone":
      base = n === 1 ? "1 dia após concluir" : `${n} dias após concluir`;
      break;
  }

  if (isHourly(rec)) {
    const h = hourlyInterval(rec);
    base += ` · a cada ${h === 1 ? "hora" : `${h} horas`}`;
  }

  return base;
}
