"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isToday } from "date-fns";
import { Moon, Sunrise } from "lucide-react";
import type { ResolvedOccurrence, SleepSchedule, Tag, TimeEntry } from "@/types";
import { packColumns, placeOccurrences } from "@/lib/layout";
import type { DayEntry } from "@/lib/entries";
import { MINUTES_IN_DAY, minutesToTime, nowMinutes, sleepSegments } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TaskBlock } from "./task-block";
import { EntryBlock } from "./entry-block";

export const DRAG_TASK_MIME = "application/x-planner-task";

const SNAP = 15;

interface TimelineProps {
  day: Date;
  now: Date;
  occurrences: ResolvedOccurrence[];
  /** Tracked entries for the day; undefined hides the "Realizado" lane. */
  entries?: DayEntry[];
  entryColor: (e: TimeEntry) => string;
  tagsById: Record<string, Tag>;
  sleep?: SleepSchedule;
  canCreate: boolean;
  pxPerMinute?: number;
  onOccurrenceClick: (occ: ResolvedOccurrence) => void;
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onStartTimer: (occ: ResolvedOccurrence) => void;
  onMoveOccurrence: (occ: ResolvedOccurrence, start: number, end: number | null) => void;
  onCreate: (start: number, end?: number) => void;
  onCreateEntry: (start: number, end: number) => void;
  onEntryClick: (entry: TimeEntry) => void;
  onMoveEntry: (entry: TimeEntry, start: number, end: number) => void;
  onDropTask?: (taskId: string, minute: number) => void;
}

type Zone = "plan" | "track";

