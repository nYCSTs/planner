import type { ResolvedOccurrence } from "@/types";
import { isHourly } from "./recurrence";

export interface PlacedOccurrence {
  occurrence: ResolvedOccurrence;
  column: number;
  columns: number;
  /** Hourly tasks render in the thin overlay band on the right. */
  overlay: boolean;
}

interface Interval {
  startMinute: number;
  endMinute: number;
}

/**
 * Greedy column packing (Google-Calendar style): transitively-overlapping
 * items are split into side-by-side columns.
 */
export function packColumns<T extends Interval>(items: T[]): { item: T; column: number; columns: number }[] {
  const out: { item: T; column: number; columns: number }[] = [];
  const sorted = [...items].sort(
    (a, b) => a.startMinute - b.startMinute || b.endMinute - b.startMinute - (a.endMinute - a.startMinute),
  );

  let cluster: T[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columnEnds: number[] = [];
    const assignment = new Map<T, number>();
    for (const it of cluster) {
      let col = columnEnds.findIndex((end) => end <= it.startMinute);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(it.endMinute);
      } else {
        columnEnds[col] = it.endMinute;
      }

      assignment.set(it, col);
    }

    for (const it of cluster) {
      out.push({ item: it, column: assignment.get(it)!, columns: columnEnds.length });
    }

    cluster = [];
    clusterEnd = -1;
  };

  for (const it of sorted) {
    if (cluster.length > 0 && it.startMinute >= clusterEnd) {
      flush();
    }

    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMinute);
  }

  if (cluster.length) {
    flush();
  }

  return out;
}

/** One stable column per distinct hourly task in the overlay band. */
function packOverlayByTask(occurrences: ResolvedOccurrence[]) {
  const taskIds: string[] = [];
  for (const o of occurrences) {
    if (!taskIds.includes(o.task.id)) {
      taskIds.push(o.task.id);
    }
  }

  const columns = Math.max(1, taskIds.length);
  return occurrences.map((occurrence) => ({ occurrence, column: taskIds.indexOf(occurrence.task.id), columns }));
}

export function placeOccurrences(occurrences: ResolvedOccurrence[]): PlacedOccurrence[] {
  const overlay = occurrences.filter((o) => isHourly(o.task.recurrence) && o.slot !== undefined);
  const regular = occurrences.filter((o) => !(isHourly(o.task.recurrence) && o.slot !== undefined));

  return [
    ...packColumns(regular).map((p) => ({ occurrence: p.item, column: p.column, columns: p.columns, overlay: false })),
    ...packOverlayByTask(overlay).map((p) => ({ ...p, overlay: true })),
  ];
}
