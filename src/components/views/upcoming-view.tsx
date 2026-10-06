"use client";

import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ArrowRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dateKey, dayFromKey, formatMinutes } from "@/lib/time";
import { backlogOccurrence, isBacklog, resolveDay } from "@/lib/occurrences";
import { transact } from "@/lib/store/store";
import { updateTask } from "@/lib/store/actions";
import { useOccurrenceStates, useProjectsById, useTags, useTasks } from "@/lib/store/hooks";
import { DRAG_TASK_MIME } from "@/components/planner/timeline";
import { QuickAdd, TaskRow, liveProject } from "@/components/planner/task-list";
import { useUI } from "@/components/app/ui-context";
import { useOccurrenceHandlers } from "@/components/app/use-handlers";
import { useOverdue } from "@/components/app/overdue-dialog";
import type { ResolvedOccurrence, Task } from "@/types";

/** One row per hourly task per day instead of one per session. */
function collapseSlots(items: ResolvedOccurrence[]): ResolvedOccurrence[] {
  const groups = new Map<string, ResolvedOccurrence[]>();
  const out: (ResolvedOccurrence | string)[] = [];
  for (const o of items) {
    if (o.slot === undefined) {
      out.push(o);
      continue;
    }

    const list = groups.get(o.task.id);
    if (list) {
      list.push(o);
    } else {
      groups.set(o.task.id, [o]);
      out.push(o.task.id);
    }
  }

  return out.map((x) => {
    if (typeof x !== "string") {
      return x;
    }

    const slots = groups.get(x)!;
    const done = slots.filter((o) => o.completed || o.skipped).length;
    const target = slots.find((o) => !o.completed && !o.skipped) ?? slots[0];
    return {
      ...target,
      title: `${target.title} · ${done}/${slots.length} sessões`,
      startMinute: slots[0].startMinute,
      endMinute: slots[slots.length - 1].endMinute,
      completed: done === slots.length,
    };
  });
}

function dayTitle(date: string, todayKey: string): string {
  const d = dayFromKey(date);
  const name = format(d, "EEEE, d 'de' MMM", { locale: ptBR });
  if (date === todayKey) {
    return `Hoje · ${name}`;
  }

  if (date === dateKey(addDays(dayFromKey(todayKey), 1))) {
    return `Amanhã · ${name}`;
  }

  return name.charAt(0).toUpperCase() + name.slice(1);
}

function DaySection({
  date,
  todayKey,
  now,
  items,
  planned,
  dropTarget,
  onDrop,
  onDragState,
}: {
  date: string;
  todayKey: string;
  now: Date;
  items: ResolvedOccurrence[];
  planned: number;
  dropTarget: boolean;
  onDrop: (taskId: string) => void;
  onDragState: (over: boolean) => void;
}) {
  const ui = useUI();
  const tags = useTags();
  const projectsById = useProjectsById();
  const handlers = useOccurrenceHandlers();
  const pending = items.filter((o) => !o.completed && !o.skipped).length;

  return (
    <section
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TASK_MIME)) {
          e.preventDefault();
          onDragState(true);
        }
      }}
      onDragLeave={() => onDragState(false)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(DRAG_TASK_MIME);
        onDragState(false);
        if (id) {
          e.preventDefault();
          onDrop(id);
        }
      }}
      className={cn("rounded-xl border bg-card p-3 transition-colors", dropTarget && "border-primary bg-primary/5")}
    >
      <header className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => {
            ui.setDay(dayFromKey(date));
            ui.setView("day");
          }}
          className={cn("text-sm font-semibold hover:underline", date === todayKey && "text-primary")}
        >
          {dayTitle(date, todayKey)}
        </button>
        <span className="text-xs text-muted-foreground">
          {pending > 0 ? `${pending} pendente${pending > 1 ? "s" : ""}` : items.length ? "tudo feito" : ""}
          {planned > 0 && ` · ${formatMinutes(planned)} planejados`}
        </span>
      </header>
      {items.length > 0 && (
        <ul className="space-y-0.5">
          {items.map((o) => (
            <TaskRow
              key={o.key}
              occ={o}
              tags={tags}
              project={liveProject(o.task.projectId, projectsById)}
              onToggleDone={handlers.toggle}
              onSelect={(x) => ui.openDetail(x)}
              onStartTimer={handlers.startTimerFor}
              dragAll
            />
          ))}
        </ul>
      )}
      <div className="mt-1 -mx-2">
        <QuickAdd day={dayFromKey(date)} now={now} />
      </div>
    </section>
  );
}

