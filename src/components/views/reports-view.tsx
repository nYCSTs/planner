"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Play, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dateKey, dayFromKey, formatMinutes } from "@/lib/time";
import { entryColor, entryDuration } from "@/lib/entries";
import { buildReport, entriesCsv, type DayBucket, type Group, type GroupBy } from "@/lib/reports";
import { continueEntry } from "@/lib/store/actions";
import {
  useEntries,
  useOccurrenceStates,
  useProjectsById,
  useTagsById,
  useTasks,
  useTasksById,
} from "@/lib/store/hooks";
import { useNowMs } from "@/hooks/use-now";
import { useUI } from "@/components/app/ui-context";
import type { TimeEntry } from "@/types";

type Mode = "week" | "month" | "custom";

const fmtH = (ms: number) => formatMinutes(ms / 60_000);

function niceMaxHours(maxH: number): { max: number; step: number } {
  for (const step of [0.5, 1, 2, 3, 4, 6, 8, 12]) {
    if (maxH / step <= 4) {
      return { max: Math.max(step, Math.ceil(maxH / step) * step), step };
    }
  }

  return { max: Math.ceil(maxH / 12) * 12, step: 12 };
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DayChart({ days, groups, compact }: { days: DayBucket[]; groups: Group[]; compact: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxH = Math.max(1, ...days.map((d) => Math.max(d.totalMs / 3_600_000, d.plannedMin / 60)));
  const { max, step } = niceMaxHours(maxH);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const height = 200;
  const pxPerH = height / max;
  const color = new Map(groups.map((g) => [g.key, g]));
  const showLabel = (i: number) => days.length <= 14 || i % 5 === 0 || i === days.length - 1;

  return (
    <div className="relative select-none pt-2">
      <div className="flex">
        <div className="relative w-10 shrink-0" style={{ height }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ bottom: t * pxPerH }}
            >
              {t}h
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border/60" style={{ bottom: t * pxPerH }} />
          ))}
          <div className="absolute inset-0 flex">
            {days.map((d, i) => {
              const segments = groups
                .map((g) => ({ g, ms: d.byGroup.get(g.key) ?? 0 }))
                .filter((s) => s.ms > 0);
              return (
                <div
                  key={d.date}
                  className="relative flex flex-1 justify-center"
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(i)}
                >
                  {hover === i && <div className="absolute inset-y-0 inset-x-0.5 rounded-md bg-muted/60" />}
                  <div className="relative flex h-full w-[min(24px,60%)] flex-col-reverse items-stretch">
                    {segments.map((s, si) => (
                      <div
                        key={s.g.key}
                        className={cn("w-full", si > 0 && "mb-[2px]", si === segments.length - 1 && "rounded-t-[4px]")}
                        style={{ height: Math.max(2, (s.ms / 3_600_000) * pxPerH - (si > 0 ? 2 : 0)), backgroundColor: color.get(s.g.key)?.color }}
                      />
                    ))}
                  </div>
                  {d.plannedMin > 0 && (
                    <div
                      className="absolute left-1/2 h-[2px] w-[min(100%,2rem)] -translate-x-1/2 rounded-full bg-foreground/70"
                      style={{ bottom: (d.plannedMin / 60) * pxPerH - 1 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {hover !== null && days[hover] && (
            <ChartTooltip day={days[hover]} groups={groups} left={((hover + 0.5) / days.length) * 100} />
          )}
        </div>
      </div>
      <div className="ml-10 flex">
        {days.map((d, i) => {
          const date = dayFromKey(d.date);
          return (
            <span key={d.date} className="flex-1 truncate pt-1 text-center text-[10px] text-muted-foreground">
              {showLabel(i) ? (compact ? format(date, "d") : format(date, "EEE d", { locale: ptBR })) : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ChartTooltip({ day, groups, left }: { day: DayBucket; groups: Group[]; left: number }) {
  const rows = groups.filter((g) => (day.byGroup.get(g.key) ?? 0) > 0).slice(0, 6);
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-48 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
      style={{ left: `clamp(6rem, ${left}%, calc(100% - 6rem))` }}
    >
      <p className="font-medium first-letter:uppercase">{format(dayFromKey(day.date), "EEEE, d MMM", { locale: ptBR })}</p>
      <p className="mt-0.5 flex justify-between text-muted-foreground">
        <span>Registrado</span>
        <span className="tabular-nums text-foreground">{fmtH(day.totalMs)}</span>
      </p>
      <p className="flex justify-between text-muted-foreground">
        <span>Planejado</span>
        <span className="tabular-nums text-foreground">{formatMinutes(day.plannedMin)}</span>
      </p>
      {rows.length > 0 && <div className="my-1.5 h-px bg-border" />}
      {rows.map((g) => (
        <p key={g.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} />
          <span className="min-w-0 flex-1 truncate">{g.label}</span>
          <span className="tabular-nums">{fmtH(day.byGroup.get(g.key) ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}

function Breakdown({ groups, totalMs }: { groups: Group[]; totalMs: number }) {
  const [open, setOpen] = useState<string | null>(null);
  if (groups.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum tempo registrado no período.</p>;
  }

  return (
    <ul className="divide-y">
      {groups.map((g) => {
        const pct = totalMs ? (g.ms / totalMs) * 100 : 0;
        return (
          <li key={g.key}>
            <button type="button" onClick={() => setOpen(open === g.key ? null : g.key)} className="flex w-full items-center gap-3 py-2 text-left">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{g.label}</span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color }} />
                </span>
              </span>
              <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">{fmtH(g.ms)}</span>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open === g.key && "rotate-180")} />
            </button>
            {open === g.key && (
              <ul className="mb-2 ml-5 space-y-0.5">
                {g.items.map((it) => (
                  <li key={it.label} className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">{it.label}</span>
                    <span className="tabular-nums">{fmtH(it.ms)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EntryLog({ entries, now }: { entries: TimeEntry[]; now: number }) {
  const ui = useUI();
  const tasksById = useTasksById();
  const projectsById = useProjectsById();
  const byDay = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      const k = dateKey(new Date(e.start));
      map.set(k, [...(map.get(k) ?? []), e]);
    }

    return [...map.entries()];
  }, [entries]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {byDay.map(([day, list]) => (
        <section key={day}>
          <p className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">
            <span className="first-letter:uppercase">{format(dayFromKey(day), "EEEE, d 'de' MMM", { locale: ptBR })}</span>
            <span className="tabular-nums">{fmtH(list.reduce((s, e) => s + entryDuration(e, now), 0))}</span>
          </p>
          <ul className="divide-y rounded-xl border">
            {list.map((e) => {
              const project = e.projectId ? projectsById[e.projectId] : undefined;
              return (
                <li key={e.id} className="group flex items-center gap-2.5 px-3 py-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entryColor(e, tasksById, projectsById) }} />
                  <button type="button" onClick={() => ui.openEntry({ entryId: e.id })} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm">{e.title || "Sem descrição"}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {format(new Date(e.start), "HH:mm")}–{e.end ? format(new Date(e.end), "HH:mm") : "agora"}
                      {project && !project.deletedAt && ` · ${project.name}`}
                    </span>
                  </button>
                  <span className="text-sm tabular-nums">{fmtH(entryDuration(e, now))}</span>
                  {e.end !== null && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 max-md:opacity-100"
                      onClick={() => {
                        continueEntry(e);
                        ui.toast(`Cronômetro iniciado: ${e.title || "Sem descrição"}`);
                      }}
                      aria-label="Continuar"
                      title="Continuar"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ReportsView({ now }: { now: Date }) {
  const ui = useUI();
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [custom, setCustom] = useState(() => ({ from: dateKey(addDays(new Date(), -13)), to: dateKey(new Date()) }));
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const nowMs = useNowMs(30_000);
  const tasks = useTasks();
  const tasksById = useTasksById();
  const occurrences = useOccurrenceStates();
  const entries = useEntries();
  const projectsById = useProjectsById();
  const tagsById = useTagsById();

  const range = useMemo(() => {
    if (mode === "week") {
      return { from: dateKey(startOfWeek(anchor, { weekStartsOn: 1 })), to: dateKey(endOfWeek(anchor, { weekStartsOn: 1 })) };
    }

    if (mode === "month") {
      return { from: dateKey(startOfMonth(anchor)), to: dateKey(endOfMonth(anchor)) };
    }

    return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
  }, [mode, anchor, custom]);

  const report = useMemo(
    () =>
      buildReport({
        from: range.from,
        to: range.to,
        groupBy,
        now: nowMs,
        tasks,
        tasksById,
        occurrences,
        entries,
        projectsById,
        tagsById,
      }),
    [range, groupBy, nowMs, tasks, tasksById, occurrences, entries, projectsById, tagsById],
  );

  const todayKey = dateKey(now);
  const elapsedDays = report.days.filter((d) => d.date <= todayKey).length || 1;
  const label =
    mode === "week"
      ? `${format(dayFromKey(range.from), "d MMM", { locale: ptBR })} – ${format(dayFromKey(range.to), "d MMM yyyy", { locale: ptBR })}`
      : mode === "month"
        ? format(anchor, "MMMM 'de' yyyy", { locale: ptBR })
        : "";

  const shift = (n: number) => setAnchor((a) => (mode === "week" ? addDays(a, 7 * n) : addMonths(a, n)));

  const exportCsv = () => {
    const blob = new Blob([entriesCsv(report.entries, nowMs, tasksById, projectsById, tagsById)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planner-tempo-${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const seg = (active: boolean) =>
    cn("rounded-md px-2.5 py-1 text-sm font-medium transition", active ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted/60 p-0.5">
            <button type="button" className={seg(mode === "week")} onClick={() => setMode("week")}>
              Semana
            </button>
            <button type="button" className={seg(mode === "month")} onClick={() => setMode("month")}>
              Mês
            </button>
            <button type="button" className={seg(mode === "custom")} onClick={() => setMode("custom")}>
              Período
            </button>
          </div>
          {mode === "custom" ? (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="h-8 w-38" />
              <span className="text-muted-foreground">–</span>
              <Input type="date" value={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="h-8 w-38" />
            </div>
          ) : (
            <div className="flex items-center">
              <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Período anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase">{label}</span>
              <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Próximo período">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="ml-auto flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => ui.openEntry({})}>
              <Timer className="h-3.5 w-3.5" /> Lançar tempo
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={report.entries.length === 0}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Total registrado" value={fmtH(report.totalMs)} />
          <StatTile label="Média por dia" value={fmtH(report.totalMs / elapsedDays)} hint={`em ${elapsedDays} dia${elapsedDays > 1 ? "s" : ""}`} />
          <StatTile label="Planejado" value={formatMinutes(report.plannedMin)} hint="tarefas com horário" />
          <StatTile
            label="Tarefas concluídas"
            value={report.actionable ? `${Math.round((report.done / report.actionable) * 100)}%` : "—"}
            hint={`${report.done} de ${report.actionable}`}
          />
        </div>

        <section className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Tempo por dia</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {report.groups.slice(0, 6).map((g) => (
                <span key={g.key} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: g.color }} />
                  {g.label}
                </span>
              ))}
              {report.groups.length > 6 && <span>+{report.groups.length - 6}</span>}
              <span className="flex items-center gap-1">
                <span className="h-[2px] w-3 rounded-full bg-foreground/70" /> Planejado
              </span>
            </div>
          </div>
          <DayChart days={report.days} groups={report.groups} compact={report.days.length > 10} />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Distribuição</h2>
              <div className="flex rounded-lg bg-muted/60 p-0.5 text-xs">
                {([
                  ["project", "Projeto"],
                  ["tag", "Etiqueta"],
                  ["task", "Descrição"],
                ] as const).map(([id, l]) => (
                  <button key={id} type="button" className={cn(seg(groupBy === id), "px-2 py-0.5 text-xs")} onClick={() => setGroupBy(id)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <Breakdown groups={report.groups} totalMs={report.totalMs} />
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Planejado × registrado por tarefa</h2>
            {report.comparisons.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem tarefas com horário ou tempo registrado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1 font-normal">Tarefa</th>
                    <th className="pb-1 text-right font-normal">Planejado</th>
                    <th className="pb-1 text-right font-normal">Registrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.comparisons.slice(0, 12).map((c) => {
                    const trackedMin = c.trackedMs / 60_000;
                    const over = c.plannedMin > 0 && trackedMin > c.plannedMin * 1.1;
                    return (
                      <tr key={c.task.id}>
                        <td className="max-w-0 py-1.5">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.task.color }} />
                            <span className="truncate">{c.task.title}</span>
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{c.plannedMin ? formatMinutes(c.plannedMin) : "—"}</td>
                        <td className={cn("py-1.5 text-right tabular-nums", over && "text-amber-600 dark:text-amber-400")}>
                          {c.trackedMs ? fmtH(c.trackedMs) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Registros</h2>
          <EntryLog entries={report.entries} now={nowMs} />
          {report.entries.length === 0 && (
            <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              Use a barra &quot;O que você está fazendo?&quot; ou o ▶ de uma tarefa para registrar tempo.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
