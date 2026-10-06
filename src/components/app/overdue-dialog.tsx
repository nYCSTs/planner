"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ArrowRight, Check, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { dateKey, dayFromKey, minutesToTime } from "@/lib/time";
import { backlogKey, dayOccKey, overdueBacklog, overdueScheduled } from "@/lib/occurrences";
import { getState, put, transact } from "@/lib/store/store";
import { updateTask } from "@/lib/store/actions";
import { useOccurrenceStates, useTasks } from "@/lib/store/hooks";
import type { Task } from "@/types";
import { useUI } from "./ui-context";

export function useOverdue(now: Date): Task[] {
  const tasks = useTasks();
  const occurrences = useOccurrenceStates();
  const todayKey = dateKey(now);
  return useMemo(
    () => {
      const at = dayFromKey(todayKey);
      return [...overdueScheduled(tasks, occurrences, at), ...overdueBacklog(tasks, occurrences, at)].sort((a, b) =>
        (a.date ?? "").localeCompare(b.date ?? ""),
      );
    },
    [tasks, occurrences, todayKey],
  );
}

function markDone(task: Task) {
  const key = task.startMinute === null ? backlogKey(task.id) : dayOccKey(task.id, task.date ?? "");
  const cur = getState().occurrences[key];
  put("occurrences", {
    ...(cur ?? { id: key, taskId: task.id, date: task.startMinute === null ? undefined : task.date }),
    status: "done",
    doneAt: Date.now(),
    updatedAt: 0,
  });
}

export function OverdueDialog({ now }: { now: Date }) {
  const ui = useUI();
  const overdue = useOverdue(now);
  const todayKey = dateKey(now);

  const moveAll = () => {
    const { undo } = transact(() => {
      for (const t of overdue) {
        updateTask(t.id, { date: todayKey });
      }
    });
    ui.toast(`${overdue.length} tarefa${overdue.length > 1 ? "s" : ""} movida${overdue.length > 1 ? "s" : ""} para hoje`, {
      label: "Desfazer",
      run: undo,
    });
    ui.setOverdueOpen(false);
  };

  return (
    <Dialog open={ui.overdueOpen && overdue.length > 0} onOpenChange={ui.setOverdueOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" /> Atrasadas
          </DialogTitle>
          <DialogDescription>Tarefas de dias anteriores que não foram concluídas nem puladas.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1">
          {overdue.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t.date ? format(dayFromKey(t.date), "EEE, d 'de' MMM", { locale: ptBR }) : ""}
                  {t.startMinute !== null && ` · ${minutesToTime(t.startMinute)}`}
                  {t.startMinute === null && " · prazo"}
                </span>
              </span>
              <Button size="icon-sm" variant="ghost" title="Ver no dia" aria-label="Ver no dia" onClick={() => {
                if (t.date) {
                  ui.setDay(dayFromKey(t.date));
                  ui.setView("day");
                  ui.setOverdueOpen(false);
                }
              }}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon-sm" variant="ghost" title="Marcar como feita" aria-label="Marcar como feita" onClick={() => markDone(t)}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => updateTask(t.id, { date: todayKey })}>
                Hoje <ArrowRight className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
        <Button onClick={moveAll}>Mover todas para hoje</Button>
      </DialogContent>
    </Dialog>
  );
}