export function UpcomingView({ now }: { now: Date }) {
  const ui = useUI();
  const tasks = useTasks();
  const occurrences = useOccurrenceStates();
  const tags = useTags();
  const projectsById = useProjectsById();
  const handlers = useOccurrenceHandlers();
  const overdue = useOverdue(now);
  const [count, setCount] = useState(7);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const todayKey = dateKey(now);

  const days = useMemo(() => {
    const out: { date: string; items: ResolvedOccurrence[]; planned: number }[] = [];
    for (let i = 0; i < count; i++) {
      const date = dateKey(addDays(dayFromKey(todayKey), i));
      const items = resolveDay({ tasks, occurrences, day: dayFromKey(date), now: dayFromKey(todayKey) }).filter(
        (o) => !(isBacklog(o.task) && !o.task.date && !o.completed),
      );
      const scheduled = items.filter((o) => o.scheduled);
      const rest = items.filter((o) => !o.scheduled).sort((a, b) => Number(a.completed) - Number(b.completed));
      const planned = scheduled.reduce((sum, o) => sum + (!o.openEnded && !o.skipped ? o.endMinute - o.startMinute : 0), 0);
      out.push({ date, items: collapseSlots([...scheduled, ...rest]), planned });
    }

    return out;
  }, [tasks, occurrences, todayKey, count]);

  const inbox = useMemo(
    () =>
      tasks
        .filter((t) => isBacklog(t) && !t.date)
        .map((t) => backlogOccurrence(t, occurrences[t.id], todayKey))
        .filter((o) => !o.completed && !o.skipped),
    [tasks, occurrences, todayKey],
  );

  const moveTo = (taskId: string, date: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.recurrence.kind !== "once" || task.date === date) {
      return;
    }

    if (task.startMinute !== null && date < todayKey) {
      return;
    }

    const { undo } = transact(() => updateTask(taskId, { date }));
    ui.toast(`"${task.title}" movida para ${format(dayFromKey(date), "EEE d/MM", { locale: ptBR })}`, { label: "Desfazer", run: undo });
  };

  const moveAllOverdue = (list: Task[]) => {
    const { undo } = transact(() => {
      for (const t of list) {
        updateTask(t.id, { date: todayKey });
      }
    });
    ui.toast(`${list.length} tarefa${list.length > 1 ? "s" : ""} movida${list.length > 1 ? "s" : ""} para hoje`, { label: "Desfazer", run: undo });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-3 p-4 pb-24 md:p-6">
        {overdue.length > 0 && (
          <section className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-3">
            <header className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-orange-700 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4" /> Atrasadas ({overdue.length})
              </span>
              <Button size="sm" variant="outline" onClick={() => moveAllOverdue(overdue)}>
                Tudo para hoje <ArrowRight className="h-3 w-3" />
              </Button>
            </header>
            <ul className="space-y-0.5">
              {overdue.map((t) => {
                const occ = isBacklog(t)
                  ? backlogOccurrence(t, occurrences[t.id], t.date ?? todayKey)
                  : resolveDay({ tasks: [t], occurrences, day: dayFromKey(t.date ?? todayKey), now: dayFromKey(todayKey) })[0];
                if (!occ) {
                  return null;
                }

                return (
                  <TaskRow
                    key={t.id}
                    occ={{ ...occ, overdue: true }}
                    tags={tags}
                    project={liveProject(t.projectId, projectsById)}
                    onToggleDone={handlers.toggle}
                    onSelect={(x) => ui.openDetail(x)}
                    onStartTimer={handlers.startTimerFor}
                    dragAll
                  />
                );
              })}
            </ul>
          </section>
        )}

        {days.map((d) => (
          <DaySection
            key={d.date}
            date={d.date}
            todayKey={todayKey}
            now={now}
            items={d.items}
            planned={d.planned}
            dropTarget={dropDay === d.date}
            onDragState={(over) => setDropDay(over ? d.date : null)}
            onDrop={(id) => moveTo(id, d.date)}
          />
        ))}

        <Button variant="ghost" className="w-full" onClick={() => setCount((c) => c + 7)}>
          Mostrar mais 7 dias
        </Button>

        <section className="rounded-xl border border-dashed p-3">
          <header className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold">
            <Inbox className="h-4 w-4" /> Sem data
            <span className="text-xs font-normal text-muted-foreground">aparecem todo dia até você concluir</span>
          </header>
          <ul className="space-y-0.5">
            {inbox.map((o) => (
              <TaskRow
                key={o.key}
                occ={o}
                tags={tags}
                project={liveProject(o.task.projectId, projectsById)}
                onToggleDone={handlers.toggle}
                onSelect={(x) => ui.openDetail(x)}
                onStartTimer={handlers.startTimerFor}
                dragAll
              />
            ))}
          </ul>
          <div className="mt-1 -mx-2">
            <QuickAdd day={now} now={now} noDate placeholder="Adicionar sem data…" />
          </div>
        </section>
      </div>
    </div>
  );
}
