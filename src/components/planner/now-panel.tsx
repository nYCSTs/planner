"use client";

import { CheckCircle2, PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { minutesToTime } from "@/lib/time";
import type { ActiveState } from "@/lib/active";

interface NowPanelProps {
  state: ActiveState;
  isToday: boolean;
  onFinish: (taskId: string) => void;
}

export function NowPanel({ state, isToday, onFinish }: NowPanelProps) {
  const { active, paused } = state;

  if (!isToday) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Visualizando outro dia. O painel “Agora” acompanha o dia atual.
      </div>
    );
  }

  if (!active) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Nada em andamento agora.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <PlayCircle className="h-4 w-4 text-emerald-500" />
        Agora
      </div>

      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: active.task.color }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{active.task.title}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {minutesToTime(active.startMinute)}
            {active.openEnded
              ? " · em aberto"
              : ` – ${minutesToTime(active.endMinute)}`}
          </p>
        </div>
        {active.openEnded && (
          <Button size="sm" variant="outline" onClick={() => onFinish(active.task.id)}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> Finalizar
          </Button>
        )}
      </div>

      {paused && (
        <div className="flex items-center gap-3 rounded-md bg-muted/50 p-2.5">
          <PauseCircle className="h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="text-muted-foreground">Pausado: </span>
              {paused.task.title}
            </p>
            <p className="text-xs text-muted-foreground">
              Retoma quando “{active.task.title}” terminar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
