"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  GitFork,
  ListTodo,
  Plus,
  Settings as SettingsIcon,
  Square,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsSheet } from "@/components/planner/settings-sheet";
import { useTheme } from "@/components/theme-provider";
import { Timeline } from "@/components/planner/timeline";
import { TaskDialog, type TaskDraft } from "@/components/planner/task-dialog";
import { TaskList } from "@/components/planner/task-list";
import { ForkDialog } from "@/components/planner/fork-dialog";
import { TrackDialog } from "@/components/planner/track-dialog";
import { Pomodoro } from "@/components/planner/pomodoro";
import { usePlanner } from "@/hooks/use-planner";
import { useNow } from "@/hooks/use-now";
import { useNotifications } from "@/hooks/use-notifications";
import { resolveOccurrences, nowMinutes, dateKey } from "@/lib/time";
import type { ResolvedOccurrence, Task } from "@/types";
import { TaskDetail } from "@/components/planner/task-detail";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Home() {
  const planner = usePlanner();
  const now = useNow(15_000);
  const { setTheme } = useTheme();
  const [day, setDay] = useState<Date>(() => new Date());
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  // When the edit form was opened from a detail view, remember the task so we
  // can return to detail on cancel/close instead of closing everything.
  const [editReturnId, setEditReturnId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [trackingStartMs, setTrackingStartMs] = useState<number | null>(null);
  // Whether the ForkDialog was opened from the tracker (vs from detail/header).
  const [forkForTracker, setForkForTracker] = useState(false);
  // Prefill for the tracker: just title+color from a chosen source task.
  const [trackPrefill, setTrackPrefill] = useState<
    Pick<Task, "title" | "color"> | undefined
  >(undefined);
  // When forking into tracker, remember source so startTracking can do the full fork.
  const [trackForkSourceId, setTrackForkSourceId] = useState<string | undefined>(undefined);

  // Keep the live theme in sync with persisted settings after hydration.
  useEffect(() => {
    if (planner.hydrated) setTheme(planner.settings.theme);
  }, [planner.hydrated, planner.settings.theme, setTheme]);

  const occurrences = useMemo(() => {
    const resolved = resolveOccurrences(
      planner.tasks,
      day,
      planner.completions,
      now,
      planner.overrides,
    );
    // Live tracker: update the running task's endMinute to currentMinute so the
    // block grows in real time instead of stretching to end-of-day.
    if (!trackingId) return resolved;
    const currentMin = nowMinutes(now);
    return resolved.map((o) =>
      o.task.id === trackingId
        ? { ...o, endMinute: Math.max(o.startMinute + 1, currentMin) }
        : o,
    );
  }, [planner.tasks, day, planner.completions, now, planner.overrides, trackingId]);

  // Timeline only shows scheduled occurrences; the list shows both lanes.
  const scheduledOccurrences = useMemo(
    () => occurrences.filter((o) => o.scheduled),
    [occurrences],
  );
  const unscheduledOccurrences = useMemo(
    () => occurrences.filter((o) => !o.scheduled),
    [occurrences],
  );
  const pendingUnscheduled = unscheduledOccurrences.filter(
    (o) => !o.completed,
  ).length;

  const todayOccurrences = useMemo(
    () => resolveOccurrences(planner.tasks, now, planner.completions, now),
    [planner.tasks, now, planner.completions],
  );

  const { permission, requestPermission, alarmActive, dismissAlarm } =
    useNotifications(todayOccurrences, now, planner.settings, trackingId);

  const openCreate = (startMinute: number) => setDraft({ startMinute });

  // Clicking an occurrence opens its detail view; Edit (inside) opens the form.
  const openDetail = (occ: ResolvedOccurrence) => setDetailId(occ.task.id);

  const openEditTask = (task: Task, fromDetail = false) => {
    if (fromDetail) setEditReturnId(task.id);
    setDraft({ startMinute: task.startMinute, task });
  };

  // X / Cancel: close the edit form entirely (does not return to detail).
  const closeDraft = () => {
    setDraft(null);
    setEditReturnId(null);
  };

  // Back (top-left): return to the detail the edit was opened from, if it still
  // exists. Shown only when the edit came from a detail view.
  const backToDetail = () => {
    setDraft(null);
    if (editReturnId && planner.tasks.some((t) => t.id === editReturnId)) {
      setDetailId(editReturnId);
    }
    setEditReturnId(null);
  };

  const toggleDone = (occ: ResolvedOccurrence) => planner.toggleDone(occ);

  const handleResize = (
    occ: ResolvedOccurrence,
    startMinute: number,
    endMinute: number | null,
  ) => planner.updateTask(occ.task.id, { startMinute, endMinute });

  // Fork a chosen task into a new copy for targetDay, then open it in the
  // edit form so the user sets the new time.
  const handleFork = (sourceId: string, targetDay: Date) => {
    if (forkForTracker) {
      // Fork chosen from the tracker: store source id for startTracking to use.
      // Don't create the task yet — only show title/color as prefill.
      const source = planner.tasks.find((t) => t.id === sourceId);
      setForkOpen(false);
      setForkForTracker(false);
      if (source) {
        setTrackPrefill({ title: source.title, color: source.color });
        setTrackForkSourceId(sourceId);
      }
      setTrackOpen(true);
      return;
    }
    const forked = planner.forkTask(sourceId, day, targetDay);
    setForkOpen(false);
    if (forked) setDraft({ startMinute: null, task: forked });
  };

  const handleTrackStart = (title: string, color: string, startMs: number) => {
    const task = planner.startTracking(title, color, trackForkSourceId, day);
    setTrackingId(task.id);
    setTrackingStartMs(startMs);
    setTrackPrefill(undefined);
    setTrackForkSourceId(undefined);
    // Navigate to today so the running task is visible on the timeline.
    setDay(new Date());
  };

  const handleTrackStop = () => {
    if (trackingId) planner.stopTracking(trackingId);
    setTrackingId(null);
    setTrackingStartMs(null);
    setTrackOpen(false);
  };

  // The occurrence currently shown in the detail dialog (today/day-scoped).
  const detailOcc = useMemo(
    () => occurrences.find((o) => o.task.id === detailId) ?? null,
    [occurrences, detailId],
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            variant={listOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setListOpen((o) => !o)}
            aria-label="Tarefas do dia"
            className="relative"
          >
            <ListTodo className="h-4 w-4" />
            {pendingUnscheduled > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {pendingUnscheduled}
              </span>
            )}
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
          <Button
            size="sm"
            onClick={() => openCreate(nowMinutes(now))}
          >
            <Plus className="mr-1 h-4 w-4" /> Nova tarefa
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setTrackPrefill(undefined); setTrackOpen(true); }}
            aria-label="Registrar agora"
          >
            <Clock className="mr-1 h-4 w-4" /> Registrar
          </Button>
          {/* Dropdown for fork option */}
          <div ref={newMenuRef} className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNewMenuOpen((o) => !o)}
              aria-label="Mais opções de criação"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {newMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNewMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1 min-w-max rounded-md border bg-popover py-1 shadow-md">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                    onClick={() => { setNewMenuOpen(false); setForkOpen(true); }}
                  >
                    <GitFork className="h-4 w-4 text-muted-foreground" />
                    Copiar de tarefa existente…
                  </button>
                </div>
              </>
            )}
          </div>
          {trackingId && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setTrackOpen(true); }}
              className="gap-1.5"
              aria-label="Tracker em andamento"
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/80" />
              <Square className="h-3.5 w-3.5" />
              Parar
            </Button>
          )}
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

      {alarmActive && (
        <div className="flex items-center justify-between border-b bg-red-500/10 px-4 py-2">
          <span className="text-xs font-medium text-red-700 dark:text-red-400">
            🔔 Alarme tocando…
          </span>
          <button
            onClick={dismissAlarm}
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 active:bg-red-800"
          >
            Parar alarme
          </button>
        </div>
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
              scheduled={scheduledOccurrences}
              unscheduled={unscheduledOccurrences}
              onToggleDone={toggleDone}
              onSelect={openDetail}
              onAddUnscheduled={() => setDraft({ startMinute: null })}
            />
          )}
        </aside>

        <section className="min-w-0 flex-1 px-4 py-2">
          {planner.hydrated ? (
            <Timeline
              day={day}
              now={now}
              occurrences={scheduledOccurrences}
              onOccurrenceClick={openDetail}
              onToggleDone={toggleDone}
              onResize={handleResize}
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
        onClose={closeDraft}
        onBack={editReturnId ? backToDetail : undefined}
        onSave={(task, id) => {
          if (id) planner.updateTask(id, task);
          else planner.addTask(task);
        }}
        onDelete={(id) => {
          planner.deleteTask(id);
          setDraft(null);
          setEditReturnId(null); // deleted task has no detail to return to
          setDetailId(null);
        }}
      />

      <Dialog
        open={detailOcc !== null}
        onOpenChange={(o) => !o && setDetailId(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Detalhes da tarefa</DialogTitle>
          </DialogHeader>
          {detailOcc && (
            <TaskDetail
              occ={detailOcc}
              day={day}
              override={planner.overrides[`${detailOcc.task.id}:${detailOcc.date}`]}
              subtaskDone={planner.subtaskDone}
              onEdit={() => {
                const task = detailOcc.task;
                setDetailId(null);
                openEditTask(task, true);
              }}
              onFork={() => {
                setDetailId(null);
                setForkOpen(true);
              }}
              onSetDayDescription={(description) =>
                planner.setDayDescription(detailOcc.task.id, day, description)
              }
              onAddSubtask={(title, scope) =>
                planner.addSubtask(detailOcc.task.id, day, title, scope)
              }
              onRemoveSubtask={(subtaskId, scope) =>
                planner.removeSubtask(detailOcc.task.id, day, subtaskId, scope)
              }
              onRenameSubtask={(subtaskId, title, scope) =>
                planner.renameSubtask(detailOcc.task.id, day, subtaskId, title, scope)
              }
              onReorderSubtask={(subtaskId, newIndex, scope) =>
                planner.reorderSubtask(detailOcc.task.id, day, subtaskId, newIndex, scope)
              }
              onToggleSubtask={(subtaskId) =>
                planner.toggleSubtaskDone(subtaskId, day)
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <TrackDialog
        open={trackOpen}
        prefill={trackPrefill}
        trackingStartMs={trackingStartMs}
        onClose={() => { setTrackOpen(false); if (!trackingId) setTrackPrefill(undefined); }}
        onStart={handleTrackStart}
        onStop={handleTrackStop}
        onOpenFork={() => { setForkForTracker(true); setForkOpen(true); setTrackOpen(false); }}
      />

      <ForkDialog
        open={forkOpen}
        tasks={planner.tasks}
        defaultDay={day}
        onClose={() => {
          setForkOpen(false);
          if (forkForTracker) { setForkForTracker(false); setTrackOpen(true); }
        }}
        onPick={handleFork}
      />

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={planner.settings}
        onChange={planner.updateSettings}
        onExport={planner.exportData}
        onImport={planner.importData}
      />
    </div>
  );
}
