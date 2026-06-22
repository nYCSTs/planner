"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Plus,
  Settings as SettingsIcon,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsSheet } from "@/components/planner/settings-sheet";
import { useTheme } from "@/components/theme-provider";
import { Timeline } from "@/components/planner/timeline";
import { TaskDialog, type TaskDraft } from "@/components/planner/task-dialog";
import { TaskList } from "@/components/planner/task-list";
import { Pomodoro } from "@/components/planner/pomodoro";
import { usePlanner } from "@/hooks/use-planner";
import { useNow } from "@/hooks/use-now";
import { useNotifications } from "@/hooks/use-notifications";
import { resolveOccurrences, nowMinutes } from "@/lib/time";
import type { ResolvedOccurrence } from "@/types";

export default function Home() {
  const planner = usePlanner();
  const now = useNow(15_000);
  const { setTheme } = useTheme();
  const [day, setDay] = useState<Date>(() => new Date());
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);

  // Keep the live theme in sync with persisted settings after hydration.
  useEffect(() => {
    if (planner.hydrated) setTheme(planner.settings.theme);
  }, [planner.hydrated, planner.settings.theme, setTheme]);

  const occurrences = useMemo(
    () => resolveOccurrences(planner.tasks, day, planner.completions, now),
    [planner.tasks, day, planner.completions, now],
  );

  const todayOccurrences = useMemo(
    () => resolveOccurrences(planner.tasks, now, planner.completions, now),
    [planner.tasks, now, planner.completions],
  );

  const { permission, requestPermission } = useNotifications(
    todayOccurrences,
    now,
    planner.settings,
  );

  const openCreate = (startMinute: number) => setDraft({ startMinute });

  const openEdit = (occ: ResolvedOccurrence) =>
    setDraft({ startMinute: occ.startMinute, task: occ.task });

  const toggleDone = (occ: ResolvedOccurrence) => planner.toggleDone(occ);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            variant={listOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setListOpen((o) => !o)}
            aria-label="Tarefas do dia"
          >
            <ListTodo className="h-4 w-4" />
          </Button>
          <h1 className="ml-1 text-lg font-semibold tracking-tight">Planner</h1>
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

        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => openCreate(nowMinutes(now))}>
            <Plus className="mr-1 h-4 w-4" /> Nova tarefa
          </Button>
          <Button
            variant={pomodoroOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setPomodoroOpen((o) => !o)}
            aria-label="Pomodoro"
          >
            <Timer className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
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
        <aside
          className={cn(
            "shrink-0 overflow-hidden border-r transition-all duration-200",
            listOpen ? "w-72" : "w-0",
          )}
        >
          {planner.hydrated && listOpen && (
            <TaskList
              occurrences={occurrences}
              onToggleDone={toggleDone}
              onSelect={openEdit}
            />
          )}
        </aside>

        <section className="min-w-0 flex-1 px-4 py-2">
          {planner.hydrated ? (
            <Timeline
              day={day}
              now={now}
              occurrences={occurrences}
              onOccurrenceClick={openEdit}
              onToggleDone={toggleDone}
              onSlotClick={openCreate}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Carregando…
            </div>
          )}
        </section>
      </main>

      {planner.hydrated && (
        <Pomodoro
          open={pomodoroOpen}
          onClose={() => setPomodoroOpen(false)}
          workMinutes={planner.settings.pomodoroWork}
          breakMinutes={planner.settings.pomodoroBreak}
          soundEnabled={planner.settings.soundEnabled}
        />
      )}

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

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={planner.settings}
        onChange={planner.updateSettings}
      />
    </div>
  );
}
