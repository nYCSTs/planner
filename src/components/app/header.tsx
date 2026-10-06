"use client";

import { useRef, useState } from "react";
import { endOfWeek, format, isToday, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Flame,
  Inbox,
  ListTodo,
  Plus,
  Search,
  Settings as SettingsIcon,
  Timer,
  Timer as TimerIcon,
  Eye,
  EyeOff,
  CalendarCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dateKey, nowMinutes } from "@/lib/time";
import { setPrefs } from "@/lib/store/device";
import { usePrefs, useRunningEntry } from "@/lib/store/hooks";
import { TimerBar } from "./timer-bar";
import { SyncIndicator } from "./sync-indicator";
import { useUI, type View } from "./ui-context";

export const VIEWS: { id: View; label: string; icon: typeof CalendarDays }[] = [
  { id: "day", label: "Dia", icon: CalendarDays },
  { id: "week", label: "Semana", icon: CalendarRange },
  { id: "upcoming", label: "Próximos", icon: CalendarCheck },
  { id: "habits", label: "Hábitos", icon: Flame },
  { id: "reports", label: "Relatórios", icon: BarChart3 },
];

function DateNav({ now, compact = false }: { now: Date; compact?: boolean }) {
  const ui = useUI();
  const dateInput = useRef<HTMLInputElement>(null);
  const week = ui.view === "week";
  const step = week ? 7 : 1;
  const raw = week
    ? `${format(startOfWeek(ui.day, { weekStartsOn: 1 }), "d MMM", { locale: ptBR })} – ${format(endOfWeek(ui.day, { weekStartsOn: 1 }), "d MMM", { locale: ptBR })}`
    : compact
      ? format(ui.day, "EEE, d MMM", { locale: ptBR })
      : format(ui.day, "EEEE, d 'de' MMMM", { locale: ptBR });
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  const onToday = week
    ? dateKey(startOfWeek(ui.day, { weekStartsOn: 1 })) === dateKey(startOfWeek(now, { weekStartsOn: 1 }))
    : isToday(ui.day);

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {!onToday && !compact && (
        <Button variant="outline" size="sm" className="mr-1" onClick={() => ui.setDay(new Date())}>
          Hoje
        </Button>
      )}
      <Button variant="ghost" size="icon" onClick={() => ui.shiftDay(-step)} aria-label="Anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <button
        type="button"
        onClick={() => dateInput.current?.showPicker?.()}
        className={cn(
          "relative min-w-0 truncate rounded-md px-2 py-1 text-center text-sm font-medium transition-colors hover:bg-accent",
          !compact && "min-w-48",
        )}
      >
        {label}
        {onToday && !week && (
          <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">hoje</span>
        )}
      </button>
      <input
        ref={dateInput}
        type="date"
        value={dateKey(ui.day)}
        onChange={(e) => e.target.value && ui.setDay(new Date(`${e.target.value}T12:00:00`))}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        aria-label="Escolher data"
        tabIndex={-1}
      />
      <Button variant="ghost" size="icon" onClick={() => ui.shiftDay(step)} aria-label="Próximo">
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!onToday && compact && (
        <Button variant="ghost" size="sm" className="px-1.5 text-xs" onClick={() => ui.setDay(new Date())}>
          Hoje
        </Button>
      )}
    </div>
  );
}

function NewTaskButton({ now }: { now: Date }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const dk = dateKey(ui.day);
  const past = dk < dateKey(now);
  const startNow = dk === dateKey(now) ? Math.ceil(nowMinutes(now) / 5) * 5 : 9 * 60;

  const item = (icon: React.ReactNode, title: string, hint: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );

  return (
    <div className="relative flex">
      <Button size="sm" className="rounded-r-none pr-2.5" onClick={() => ui.openForm({ initial: { startMinute: past ? null : startNow, date: past ? undefined : dk } })}>
        <Plus className="h-4 w-4" /> Nova tarefa
      </Button>
      <Button
        size="sm"
        className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
        onClick={() => setOpen((o) => !o)}
        aria-label="Mais opções de criação"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg">
            {item(<Clock3 className="h-4 w-4" />, "Tarefa com horário", "Aparece na timeline", () => ui.openForm({ initial: { startMinute: startNow, date: dk } }), past)}
            {item(<Inbox className="h-4 w-4" />, "Tarefa sem horário", "Lista de pendências", () => ui.openForm({ initial: { startMinute: null } }))}
            {item(<TimerIcon className="h-4 w-4" />, "Registro de tempo", "Lançar um período já feito", () => ui.openEntry({}))}
            <div className="my-1 h-px bg-border" />
            {item(<Copy className="h-4 w-4" />, "Duplicar existente…", "Copiar uma tarefa", () => ui.setDuplicateFrom({ date: dk }))}
          </div>
        </>
      )}
    </div>
  );
}

