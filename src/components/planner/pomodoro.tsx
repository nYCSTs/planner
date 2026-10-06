"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { beep } from "@/lib/sound";
import { formatClock } from "@/lib/time";
import { startTimer, stopTimer } from "@/lib/store/actions";
import { useRunningEntry } from "@/lib/store/hooks";

type Phase = "work" | "break";

interface PomodoroState {
  phase: Phase;
  /** ms epoch when the running phase ends; null when paused. */
  endsAt: number | null;
  /** Remaining ms while paused. */
  remaining: number;
  cycles: number;
}

const KEY = "planner.pomodoro";
const POMODORO_TITLE = "Foco (Pomodoro)";

function load(workMs: number): PomodoroState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      return JSON.parse(raw) as PomodoroState;
    }
  } catch {
    // ignore
  }

  return { phase: "work", endsAt: null, remaining: workMs, cycles: 0 };
}

function save(s: PomodoroState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

interface PomodoroProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  workMinutes: number;
  breakMinutes: number;
  soundEnabled: boolean;
}

/** Pomodoro that survives reloads (state in localStorage, per device). */
export function Pomodoro({ open, onOpen, onClose, workMinutes, breakMinutes, soundEnabled }: PomodoroProps) {
  const workMs = workMinutes * 60_000;
  const breakMs = breakMinutes * 60_000;
  const [state, setState] = useState<PomodoroState>(() => ({ phase: "work", endsAt: null, remaining: workMs, cycles: 0 }));
  const [now, setNow] = useState(() => Date.now());
  const runningEntry = useRunningEntry();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(load(workMs));
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (s: PomodoroState) => {
    setState(s);
    save(s);
  };

  const running = state.endsAt !== null;
  const remaining = running ? Math.max(0, (state.endsAt ?? 0) - now) : state.remaining;

  useEffect(() => {
    if (!running) {
      return;
    }

    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running || remaining > 0) {
      return;
    }

    if (soundEnabled) {
      beep(state.phase === "work" ? 2 : 1);
    }

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(state.phase === "work" ? "Hora da pausa" : "De volta ao foco", { tag: "pomodoro" });
      } catch {
        // ignore
      }
    }

    const next: Phase = state.phase === "work" ? "break" : "work";
    const len = next === "work" ? workMs : breakMs;
    if (next === "break" && runningEntry?.title === POMODORO_TITLE) {
      stopTimer();
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    update({ phase: next, endsAt: Date.now() + len, remaining: len, cycles: state.cycles + (state.phase === "work" ? 1 : 0) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, running]);

  const toggle = () => {
    if (running) {
      update({ ...state, endsAt: null, remaining });
      return;
    }

    const t = Date.now();
    setNow(t);
    update({ ...state, endsAt: t + state.remaining });
    if (state.phase === "work" && !runningEntry) {
      startTimer({ title: POMODORO_TITLE });
    }
  };

  const reset = () => update({ phase: "work", endsAt: null, remaining: workMs, cycles: state.cycles });

  const skip = () => {
    const next: Phase = state.phase === "work" ? "break" : "work";
    const len = next === "work" ? workMs : breakMs;
    update({ phase: next, endsAt: running ? Date.now() + len : null, remaining: len, cycles: state.cycles });
  };

  if (!open && !running) {
    return null;
  }

  const total = state.phase === "work" ? workMs : breakMs;
  const progress = 1 - remaining / total;

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="fixed bottom-20 right-3 z-40 flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold shadow-md md:bottom-4"
      >
        <span className={cn("h-2 w-2 rounded-full", state.phase === "work" ? "bg-indigo-500" : "bg-emerald-500")} />
        {formatClock(remaining)}
      </button>
    );
  }

  return (
    <div className="border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="h-0.5 w-full overflow-hidden bg-muted">
        <div
          className={cn("h-full transition-all", state.phase === "work" ? "bg-indigo-500" : "bg-emerald-500")}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Timer className="h-4 w-4" />
          Pomodoro
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            state.phase === "work" ? "bg-indigo-500/15 text-indigo-500" : "bg-emerald-500/15 text-emerald-500",
          )}
        >
          {state.phase === "work" ? "Foco" : "Pausa"}
        </span>
        <div className="font-mono text-2xl font-semibold tabular-nums">{formatClock(remaining)}</div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={running ? "secondary" : "default"} onClick={toggle}>
            {running ? <><Pause className="h-4 w-4" /> Pausar</> : <><Play className="h-4 w-4" /> Iniciar</>}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={skip} aria-label="Pular fase" title="Pular fase">
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={reset} aria-label="Reiniciar" title="Reiniciar">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {state.cycles} ciclo{state.cycles === 1 ? "" : "s"}
          {runningEntry && ` · registrando "${runningEntry.title || "sem descrição"}"`}
        </span>
        <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={onClose} aria-label="Minimizar Pomodoro">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
