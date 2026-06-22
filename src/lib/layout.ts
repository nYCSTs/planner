import type { ResolvedOccurrence } from "@/types";

export interface PlacedOccurrence {
  occurrence: ResolvedOccurrence;
  /** Column index within its overlap cluster. */
  column: number;
  /** Total columns in its cluster. */
  columns: number;
  /** True for hourly tasks rendered as a thin overlay strip on the right. */
  overlay: boolean;
}

/**
 * Greedy column packing for overlapping occurrences (Google-Calendar style).
 * Hourly tasks are split off into an "overlay" lane so they sit on top of
 * regular work instead of squeezing it.
 */
export function placeOccurrences(
  occurrences: ResolvedOccurrence[],
): PlacedOccurrence[] {
  const overlay = occurrences.filter((o) => o.task.recurrence.kind === "hourly");
  const regular = occurrences.filter((o) => o.task.recurrence.kind !== "hourly");

  const placed: PlacedOccurrence[] = [];

  // Sort by start, then by longer-first for stable packing.
  const sorted = [...regular].sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      b.endMinute - b.startMinute - (a.endMinute - a.startMinute),
  );

  // Build clusters of transitively-overlapping occurrences.
  let cluster: ResolvedOccurrence[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // Assign columns within the cluster greedily.
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
      placed.push({
        occurrence: occ,
        column: assignment.get(occ.key)!,
        columns: total,
        overlay: false,
      });
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

  for (const occ of overlay) {
    placed.push({ occurrence: occ, column: 0, columns: 1, overlay: true });
  }

  return placed;
}
