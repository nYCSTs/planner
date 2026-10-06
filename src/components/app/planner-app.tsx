"use client";

import { useEffect } from "react";
import { BellRing, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/components/theme-provider";
import { useNow } from "@/hooks/use-now";
import { useNotifications } from "@/hooks/use-notifications";
import { useIsDesktop } from "@/hooks/use-media-query";
import { initStore } from "@/lib/store/store";
import { useReady, useSettings } from "@/lib/store/hooks";
import { useDayOccurrences, useOccurrence } from "@/lib/store/use-day";
import { TaskForm } from "@/components/planner/task-form";
import { TaskDetail } from "@/components/planner/task-detail";
import { EntryDialog } from "@/components/planner/entry-dialog";
import { ForkDialog } from "@/components/planner/fork-dialog";
import { SettingsSheet } from "@/components/planner/settings-sheet";
import { Pomodoro } from "@/components/planner/pomodoro";
import { DayView } from "@/components/views/day-view";
import { WeekView } from "@/components/views/week-view";
import { UpcomingView } from "@/components/views/upcoming-view";
import { HabitsView } from "@/components/views/habits-view";
import { ReportsView } from "@/components/views/reports-view";
import { UIProvider, useUI } from "./ui-context";
import { DesktopHeader, MobileHeader } from "./header";
import { BottomNav } from "./bottom-nav";
import { ScopeDialog } from "./scope-dialog";
import { Toasts } from "./toasts";
import { CommandPalette } from "./command-palette";
import { ShortcutsHelp, useShortcuts } from "./shortcuts";
import { OverdueDialog, useOverdue } from "./overdue-dialog";
import { SyncDialog } from "./sync-dialog";
import { useSyncEngine } from "./use-sync";
import { usePwa } from "./use-pwa";

function DetailDialog({ now }: { now: Date }) {
  const ui = useUI();
  const isDesktop = useIsDesktop();
  const occ = useOccurrence(ui.selected, now);
  const asPanel = isDesktop && ui.view === "day";

  return (
    <Dialog open={!asPanel && occ !== null} onOpenChange={(o) => !o && ui.closeDetail()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto overflow-x-hidden sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Detalhes da tarefa</DialogTitle>
        </DialogHeader>
        {occ && <TaskDetail key={occ.key + occ.date} occ={occ} />}
      </DialogContent>
    </Dialog>
  );
}

function Shell() {
  const ui = useUI();
  const ready = useReady();
  const now = useNow(15_000);
  const settings = useSettings();
  const { setTheme } = useTheme();
  const todayOccurrences = useDayOccurrences(now, now);
  const { permission, requestPermission, alarmActive, dismissAlarm } = useNotifications(todayOccurrences, now, settings);
  const overdue = useOverdue(now);

  useEffect(() => {
    void initStore();
  }, []);

  useEffect(() => {
    setTheme(settings.theme);
  }, [settings.theme, setTheme]);

  useShortcuts();
  useSyncEngine();
  usePwa();

  const views = {
    day: <DayView now={now} />,
    week: <WeekView now={now} />,
    upcoming: <UpcomingView now={now} />,
    habits: <HabitsView now={now} />,
    reports: <ReportsView now={now} />,
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <DesktopHeader now={now} overdueCount={overdue.length} />
      <MobileHeader now={now} overdueCount={overdue.length} />

      {ready && settings.notificationsEnabled && permission === "default" && (
        <button
          type="button"
          onClick={requestPermission}
          className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-left text-xs text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
        >
          <BellRing className="h-3.5 w-3.5 shrink-0" />
          Ative as notificações do navegador para receber avisos das tarefas →
        </button>
      )}

      {alarmActive && (
        <div className="flex items-center justify-between border-b bg-red-500/10 px-4 py-2">
          <span className="flex items-center gap-2 text-xs font-medium text-red-700 dark:text-red-400">
            <BellRing className="h-3.5 w-3.5 animate-pulse" /> Alarme tocando…
          </span>
          <button
            type="button"
            onClick={dismissAlarm}
            className="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
          >
            <X className="h-3.5 w-3.5" /> Parar alarme
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1">
        {ready ? (
          views[ui.view]
        ) : (
          <div className="grid h-full place-items-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" aria-label="Carregando" />
          </div>
        )}
      </main>

      {ready && (
        <Pomodoro
          open={ui.pomodoroOpen}
          onOpen={() => ui.setPomodoroOpen(true)}
          onClose={() => ui.setPomodoroOpen(false)}
          workMinutes={settings.pomodoroWork}
          breakMinutes={settings.pomodoroBreak}
          soundEnabled={settings.soundEnabled}
        />
      )}

      <BottomNav now={now} />

      <TaskForm />
      <DetailDialog now={now} />
      <EntryDialog />
      <ForkDialog />
      <ScopeDialog />
      <SettingsSheet />
      <SyncDialog />
      <CommandPalette />
      <ShortcutsHelp />
      <OverdueDialog now={now} />
      <Toasts />
    </div>
  );
}

export function PlannerApp() {
  return (
    <UIProvider>
      <Shell />
    </UIProvider>
  );
}
