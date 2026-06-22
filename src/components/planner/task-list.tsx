"use client";

import { ListTodo } from "lucide-react";
import { minutesToTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ResolvedOccurrence } from "@/types";

interface TaskListProps {
  occurrences: ResolvedOccurrence[];
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onSelect: (occ: ResolvedOccurrence) => void;
}

const RECURRENCE_LABEL: Record<string, string> = {
  once: "pontual",
  hourly: "a cada hora",
  weekdays: "dias úteis",
  weekends: "fim de semana",
  everyday: "todos os dias",
  custom: "dias específicos",
};

export function TaskList({ occurrences, onToggleDone, onSelect }: TaskListProps) {
  // Collapse hourly tasks into a single row (24 occurrences → 1 entry).
  const seen = new Set<string>();
  const rows = occurrences.filter((o) => {
    if (o.task.recurrence.kind !== "hourly") return true;
    if (seen.has(o.task.id)) return false;
    seen.add(o.task.id);
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
        <ListTodo className="h-4 w-4" />
        Tarefas do dia
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {rows.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma tarefa neste dia.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((occ) => {
              const hourly = occ.task.recurrence.kind === "hourly";
              const done = occ.completed;
              return (
                <li key={occ.task.id}>
                  <div className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50">
                    <button
                      type="button"
                      aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
                      disabled={hourly}
                      onClick={() => onToggleDone(occ)}
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition",
                        done
                          ? "border-transparent"
                          : "opacity-60 hover:opacity-100",
                        hourly && "cursor-not-allowed opacity-30",
                      )}
                      style={
                        done
                          ? undefined
                          : { borderColor: occ.task.color }
                      }
                    >
                      {done && <span className="text-sm leading-none">✅</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelect(occ)}
                      className="flex min-w-0 flex-1 flex-col text-left"
                    >
                      <span
                        className={cn(
                          "truncate text-sm",
                          done && "text-muted-foreground line-through",
                        )}
                      >
                        {occ.task.title}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {hourly
                          ? RECURRENCE_LABEL.hourly
                          : `${minutesToTime(occ.startMinute)}${
                              occ.openEnded
                                ? " · em aberto"
                                : ` – ${minutesToTime(occ.endMinute)}`
                            }`}
                      </span>
                    </button>

                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: occ.task.color }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
