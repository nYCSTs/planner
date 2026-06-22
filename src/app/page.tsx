"use client";

import { useMemo, useState } from "react";
import { addDays, format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/planner/timeline";
import { TaskDialog, type TaskDraft } from "@/components/planner/task-dialog";
import { NowPanel } from "@/components/planner/now-panel";
import { Pomodoro } from "@/components/planner/pomodoro";
import { usePlanner } from "@/hooks/use-planner";
import { useNow } from "@/hooks/use-now";
import { useNotifications } from "@/hooks/use-notifications";
import { resolveOccurrences, nowMinutes } from "@/lib/time";
import { activeAt } from "@/lib/active";
import type { ResolvedOccurrence } from "@/types";

export default function Home() {
  const planner = usePlanner();
  const now = useNow(15_000);
  const [day, setDay] = useState<Date>(() => new Date());
  const [draft, setDraft] = useState<TaskDraft | null>(null);

  const occurrences = useMemo(
    () => resolveOccurrences(planner.tasks, day, planner.completions),
    [planner.tasks, day, planner.completions],
  );

  const todayOccurrences = useMemo(
    () => resolveOccurrences(planner.tasks, now, planner.completions),
    [planner.tasks, now, planner.completions],
  );

  const activeState = useMemo(
    () => activeAt(todayOccurrences, nowMinutes(now)),
    [todayOccurrences, now],
  );

  const { permission, requestPermission } = useNotifications(
    todayOccurrences,
    now,
    planner.settings,
  );

  const openCreate = (startMinute: number) => setDraft({ startMinute });

  const openEdit = (occ: ResolvedOccurrence) =>
    setDraft({ startMinute: occ.startMinute, task: occ.task });

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Planner</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setDay((d) => addDays(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            onClick={() => setDay(new Date())}
            className="min-w-44 text-center text-sm font-medium capitalize"
          >
            {format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
            {isToday(day) && (
              <span className="ml-2 text-xs text-muted-foreground">(hoje)</span>
            )}
          </button>
          <Button variant="ghost" size="icon" onClick={() => setDay((d) => addDays(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button size="sm" onClick={() => openCreate(now.getHours() * 60)}>
          <Plus className="mr-1 h-4 w-4" /> Nova tarefa
        </Button>
      </header>

      {planner.hydrated &&
        planner.settings.notificationsEnabled &&
        permission === "default" && (
          <button
            onClick={requestPermission}
            className="border-b bg-amber-500/10 px-4 py-2 text-left text-xs text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
          >
            Ative as notificações do navegador para receber avisos das tarefas →
          </button>
        )}

      <main className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 px-4 py-2">
          {planner.hydrated ? (
            <Timeline
              day={day}
              now={now}
              occurrences={occurrences}
              onOccurrenceClick={openEdit}
              onSlotClick={openCreate}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Carregando…
            </div>
          )}
        </section>

        <aside className="hidden w-80 shrink-0 space-y-4 overflow-y-auto border-l p-4 lg:block">
          {planner.hydrated && (
            <NowPanel
              state={activeState}
              isToday={isToday(day)}
              onFinish={(taskId) => planner.completeTask(taskId, now)}
            />
          )}
          {planner.hydrated && (
            <Pomodoro
              workMinutes={planner.settings.pomodoroWork}
              breakMinutes={planner.settings.pomodoroBreak}
              soundEnabled={planner.settings.soundEnabled}
            />
          )}
        </aside>
      </main>

      <TaskDialog
        open={draft !== null}
        draft={draft}
        day={day}
        existingTasks={planner.tasks}
        defaultNotifyStart={planner.settings.notifyBeforeStart}
        defaultNotifyEnd={planner.settings.notifyBeforeEnd}
        onClose={() => setDraft(null)}
        onSave={(task, id) => {
          if (id) planner.updateTask(id, task);
          else planner.addTask(task);
        }}
        onDelete={planner.deleteTask}
      />
    </div>
  );
}
