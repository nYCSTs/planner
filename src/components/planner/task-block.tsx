"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, ListChecks } from "lucide-react";
import type { PlacedOccurrence } from "@/lib/layout";
import { MINUTES_IN_DAY, minutesToTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface TaskBlockProps {
  placed: PlacedOccurrence;
  pxPerMinute: number;
  onClick: () => void;
  onToggleDone: () => void;
  /** Commit a resize: new start/end minutes for the underlying task. */
  onResize: (startMinute: number, endMinute: number | null) => void;
}

const SNAP = 5; // minutes

export function TaskBlock({
  placed,
  pxPerMinute,
  onClick,
  onToggleDone,
  onResize,
}: TaskBlockProps) {
  const { occurrence, column, columns, overlay } = placed;
  const { task, startMinute, endMinute, openEnded, completed } = occurrence;

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

  // Hourly/overlay and unscheduled blocks are not resizable.
  const resizable = !overlay && occurrence.scheduled;

  const effStart = startMinute + (drag?.startDelta ?? 0);
  const effEnd = endMinute + (drag?.endDelta ?? 0);

  const top = effStart * pxPerMinute;
  const height = Math.max(18, (effEnd - effStart) * pxPerMinute);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaMin =
        Math.round((e.clientY - d.originY) / pxPerMinute / SNAP) * SNAP;
      if (d.edge === "top") {
        // Don't let start pass end - SNAP.
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

  const beginDrag = (edge: "top" | "bottom", e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { edge, originY: e.clientY, startDelta: 0, endDelta: 0 };
    setDrag({ startDelta: 0, endDelta: 0 });
  };

  // Overlay (hourly) tasks live in a band on the right; regular tasks use the
  // full width. Within either lane, columns are placed side-by-side so
  // overlapping items never stack on top of each other.
  const gapPct = 1.5;
  // Width of the overlay band: scales a bit with column count, capped.
  const overlayBandPct = overlay ? Math.min(40, 16 + (columns - 1) * 12) : 0;
  const overlayBandLeftPct = 100 - overlayBandPct;

  const widthPct = overlay
    ? (overlayBandPct - gapPct * (columns - 1)) / columns
    : (100 - gapPct * (columns - 1)) / columns;
  const leftPct = overlay
    ? overlayBandLeftPct + column * (widthPct + gapPct)
    : column * (widthPct + gapPct);

  const compact = height < 36;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group absolute flex cursor-pointer flex-col overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm transition-all hover:shadow-md",
        // Overlay (hourly) tasks always sit above regular ones, even on hover,
        // so they stay clickable instead of the background block stealing it.
        completed && "opacity-70",
        overlay
          ? "z-30 border-dashed hover:z-40"
          : "z-10 hover:z-20",
      )}
      style={{
        top,
        height,
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        backgroundColor: `${task.color}22`,
        borderColor: `${task.color}99`,
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-l"
        style={{ backgroundColor: task.color }}
      />

      {/* Resize handles */}
      {resizable && (
        <span
          onPointerDown={(e) => beginDrag("top", e)}
          className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize opacity-0 transition group-hover:opacity-100"
          title="Arraste para ajustar o início"
        >
          <span className="mx-auto mt-0.5 block h-0.5 w-6 rounded-full bg-current opacity-50" />
        </span>
      )}
      {resizable && !openEnded && (
        <span
          onPointerDown={(e) => beginDrag("bottom", e)}
          className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize opacity-0 transition group-hover:opacity-100"
          title="Arraste para ajustar o término"
        >
          <span className="mx-auto mb-0.5 block h-0.5 w-6 rounded-full bg-current opacity-50" />
        </span>
      )}

      <div className="flex items-center gap-1 pl-1">
        {!task.tracked && (completed ? (
          <span className="shrink-0 text-xs leading-none">✅</span>
        ) : (
          <button
            type="button"
            aria-label="Concluir tarefa"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            className="h-3 w-3 shrink-0 rounded-full border border-current opacity-50 transition hover:opacity-100"
            style={{ borderColor: task.color }}
          />
        ))}
        <span className={cn("truncate font-medium", completed && "line-through")}>
          {task.title}
        </span>
        {(occurrence.hasDescription || occurrence.hasSubtasks) && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] opacity-70">
            {occurrence.hasDescription && <FileText className="h-3 w-3" />}
            {occurrence.hasSubtasks && <ListChecks className="h-3 w-3" />}
          </span>
        )}
      </div>
      {!compact && (
        <span className="pl-1 text-[10px] tabular-nums text-muted-foreground">
          {minutesToTime(effStart)}
          {openEnded && !completed
            ? " · em aberto"
            : ` – ${minutesToTime(effEnd)}`}
        </span>
      )}
    </div>
  );
}
