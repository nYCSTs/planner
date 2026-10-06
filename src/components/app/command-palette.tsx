"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Flame,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Timer,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { addDaysKey, dateKey, dayFromKey, minutesToTime } from "@/lib/time";
import { describeRecurrence, patternMatches } from "@/lib/recurrence";
import { afterDoneDue, backlogKey, dayOccKey, historyIndex, isBacklog } from "@/lib/occurrences";
import { getState } from "@/lib/store/store";
import { useTasks } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";
import { useUI } from "./ui-context";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  color?: string;
  run: () => void;
}

/** Nearest day (today or later, else the last past one) the task occurs on. */
function nextDate(task: Task, todayKey: string): string {
  if (isBacklog(task)) {
    return todayKey;
  }

  if (task.recurrence.kind === "once") {
    return task.date ?? todayKey;
  }

  if (task.recurrence.kind === "afterDone") {
    const due = afterDoneDue(task, historyIndex(getState().occurrences));
    return due < todayKey ? todayKey : due;
  }

  for (let i = 0; i < 400; i++) {
    const key = addDaysKey(todayKey, i);
    if (patternMatches(task, key)) {
      return key;
    }
  }

  return task.recurrence.endDate ?? todayKey;
}

export function CommandPalette() {
  const ui = useUI();
  const tasks = useTasks();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const close = () => {
    ui.setPaletteOpen(false);
    setQuery("");
    setActive(0);
  };

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const todayKey = dateKey(new Date());
    const actions: Item[] = [
      { id: "new", label: "Nova tarefa", icon: <Plus className="h-4 w-4" />, hint: "N", run: () => ui.openForm({ initial: { date: dateKey(ui.day) } }) },
      { id: "new-unscheduled", label: "Nova tarefa sem horário", icon: <Plus className="h-4 w-4" />, run: () => ui.openForm({ initial: { startMinute: null } }) },
      {
        id: "timer",
        label: "Iniciar cronômetro",
        icon: <Play className="h-4 w-4" />,
        hint: "T",
        run: () => setTimeout(() => document.querySelector<HTMLInputElement>("[data-timer-input]")?.focus(), 50),
      },
      { id: "entry", label: "Lançar registro de tempo", icon: <Timer className="h-4 w-4" />, run: () => ui.openEntry({}) },
      { id: "today", label: "Ir para hoje", icon: <CalendarDays className="h-4 w-4" />, run: () => { ui.setDay(new Date()); ui.setView("day"); } },
      { id: "v-week", label: "Visão: Semana", icon: <CalendarRange className="h-4 w-4" />, run: () => ui.setView("week") },
      { id: "v-upcoming", label: "Visão: Próximos 7 dias", icon: <CalendarCheck className="h-4 w-4" />, run: () => ui.setView("upcoming") },
      { id: "v-habits", label: "Visão: Hábitos", icon: <Flame className="h-4 w-4" />, run: () => ui.setView("habits") },
      { id: "v-reports", label: "Visão: Relatórios", icon: <BarChart3 className="h-4 w-4" />, run: () => ui.setView("reports") },
      { id: "sync", label: "Sincronizar aparelhos", icon: <RefreshCw className="h-4 w-4" />, run: () => ui.setSyncOpen(true) },
      { id: "settings", label: "Configurações", icon: <Settings className="h-4 w-4" />, run: () => ui.setSettingsOpen(true) },
    ].filter((a) => !q || a.label.toLowerCase().includes(q));

    const found: Item[] = q
      ? tasks
          .filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
          .slice(0, 30)
          .map((t) => {
            const date = nextDate(t, todayKey);
            const hint =
              t.recurrence.kind === "once"
                ? `${date.split("-").reverse().slice(0, 2).join("/")}${t.startMinute !== null ? ` · ${minutesToTime(t.startMinute)}` : ""}`
                : describeRecurrence(t.recurrence);
            return {
              id: t.id,
              label: t.title,
              hint,
              color: t.color,
              run: () => {
                ui.setDay(dayFromKey(date));
                ui.setView("day");
                const key = isBacklog(t) ? backlogKey(t.id) : dayOccKey(t.id, date);
                ui.openDetail({ key, date });
              },
            };
          })
      : [];

    return [...found, ...actions];
  }, [query, tasks, ui]);

  const choose = (item: Item | undefined) => {
    if (!item) {
      return;
    }

    close();
    item.run();
  };

  return (
    <Dialog open={ui.paletteOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            placeholder="Buscar tarefas ou ações…"
            className="h-12 flex-1 bg-transparent text-sm outline-none"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(items[active]);
              }
            }}
          />
        </div>
        <ul className="max-h-[50dvh] overflow-y-auto p-1">
          {items.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nada encontrado.</li>}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(item)}
                className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm", active === i && "bg-accent")}
              >
                {item.icon ? (
                  <span className="text-muted-foreground">{item.icon}</span>
                ) : (
                  <span className="mx-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                )}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
