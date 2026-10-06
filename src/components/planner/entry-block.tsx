"use client";

import { Timer } from "lucide-react";
import type { DayEntry } from "@/lib/entries";
import { formatMinutes, minutesToTime } from "@/lib/time";
import { rgba } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { useBlockDrag } from "./use-block-drag";

interface EntryBlockProps {
  item: DayEntry;
  color: string;
  column: number;
  columns: number;
  pxPerMinute: number;
  onClick: () => void;
  onMove: (startMinute: number, endMinute: number) => void;
}

export function EntryBlock({ item, color, column, columns, pxPerMinute, onClick, onMove }: EntryBlockProps) {
  const { entry, running, clippedStart, clippedEnd } = item;
  const movable = !running && !clippedStart && !clippedEnd;
  const drag = useBlockDrag({
    start: item.startMinute,
    end: item.endMinute,
    pxPerMinute,
    snap: 1,
    onCommit: onMove,
  });

  const top = drag.start * pxPerMinute;
  const rawHeight = (drag.end - drag.start) * pxPerMinute;
  const height = running ? Math.max(2, rawHeight) : Math.max(14, rawHeight);
  const gap = 3;
  const width = (100 - gap * (columns - 1)) / columns;
  const left = column * (width + gap);
  const tiny = height < 22;
  const compact = height < 36;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        if (movable) {
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
        if (e.key === "Enter") {
          onClick();
        }
      }}
      className={cn(
        "group absolute z-10 flex flex-col overflow-hidden rounded-md text-left text-[11px] text-white shadow-sm transition-shadow hover:z-20 hover:shadow-md",
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        drag.moving && "z-30 opacity-90 ring-2 ring-foreground/40",
        clippedStart && "rounded-t-none",
        clippedEnd && "rounded-b-none",
      )}
      style={{
        top,
        height,
        left: `${left}%`,
        width: `${width}%`,
        backgroundColor: rgba(color, 0.88),
        backgroundImage: running
          ? `repeating-linear-gradient(-45deg, transparent, transparent 6px, ${rgba("#ffffff", 0.14)} 6px, ${rgba("#ffffff", 0.14)} 12px)`
          : undefined,
      }}
      title={`${entry.title} · ${minutesToTime(item.startMinute)}–${running ? "agora" : minutesToTime(item.endMinute)}`}
    >
      {movable && (
        <>
          <span onPointerDown={(e) => drag.begin("top", e)} className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize" />
          <span onPointerDown={(e) => drag.begin("bottom", e)} className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize" />
        </>
      )}
      {!tiny && (
        <div className="flex min-w-0 items-center gap-1 px-1.5 pt-0.5">
          {running ? (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white" />
          ) : (
            <Timer className="h-3 w-3 shrink-0 opacity-80" />
          )}
          <span className="truncate font-semibold">{entry.title || "Sem descrição"}</span>
        </div>
      )}
      {!compact && (
        <span className="px-1.5 text-[10px] tabular-nums opacity-85">
          {minutesToTime(drag.start)}–{running ? "agora" : minutesToTime(drag.end)} · {formatMinutes(drag.end - drag.start)}
        </span>
      )}
    </div>
  );
}
