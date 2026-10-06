"use client";

import { useState } from "react";
import { BarChart3, CalendarCheck, CalendarDays, CalendarRange, Flame, Menu, Plus, RefreshCw, Settings, Timer } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { dateKey, nowMinutes } from "@/lib/time";
import { useUI, type View } from "./ui-context";

export function BottomNav({ now }: { now: Date }) {
  const ui = useUI();
  const [moreOpen, setMoreOpen] = useState(false);
  const dk = dateKey(ui.day);
  const isPast = dk < dateKey(now);

  const tab = (id: View, label: string, Icon: typeof CalendarDays) => (
    <button
      type="button"
      onClick={() => ui.setView(id)}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium",
        ui.view === id ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );

  const more = (label: string, Icon: typeof CalendarDays, onClick: () => void) => (
    <button
      type="button"
      onClick={() => {
        setMoreOpen(false);
        onClick();
      }}
      className="flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium hover:bg-accent"
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );

  return (
    <>
      <nav
        className="flex items-stretch border-t bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tab("day", "Dia", CalendarDays)}
        {tab("week", "Semana", CalendarRange)}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() =>
              ui.openForm({
                initial: isPast
                  ? { startMinute: null }
                  : ui.view === "day"
                    ? { startMinute: dk === dateKey(now) ? Math.ceil(nowMinutes(now) / 5) * 5 : 9 * 60, date: dk }
                    : { startMinute: null },
              })
            }
            className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
            aria-label="Nova tarefa"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
        {tab("upcoming", "Próximos", CalendarCheck)}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium",
            ui.view === "habits" || ui.view === "reports" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Menu className="h-5 w-5" />
          Mais
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Mais</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4">
            {more("Hábitos", Flame, () => ui.setView("habits"))}
            {more("Relatórios", BarChart3, () => ui.setView("reports"))}
            {more("Pomodoro", Timer, () => ui.setPomodoroOpen(true))}
            {more("Registrar tempo", Timer, () => ui.openEntry({}))}
            {more("Sincronizar", RefreshCw, () => ui.setSyncOpen(true))}
            {more("Configurações", Settings, () => ui.setSettingsOpen(true))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
