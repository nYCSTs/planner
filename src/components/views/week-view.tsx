"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isToday, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check } from "lucide-react";
import type { ResolvedOccurrence } from "@/types";
import { placeOccurrences, type PlacedOccurrence } from "@/lib/layout";
import { isBacklog, resolveDay } from "@/lib/occurrences";
import { isRecurring } from "@/lib/recurrence";
import { MINUTES_IN_DAY, dateKey, dayFromKey, minutesToTime, nowMinutes, sleepSegments } from "@/lib/time";
import { rgba } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { useOccurrenceStates, useSettings, useTasks } from "@/lib/store/hooks";
import { useUI } from "@/components/app/ui-context";
import { useOccurrenceHandlers } from "@/components/app/use-handlers";
import { useBlockDrag } from "@/components/planner/use-block-drag";

const PX = 0.9;
const SNAP = 15;

function WeekBlock({
  placed,
  dayIndex,
  colWidth,
  columnAt,
  onClick,
  onToggle,
  onMove,
}: {
  placed: PlacedOccurrence;
  dayIndex: number;
  colWidth: number;
  columnAt: (x: number) => number;
  onClick: () => void;
  onToggle: () => void;
  onMove: (start: number, end: number | null, dayIndex: number) => void;
}) {
  const { occurrence: o, column, columns, overlay } = placed;
  const movable = !overlay && !o.openEnded;
  const drag = useBlockDrag({
    start: o.startMinute,
    end: o.endMinute,
    pxPerMinute: PX,
    snap: SNAP,
    column: dayIndex,
    columnAt: isRecurring(o.task) ? undefined : columnAt,
    onCommit: (s, e, col) => onMove(s, o.openEnded ? null : e, col ?? dayIndex),
  });

  const width = overlay ? 30 : 100 / columns;
  const left = overlay ? 70 : column * width;
  const height = Math.max(14, (drag.end - drag.start) * PX);
  const dimmed = o.completed || o.skipped;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => (movable ? drag.begin("move", e) : e.stopPropagation())}
      onClick={(e) => {
        e.stopPropagation();
        if (!drag.consumeClick()) {
          onClick();
        }
      }}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "group absolute overflow-hidden rounded-md px-1 py-0.5 text-[10px] leading-tight shadow-xs",
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        overlay ? "z-20" : "z-10",
        drag.dragging && "z-40 shadow-lg ring-2 ring-primary/40",
        dimmed && "opacity-60",
      )}
      style={{
        top: drag.start * PX,
        height,
        left: `calc(${left}% + 1px)`,
        width: `calc(${width}% - 2px)`,
        transform: drag.column !== undefined && drag.column !== dayIndex ? `translateX(${(drag.column - dayIndex) * colWidth}px)` : undefined,
        backgroundColor: rgba(o.task.color, 0.2),
        borderLeft: `2px solid ${o.task.color}`,
      }}
      title={`${o.title} · ${minutesToTime(o.startMinute)}${o.openEnded ? "" : `–${minutesToTime(o.endMinute)}`}`}
    >
      {movable && (
        <span onPointerDown={(e) => drag.begin("bottom", e)} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" />
      )}
      <span className="flex items-start gap-0.5">
        <button
          type="button"
          aria-label={o.completed ? "Reabrir" : "Concluir"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="mt-px grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full border"
          style={o.completed ? { backgroundColor: o.task.color, borderColor: o.task.color } : { borderColor: o.task.color }}
        >
          {o.completed && <Check className="h-2 w-2 text-white" strokeWidth={4} />}
        </button>
        <span className={cn("min-w-0 font-semibold", dimmed && "line-through")}>{o.title}</span>
      </span>
      {height >= 30 && (
        <span className="block tabular-nums text-muted-foreground">
          {minutesToTime(drag.start)}
          {!o.openEnded && `–${minutesToTime(drag.end)}`}
        </span>
      )}
    </div>
  );
}

