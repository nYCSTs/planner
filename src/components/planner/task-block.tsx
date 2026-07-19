"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText, Flag, Link as LinkIcon, ListChecks } from "lucide-react";
import type { PlacedOccurrence } from "@/lib/layout";
import type { Tag } from "@/types";
import { MINUTES_IN_DAY, minutesToTime } from "@/lib/time";
import { rgba } from "@/lib/colors";
import { PRIORITY_META } from "@/lib/priority";
import { cn } from "@/lib/utils";

interface TaskBlockProps {
  placed: PlacedOccurrence;
  pxPerMinute: number;
  /** Resolved tags for this task (for the tag dots), if any. */
  tags?: Tag[];
  onClick: () => void;
  onToggleDone: () => void;
  /** Commit a resize: new start/end minutes for the underlying task. */
  onResize: (startMinute: number, endMinute: number | null) => void;
}

const SNAP = 5; // minutes

export function TaskBlock({
  placed,
  pxPerMinute,
  tags,
  onClick,
  onToggleDone,
  onResize,
}: TaskBlockProps) {
  const { occurrence, column, columns, overlay } = placed;
  const { task, startMinute, endMinute, openEnded, completed, skipped } = occurrence;

  // Live preview offsets while dragging a resize handle (in minutes).
  const [drag, setDrag] = useState<{ startDelta: number; endDelta: number } | null>(
    null,
  );
  const dragRef = useRef<{
    edge: "top" | "bottom";
    originY: number;
    startDelta: number;
    endDelta: number;
  } | null>(null);

  // Live offset while dragging the whole block to reschedule it (both edges
  // shift by the same amount). Null when not moving.
  const [moveDelta, setMoveDelta] = useState<number | null>(null);
  // True once the pointer has moved past the threshold (an actual drag, not a
  // tap). Drives the "moving" visual and gates committing the reschedule.
  const [moveStarted, setMoveStarted] = useState(false);
  const moveRef = useRef<{ originY: number } | null>(null);
  // Set true when a move actually happened so the following click doesn't open
  // the detail dialog.
  const suppressClick = useRef(false);

  // Hourly/overlay and unscheduled blocks are not resizable/movable.
  const resizable = !overlay && occurrence.scheduled;
  // Live (open-ended, currently tracked) blocks can't be moved by dragging.
  const movable = resizable && !openEnded;

  const effStart = startMinute + (drag?.startDelta ?? 0) + (moveDelta ?? 0);
  const effEnd = endMinute + (drag?.endDelta ?? 0) + (moveDelta ?? 0);

  const top = effStart * pxPerMinute;
  const rawHeight = (effEnd - effStart) * pxPerMinute;
  // Open-ended (live tracker) blocks use exact height so the bottom edge always
  // coincides with the now-line. Regular blocks get a minimum so they stay
  // clickable even for very short tasks.
  const height = openEnded ? Math.max(0, rawHeight) : Math.max(20, rawHeight);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaMin =
        Math.round((e.clientY - d.originY) / pxPerMinute / SNAP) * SNAP;
      if (d.edge === "top") {
        const maxDelta = endMinute - startMinute - SNAP;
        const clamped = Math.max(-startMinute, Math.min(maxDelta, deltaMin));
        setDrag({ startDelta: clamped, endDelta: 0 });
      } else {
        const maxEnd = MINUTES_IN_DAY - endMinute;
        const minDelta = -(endMinute - startMinute - SNAP);
        const clamped = Math.max(minDelta, Math.min(maxEnd, deltaMin));
        setDrag({ startDelta: 0, endDelta: clamped });
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d) {
        const newStart = startMinute + (d.edge === "top" ? drag.startDelta : 0);
        const newEnd = endMinute + (d.edge === "bottom" ? drag.endDelta : 0);
        if (newStart !== startMinute || newEnd !== endMinute) {
          onResize(newStart, openEnded ? null : newEnd);
        }
      }
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, startMinute, endMinute, openEnded, pxPerMinute, onResize]);

  // Whole-block move: shifts start and end together. A small threshold keeps a
  // plain click from being read as a drag.
  const MOVE_THRESHOLD = 4; // px
  useEffect(() => {
    if (moveDelta === null) return;
    let started = moveStarted;
    const onMove = (e: PointerEvent) => {
      const m = moveRef.current;
      if (!m) return;
      const rawDelta = e.clientY - m.originY;
      if (!started && Math.abs(rawDelta) < MOVE_THRESHOLD) return;
      if (!started) { started = true; setMoveStarted(true); }
      const snapped = Math.round(rawDelta / pxPerMinute / SNAP) * SNAP;
      // Clamp so neither edge leaves the day.
      const clamped = Math.max(-startMinute, Math.min(MINUTES_IN_DAY - endMinute, snapped));
      setMoveDelta(clamped);
    };
    const onUp = () => {
      if (started && moveDelta && moveDelta !== 0) {
        suppressClick.current = true;
        onResize(startMinute + moveDelta, openEnded ? null : endMinute + moveDelta);
      }
      moveRef.current = null;
      setMoveDelta(null);
      setMoveStarted(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [moveDelta, moveStarted, startMinute, endMinute, openEnded, pxPerMinute, onResize]);

  const beginMove = (e: React.PointerEvent) => {
    // Left button only; ignore drags that start on the resize handles.
    if (e.button !== 0 || !movable) {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    moveRef.current = { originY: e.clientY };
    setMoveDelta(0);
    setMoveStarted(false);
  };

  const beginDrag = (edge: "top" | "bottom", e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { edge, originY: e.clientY, startDelta: 0, endDelta: 0 };
    setDrag({ startDelta: 0, endDelta: 0 });
  };

  // Overlay (hourly) tasks live in a band on the right; regular tasks use the
  // full width. Within either lane, columns are placed side-by-side.
  const gapPct = overlay ? 1.5 : 2.5;
  const overlayBandPct = overlay ? Math.min(40, 16 + (columns - 1) * 12) : 0;
  const overlayBandLeftPct = 100 - overlayBandPct;

  const widthPct = overlay
    ? (overlayBandPct - gapPct * (columns - 1)) / columns
    : (100 - gapPct * (columns - 1)) / columns;
  const leftPct = overlay
    ? overlayBandLeftPct + column * (widthPct + gapPct)
    : column * (widthPct + gapPct);

  const dimmed = completed || skipped;
  const compact = height < 38;
  const tiny = height < 24;
  const priority = task.priority ? PRIORITY_META[task.priority] : null;
  const moving = moveStarted;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={beginMove}
      onClick={(e) => {
        e.stopPropagation();
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group absolute flex flex-col overflow-hidden rounded-lg text-left text-xs shadow-sm ring-1 transition-shadow duration-150 hover:shadow-md",
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        overlay ? "z-30 hover:z-40" : "z-10 hover:z-20",
        moving && "z-40 opacity-90 shadow-lg ring-2",
        !moving && "hover:-translate-y-px",
        dimmed && "opacity-65 saturate-[0.6]",
      )}
      style={{
        top,
        height,
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        // Fill: a soft tint of the accent that works in both themes; the ring
        // provides a crisp accent-colored edge, and a rail marks the start.
        backgroundColor: rgba(task.color, overlay ? 0.14 : 0.18),
        // @ts-expect-error CSS var used by ring utility below via arbitrary value
        "--tw-ring-color": rgba(task.color, 0.55),
        borderLeft: `3px solid ${task.color}`,
        backgroundImage: overlay
          ? `repeating-linear-gradient(45deg, transparent, transparent 6px, ${rgba(task.color, 0.08)} 6px, ${rgba(task.color, 0.08)} 12px)`
          : undefined,
      }}
    >
      {/* Resize handles — clear of the left edge so the done/skip control stays
          clickable, even on short blocks. */}
      {resizable && (
        <span
          onPointerDown={(e) => beginDrag("top", e)}
          className="absolute inset-x-0 top-0 z-10 flex h-2.5 cursor-ns-resize items-start justify-center opacity-0 transition group-hover:opacity-100"
          style={{ left: "1.5rem" }}
          title="Arraste para ajustar o início"
        >
          <span className="mt-0.5 h-1 w-8 rounded-full bg-current opacity-40" />
        </span>
      )}
      {resizable && !openEnded && (
        <span
          onPointerDown={(e) => beginDrag("bottom", e)}
          className="absolute inset-x-0 bottom-0 z-10 flex h-2.5 cursor-ns-resize items-end justify-center opacity-0 transition group-hover:opacity-100"
          style={{ left: "1.5rem" }}
          title="Arraste para ajustar o término"
        >
          <span className="mb-0.5 h-1 w-8 rounded-full bg-current opacity-40" />
        </span>
      )}

      {/* Live time badge while dragging (move or resize) */}
      {(moving || drag) && (
        <span className="absolute right-1 top-1 z-20 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background tabular-nums shadow-sm">
          {minutesToTime(effStart)}
          {!openEnded && ` – ${minutesToTime(effEnd)}`}
        </span>
      )}

      <div className={cn("flex min-w-0 items-center gap-1.5 px-2", tiny ? "py-0" : "py-1")}>
        {!task.tracked && (completed ? (
          <button
            type="button"
            aria-label="Desfazer conclusão"
            onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-white"
            style={{ backgroundColor: task.color }}
            title="Clique para desfazer"
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
          </button>
        ) : skipped ? (
          <span className="grid h-4 w-4 shrink-0 place-items-center text-[11px] leading-none" title="Pulada">🚫</span>
        ) : (
          <button
            type="button"
            aria-label="Concluir tarefa"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition hover:bg-white/40 dark:hover:bg-white/10"
            style={{ borderColor: task.color }}
          />
        ))}
        {priority && !dimmed && (
          <span className="shrink-0" title={`Prioridade ${priority.label}`}>
            <Flag className={cn("h-3 w-3 fill-current", priority.flag)} />
          </span>
        )}
        <span
          className={cn(
            "truncate font-semibold",
            dimmed && "line-through",
          )}
          style={{ color: dimmed ? undefined : "var(--foreground)" }}
        >
          {task.title}
        </span>
        {(occurrence.hasDescription || occurrence.hasSubtasks || task.link) && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-60">
            {task.link && <LinkIcon className="h-3 w-3" />}
            {occurrence.hasDescription && <FileText className="h-3 w-3" />}
            {occurrence.hasSubtasks && <ListChecks className="h-3 w-3" />}
          </span>
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-1.5 px-2 pb-0.5">
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {minutesToTime(effStart)}
            {openEnded && !completed
              ? " · em aberto"
              : ` – ${minutesToTime(effEnd)}`}
          </span>
          {tags && tags.length > 0 && height >= 52 && (
            <span className="flex items-center gap-1 truncate">
              {tags.slice(0, 3).map((t) => (
                <span
                  key={t.id}
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                  title={t.label}
                />
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
