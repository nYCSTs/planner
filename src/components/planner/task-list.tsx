"use client";

import { useState } from "react";
import { FileText, ListChecks, ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { minutesToTime, isHourly } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ResolvedOccurrence } from "@/types";

interface TaskListProps {
  scheduled: ResolvedOccurrence[];
  unscheduled: ResolvedOccurrence[];
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onSelect: (occ: ResolvedOccurrence) => void;
  onAddUnscheduled: () => void;
}

type Tab = "scheduled" | "unscheduled";

function Row({
  occ,
  onToggleDone,
  onSelect,
}: {
  occ: ResolvedOccurrence;
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onSelect: (occ: ResolvedOccurrence) => void;
}) {
  const hourly = isHourly(occ.task.recurrence);
  const done = occ.completed;
  return (
    <li>
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
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "truncate text-sm",
                done && "text-muted-foreground line-through",
              )}
            >
              {occ.task.title}
            </span>
            {occ.hasDescription && (
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            {occ.hasSubtasks && (
              <ListChecks className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </span>
          {occ.scheduled && (
            <span className="truncate text-[11px] text-muted-foreground">
              {minutesToTime(occ.startMinute)}
              {occ.openEnded
                ? " · em aberto"
                : ` – ${minutesToTime(occ.endMinute)}`}
              {hourly && " · a cada hora"}
            </span>
          )}
        </button>

        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: occ.task.color }}
        />
      </div>
    </li>
  );
}

export function TaskList({
  scheduled,
  unscheduled,
  onToggleDone,
  onSelect,
  onAddUnscheduled,
}: TaskListProps) {
  const [tab, setTab] = useState<Tab>("scheduled");
  const rows = tab === "scheduled" ? scheduled : unscheduled;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
        <ListTodo className="h-4 w-4" />
        Tarefas do dia
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b p-1">
        {(
          [
            { id: "scheduled" as const, label: "Com horário", count: scheduled.length },
            { id: "unscheduled" as const, label: "Sem horário", count: unscheduled.length },
          ]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
              tab === t.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {t.label}
            <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {tab === "scheduled"
              ? "Nenhuma tarefa com horário neste dia."
              : "Nenhuma tarefa sem horário."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((occ) => (
              <Row
                key={occ.key}
                occ={occ}
                onToggleDone={onToggleDone}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>

      {tab === "unscheduled" && (
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={onAddUnscheduled}
          >
            <Plus className="mr-1 h-4 w-4" /> Nova tarefa sem horário
          </Button>
        </div>
      )}
    </div>
  );
}
