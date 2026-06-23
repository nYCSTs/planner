"use client";

import { useEffect, useRef, useState } from "react";
import { GitFork, Play, Square } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TASK_COLORS, randomColor } from "@/lib/colors";
import { minutesToTime, nowMinutes } from "@/lib/time";
import type { Task } from "@/types";

interface TrackDialogProps {
  open: boolean;
  /** Pre-filled from a fork — carries title, color, subtasks. */
  prefill?: Pick<Task, "title" | "color" | "subtasks">;
  /**
   * When non-null the dialog opens in "running" mode (tracker already started).
   * The value is the ms timestamp of when tracking started.
   */
  trackingStartMs: number | null;
  onClose: () => void;
  /** Called when the user clicks "Iniciar". Returns the ms timestamp used. */
  onStart: (title: string, color: string, startMs: number) => void;
  onStop: () => void;
  onOpenFork: () => void;
}

/** Elapsed time formatted as HH:MM:SS. */
function elapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function TrackDialog({
  open,
  prefill,
  trackingStartMs,
  onClose,
  onStart,
  onStop,
  onOpenFork,
}: TrackDialogProps) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(() => randomColor());
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = trackingStartMs !== null;

  // Reset form fields when dialog opens fresh (not running).
  useEffect(() => {
    if (!open || running) return;
    if (prefill) {
      setTitle(prefill.title);
      setColor(prefill.color);
    } else {
      setTitle("");
      setColor(randomColor());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Apply prefill changes mid-open (fork chosen while dialog is open).
  useEffect(() => {
    if (!open || !prefill || running) return;
    setTitle(prefill.title);
    setColor(prefill.color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Tick every second while tracking so elapsed time updates.
  useEffect(() => {
    if (!running) { setTick(0); return; }
    intervalRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  void tick; // used to trigger re-render

  const handleStart = () => {
    const t = title.trim();
    if (!t) return;
    const startMs = Date.now();
    onStart(t, color, startMs);
  };

  const startMinuteLabel = running && trackingStartMs
    ? minutesToTime(Math.floor(trackingStartMs / 60000) % (24 * 60) ||
        // compute from the wall clock at the moment tracking started
        (() => {
          const d = new Date(trackingStartMs);
          return d.getHours() * 60 + d.getMinutes();
        })())
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o && !running) onClose(); else if (!o) onClose(); }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                running ? "animate-pulse bg-red-500" : "bg-muted-foreground",
              )}
            />
            {running ? "Registrando…" : "Registrar agora"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="track-title">O que você está fazendo?</Label>
            <Input
              id="track-title"
              autoFocus={!running}
              disabled={running}
              value={title}
              placeholder="Ex: Revisão de flashcards"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }}
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {TASK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={running}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition",
                    color === c && "ring-2 ring-ring",
                    running && "opacity-50",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Fork from existing */}
          {!running && (
            <button
              type="button"
              onClick={onOpenFork}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <GitFork className="h-3.5 w-3.5" />
              Copiar de tarefa existente…
            </button>
          )}

          {/* Timer display */}
          {running && trackingStartMs !== null && (
            <div className="rounded-lg bg-muted px-4 py-3 text-center">
              <span className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                {elapsed(trackingStartMs)}
              </span>
              {startMinuteLabel && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Iniciado às {minutesToTime(
                    (() => {
                      const d = new Date(trackingStartMs);
                      return d.getHours() * 60 + d.getMinutes();
                    })()
                  )}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!running ? (
              <>
                <Button
                  className="flex-1"
                  disabled={!title.trim()}
                  onClick={handleStart}
                >
                  <Play className="mr-1.5 h-4 w-4" /> Iniciar
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button
                className="flex-1"
                variant="destructive"
                onClick={onStop}
              >
                <Square className="mr-1.5 h-4 w-4" /> Parar e salvar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
