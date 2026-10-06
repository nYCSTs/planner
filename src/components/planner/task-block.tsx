"use client";

import { Ban, Check, FileText, Flag, Link as LinkIcon, ListChecks, Play, Repeat } from "lucide-react";
import type { PlacedOccurrence } from "@/lib/layout";
import type { Tag } from "@/types";
import { minutesToTime } from "@/lib/time";
import { rgba } from "@/lib/colors";
import { PRIORITY_META } from "@/lib/priority";
import { isRecurring } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { useBlockDrag } from "./use-block-drag";

interface TaskBlockProps {
  placed: PlacedOccurrence;
  pxPerMinute: number;
  tags?: Tag[];
  /** Compact rendering for the week view. */
  dense?: boolean;
  onClick: () => void;
  onToggleDone: () => void;
  onStartTimer?: () => void;
  onMove?: (startMinute: number, endMinute: number | null) => void;
}

export function TaskBlock({
  placed,
  pxPerMinute,
  tags,
  dense = false,
  onClick,
  onToggleDone,
  onStartTimer,
  onMove,
}: TaskBlockProps) {
  const { occurrence, column, columns, overlay } = placed;
  const { task, title, startMinute, endMinute, openEnded, completed, skipped } = occurrence;
  const resizable = !overlay && Boolean(onMove);

  const drag = useBlockDrag({
    start: startMinute,
    end: endMinute,
    pxPerMinute,
    onCommit: (s, e) => onMove?.(s, openEnded ? null : e),
  });

  const top = drag.start * pxPerMinute;
  const height = Math.max(dense ? 16 : 20, (drag.end - drag.start) * pxPerMinute);

  const gapPct = overlay ? 1.5 : 2.5;
  const overlayBandPct = overlay ? Math.min(45, 22 + (columns - 1) * 12) : 0;
  const widthPct = overlay
    ? (overlayBandPct - gapPct * (columns - 1)) / columns
    : (100 - gapPct * (columns - 1)) / columns;
  const leftPct = overlay
    ? 100 - overlayBandPct + column * (widthPct + gapPct)
    : column * (widthPct + gapPct);

  const dimmed = completed || skipped;
  const compact = height < 38;
  const tiny = height < 24;
  const priority = task.priority ? PRIORITY_META[task.priority] : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        if (resizable && !openEnded) {
          drag.begin("move", e);
        } else {
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!drag.consumeClick()) {
          onClick();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group absolute flex flex-col overflow-hidden rounded-lg text-left text-xs shadow-sm ring-1 transition-shadow duration-150 hover:shadow-md",
        resizable && !openEnded ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        overlay ? "z-30 hover:z-40" : "z-10 hover:z-20",
        drag.moving && "z-40 opacity-90 shadow-lg ring-2",
        dimmed && "opacity-65 saturate-[0.6]",
      )}
      style={{
        top,
        height,
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        backgroundColor: rgba(task.color, overlay ? 0.14 : 0.18),
        // @ts-expect-error CSS var consumed by the ring utility
        "--tw-ring-color": rgba(task.color, 0.55),
        borderLeft: `3px solid ${task.color}`,
        backgroundImage: overlay
          ? `repeating-linear-gradient(45deg, transparent, transparent 6px, ${rgba(task.color, 0.08)} 6px, ${rgba(task.color, 0.08)} 12px)`
          : undefined,
      }}
    >
      {resizable && (
        <span
          onPointerDown={(e) => drag.begin("top", e)}
          className="absolute inset-x-0 top-0 z-10 flex h-2.5 cursor-ns-resize items-start justify-center opacity-0 transition group-hover:opacity-100"
          style={{ left: "1.5rem" }}
          title="Arraste para ajustar o início"
        >
          <span className="mt-0.5 h-1 w-8 rounded-full bg-current opacity-40" />
        </span>
      )}
      {resizable && !openEnded && (
        <span
          onPointerDown={(e) => drag.begin("bottom", e)}
          className="absolute inset-x-0 bottom-0 z-10 flex h-2.5 cursor-ns-resize items-end justify-center opacity-0 transition group-hover:opacity-100"
          style={{ left: "1.5rem" }}
          title="Arraste para ajustar o término"
        >
          <span className="mb-0.5 h-1 w-8 rounded-full bg-current opacity-40" />
        </span>
      )}

      {drag.dragging && (
        <span className="absolute right-1 top-1 z-20 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background tabular-nums shadow-sm">
          {minutesToTime(drag.start)}
          {!openEnded && ` – ${minutesToTime(drag.end)}`}
        </span>
      )}

      <div className={cn("flex min-w-0 items-center gap-1.5", dense ? "px-1" : "px-2", tiny ? "py-0" : "py-1")}>
        {completed ? (
          <button
            type="button"
            aria-label="Desfazer conclusão"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-white"
            style={{ backgroundColor: task.color }}
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
          </button>
        ) : skipped ? (
          <Ban className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Pulada" />
        ) : (
          <button
            type="button"
            aria-label="Concluir tarefa"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition hover:bg-white/40 dark:hover:bg-white/10"
            style={{ borderColor: task.color }}
          />
        )}
        {priority && !dimmed && !dense && <Flag className={cn("h-3 w-3 shrink-0 fill-current", priority.flag)} />}
        <span className={cn("truncate font-semibold", dimmed && "line-through")} style={{ color: dimmed ? undefined : "var(--foreground)" }}>
          {title}
        </span>
        {!dense && !overlay && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-60">
            {isRecurring(task) && <Repeat className="h-3 w-3" />}
            {task.link && <LinkIcon className="h-3 w-3" />}
            {occurrence.hasDescription && <FileText className="h-3 w-3" />}
            {occurrence.hasSubtasks && <ListChecks className="h-3 w-3" />}
          </span>
        )}
        {onStartTimer && !dimmed && !dense && !overlay && (
          <button
            type="button"
            aria-label="Iniciar cronômetro"
            title="Iniciar cronômetro"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onStartTimer();
            }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-md opacity-0 transition hover:bg-background/60 group-hover:opacity-100"
          >
            <Play className="h-3 w-3 fill-current" />
          </button>
        )}
      </div>
      {!compact && (
        <div className={cn("flex items-center gap-1.5 pb-0.5", dense ? "px-1" : "px-2")}>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {minutesToTime(drag.start)}
            {openEnded && !completed ? " · em aberto" : ` – ${minutesToTime(drag.end)}`}
          </span>
          {tags && tags.length > 0 && height >= 52 && (
            <span className="flex items-center gap-1 truncate">
              {tags.slice(0, 3).map((t) => (
                <span key={t.id} className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} title={t.label} />
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
