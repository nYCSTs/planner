"use client";

import { Check } from "lucide-react";
import type { PlacedOccurrence } from "@/lib/layout";
import { minutesToTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface TaskBlockProps {
  placed: PlacedOccurrence;
  pxPerMinute: number;
  onClick: () => void;
}

export function TaskBlock({ placed, pxPerMinute, onClick }: TaskBlockProps) {
  const { occurrence, column, columns, overlay } = placed;
  const { task, startMinute, endMinute, openEnded, completed } = occurrence;

  const top = startMinute * pxPerMinute;
  const height = Math.max(18, (endMinute - startMinute) * pxPerMinute);

  // Overlay (hourly) tasks hug the right edge as a thin strip.
  const gapPct = 1.5;
  const widthPct = overlay ? 14 : (100 - gapPct * (columns - 1)) / columns;
  const leftPct = overlay
    ? 100 - widthPct
    : column * (widthPct + gapPct);

  const compact = height < 36;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "group absolute z-20 flex flex-col overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm transition-all hover:z-40 hover:shadow-md",
        completed && "opacity-60",
        overlay && "z-30 border-dashed",
      )}
      style={{
        top,
        height,
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        backgroundColor: `${task.color}22`,
        borderColor: `${task.color}99`,
        color: "inherit",
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-l"
        style={{ backgroundColor: task.color }}
      />
      <div className="flex items-center gap-1 pl-1">
        {completed && <Check className="h-3 w-3 shrink-0" />}
        <span className={cn("truncate font-medium", completed && "line-through")}>
          {task.title}
        </span>
      </div>
      {!compact && (
        <span className="pl-1 text-[10px] tabular-nums text-muted-foreground">
          {minutesToTime(startMinute)}
          {openEnded && !completed
            ? " · em aberto"
            : ` – ${minutesToTime(endMinute)}`}
        </span>
      )}
    </button>
  );
}