export function WeekView({ now }: { now: Date }) {
  const ui = useUI();
  const tasks = useTasks();
  const occurrences = useOccurrenceStates();
  const settings = useSettings();
  const handlers = useOccurrenceHandlers();
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(100);
  const todayKey = dateKey(now);

  const weekStart = startOfWeek(ui.day, { weekStartsOn: 1 });
  const weekKey = dateKey(weekStart);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(dayFromKey(weekKey), i)), [weekKey]);

  const perDay = useMemo(
    () => days.map((d) => resolveDay({ tasks, occurrences, day: d, now: dayFromKey(todayKey) })),
    [days, tasks, occurrences, todayKey],
  );

  useEffect(() => {
    const el = colsRef.current;
    if (!el) {
      return;
    }

    const ro = new ResizeObserver(() => setColWidth(el.getBoundingClientRect().width / 7));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: Math.max(0, (nowMinutes(new Date()) - 120) * PX) });
  }, [weekKey]);

  const columnAt = (clientX: number) => {
    const rect = colsRef.current?.getBoundingClientRect();
    if (!rect) {
      return 0;
    }

    return Math.max(0, Math.min(6, Math.floor((clientX - rect.left) / (rect.width / 7))));
  };

  const createAt = (dayIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    const dk = dateKey(days[dayIdx]);
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = Math.max(0, Math.min(MINUTES_IN_DAY - 60, Math.round((e.clientY - rect.top) / PX / SNAP) * SNAP));
    if (dk < todayKey || (dk === todayKey && minute < nowMinutes(now) - 10)) {
      ui.toast("Não é possível criar tarefas no passado.");
      return;
    }

    ui.openForm({ initial: { startMinute: minute, endMinute: minute + 60, date: dk } });
  };

  const move = (o: ResolvedOccurrence, start: number, end: number | null, dayIdx: number) => {
    void handlers.move(o, start, end, dateKey(days[dayIdx]));
  };

  const openDay = (d: Date) => {
    ui.setDay(d);
    ui.setView("day");
  };

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-40 flex border-b bg-background">
        <div className="w-10 shrink-0 sm:w-14" />
        <div className="grid flex-1 grid-cols-7">
          {days.map((d, i) => {
            const dk = dateKey(d);
            const pending = perDay[i].filter(
              (o) => !o.scheduled && !o.completed && !o.skipped && (dk === todayKey || !isBacklog(o.task) || Boolean(o.task.date)),
            );
            return (
              <div key={i} className="min-w-0 border-l px-1 py-1.5 text-center">
                <button type="button" onClick={() => openDay(d)} className="mx-auto flex flex-col items-center rounded-md px-1 hover:bg-accent">
                  <span className="text-[10px] uppercase text-muted-foreground">{format(d, "EEE", { locale: ptBR }).replace(".", "")}</span>
                  <span
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-full text-sm font-semibold",
                      isToday(d) && "bg-primary text-primary-foreground",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                </button>
                <div className="mt-1 space-y-0.5 text-left max-sm:hidden">
                  {pending.slice(0, 3).map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => ui.openDetail(o)}
                      className="block w-full truncate rounded px-1 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: rgba(o.task.color, 0.16) }}
                      title={o.title}
                    >
                      {o.title}
                    </button>
                  ))}
                  {pending.length > 3 && (
                    <button type="button" onClick={() => openDay(d)} className="block w-full text-[10px] text-muted-foreground">
                      +{pending.length - 3}
                    </button>
                  )}
                </div>
                {pending.length > 0 && (
                  <span className="mt-0.5 inline-block rounded-full bg-amber-500 px-1.5 text-[9px] font-semibold text-white sm:hidden">
                    {pending.length}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="relative flex" style={{ height: MINUTES_IN_DAY * PX }}>
          <div className="relative w-10 shrink-0 sm:w-14">
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground/70"
                style={{ top: h * 60 * PX }}
              >
                {h > 0 ? `${String(h).padStart(2, "0")}h` : ""}
              </span>
            ))}
          </div>
          <div ref={colsRef} className="relative grid flex-1 grid-cols-7">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/50" style={{ top: h * 60 * PX }} />
            ))}
            {days.map((d, i) => {
              const dk = dateKey(d);
              const placed = placeOccurrences(perDay[i].filter((o) => o.scheduled));
              const sleep = sleepSegments(settings.sleep, d);
              return (
                <div
                  key={dk}
                  className={cn("relative border-l", dk === todayKey && "bg-primary/[0.03]", dk < todayKey && "bg-muted/20")}
                  onClick={(e) => createAt(i, e)}
                >
                  {sleep.map((s) => (
                    <div
                      key={s.part}
                      className="pointer-events-none absolute inset-x-0 bg-indigo-500/[0.06]"
                      style={{ top: s.startMinute * PX, height: (s.endMinute - s.startMinute) * PX }}
                    />
                  ))}
                  {placed.map((p) => (
                    <WeekBlock
                      key={p.occurrence.key}
                      placed={p}
                      dayIndex={i}
                      colWidth={colWidth}
                      columnAt={columnAt}
                      onClick={() => ui.openDetail(p.occurrence)}
                      onToggle={() => handlers.toggle(p.occurrence)}
                      onMove={(s, e, col) => move(p.occurrence, s, e, col)}
                    />
                  ))}
                  {dk === todayKey && (
                    <div className="pointer-events-none absolute inset-x-0 z-30 h-px bg-red-500" style={{ top: nowMinutes(now) * PX }}>
                      <div className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-red-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
