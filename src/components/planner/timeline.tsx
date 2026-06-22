"use client";

import { useEffect, useMemo, useRef } from "react";
import { isToday } from "date-fns";
import type { ResolvedOccurrence } from "@/types";
import { placeOccurrences } from "@/lib/layout";
import { MINUTES_IN_DAY, nowMinutes } from "@/lib/time";
import { TaskBlock } from "./task-block";

const PX_PER_MINUTE = 1; // 1440px tall day
const HOUR_HEIGHT = 60 * PX_PER_MINUTE;

interface TimelineProps {
  day: Date;
  now: Date;
  occurrences: ResolvedOccurrence[];
  onOccurrenceClick: (occ: ResolvedOccurrence) => void;
  onSlotClick: (startMinute: number) => void;
}

export function Timeline({
  day,
  now,
  occurrences,
  onOccurrenceClick,
  onSlotClick,
}: TimelineProps) {
  const placed = useMemo(() => placeOccurrences(occurrences), [occurrences]);
  const showNowLine = isToday(day);
  const nowMin = nowMinutes(now);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current time (or 8am) on day change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = (showNowLine ? nowMin : 8 * 60) * PX_PER_MINUTE - 120;
    el.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto">
      <div
        className="relative ml-14"
        style={{ height: MINUTES_IN_DAY * PX_PER_MINUTE }}
      >
        {/* Hour grid */}
        {hours.map((h) => (
          <div
            key={h}
            className="group absolute inset-x-0 border-t border-border/60"
            style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            onClick={() => onSlotClick(h * 60)}
          >
            <span className="absolute -left-14 -top-2 w-12 select-none text-right text-xs tabular-nums text-muted-foreground">
              {String(h).padStart(2, "0")}:00
            </span>
            <div className="h-full cursor-pointer transition-colors group-hover:bg-accent/30" />
          </div>
        ))}

        {/* Now line */}
        {showNowLine && (
          <div
            className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
            style={{ top: nowMin * PX_PER_MINUTE }}
          >
            <div className="-ml-1.5 h-3 w-3 rounded-full bg-red-500" />
            <div className="h-px w-full bg-red-500" />
          </div>
        )}

        {/* Empty-day hint */}
        {placed.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 text-center text-sm text-muted-foreground">
            Nenhuma tarefa neste dia. Clique em um horário para adicionar.
          </div>
        )}

        {/* Task blocks */}
        {placed.map((p) => (
          <TaskBlock
            key={p.occurrence.key}
            placed={p}
            pxPerMinute={PX_PER_MINUTE}
            onClick={() => onOccurrenceClick(p.occurrence)}
          />
        ))}
      </div>
    </div>
  );
}