export function Timeline({
  day,
  now,
  occurrences,
  entries,
  entryColor,
  tagsById,
  sleep,
  canCreate,
  pxPerMinute = 1,
  onOccurrenceClick,
  onToggleDone,
  onStartTimer,
  onMoveOccurrence,
  onCreate,
  onCreateEntry,
  onEntryClick,
  onMoveEntry,
  onDropTask,
}: TimelineProps) {
  const placed = useMemo(() => placeOccurrences(occurrences), [occurrences]);
  const placedEntries = useMemo(() => packColumns(entries ?? []), [entries]);
  const sleepBands = useMemo(() => (sleep ? sleepSegments(sleep, day) : []), [sleep, day]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const showNowLine = mounted && isToday(day);
  const nowMin = nowMinutes(now);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ zone: Zone; start: number; end: number } | null>(null);
  const [dropMinute, setDropMinute] = useState<number | null>(null);
  const pointerType = useRef<string>("mouse");
  const hourHeight = 60 * pxPerMinute;
  const showLane = entries !== undefined;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const target = (isToday(day) ? nowMinutes(new Date()) : 8 * 60) * pxPerMinute - 120;
    el.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    // Scroll only when the day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const minuteAt = (clientY: number, snap = SNAP): number => {
    const grid = gridRef.current;
    if (!grid) {
      return 0;
    }

    const raw = (clientY - grid.getBoundingClientRect().top) / pxPerMinute;
    return Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(raw / snap) * snap));
  };

  const allowed = (zone: Zone) => zone === "track" || canCreate;

  const beginCreate = (zone: Zone, e: React.PointerEvent) => {
    pointerType.current = e.pointerType;
    if (e.button !== 0 || e.pointerType === "touch" || !allowed(zone)) {
      return;
    }

    const anchor = minuteAt(e.clientY);
    setSelection({ zone, start: anchor, end: anchor });

    const onMove = (ev: PointerEvent) => {
      const cur = minuteAt(ev.clientY);
      setSelection({ zone, start: Math.min(anchor, cur), end: Math.max(anchor, cur) });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setSelection(null);
      const end = minuteAt(ev.clientY);
      const lo = Math.min(anchor, end);
      const hi = Math.max(anchor, end);
      if (zone === "track") {
        onCreateEntry(lo, hi - lo >= SNAP ? hi : lo + 30);
      } else if (hi - lo >= SNAP) {
        onCreate(lo, hi);
      } else {
        onCreate(lo);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const tapCreate = (zone: Zone, e: React.MouseEvent) => {
    if (pointerType.current !== "touch" || !allowed(zone)) {
      return;
    }

    const m = minuteAt(e.clientY, 30);
    if (zone === "track") {
      onCreateEntry(m, m + 30);
    } else {
      onCreate(m);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto overscroll-contain">
      {showLane && (
        <div className="sticky top-0 z-40 ml-14 flex border-b bg-background/90 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur sm:ml-16">
          <span className="flex-1 px-2 py-1">Planejado</span>
          <span className="w-[34%] border-l px-2 py-1 sm:w-[30%]">Realizado</span>
        </div>
      )}
      <div ref={gridRef} className="relative ml-14 select-none sm:ml-16" style={{ height: MINUTES_IN_DAY * pxPerMinute }}>
        {hours.map((h) => (
          <div
            key={h}
            className={cn("pointer-events-none absolute inset-x-0 border-t", h % 2 === 0 ? "border-border/70" : "border-border/40")}
            style={{ top: h * hourHeight, height: hourHeight }}
          >
            <span className="absolute -left-14 -top-2.5 w-12 text-right text-[11px] font-medium tabular-nums text-muted-foreground/70 sm:-left-16 sm:w-14">
              {String(h).padStart(2, "0")}:00
            </span>
            {(h < 6 || h >= 22) && <div className="absolute inset-0 bg-muted/25" />}
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/25" />
          </div>
        ))}

        {sleepBands.map((seg) => {
          const height = (seg.endMinute - seg.startMinute) * pxPerMinute;
          return (
            <div
              key={seg.part}
              className="pointer-events-none absolute inset-x-0 z-[1] overflow-hidden border-y border-indigo-400/25 bg-indigo-500/[0.07] dark:border-indigo-300/15 dark:bg-indigo-400/[0.08]"
              style={{
                top: seg.startMinute * pxPerMinute,
                height,
                backgroundImage:
                  "repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(99,102,241,0.05) 10px, rgba(99,102,241,0.05) 20px)",
              }}
            >
              {height >= 28 && (
                <span className="absolute left-2 top-1.5 flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
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

        {/* Planned zone */}
        <div
          className={cn("absolute inset-y-0 left-0", showLane ? "right-[34%] sm:right-[30%]" : "right-0", canCreate && "cursor-cell")}
          onPointerDown={(e) => beginCreate("plan", e)}
          onClick={(e) => tapCreate("plan", e)}
          onDragOver={(e) => {
            if (!onDropTask || !e.dataTransfer.types.includes(DRAG_TASK_MIME)) {
              return;
            }

            e.preventDefault();
            setDropMinute(minuteAt(e.clientY));
          }}
          onDragLeave={() => setDropMinute(null)}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(DRAG_TASK_MIME);
            setDropMinute(null);
            if (id && onDropTask) {
              e.preventDefault();
              onDropTask(id, minuteAt(e.clientY));
            }
          }}
        >
          {selection?.zone === "plan" && selection.end > selection.start && (
            <SelectionBox start={selection.start} end={selection.end} pxPerMinute={pxPerMinute} />
          )}
          {dropMinute !== null && (
            <SelectionBox start={dropMinute} end={dropMinute + 60} pxPerMinute={pxPerMinute} label="Soltar aqui" />
          )}

          {placed.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-1 px-4 text-center" style={{ top: 9 * hourHeight }}>
              <p className="text-sm font-medium text-muted-foreground">Nada planejado neste dia</p>
              {canCreate && (
                <p className="text-xs text-muted-foreground/70">Clique num horário ou arraste para criar.</p>
              )}
            </div>
          )}

          {placed.map((p) => (
            <TaskBlock
              key={p.occurrence.key}
              placed={p}
              pxPerMinute={pxPerMinute}
              tags={(p.occurrence.task.tags ?? []).map((id) => tagsById[id]).filter(Boolean)}
              onClick={() => onOccurrenceClick(p.occurrence)}
              onToggleDone={() => onToggleDone(p.occurrence)}
              onStartTimer={() => onStartTimer(p.occurrence)}
              onMove={(s, e) => onMoveOccurrence(p.occurrence, s, e)}
            />
          ))}
        </div>

        {/* Tracked lane */}
        {showLane && (
          <div
            className="absolute inset-y-0 right-0 w-[34%] cursor-cell border-l border-dashed bg-muted/10 sm:w-[30%]"
            onPointerDown={(e) => beginCreate("track", e)}
            onClick={(e) => tapCreate("track", e)}
          >
            {selection?.zone === "track" && selection.end > selection.start && (
              <SelectionBox start={selection.start} end={selection.end} pxPerMinute={pxPerMinute} />
            )}
            <div className="absolute inset-y-0 left-1 right-1">
              {placedEntries.map(({ item, column, columns }) => (
                <EntryBlock
                  key={item.entry.id}
                  item={item}
                  color={entryColor(item.entry)}
                  column={column}
                  columns={columns}
                  pxPerMinute={pxPerMinute}
                  onClick={() => onEntryClick(item.entry)}
                  onMove={(s, e) => onMoveEntry(item.entry, s, e)}
                />
              ))}
            </div>
          </div>
        )}

        {showNowLine && (
          <div className="pointer-events-none absolute inset-x-0 z-30 h-px bg-red-500" style={{ top: nowMin * pxPerMinute }}>
            <span className="absolute -left-14 -top-2.5 w-12 rounded bg-red-500 py-0.5 text-center text-[10px] font-bold text-white tabular-nums sm:-left-16 sm:w-14">
              {minutesToTime(nowMin)}
            </span>
            <div className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-red-500 ring-2 ring-background" />
          </div>
        )}
      </div>
    </div>
  );
}

function SelectionBox({ start, end, pxPerMinute, label }: { start: number; end: number; pxPerMinute: number; label?: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 rounded-md border-2 border-dashed border-primary/50 bg-primary/10"
      style={{ top: start * pxPerMinute, height: (end - start) * pxPerMinute }}
    >
      <span className="absolute left-2 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
        {label ?? `${minutesToTime(start)} – ${minutesToTime(end)}`}
      </span>
    </div>
  );
}
