"use client";

import { ListTodo } from "lucide-react";
import { minutesToTime, isHourly } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ResolvedOccurrence } from "@/types";

interface TaskListProps {
  occurrences: ResolvedOccurrence[];
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onSelect: (occ: ResolvedOccurrence) => void;
}

export function TaskList({ occurrences, onToggleDone, onSelect }: TaskListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
        <ListTodo className="h-4 w-4" />
        Tarefas do dia
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {occurrences.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {occurrences.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma tarefa neste dia.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {occurrences.map((occ) => {
              const hourly = isHourly(occ.task.recurrence);
              const done = occ.completed;
              return (
                <li key={occ.key}>
                  <div className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50">
                    <button
                      type="button"
                      aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
                      onClick={() => onToggleDone(occ)}
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition",
                        done ? "border-transparent" : "opacity-60 hover:opacity-100",
                      )}
                      style={done ? undefined : { borderColor: occ.task.color }}
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
                        {minutesToTime(occ.startMinute)}
                        {occ.openEnded
                          ? " · em aberto"
                          : ` – ${minutesToTime(occ.endMinute)}`}
                        {hourly && " · a cada hora"}
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
