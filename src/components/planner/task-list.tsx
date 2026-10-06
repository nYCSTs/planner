"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  GripVertical,
  ListChecks,
  Play,
  Plus,
  Repeat,
  Search,
  Timer,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { dateKey, formatMinutes, minutesToTime } from "@/lib/time";
import { cn, normalizeUrl } from "@/lib/utils";
import { rgba } from "@/lib/colors";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority";
import { describeRecurrence, isHourly } from "@/lib/recurrence";
import { isBacklog } from "@/lib/occurrences";
import type { DayEntry } from "@/lib/entries";
import { createTask } from "@/lib/store/actions";
import { randomColor } from "@/lib/colors";
import type { Priority, Project, ResolvedOccurrence, Tag } from "@/types";
import { DRAG_TASK_MIME } from "./timeline";

interface TaskListProps {
  day: Date;
  now: Date;
  scheduled: ResolvedOccurrence[];
  unscheduled: ResolvedOccurrence[];
  entries: DayEntry[];
  tags: Tag[];
  projectsById: Record<string, Project>;
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onSelect: (occ: ResolvedOccurrence) => void;
  onStartTimer: (occ: ResolvedOccurrence) => void;
  onAdded?: (title: string) => void;
}

type Tab = "scheduled" | "unscheduled";

function liveProject(id: string | undefined, byId: Record<string, Project>): Project | undefined {
  const p = id ? byId[id] : undefined;
  return p && !p.deletedAt ? p : undefined;
}
type StatusFilter = "all" | "pending" | "done";

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-12 w-12 shrink-0 place-items-center">
      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className={cn("transition-[stroke-dashoffset] duration-500", pct === 100 ? "stroke-green-500" : "stroke-primary")}
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums">{pct}%</span>
    </div>
  );
}

