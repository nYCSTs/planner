"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  GitFork,
  Inbox,
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
import { UnscheduledDialog } from "@/components/planner/unscheduled-dialog";
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
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const [unscheduledEditing, setUnscheduledEditing] = useState<Task | undefined>(undefined);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
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
      planner.skips,
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
  }, [planner.tasks, day, planner.completions, now, planner.overrides, planner.skips, trackingId]);

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
    () => resolveOccurrences(planner.tasks, now, planner.completions, now, planner.overrides, planner.skips),
    [planner.tasks, now, planner.completions, planner.overrides, planner.skips],
  );

  const tagsById = useMemo(
    () => Object.fromEntries(planner.tags.map((t) => [t.id, t])),
    [planner.tags],
  );

  const { permission, requestPermission, alarmActive, dismissAlarm } =
    useNotifications(todayOccurrences, now, planner.settings, trackingId);

  // Past "once" tasks (not today) that are neither completed nor skipped.
  // Tracker-created ("Registrar") tasks are excluded — they're logs of time
  // already spent, not commitments that can be "late".
  const overdueTasks = useMemo(() => {
    const todayKey = dateKey(now);
    return planner.tasks.filter((t) => {
      if (t.tracked) return false;
      if (t.startMinute === null) return false; // unscheduled — no date
      if (t.recurrence.kind !== "once") return false;
      if (!t.date || t.date >= todayKey) return false;
      const compKey = `${t.id}:${t.date}`;
      return planner.completions[compKey] === undefined && !planner.skips[compKey];
    });
  }, [planner.tasks, planner.completions, planner.skips, now]);

  const openCreate = (startMinute: number, endMinute?: number) => {
    // Don't allow creating new tasks in past slots on today.
    if (isToday(day) && startMinute < nowMinutes(now)) return;
    setDraft({ startMinute, endMinute });
  };

  // Clicking an occurrence opens its detail view; Edit (inside) opens the form.
  const openDetail = (occ: ResolvedOccurrence) => setDetailId(occ.task.id);

  const openEditTask = (task: Task, fromDetail = false) => {
    if (task.startMinute === null) {
      // Unscheduled tasks use the simpler UnscheduledDialog.
      if (fromDetail) setEditReturnId(task.id);
      setUnscheduledEditing(task);
      setUnscheduledOpen(true);
      return;
    }
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
      <header className="flex items-center justify-between gap-4 border-b px-4 py-2.5">
        <div className="flex items-center gap-1.5">
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
          <h1 className="ml-0.5 flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <CalendarDays className="h-4 w-4" />
            </span>
            Planner
          </h1>
        </div>

        <div className="flex items-center gap-1">
          {!isToday(day) && (
            <Button variant="outline" size="sm" className="mr-1" onClick={() => setDay(new Date())}>
              Hoje
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setDay((d) => addDays(d, -1))} aria-label="Dia anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {/* Clicking the day label opens a native date picker for quick navigation */}
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker()}
            className="relative min-w-52 cursor-pointer rounded-md px-2 py-1 text-center text-sm font-medium capitalize transition-colors hover:bg-accent"
          >
            {format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
            {isToday(day) && (
              <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                HOJE
              </span>
            )}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={dateKey(day)}
            onChange={(e) => {
              if (e.target.value) setDay(new Date(e.target.value + "T12:00:00"));
            }}
            className="sr-only"
            aria-label="Escolher data"
            tabIndex={-1}
          />
          <Button variant="ghost" size="icon" onClick={() => setDay((d) => addDays(d, 1))} aria-label="Próximo dia">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {trackingId && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setTrackOpen(true)}
              className="gap-1.5"
              aria-label="Tracker em andamento"
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <Square className="h-3.5 w-3.5" />
              Parar
            </Button>
          )}

          {/* Primary create split-button with a dropdown of every creation mode. */}
          <div ref={newMenuRef} className="relative flex">
            <Button
              size="sm"
              className="rounded-r-none pr-2.5"
              onClick={() => openCreate(nowMinutes(now))}
              disabled={dateKey(day) < dateKey(now)}
              title={dateKey(day) < dateKey(now) ? "Não é possível criar tarefas no passado" : undefined}
            >
              <Plus className="mr-1 h-4 w-4" /> Nova tarefa
            </Button>
            <Button
              size="sm"
              className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
              onClick={() => setNewMenuOpen((o) => !o)}
              aria-label="Mais opções de criação"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {newMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNewMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg">
                  <MenuItem
                    icon={<Clock3 className="h-4 w-4 text-muted-foreground" />}
                    title="Tarefa com horário"
                    hint="Aparece na timeline"
                    disabled={dateKey(day) < dateKey(now)}
                    onClick={() => { setNewMenuOpen(false); openCreate(nowMinutes(now)); }}
                  />
                  <MenuItem
                    icon={<Inbox className="h-4 w-4 text-muted-foreground" />}
                    title="Tarefa sem horário"
                    hint="Lista de pendências"
                    onClick={() => { setNewMenuOpen(false); setUnscheduledEditing(undefined); setUnscheduledOpen(true); }}
                  />
                  <MenuItem
                    icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                    title="Registrar agora"
                    hint="Cronômetro (Toggl)"
                    onClick={() => { setNewMenuOpen(false); setTrackPrefill(undefined); setTrackOpen(true); }}
                  />
                  <div className="my-1 h-px bg-border" />
                  <MenuItem
                    icon={<GitFork className="h-4 w-4 text-muted-foreground" />}
                    title="Copiar de existente…"
                    hint="Duplicar uma tarefa"
                    onClick={() => { setNewMenuOpen(false); setForkOpen(true); }}
                  />
                </div>
              </>
            )}
          </div>

          <Button
            variant={pomodoroOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setPomodoroOpen((o) => !o)}
            aria-label="Pomodoro"
          >
            <Timer className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Configurações">
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

      {planner.hydrated && overdueTasks.length > 0 && (
        <button
          onClick={() => {
            // Navigate to the most recent overdue task's day.
            const latest = overdueTasks.reduce((a, b) =>
              (a.date ?? "") > (b.date ?? "") ? a : b,
            );
            if (latest.date) setDay(new Date(latest.date + "T12:00:00"));
          }}
          className="border-b bg-orange-500/10 px-4 py-2 text-left text-xs text-orange-700 hover:bg-orange-500/20 dark:text-orange-400"
        >
          ⚠️ {overdueTasks.length} tarefa{overdueTasks.length > 1 ? "s" : ""} em atraso — clique para ver
        </button>
      )}

      <main className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "shrink-0 overflow-hidden border-r transition-all duration-200",
            listOpen ? "w-80" : "w-0",
          )}
        >
          {planner.hydrated && listOpen && (
            <TaskList
              scheduled={scheduledOccurrences}
              unscheduled={unscheduledOccurrences}
              completions={planner.completions}
              tags={planner.tags}
              onToggleDone={toggleDone}
              onSelect={openDetail}
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
              canCreate={dateKey(day) >= dateKey(now)}
              tagsById={tagsById}
              sleep={planner.settings.sleep}
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
        allTags={planner.tags}
        onCreateTag={planner.addTag}
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
              completions={planner.completions}
              allTags={planner.tags}
              onToggleDone={() => planner.toggleDone(detailOcc)}
              onDelete={() => {
                planner.deleteTask(detailOcc.task.id);
                setDetailId(null);
              }}
              onEdit={() => {
                const task = detailOcc.task;
                setDetailId(null);
                openEditTask(task, true);
              }}
              onFork={() => {
                setDetailId(null);
                setForkOpen(true);
              }}
              onToggleSkip={(reason) => planner.toggleSkip(detailOcc, reason)}
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

      <UnscheduledDialog
        open={unscheduledOpen}
        editing={unscheduledEditing}
        allTags={planner.tags}
        onCreateTag={planner.addTag}
        onClose={() => {
          setUnscheduledOpen(false);
          setUnscheduledEditing(undefined);
          if (editReturnId) {
            setDetailId(editReturnId);
            setEditReturnId(null);
          }
        }}
        onSave={(fields, id) => {
          if (id) planner.updateTask(id, fields);
          else planner.addTask(fields);
        }}
        onDelete={(id) => {
          planner.deleteTask(id);
          setUnscheduledOpen(false);
          setUnscheduledEditing(undefined);
          setDetailId(null);
          setEditReturnId(null);
        }}
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
        tags={planner.tags}
        onAddTag={planner.addTag}
        onUpdateTag={planner.updateTag}
        onDeleteTag={planner.deleteTag}
      />
    </div>
  );
}

/** A row in the "New" dropdown menu: icon + title + subtle hint. */
function MenuItem({
  icon,
  title,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
