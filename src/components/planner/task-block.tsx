"use client";

import type { PlacedOccurrence } from "@/lib/layout";
import { minutesToTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface TaskBlockProps {
  placed: PlacedOccurrence;
  pxPerMinute: number;
  onClick: () => void;
  onToggleDone: () => void;
}

export function TaskBlock({
  placed,
  pxPerMinute,
  onClick,
  onToggleDone,
}: TaskBlockProps) {
  const { occurrence, column, columns, overlay } = placed;
  const { task, startMinute, endMinute, openEnded, completed } = occurrence;

  const top = startMinute * pxPerMinute;
  const height = Math.max(18, (endMinute - startMinute) * pxPerMinute);

  // Overlay (hourly) tasks hug the right edge as a thin strip.
  const gapPct = 1.5;
  const widthPct = overlay ? 14 : (100 - gapPct * (columns - 1)) / columns;
  const leftPct = overlay ? 100 - widthPct : column * (widthPct + gapPct);

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
        "group absolute z-20 flex cursor-pointer flex-col overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm transition-all hover:z-40 hover:shadow-md",
        completed && "opacity-70",
        overlay && "z-30 border-dashed",
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
      <div className="flex items-center gap-1 pl-1">
        {completed ? (
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
        )}
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
    </div>
  );
}