function DaySummary({ all, entries }: { all: ResolvedOccurrence[]; entries: DayEntry[] }) {
  const actionable = all.filter((o) => !o.skipped);
  const done = actionable.filter((o) => o.completed).length;
  const total = actionable.length;

  let planned = 0;
  for (const o of all) {
    if (o.scheduled && !o.skipped && !o.openEnded) {
      planned += o.endMinute - o.startMinute;
    }
  }

  const tracked = entries.reduce((sum, e) => sum + (e.endMinute - e.startMinute), 0);

  return (
    <div className="border-b px-3 py-3">
      <div className="flex items-center gap-3">
        <ProgressRing done={done} total={total} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {done} de {total} {total === 1 ? "tarefa" : "tarefas"}
          </p>
          <p className="text-xs text-muted-foreground">
            {total === 0
              ? "Nada planejado"
              : done === total
                ? "Tudo concluído!"
                : `${total - done} pendente${total - done === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
      {(planned > 0 || tracked > 0) && (
        <div className="mt-2.5 flex gap-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[10px] leading-none text-muted-foreground">Planejado</p>
              <p className="text-xs font-semibold tabular-nums">{formatMinutes(planned)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[10px] leading-none text-muted-foreground">Registrado</p>
              <p className="text-xs font-semibold tabular-nums">{formatMinutes(tracked)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  occ,
  tags,
  project,
  onToggleDone,
  onSelect,
  onStartTimer,
}: {
  occ: ResolvedOccurrence;
  tags: Tag[];
  project?: Project;
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onSelect: (occ: ResolvedOccurrence) => void;
  onStartTimer: (occ: ResolvedOccurrence) => void;
}) {
  const done = occ.completed;
  const skipped = occ.skipped;
  const priority = occ.task.priority ? PRIORITY_META[occ.task.priority] : null;
  const occTags = (occ.task.tags ?? []).map((id) => tags.find((t) => t.id === id)).filter(Boolean) as Tag[];
  const taskLink = occ.task.link ? normalizeUrl(occ.task.link) : null;
  const emphasize = !occ.scheduled && !done && !skipped;
  const accent = priority?.dotHex ?? occ.task.color;
  const draggable = isBacklog(occ.task) && !done && !skipped;

  return (
    <li>
      <div
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TASK_MIME, occ.task.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        className={cn(
          "group relative flex items-start gap-2.5 rounded-lg py-1.5 pr-2 transition-colors hover:bg-accent/60",
          emphasize ? "pl-3" : "pl-2",
          draggable && "cursor-grab active:cursor-grabbing",
        )}
      >
        {emphasize && <span className="absolute inset-y-1 left-0 w-1 rounded-full" style={{ backgroundColor: accent }} />}
        {draggable && (
          <GripVertical className="absolute left-0.5 top-2 hidden h-3.5 w-3.5 text-muted-foreground/60 group-hover:block" />
        )}
        <button
          type="button"
          aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
          onClick={() => onToggleDone(occ)}
          className={cn(
            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-white transition",
            done ? "border-transparent" : "hover:bg-accent",
          )}
          style={done ? { backgroundColor: occ.task.color } : { borderColor: occ.task.color }}
        >
          {done && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>

        <button type="button" onClick={() => onSelect(occ)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
          <span className="flex items-center gap-1.5">
            {priority && !done && !skipped && (
              <span className={cn("shrink-0", priority.flag)} title={`Prioridade ${priority.label}`}>
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" x2="4" y1="22" y2="15" />
                </svg>
              </span>
            )}
            <span className={cn("truncate text-sm", emphasize && "font-medium", (done || skipped) && "text-muted-foreground line-through")}>
              {occ.title}
            </span>
            {skipped && (
              <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                Pulada
              </span>
            )}
            {occ.overdue && !done && (
              <span className="shrink-0 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                Atrasada
              </span>
            )}
            {occ.hasDescription && <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />}
            {occ.hasSubtasks && <ListChecks className="h-3 w-3 shrink-0 text-muted-foreground" />}
          </span>

          <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            {occ.scheduled ? (
              <span className="tabular-nums">
                {minutesToTime(occ.startMinute)}
                {occ.openEnded ? " · em aberto" : `–${minutesToTime(occ.endMinute)}`}
                {isHourly(occ.task.recurrence) && occ.slot !== undefined && " · sessão"}
              </span>
            ) : occ.task.recurrence.kind !== "once" ? (
              <span className="flex items-center gap-1">
                <Repeat className="h-3 w-3 shrink-0" />
                {describeRecurrence(occ.task.recurrence)}
              </span>
            ) : occ.task.date ? (
              <span>Prazo {occ.task.date.split("-").reverse().slice(0, 2).join("/")}</span>
            ) : null}
            {project && (
              <span className="flex min-w-0 items-center gap-1">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                <span className="truncate">{project.name}</span>
              </span>
            )}
          </span>

          {occTags.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {occTags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
                  style={{ backgroundColor: rgba(t.color, 0.16), color: t.color }}
                >
                  {t.label}
                </span>
              ))}
            </span>
          )}
        </button>

        <span className="mt-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
          {taskLink && (
            <a
              href={taskLink}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Abrir link"
              aria-label="Abrir link"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {!done && !skipped && (
            <button
              type="button"
              onClick={() => onStartTimer(occ)}
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Iniciar cronômetro"
              aria-label="Iniciar cronômetro"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

function QuickAdd({ day, now, onAdded }: { day: Date; now: Date; onAdded?: (title: string) => void }) {
  const [value, setValue] = useState("");
  const dk = dateKey(day);
  const todayKey = dateKey(now);
  if (dk < todayKey) {
    return null;
  }

  const submit = () => {
    const title = value.trim();
    if (!title) {
      return;
    }

    createTask({
      title,
      color: randomColor(),
      startMinute: null,
      endMinute: null,
      recurrence: { kind: "once" },
      date: dk === todayKey ? undefined : dk,
    });
    setValue("");
    onAdded?.(title);
  };

  return (
    <div className="relative px-2 pb-1">
      <Plus className="pointer-events-none absolute left-4.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        placeholder={dk === todayKey ? "Adicionar tarefa…" : "Adicionar para este dia…"}
        className="h-8 border-dashed pl-8 text-sm"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
    </div>
  );
}

export function TaskList({
  day,
  now,
  scheduled,
  unscheduled,
  entries,
  tags,
  projectsById,
  onToggleDone,
  onSelect,
  onStartTimer,
  onAdded,
}: TaskListProps) {
  const [tab, setTab] = useState<Tab>("unscheduled");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const all = useMemo(() => [...scheduled, ...unscheduled], [scheduled, unscheduled]);
  const usedTags = useMemo(() => {
    const s = new Set(all.flatMap((o) => o.task.tags ?? []));
    return tags.filter((t) => s.has(t.id));
  }, [all, tags]);
  const usedProjects = useMemo(() => {
    const s = new Set(all.map((o) => o.task.projectId).filter(Boolean) as string[]);
    return [...s].map((id) => projectsById[id]).filter((p) => p && !p.deletedAt);
  }, [all, projectsById]);

  const matches = (o: ResolvedOccurrence) => {
    if (query && !o.title.toLowerCase().includes(query.toLowerCase())) {
      return false;
    }

    if (status === "pending" && (o.completed || o.skipped)) {
      return false;
    }

    if (status === "done" && !o.completed) {
      return false;
    }

    if (priorityFilter && o.task.priority !== priorityFilter) {
      return false;
    }

    if (tagFilter && !(o.task.tags ?? []).includes(tagFilter)) {
      return false;
    }

    return !(projectFilter && o.task.projectId !== projectFilter);
  };

  const sortedUnscheduled = unscheduled.filter(matches).sort((a, b) => {
    const da = a.completed || a.skipped;
    const db = b.completed || b.skipped;
    if (da !== db) {
      return Number(da) - Number(db);
    }

    if (!da) {
      if (a.overdue !== b.overdue) {
        return Number(b.overdue) - Number(a.overdue);
      }

      return PRIORITY_ORDER[a.task.priority ?? "low"] - PRIORITY_ORDER[b.task.priority ?? "low"];
    }

    return (b.doneAt ?? 0) - (a.doneAt ?? 0);
  });

  const rows = tab === "scheduled" ? scheduled.filter(matches) : sortedUnscheduled;
  const hasActiveFilter = status !== "all" || priorityFilter !== null || tagFilter !== null || projectFilter !== null || query !== "";
  const pendingUnscheduled = unscheduled.filter((o) => !o.completed && !o.skipped).length;
  const pendingScheduled = scheduled.filter((o) => !o.completed && !o.skipped).length;
  const overdueCount = unscheduled.filter((o) => o.overdue && !o.completed).length;

  const chip = (on: boolean) =>
    cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition", on ? "border-transparent" : "hover:bg-accent");

  return (
    <div className="flex h-full flex-col">
      <DaySummary all={all} entries={entries} />

      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} placeholder="Filtrar…" className="h-8 pl-8 text-sm" onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={cn(
            "relative grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition",
            showFilters || hasActiveFilter ? "border-primary bg-accent" : "hover:bg-accent",
          )}
          aria-label="Filtros"
        >
          <Filter className="h-4 w-4" />
          {hasActiveFilter && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />}
        </button>
      </div>

      {showFilters && (
        <div className="space-y-2 px-3 pt-2.5">
          <div className="flex flex-wrap gap-1">
            {([
              { id: "all", label: "Todas" },
              { id: "pending", label: "Pendentes" },
              { id: "done", label: "Concluídas" },
            ] as const).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatus(s.id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
                  status === s.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["high", "medium", "low"] as Priority[]).map((p) => {
              const m = PRIORITY_META[p];
              const on = priorityFilter === p;
              return (
                <button key={p} type="button" onClick={() => setPriorityFilter(on ? null : p)} className={cn(chip(on), on && m.chip)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
                  {m.label}
                </button>
              );
            })}
          </div>
          {usedProjects.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {usedProjects.map((p) => {
                const on = projectFilter === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProjectFilter(on ? null : p.id)}
                    className={chip(on)}
                    style={on ? { backgroundColor: rgba(p.color, 0.16), color: p.color } : undefined}
                  >
                    <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
          {usedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {usedTags.map((t) => {
                const on = tagFilter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTagFilter(on ? null : t.id)}
                    className={chip(on)}
                    style={on ? { backgroundColor: rgba(t.color, 0.16), color: t.color } : undefined}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 px-2 pb-1 pt-2.5">
        {[
          { id: "unscheduled" as const, label: "Sem horário", total: unscheduled.length, pending: pendingUnscheduled },
          { id: "scheduled" as const, label: "Com horário", total: scheduled.length, pending: pendingScheduled },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition",
              tab === t.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {t.label}
            {t.pending > 0 ? (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold tabular-nums text-white">
                {t.pending}
              </span>
            ) : (
              <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{t.total}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "unscheduled" && <QuickAdd day={day} now={now} onAdded={onAdded} />}

      {tab === "unscheduled" && overdueCount > 0 && (
        <p className="mx-3 mb-1 flex items-center gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5" /> {overdueCount} com prazo vencido
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {hasActiveFilter
                ? "Nenhuma tarefa corresponde aos filtros."
                : tab === "scheduled"
                  ? "Nenhuma tarefa com horário neste dia."
                  : "Nenhuma tarefa sem horário."}
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((occ) => (
              <Row
                key={occ.key}
                occ={occ}
                tags={tags}
                project={liveProject(occ.task.projectId, projectsById)}
                onToggleDone={onToggleDone}
                onSelect={onSelect}
                onStartTimer={onStartTimer}
              />
            ))}
          </ul>
        )}
        {tab === "unscheduled" && rows.some((o) => isBacklog(o.task) && !o.completed) && (
          <p className="px-2 pt-3 text-center text-[11px] text-muted-foreground/70 max-md:hidden">
            Arraste uma tarefa para a timeline para reservar um horário.
          </p>
        )}
      </div>
    </div>
  );
}
