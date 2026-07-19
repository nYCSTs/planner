"use client";

import { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  ListChecks,
  ListTodo,
  Repeat,
  Search,
  Timer,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { minutesToTime, isHourly } from "@/lib/time";
import { cn, normalizeUrl } from "@/lib/utils";
import { rgba } from "@/lib/colors";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority";
import type { Priority, RecurrenceKind, ResolvedOccurrence, Tag } from "@/types";

const RECURRENCE_SHORT: Record<RecurrenceKind, string> = {
  once: "",
  everyday: "Todos os dias",
  weekdays: "Dias úteis",
  weekends: "Fim de semana",
  custom: "Dias específicos",
};

interface TaskListProps {
  scheduled: ResolvedOccurrence[];
  unscheduled: ResolvedOccurrence[];
  completions: Record<string, number>;
  tags: Tag[];
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onSelect: (occ: ResolvedOccurrence) => void;
}

type Tab = "scheduled" | "unscheduled";
type StatusFilter = "all" | "pending" | "done";

/** Formats a minute total as "Xh Ym" / "Ym". */
function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Ring-style progress meter for the day summary. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative grid h-12 w-12 place-items-center">
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
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset] duration-500",
            pct === 100 ? "stroke-green-500" : "stroke-primary",
          )}
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums">{pct}%</span>
    </div>
  );
}

