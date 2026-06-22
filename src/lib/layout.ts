import type { ResolvedOccurrence } from "@/types";
import { isHourly } from "./time";

export interface PlacedOccurrence {
  occurrence: ResolvedOccurrence;
  /** Column index within its overlap cluster. */
  column: number;
  /** Total columns in its cluster. */
  columns: number;
  /** True for hourly tasks rendered in the thin overlay band on the right. */
  overlay: boolean;
}

/**
 * Greedy column packing for a set of occurrences (Google-Calendar style):
 * transitively-overlapping occurrences are split into side-by-side columns so
 * none sit on top of another. Returns each occurrence with its column index and
 * the column count of its cluster.
 */
function packColumns(
  occurrences: ResolvedOccurrence[],
): { occurrence: ResolvedOccurrence; column: number; columns: number }[] {
  const out: { occurrence: ResolvedOccurrence; column: number; columns: number }[] =
    [];

  const sorted = [...occurrences].sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      b.endMinute - b.startMinute - (a.endMinute - a.startMinute),
  );

  let cluster: ResolvedOccurrence[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const assignment = new Map<string, number>();
    for (const occ of cluster) {
      let col = columnEnds.findIndex((end) => end <= occ.startMinute);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(occ.endMinute);
      } else {
        columnEnds[col] = occ.endMinute;
      }
      assignment.set(occ.key, col);
    }
    const total = columnEnds.length;
    for (const occ of cluster) {
      out.push({ occurrence: occ, column: assignment.get(occ.key)!, columns: total });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const occ of sorted) {
    if (cluster.length > 0 && occ.startMinute >= clusterEnd) {
      flush();
    }
    cluster.push(occ);
    clusterEnd = Math.max(clusterEnd, occ.endMinute);
  }
  flush();

  return out;
}

/**
 * Lay out hourly occurrences in the overlay band with one column per distinct
 * hourly task. Because consecutive hourly slots chain into one giant transitive
 * cluster, per-occurrence packing would explode the column count; grouping by
 * task instead keeps each task in a stable, readable column (Bunpro always in
 * its column, "respostas" in the next).
 */
function packOverlayByTask(
  occurrences: ResolvedOccurrence[],
): { occurrence: ResolvedOccurrence; column: number; columns: number }[] {
  const taskIds: string[] = [];
  for (const o of occurrences) {
    if (!taskIds.includes(o.task.id)) taskIds.push(o.task.id);
  }
  const columns = Math.max(1, taskIds.length);
  return occurrences.map((occurrence) => ({
    occurrence,
    column: taskIds.indexOf(occurrence.task.id),
    columns,
  }));
}

/**
 * Place occurrences for the timeline. Hourly tasks are kept in a separate
 * "overlay" lane on the right so they sit on top of regular work; regular tasks
 * are column-packed by overlap, hourly tasks by distinct task, so overlapping
 * items never stack on top of each other.
 */
export function placeOccurrences(
  occurrences: ResolvedOccurrence[],
): PlacedOccurrence[] {
  const overlay = occurrences.filter((o) => isHourly(o.task.recurrence));
  const regular = occurrences.filter((o) => !isHourly(o.task.recurrence));

  return [
    ...packColumns(regular).map((p) => ({ ...p, overlay: false })),
    ...packOverlayByTask(overlay).map((p) => ({ ...p, overlay: true })),
  ];
}
