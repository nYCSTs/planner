"use client";

import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dateKey, nowMinutes } from "@/lib/time";
import { getState } from "@/lib/store/store";
import { stopTimer } from "@/lib/store/actions";
import { useUI, type View } from "./ui-context";

const SHORTCUTS: [string, string][] = [
  ["N", "Nova tarefa"],
  ["U", "Nova tarefa sem horário"],
  ["T", "Focar o cronômetro"],
  ["S", "Parar o cronômetro"],
  ["← / →", "Dia (ou semana) anterior / próximo"],
  ["H", "Ir para hoje"],
  ["1 – 5", "Dia · Semana · Próximos · Hábitos · Relatórios"],
  ["L", "Mostrar/ocultar lista do dia"],
  ["P", "Pomodoro"],
  ["Ctrl/⌘ K  ou  /", "Buscar"],
  ["?", "Esta ajuda"],
];

const VIEW_KEYS: Record<string, View> = { "1": "day", "2": "week", "3": "upcoming", "4": "habits", "5": "reports" };

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) {
    return false;
  }

  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function useShortcuts() {
  const ui = useUI();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.setPaletteOpen(true);
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector("[role=dialog]")) {
        return;
      }

      const key = e.key.toLowerCase();
      const dk = dateKey(ui.day);
      const today = dateKey(new Date());

      if (key === "n") {
        e.preventDefault();
        ui.openForm({ initial: dk < today ? { startMinute: null } : { date: dk, startMinute: dk === today ? Math.ceil(nowMinutes() / 5) * 5 : 9 * 60 } });
      } else if (key === "u") {
        e.preventDefault();
        ui.openForm({ initial: { startMinute: null } });
      } else if (key === "t") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("[data-timer-input]")?.focus();
      } else if (key === "s") {
        if (Object.values(getState().entries).some((x) => !x.deletedAt && x.end === null)) {
          stopTimer();
          ui.toast("Cronômetro parado");
        }
      } else if (e.key === "ArrowLeft") {
        ui.shiftDay(ui.view === "week" ? -7 : -1);
      } else if (e.key === "ArrowRight") {
        ui.shiftDay(ui.view === "week" ? 7 : 1);
      } else if (key === "h") {
        ui.setDay(new Date());
      } else if (VIEW_KEYS[key]) {
        ui.setView(VIEW_KEYS[key]);
      } else if (key === "l") {
        ui.setListOpen((o) => !o);
      } else if (key === "p") {
        ui.setPomodoroOpen((o) => !o);
      } else if (key === "/") {
        e.preventDefault();
        ui.setPaletteOpen(true);
      } else if (e.key === "?") {
        ui.setHelpOpen(true);
      } else if (e.key === "Escape" && ui.selected) {
        ui.closeDetail();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui]);
}

export function ShortcutsHelp() {
  const ui = useUI();
  return (
    <Dialog open={ui.helpOpen} onOpenChange={ui.setHelpOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
        </DialogHeader>
        <dl className="space-y-1.5 text-sm">
          {SHORTCUTS.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
