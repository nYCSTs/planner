"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { beep } from "@/lib/sound";

type Phase = "work" | "break";

interface PomodoroProps {
  workMinutes: number;
  breakMinutes: number;
  soundEnabled: boolean;
}

export function Pomodoro({ workMinutes, breakMinutes, soundEnabled }: PomodoroProps) {
  const [phase, setPhase] = useState<Phase>("work");
  const [remaining, setRemaining] = useState(workMinutes * 60);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phaseLength = (p: Phase) =>
    (p === "work" ? workMinutes : breakMinutes) * 60;

  // Reset remaining when durations change and timer isn't running.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!running) setRemaining(phaseLength(phase));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workMinutes, breakMinutes]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // Phase transition.
          if (soundEnabled) beep(phase === "work" ? 2 : 1);
          const next: Phase = phase === "work" ? "break" : "work";
          if (phase === "work") setCompleted((c) => c + 1);
          setPhase(next);
          return phaseLength(next);
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase, soundEnabled]);

  const reset = () => {
    setRunning(false);
    setPhase("work");
    setRemaining(workMinutes * 60);
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const total = phaseLength(phase);
  const progress = 1 - remaining / total;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Timer className="h-4 w-4" />
          Pomodoro
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            phase === "work"
              ? "bg-indigo-500/15 text-indigo-500"
              : "bg-emerald-500/15 text-emerald-500",
          )}
        >
          {phase === "work" ? "Foco" : "Pausa"}
        </span>
      </div>

      <div className="text-center">
        <div className="font-mono text-5xl font-semibold tabular-nums">
          {mm}:{ss}
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all",
              phase === "work" ? "bg-indigo-500" : "bg-emerald-500",
            )}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          size="sm"
          variant={running ? "secondary" : "default"}
          onClick={() => setRunning((r) => !r)}
        >
          {running ? (
            <>
              <Pause className="mr-1 h-4 w-4" /> Pausar
            </>
          ) : (
            <>
              <Play className="mr-1 h-4 w-4" /> Iniciar
            </>
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {completed} ciclo{completed === 1 ? "" : "s"} concluído
        {completed === 1 ? "" : "s"}
      </p>
    </div>
  );
}
