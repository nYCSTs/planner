"use client";

import { useCallback } from "react";
import type { ResolvedOccurrence } from "@/types";
import { isRecurring, recurrenceFloor } from "@/lib/recurrence";
import { getState, transact } from "@/lib/store/store";
import {
  setOccurrenceTime,
  splitSeries,
  startTimer,
  stopTimer,
  toggleDone,
  updateTask,
} from "@/lib/store/actions";
import { useUI } from "./ui-context";

/** Shared occurrence interactions used by every view. */
export function useOccurrenceHandlers() {
  const ui = useUI();
  const { toast, askScope } = ui;

  const toggle = useCallback(
    (occ: ResolvedOccurrence) => {
      const { undo } = transact(() => toggleDone(occ));
      if (!occ.completed) {
        toast(`Concluída: ${occ.title}`, { label: "Desfazer", run: undo });
      }
    },
    [toast],
  );

  const startTimerFor = useCallback(
    (occ: ResolvedOccurrence) => {
      const running = Object.values(getState().entries).find((e) => !e.deletedAt && e.end === null);
      if (running?.taskId === occ.task.id) {
        stopTimer();
        return;
      }

      startTimer({
        title: occ.title,
        taskId: occ.task.id,
        occurrenceKey: occ.key,
        projectId: occ.task.projectId,
        tags: occ.task.tags,
      });
      toast(`Cronômetro iniciado: ${occ.title}`);
    },
    [toast],
  );

  /** Move/resize an occurrence, asking the scope for recurring tasks. */
  const move = useCallback(
    async (occ: ResolvedOccurrence, startMinute: number, endMinute: number | null, date?: string) => {
      const task = occ.task;
      if (!isRecurring(task)) {
        updateTask(task.id, { startMinute, endMinute, ...(date ? { date } : {}) });
        return;
      }

      if (date && date !== occ.date) {
        toast("Tarefas recorrentes só podem mudar de horário, não de dia.");
        return;
      }

      const atFirst = occ.date <= recurrenceFloor(task);
      const scope = await askScope({ title: "Mudar horário de", allowFollowing: !atFirst });
      if (scope === "this") {
        setOccurrenceTime(occ, startMinute, endMinute);
      } else if (scope === "following") {
        splitSeries(task.id, occ.date, { startMinute, endMinute });
      } else if (scope === "all") {
        updateTask(task.id, { startMinute, endMinute });
      }
    },
    [askScope, toast],
  );

  return { toggle, startTimerFor, move };
}
