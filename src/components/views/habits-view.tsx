"use client";

import { useMemo, useState } from "react";
import { Check, Flame, Repeat, Target, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { dateKey, dayFromKey } from "@/lib/time";
import { describeRecurrence, isRecurring } from "@/lib/recurrence";
import { habitStats, seriesOf, type HabitStats } from "@/lib/habits";
import { nextOccurrenceDate, resolveDay } from "@/lib/occurrences";
import { useIsMobile } from "@/hooks/use-media-query";
import { useOccurrenceStates, useTasks } from "@/lib/store/hooks";
import { Heatmap } from "@/components/planner/task-history";
import { useUI } from "@/components/app/ui-context";
import { useOccurrenceHandlers } from "@/components/app/use-handlers";
import type { ResolvedOccurrence, Task } from "@/types";

interface Habit {
  task: Task;
  stats: HabitStats;
  today: ResolvedOccurrence[];
  active: boolean;
}

export function HabitsView({ now }: { now: Date }) {
  const ui = useUI();
  const tasks = useTasks();
  const occurrences = useOccurrenceStates();
  const handlers = useOccurrenceHandlers();
  const isMobile = useIsMobile();
  const [showEnded, setShowEnded] = useState(false);
  const todayKey = dateKey(now);
  const weeks = isMobile ? 15 : 26;

  const habits = useMemo<Habit[]>(() => {
    // Split series show once, under their newest part.
    const newest = new Map<string, Task>();
    for (const t of tasks) {
      if (!isRecurring(t)) {
        continue;
      }

      const root = t.seriesId ?? t.id;
      const cur = newest.get(root);
      if (!cur || (t.recurrence.startDate ?? "") > (cur.recurrence.startDate ?? "")) {
        newest.set(root, t);
      }
    }

    return [...newest.values()]
      .map((task) => {
        const today = resolveDay({ tasks: seriesOf(task, tasks), occurrences, day: dayFromKey(todayKey), now: dayFromKey(todayKey) });
        const active = !task.recurrence.endDate || task.recurrence.endDate >= todayKey;
        return { task, stats: habitStats(task, tasks, occurrences, todayKey, weeks * 7), today, active };
      })
      .sort((a, b) => {
        const pa = a.today.some((o) => !o.completed && !o.skipped) ? 0 : a.today.length ? 1 : 2;
        const pb = b.today.some((o) => !o.completed && !o.skipped) ? 0 : b.today.length ? 1 : 2;
        return pa - pb || b.stats.streak - a.stats.streak || a.task.title.localeCompare(b.task.title, "pt-BR");
      });
  }, [tasks, occurrences, todayKey, weeks]);

  const active = habits.filter((h) => h.active);
  const ended = habits.filter((h) => !h.active);
  const todayAll = active.flatMap((h) => h.today).filter((o) => !o.skipped);
  const todayDone = todayAll.filter((o) => o.completed).length;

  const open = (h: Habit) => {
    const first = h.today[0];
    if (first) {
      ui.openDetail(first);
      return;
    }

    const date = nextOccurrenceDate(h.task, todayKey, occurrences);
    const occ = resolveDay({ tasks: [h.task], occurrences, day: dayFromKey(date), now: dayFromKey(todayKey) })[0];
    if (occ) {
      ui.openDetail(occ);
    }
  };

  const card = (h: Habit) => {
    const pending = h.today.filter((o) => !o.completed && !o.skipped);
    const done = h.today.length > 0 && pending.length === 0;
    return (
      <li key={h.task.id} className={cn("rounded-xl border bg-card p-3", !h.active && "opacity-70")}>
        <div className="flex items-start gap-3">
          {h.today.length > 0 && h.active ? (
            <button
              type="button"
              aria-label={done ? "Feito hoje" : "Marcar como feito hoje"}
              onClick={() => (pending[0] ? handlers.toggle(pending[0]) : handlers.toggle(h.today[0]))}
              className={cn(
                "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-white transition",
                !done && "hover:bg-accent",
              )}
              style={done ? { backgroundColor: h.task.color, borderColor: h.task.color } : { borderColor: h.task.color }}
            >
              {done && <Check className="h-4 w-4" strokeWidth={3} />}
            </button>
          ) : (
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Repeat className="h-3.5 w-3.5" />
            </span>
          )}
          <button type="button" onClick={() => open(h)} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-semibold">{h.task.title}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {describeRecurrence(h.task.recurrence)}
              {h.today.length > 1 && ` · hoje ${h.today.filter((o) => o.completed).length}/${h.today.length}`}
              {!h.active && " · encerrado"}
            </span>
          </button>
          <div className="flex shrink-0 gap-3 text-right">
            <span title="Sequência atual">
              <span className="flex items-center justify-end gap-0.5 text-sm font-semibold tabular-nums">
                <Flame className={cn("h-3.5 w-3.5", h.stats.streak > 0 ? "text-orange-500" : "text-muted-foreground")} />
                {h.stats.streak}
              </span>
              <span className="text-[10px] text-muted-foreground">sequência</span>
            </span>
            <span title="Conclusão nos últimos 30 dias" className="max-sm:hidden">
              <span className="block text-sm font-semibold tabular-nums">
                {h.stats.rate30 === null ? "—" : `${Math.round(h.stats.rate30 * 100)}%`}
              </span>
              <span className="text-[10px] text-muted-foreground">30 dias</span>
            </span>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto pb-1">
          <Heatmap cells={h.stats.cells} color={h.task.color} size="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        </div>
      </li>
    );
  };

  const best = habits.reduce((m, h) => Math.max(m, h.stats.best), 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 md:p-6">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5" /> Hoje
            </p>
            <p className="text-2xl font-semibold">
              {todayDone}/{todayAll.length}
            </p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Target className="h-3.5 w-3.5" /> Ativos
            </p>
            <p className="text-2xl font-semibold">{active.length}</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" /> Melhor sequência
            </p>
            <p className="text-2xl font-semibold">{best}</p>
          </div>
        </div>

        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Repeat className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium">Nenhuma tarefa recorrente ainda</p>
            <p className="text-xs text-muted-foreground">Crie uma tarefa com repetição para acompanhar sequência e histórico aqui.</p>
          </div>
        ) : (
          <ul className="space-y-2">{active.map(card)}</ul>
        )}

        {ended.length > 0 && (
          <div className="space-y-2">
            <button type="button" onClick={() => setShowEnded((s) => !s)} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              {showEnded ? "Esconder" : "Mostrar"} encerrados ({ended.length})
            </button>
            {showEnded && <ul className="space-y-2">{ended.map(card)}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}
