"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isToday } from "date-fns";
import { Moon, Sunrise } from "lucide-react";
import type { ResolvedOccurrence, SleepSchedule, Tag } from "@/types";
import { placeOccurrences } from "@/lib/layout";
import { MINUTES_IN_DAY, minutesToTime, nowMinutes, sleepSegments } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TaskBlock } from "./task-block";

const PX_PER_MINUTE = 1; // 1440px tall day
const HOUR_HEIGHT = 60 * PX_PER_MINUTE;
const SNAP = 15; // minutes — drag-to-create snapping

interface TimelineProps {
  day: Date;
  now: Date;
  occurrences: ResolvedOccurrence[];
  onOccurrenceClick: (occ: ResolvedOccurrence) => void;
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onResize: (occ: ResolvedOccurrence, startMinute: number, endMinute: number | null) => void;
  /** Create a task. When endMinute is given the user dragged out an interval. */
  onSlotClick: (startMinute: number, endMinute?: number) => void;
  /** Whether creating tasks is allowed on this day (blocks past days). */
  canCreate?: boolean;
  /** All tags, keyed by id, for rendering tag dots on blocks. */
  tagsById?: Record<string, Tag>;
  /** Optional daily sleep window rendered as a distinct ambient band. */
  sleep?: SleepSchedule;
}

