"use client";

import { useMemo } from "react";
import { Flame, Trophy, Target } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { OccurrenceState, Task } from "@/types";
import { habitStats, type HistoryCell } from "@/lib/habits";
import { dayFromKey } from "@/lib/time";
import { rgba } from "@/lib/colors";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<HistoryCell["status"], string> = {
  done: "Feita",
  partial: "Parcial",
  skipped: "Pulada",
  missed: "Não feita",
  pending: "Pendente",
  future: "Futura",
  none: "Sem ocorrência",
};

export function HeatmapCell({ cell, color, size = "h-3 w-3" }: { cell: HistoryCell; color: string; size?: string }) {
  const style: React.CSSProperties = {};
  let cls = "";
  switch (cell.status) {
    case "done":
      style.backgroundColor = color;
      break;
    case "partial":
      style.backgroundColor = rgba(color, 0.2 + cell.ratio * 0.5);
      break;
    case "skipped":
      cls = "bg-amber-400/40";
      break;
    case "missed":
      cls = "bg-red-500/15 ring-1 ring-inset ring-red-500/40";
      break;
    case "pending":
      style.boxShadow = `inset 0 0 0 1.5px ${color}`;
      break;
    case "future":
      cls = "bg-muted/50";
      break;
    case "none":
      cls = "bg-muted/30";
      break;
  }

  return (
    <span
      className={cn("block rounded-[3px]", size, cls)}
      style={style}
      title={`${format(dayFromKey(cell.date), "EEE, d MMM", { locale: ptBR })} · ${STATUS_LABEL[cell.status]}`}
    />
  );
}

/** Weekday-aligned grid (columns = weeks, rows = Mon..Sun). */
export function Heatmap({ cells, color, size }: { cells: HistoryCell[]; color: string; size?: string }) {
  const pad = cells.length ? (dayFromKey(cells[0].date).getDay() + 6) % 7 : 0;
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridAutoColumns: "min-content" }}>
      {Array.from({ length: pad }, (_, i) => (
        <span key={`pad-${i}`} />
      ))}
      {cells.map((c) => (
        <HeatmapCell key={c.date} cell={c} color={color} size={size} />
      ))}
    </div>
  );
}

export function TaskHistory({
  task,
  tasks,
  occurrences,
  todayKey,
}: {
  task: Task;
  tasks: Task[];
  occurrences: Record<string, OccurrenceState>;
  todayKey: string;
}) {
  const stats = useMemo(() => habitStats(task, tasks, occurrences, todayKey, 84), [task, tasks, occurrences, todayKey]);

  return (
    <section className="space-y-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Histórico</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Flame className="h-3.5 w-3.5 text-orange-500" />} label="Sequência" value={`${stats.streak}`} />
        <Stat icon={<Trophy className="h-3.5 w-3.5 text-amber-500" />} label="Melhor" value={`${stats.best}`} />
        <Stat
          icon={<Target className="h-3.5 w-3.5 text-emerald-500" />}
          label="30 dias"
          value={stats.rate30 === null ? "—" : `${Math.round(stats.rate30 * 100)}%`}
        />
      </div>
      <div className="overflow-x-auto pb-1">
        <Heatmap cells={stats.cells} color={task.color} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <Legend className="" style={{ backgroundColor: task.color }} label="feita" />
        <Legend className="bg-amber-400/40" label="pulada" />
        <Legend className="bg-red-500/15 ring-1 ring-inset ring-red-500/40" label="não feita" />
        <Legend className="bg-muted/30" label="sem ocorrência" />
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Legend({ className, style, label }: { className: string; style?: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("h-2.5 w-2.5 rounded-[3px]", className)} style={style} />
      {label}
    </span>
  );
}