export function DesktopHeader({ now, overdueCount }: { now: Date; overdueCount: number }) {
  const ui = useUI();
  const prefs = usePrefs();
  const dated = ui.view === "day" || ui.view === "week";

  return (
    <header className="hidden border-b md:block">
      <div className="flex h-12 items-center gap-3 px-3">
        <div className="flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="hidden text-base font-semibold tracking-tight lg:inline">Planner</span>
        </div>

        <nav className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => ui.setView(v.id)}
              aria-label={v.label}
              title={`${v.label} (${VIEWS.indexOf(v) + 1})`}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition",
                ui.view === v.id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <v.icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{v.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 justify-center">
          <TimerBar />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => ui.setPaletteOpen(true)} aria-label="Buscar (Ctrl+K)" title="Buscar (Ctrl+K)">
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant={ui.pomodoroOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => ui.setPomodoroOpen((o) => !o)}
            aria-label="Pomodoro"
            title="Pomodoro"
          >
            <Timer className="h-4 w-4" />
          </Button>
          <SyncIndicator />
          <Button variant="ghost" size="icon" onClick={() => ui.setSettingsOpen(true)} aria-label="Configurações" title="Configurações">
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {dated && (
        <div className="flex h-11 items-center gap-2 border-t px-3">
          {ui.view === "day" && (
            <Button
              variant={ui.listOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={() => ui.setListOpen((o) => !o)}
              aria-label="Lista do dia"
              title="Lista do dia"
            >
              <ListTodo className="h-4 w-4" />
            </Button>
          )}
          <DateNav now={now} />
          <div className="ml-auto flex items-center gap-1.5">
            {overdueCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-orange-600 hover:text-orange-700 dark:text-orange-400"
                onClick={() => ui.setOverdueOpen(true)}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {overdueCount} atrasada{overdueCount > 1 ? "s" : ""}
              </Button>
            )}
            {ui.view === "day" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPrefs({ showTracked: !prefs.showTracked })}
                title={prefs.showTracked ? "Esconder registros de tempo" : "Mostrar registros de tempo"}
              >
                {prefs.showTracked ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                Realizado
              </Button>
            )}
            <NewTaskButton now={now} />
          </div>
        </div>
      )}
    </header>
  );
}

export function MobileHeader({ now, overdueCount }: { now: Date; overdueCount: number }) {
  const ui = useUI();
  const running = useRunningEntry();
  const [timerOpen, setTimerOpen] = useState(false);
  const dated = ui.view === "day" || ui.view === "week";
  const title = VIEWS.find((v) => v.id === ui.view)?.label ?? "";

  return (
    <header className="border-b md:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex h-12 items-center gap-1 px-2">
        {dated ? <DateNav now={now} compact /> : <span className="px-2 text-base font-semibold">{title}</span>}
        <div className="ml-auto flex items-center">
          {overdueCount > 0 && (
            <Button variant="ghost" size="icon" className="text-orange-600" onClick={() => ui.setOverdueOpen(true)} aria-label="Atrasadas">
              <AlertTriangle className="h-4 w-4" />
            </Button>
          )}
          {!running && (
            <Button variant={timerOpen ? "secondary" : "ghost"} size="icon" onClick={() => setTimerOpen((o) => !o)} aria-label="Cronômetro">
              <TimerIcon className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => ui.setPaletteOpen(true)} aria-label="Buscar">
            <Search className="h-4 w-4" />
          </Button>
          <SyncIndicator />
        </div>
      </div>
      {(running || timerOpen) && (
        <div className="px-2 pb-2">
          <TimerBar compact onStarted={() => setTimerOpen(false)} />
        </div>
      )}
    </header>
  );
}