function DaySummary({
  scheduled,
  unscheduled,
}: {
  scheduled: ResolvedOccurrence[];
  unscheduled: ResolvedOccurrence[];
}) {
  const all = [...scheduled, ...unscheduled];
  // Count real commitments (exclude skipped from "total to do").
  const actionable = all.filter((o) => !o.skipped);
  const done = actionable.filter((o) => o.completed).length;
  const total = actionable.length;

  // Planned vs tracked minutes over scheduled, closed-interval occurrences.
  let planned = 0;
  let tracked = 0;
  for (const o of scheduled) {
    if (o.skipped) continue;
    const dur = Math.max(0, o.endMinute - o.startMinute);
    if (o.task.tracked) tracked += dur;
    else if (!o.openEnded) planned += dur;
  }

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
              ? "Nada planejado para hoje"
              : done === total
              ? "Tudo concluído! 🎉"
              : `${total - done} pendente${total - done === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
      {(planned > 0 || tracked > 0) && (
        <div className="mt-2.5 flex gap-2">
          {planned > 0 && (
            <div className="flex flex-1 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[10px] leading-none text-muted-foreground">Planejado</p>
                <p className="text-xs font-semibold tabular-nums">{formatMinutes(planned)}</p>
              </div>
            </div>
          )}
          {tracked > 0 && (
            <div className="flex flex-1 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5">
              <Timer className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[10px] leading-none text-muted-foreground">Registrado</p>
                <p className="text-xs font-semibold tabular-nums">{formatMinutes(tracked)}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  occ,
  tags,
  onToggleDone,
  onSelect,
}: {
  occ: ResolvedOccurrence;
  tags: Tag[];
  onToggleDone: (occ: ResolvedOccurrence) => void;
  onSelect: (occ: ResolvedOccurrence) => void;
}) {
  const hourly = isHourly(occ.task.recurrence);
  const done = occ.completed;
  const skipped = occ.skipped;
  const priority = occ.task.priority ? PRIORITY_META[occ.task.priority] : null;
  const occTags = (occ.task.tags ?? []).map((id) => tags.find((t) => t.id === id)).filter(Boolean) as Tag[];
  const taskLink = occ.task.link ? normalizeUrl(occ.task.link) : null;
  // Emphasize pending unscheduled tasks: they have no place on the timeline, so
  // the list is where they must catch the eye. A left accent bar (colored by
  // priority when set, else the task color) + a faint tint lifts them.
  const emphasize = !occ.scheduled && !done && !skipped;
  const accent = priority?.dotHex ?? occ.task.color;

  return (
    <li>
      <div
        className={cn(
          "group relative flex items-start gap-2.5 rounded-lg py-1.5 pr-2 transition-colors hover:bg-accent/60",
          emphasize ? "pl-3" : "pl-2",
        )}
      >
        {emphasize && (
          <span
            className="absolute inset-y-1 left-0 w-1 rounded-full"
            style={{ backgroundColor: accent }}
          />
        )}
        {occ.task.tracked ? (
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ backgroundColor: rgba(occ.task.color, 0.2) }} title="Registro de tempo">
            <Timer className="h-3 w-3" style={{ color: occ.task.color }} />
          </span>
        ) : (
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
        )}

        <button
          type="button"
          onClick={() => onSelect(occ)}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
        >
          <span className="flex items-center gap-1.5">
            {priority && !done && !skipped && (
              <span className={cn("shrink-0", priority.flag)} title={`Prioridade ${priority.label}`}>
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
              </span>
            )}
            <span
              className={cn(
                "truncate text-sm",
                emphasize && "font-medium",
                (done || skipped) && "text-muted-foreground line-through",
              )}
            >
              {occ.task.title}
            </span>
            {skipped && (
              <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                Pulada
              </span>
            )}
            {occ.hasDescription && <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />}
            {occ.hasSubtasks && <ListChecks className="h-3 w-3 shrink-0 text-muted-foreground" />}
          </span>

          {occ.scheduled ? (
            <span className="truncate text-[11px] text-muted-foreground">
              {minutesToTime(occ.startMinute)}
              {occ.openEnded ? " · em aberto" : ` – ${minutesToTime(occ.endMinute)}`}
              {hourly && " · a cada hora"}
            </span>
          ) : (
            occ.task.recurrence.kind !== "once" && (
              <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <Repeat className="h-3 w-3 shrink-0" />
                {RECURRENCE_SHORT[occ.task.recurrence.kind]}
              </span>
            )
          )}

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

        {taskLink && (
          <a
            href={taskLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
            title="Abrir link em nova aba"
            aria-label="Abrir link em nova aba"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}

        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: occ.task.color }}
        />
      </div>
    </li>
  );
}

export function TaskList({
  scheduled,
  unscheduled,
  completions,
  tags,
  onToggleDone,
  onSelect,
}: TaskListProps) {
  // Default to the "Sem horário" lane: those tasks have no place on the
  // timeline next to it, so the list is their primary home. Scheduled tasks
  // already have the full timeline view.
  const [tab, setTab] = useState<Tab>("unscheduled");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Which tags actually appear on today's tasks (for the filter row).
  const usedTagIds = useMemo(() => {
    const s = new Set<string>();
    for (const o of [...scheduled, ...unscheduled]) {
      for (const id of o.task.tags ?? []) s.add(id);
    }
    return s;
  }, [scheduled, unscheduled]);
  const usableTags = tags.filter((t) => usedTagIds.has(t.id));

  const matches = (o: ResolvedOccurrence) => {
    if (query && !o.task.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (status === "pending" && (o.completed || o.skipped)) return false;
    if (status === "done" && !o.completed) return false;
    if (priorityFilter && o.task.priority !== priorityFilter) return false;
    if (tagFilter && !(o.task.tags ?? []).includes(tagFilter)) return false;
    return true;
  };

  const filteredScheduled = scheduled.filter(matches);

  // Pending first (by priority), then done (most recent first).
  const sortedUnscheduled = [...unscheduled].filter(matches).sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    if (!a.completed) {
      const pa = PRIORITY_ORDER[a.task.priority ?? "low"];
      const pb = PRIORITY_ORDER[b.task.priority ?? "low"];
      return pa - pb;
    }
    return (completions[b.key] ?? 0) - (completions[a.key] ?? 0);
  });

  const rows = tab === "scheduled" ? filteredScheduled : sortedUnscheduled;
  const hasActiveFilter = status !== "all" || priorityFilter !== null || tagFilter !== null || query !== "";

  const pendingUnscheduled = unscheduled.filter((o) => !o.completed && !o.skipped).length;
  const pendingScheduled = scheduled.filter((o) => !o.completed && !o.skipped).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-3 text-sm font-semibold">
        <ListTodo className="h-4 w-4" />
        Tarefas do dia
      </div>

      <DaySummary scheduled={scheduled} unscheduled={unscheduled} />

      {/* Search + filter toggle */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder="Buscar…"
            className="h-8 pl-8 text-sm"
            onChange={(e) => setQuery(e.target.value)}
          />
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

      {/* Filter panel */}
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
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriorityFilter(on ? null : p)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition",
                    on ? "border-transparent" : "hover:bg-accent",
                    on && m.chip,
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
                  {m.label}
                </button>
              );
            })}
          </div>
          {usableTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {usableTags.map((t) => {
                const on = tagFilter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTagFilter(on ? null : t.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition",
                      on ? "border-transparent" : "hover:bg-accent",
                    )}
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

      {/* Tabs — "Sem horário" first (the list's primary lane). Each tab shows
          its pending count in amber to keep open work visible; falls back to a
          muted total when nothing is pending. */}
      <div className="flex gap-1 px-2 pb-1 pt-2.5">
        {(
          [
            { id: "unscheduled" as const, label: "Sem horário", total: unscheduled.length, pending: pendingUnscheduled },
            { id: "scheduled" as const, label: "Com horário", total: scheduled.length, pending: pendingScheduled },
          ]
        ).map((t) => (
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
              <Row key={occ.key} occ={occ} tags={tags} onToggleDone={onToggleDone} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
