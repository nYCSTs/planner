"use client";

import { useMemo, useState } from "react";
import { addDays, format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/planner/timeline";
import { usePlanner } from "@/hooks/use-planner";
import { useNow } from "@/hooks/use-now";
import { resolveOccurrences } from "@/lib/time";
import type { ResolvedOccurrence } from "@/types";

export default function Home() {
  const planner = usePlanner();
  const now = useNow();
  const [day, setDay] = useState<Date>(() => new Date());
  const [draftStart, setDraftStart] = useState<number | null>(null);
  const [editing, setEditing] = useState<ResolvedOccurrence | null>(null);

  const occurrences = useMemo(
    () => resolveOccurrences(planner.tasks, day, planner.completions),
    [planner.tasks, day, planner.completions],
  );

  const openCreate = (startMinute: number) => {
    setEditing(null);
    setDraftStart(startMinute);
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Planner</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setDay((d) => addDays(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            onClick={() => setDay(new Date())}
            className="min-w-44 text-center text-sm font-medium capitalize"
          >
            {format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
            {isToday(day) && (
              <span className="ml-2 text-xs text-muted-foreground">(hoje)</span>
            )}
          </button>
          <Button variant="ghost" size="icon" onClick={() => setDay((d) => addDays(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button size="sm" onClick={() => openCreate(now.getHours() * 60)}>
          <Plus className="mr-1 h-4 w-4" /> Nova tarefa
        </Button>
      </header>

      <main className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 px-4 py-2">
          {planner.hydrated ? (
            <Timeline
              day={day}
              now={now}
              occurrences={occurrences}
              onOccurrenceClick={setEditing}
              onSlotClick={openCreate}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Carregando…
            </div>
          )}
        </section>
      </main>

      {/* draftStart / editing wired to the task dialog in the next step */}
      {(draftStart !== null || editing) && (
        <div className="hidden" data-placeholder />
      )}
    </div>
  );
}
