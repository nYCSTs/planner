"use client";

import { useMemo, useState } from "react";
import { CalendarClock, List, X } from "lucide-react";
import type { ResolvedOccurrence, TimeEntry } from "@/types";
import { dateKey, msAt, nowMinutes } from "@/lib/time";
import { entriesForDay, entryColor } from "@/lib/entries";
import { isBacklog } from "@/lib/occurrences";
import { scheduleBacklog, updateEntry } from "@/lib/store/actions";
import { useDayOccurrences, useOccurrence } from "@/lib/store/use-day";
import { useEntries, usePrefs, useProjectsById, useSettings, useTags, useTagsById, useTasksById } from "@/lib/store/hooks";
import { useIsDesktop, useIsMobile, useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Timeline } from "@/components/planner/timeline";
import { TaskList } from "@/components/planner/task-list";
import { TaskDetail } from "@/components/planner/task-detail";
import { useUI } from "@/components/app/ui-context";
import { useOccurrenceHandlers } from "@/components/app/use-handlers";

export function DayView({ now }: { now: Date }) {
  const ui = useUI();
  const { day } = ui;
  const prefs = usePrefs();
  const settings = useSettings();
  const isDesktop = useIsDesktop();
  const isWide = useMediaQuery("(min-width: 1280px)");
  const isMobile = useIsMobile();
  const occurrences = useDayOccurrences(day, now);
  const entries = useEntries();
  const tags = useTags();
  const tagsById = useTagsById();
  const tasksById = useTasksById();
  const projectsById = useProjectsById();
  const handlers = useOccurrenceHandlers();
  const [mobileTab, setMobileTab] = useState<"agenda" | "list">("agenda");
  const detailOcc = useOccurrence(ui.selected, now);

  const dk = dateKey(day);
  const nowMs = now.getTime();
  const scheduled = useMemo(() => occurrences.filter((o) => o.scheduled), [occurrences]);
  const unscheduled = useMemo(() => occurrences.filter((o) => !o.scheduled), [occurrences]);
  const dayEntries = useMemo(() => entriesForDay(entries, day, nowMs), [entries, day, nowMs]);
  const canCreate = dk >= dateKey(now);
  const color = (e: TimeEntry) => entryColor(e, tasksById, projectsById);

  const create = (start: number, end?: number) => {
    if (dk === dateKey(now) && start < nowMinutes(now) - 5) {
      ui.toast("Não é possível criar tarefas no passado.");
      return;
    }

    ui.openForm({ initial: { startMinute: start, endMinute: end ?? Math.min(start + 60, 24 * 60 - 1), date: dk } });
  };

  const dropTask = (taskId: string, minute: number) => {
    const task = tasksById[taskId];
    if (!task || !isBacklog(task)) {
      return;
    }

    scheduleBacklog(taskId, dk, minute, Math.min(minute + 60, 24 * 60 - 1));
    ui.toast(`"${task.title}" agendada`);
  };

  const showPanel = isDesktop && detailOcc !== null;
  const listVisible = ui.listOpen && (isWide || !showPanel);

  const list = (
    <TaskList
      day={day}
      now={now}
      scheduled={scheduled}
      unscheduled={unscheduled}
      entries={dayEntries}
      tags={tags}
      projectsById={projectsById}
      onToggleDone={handlers.toggle}
      onSelect={(o: ResolvedOccurrence) => ui.openDetail(o)}
      onStartTimer={handlers.startTimerFor}
    />
  );

  const timeline = (
    <Timeline
      day={day}
      now={now}
      occurrences={scheduled}
      entries={prefs.showTracked ? dayEntries : undefined}
      entryColor={color}
      tagsById={tagsById}
      sleep={settings.sleep}
      canCreate={canCreate}
      onOccurrenceClick={(o) => ui.openDetail(o)}
      onToggleDone={handlers.toggle}
      onStartTimer={handlers.startTimerFor}
      onMoveOccurrence={(o, s, e) => void handlers.move(o, s, e)}
      onCreate={create}
      onCreateEntry={(s, e) => ui.openEntry({ start: msAt(dk, s), end: msAt(dk, e) })}
      onEntryClick={(e) => ui.openEntry({ entryId: e.id })}
      onMoveEntry={(e, s, end) => updateEntry(e.id, { start: msAt(dk, s), end: msAt(dk, end) })}
      onDropTask={dropTask}
    />
  );

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-r transition-[width] duration-200 md:block",
          listVisible ? "md:w-72 xl:w-80" : "md:w-0 md:border-r-0",
        )}
      >
        {listVisible && !isMobile && list}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-1 border-b p-1.5 md:hidden">
          {([
            { id: "agenda", label: "Agenda", icon: CalendarClock },
            { id: "list", label: "Lista", icon: List },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMobileTab(t.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition",
                mobileTab === t.id ? "bg-accent" : "text-muted-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {t.id === "list" && unscheduled.some((o) => !o.completed && !o.skipped) && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                  {unscheduled.filter((o) => !o.completed && !o.skipped).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 md:px-3 md:py-2">
          {isMobile && mobileTab === "list" ? <div className="h-full">{list}</div> : timeline}
        </div>
      </section>

      {showPanel && detailOcc && (
        <aside className="relative w-[400px] shrink-0 overflow-y-auto border-l bg-card/40 p-4 xl:w-[440px]">
          <button
            type="button"
            onClick={ui.closeDetail}
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Fechar detalhes"
          >
            <X className="h-4 w-4" />
          </button>
          <TaskDetail key={detailOcc.key + detailOcc.date} occ={detailOcc} />
        </aside>
      )}
    </div>
  );
}