export function Timeline({
  day,
  now,
  occurrences,
  onOccurrenceClick,
  onToggleDone,
  onResize,
  onSlotClick,
  canCreate = true,
  tagsById,
  sleep,
}: TimelineProps) {
  const placed = useMemo(() => placeOccurrences(occurrences), [occurrences]);
  const sleepBands = useMemo(
    () => (sleep ? sleepSegments(sleep, day) : []),
    [sleep, day],
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Suppress the now-line until client-side hydration is complete so the
  // server's UTC clock doesn't place the indicator at the wrong position.
  const showNowLine = mounted && isToday(day);
  const nowMin = nowMinutes(now);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Drag-to-create: a live [start, end] selection in minutes while dragging on
  // empty timeline space. Null when not dragging.
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const dragAnchor = useRef<number | null>(null);

  // Auto-scroll to current time (or 8am) on day change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = (showNowLine ? nowMin : 8 * 60) * PX_PER_MINUTE - 120;
    el.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const minuteFromEvent = (clientY: number): number => {
    const grid = gridRef.current;
    if (!grid) return 0;
    const rect = grid.getBoundingClientRect();
    const raw = (clientY - rect.top) / PX_PER_MINUTE;
    return Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(raw / SNAP) * SNAP));
  };

  const beginCreateDrag = (e: React.PointerEvent) => {
    if (!canCreate) return;
    // Only start on primary button and on the background (not on a block).
    if (e.button !== 0) return;
    const start = minuteFromEvent(e.clientY);
    dragAnchor.current = start;
    setSelection({ start, end: start });

    const onMove = (ev: PointerEvent) => {
      const anchor = dragAnchor.current;
      if (anchor === null) return;
      const cur = minuteFromEvent(ev.clientY);
      setSelection({ start: Math.min(anchor, cur), end: Math.max(anchor, cur) });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const anchor = dragAnchor.current;
      dragAnchor.current = null;
      setSelection(null);
      if (anchor === null) return;
      const end = minuteFromEvent(ev.clientY);
      const lo = Math.min(anchor, end);
      const hi = Math.max(anchor, end);
      // A drag of at least one snap step creates an interval; a click (no drag)
      // creates a default-length task at that minute.
      if (hi - lo >= SNAP) onSlotClick(lo, hi);
      else onSlotClick(lo);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto">
      <div
        ref={gridRef}
        className="relative ml-16 touch-none select-none"
        style={{ height: MINUTES_IN_DAY * PX_PER_MINUTE }}
        onPointerDown={beginCreateDrag}
      >
        {/* Hour grid */}
        {hours.map((h) => {
          const night = h < 6 || h >= 22;
          return (
            <div
              key={h}
              className={cn(
                "group absolute inset-x-0 border-t",
                h % 2 === 0 ? "border-border/70" : "border-border/40",
              )}
              style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            >
              {/* Hour label in the left gutter */}
              <span className="pointer-events-none absolute -left-16 -top-2.5 w-14 select-none text-right text-[11px] font-medium tabular-nums text-muted-foreground/70">
                {String(h).padStart(2, "0")}:00
              </span>
              {/* Night shading for a calmer day rhythm */}
              {night && (
                <div className="pointer-events-none absolute inset-0 bg-muted/25" />
              )}
              {/* Half-hour tick */}
              <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border/25" />
              {/* Hover affordance for creating */}
              {canCreate && (
                <div className="h-full cursor-pointer transition-colors group-hover:bg-accent/25" />
              )}
            </div>
          );
        })}

        {/* Sleep band(s): a distinct, calm indigo overlay behind tasks. */}
        {sleepBands.map((seg) => {
          const h = (seg.endMinute - seg.startMinute) * PX_PER_MINUTE;
          return (
            <div
              key={seg.part}
              className="pointer-events-none absolute inset-x-0 z-[1] overflow-hidden border-y border-indigo-400/25 bg-indigo-500/[0.07] dark:border-indigo-300/15 dark:bg-indigo-400/[0.08]"
              style={{
                top: seg.startMinute * PX_PER_MINUTE,
                height: h,
                backgroundImage:
                  "repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(99,102,241,0.05) 10px, rgba(99,102,241,0.05) 20px)",
              }}
            >
              {h >= 28 && (
                <span className="absolute right-2 top-1.5 flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                  {seg.part === "evening" ? (
                    <><Moon className="h-3 w-3" /> Dormir · {minutesToTime(seg.startMinute)}</>
                  ) : (
                    <><Sunrise className="h-3 w-3" /> Acordar · {minutesToTime(seg.endMinute)}</>
                  )}
                </span>
              )}
            </div>
          );
        })}

        {/* Drag-to-create selection preview */}
        {selection && selection.end > selection.start && (
          <div
            className="pointer-events-none absolute inset-x-0 z-20 rounded-md border-2 border-dashed border-primary/50 bg-primary/10"
            style={{
              top: selection.start * PX_PER_MINUTE,
              height: (selection.end - selection.start) * PX_PER_MINUTE,
            }}
          >
            <span className="absolute left-2 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {minutesToTime(selection.start)} – {minutesToTime(selection.end)}
            </span>
          </div>
        )}

        {/* Now line with a time chip anchored in the gutter. */}
        {showNowLine && (
          <div
            className="pointer-events-none absolute inset-x-0 z-30 h-px bg-red-500"
            style={{ top: nowMin * PX_PER_MINUTE }}
          >
            <span className="absolute -left-16 -top-2.5 w-14 rounded bg-red-500 py-0.5 text-center text-[10px] font-bold text-white tabular-nums">
              {minutesToTime(nowMin)}
            </span>
            <div className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-red-500 ring-2 ring-background" />
          </div>
        )}

        {/* Empty-day hint */}
        {placed.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Nenhuma tarefa neste dia
            </p>
            <p className="text-xs text-muted-foreground/70">
              Clique num horário ou arraste para criar um intervalo.
            </p>
          </div>
        )}

        {/* Task blocks */}
        {placed.map((p) => (
          <TaskBlock
            key={p.occurrence.key}
            placed={p}
            pxPerMinute={PX_PER_MINUTE}
            tags={
              tagsById
                ? (p.occurrence.task.tags ?? [])
                    .map((id) => tagsById[id])
                    .filter(Boolean)
                : undefined
            }
            onClick={() => onOccurrenceClick(p.occurrence)}
            onToggleDone={() => onToggleDone(p.occurrence)}
            onResize={(s, e) => onResize(p.occurrence, s, e)}
          />
        ))}
      </div>
    </div>
  );
}
