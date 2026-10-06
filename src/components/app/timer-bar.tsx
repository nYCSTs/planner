"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, ListTodo, Play, Square } from "lucide-react";
import { formatHms } from "@/lib/time";
import { entryColor } from "@/lib/entries";
import { cn } from "@/lib/utils";
import { startTimer, stopTimer, type EntryInput } from "@/lib/store/actions";
import { useEntries, useProjectsById, useRunningEntry, useTasks, useTasksById } from "@/lib/store/hooks";
import { useUI } from "./ui-context";

function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

interface Suggestion {
  key: string;
  input: EntryInput;
  color: string;
  hint: string;
  kind: "recent" | "task";
}

/** Toggl-style "what are you doing?" bar: start/stop the running entry. */
export function TimerBar({ compact = false, onStarted }: { compact?: boolean; onStarted?: () => void }) {
  const ui = useUI();
  const running = useRunningEntry();
  const entries = useEntries();
  const tasks = useTasks();
  const tasksById = useTasksById();
  const projectsById = useProjectsById();
  const now = useTick(Boolean(running));
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const elapsed = running ? formatHms(now - running.start) : "";

  useEffect(() => {
    const base = "Planner";
    document.title = running ? `▶ ${elapsed} · ${running.title || "Sem descrição"}` : base;
  }, [running, elapsed]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = title.trim().toLowerCase();
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    const recent = [...entries].sort((a, b) => b.start - a.start);
    for (const e of recent) {
      const key = `${e.title}|${e.taskId ?? ""}|${e.projectId ?? ""}`;
      if (seen.has(key) || !e.title || (q && !e.title.toLowerCase().includes(q))) {
        continue;
      }

      seen.add(key);
      const project = e.projectId ? projectsById[e.projectId] : undefined;
      out.push({
        key,
        input: { title: e.title, taskId: e.taskId, projectId: e.projectId, tags: e.tags, color: e.color },
        color: entryColor(e, tasksById, projectsById),
        hint: project?.name ?? "Recente",
        kind: "recent",
      });
      if (out.length >= 5) {
        break;
      }
    }

    if (q) {
      for (const t of tasks) {
        if (out.length >= 9 || !t.title.toLowerCase().includes(q) || out.some((s) => s.input.taskId === t.id)) {
          continue;
        }

        out.push({
          key: `task-${t.id}`,
          input: { title: t.title, taskId: t.id, projectId: t.projectId, tags: t.tags },
          color: t.color,
          hint: "Tarefa",
          kind: "task",
        });
      }
    }

    return out;
  }, [entries, tasks, tasksById, projectsById, title]);

  const start = (input?: EntryInput) => {
    const payload = input ?? { title: title.trim() };
    startTimer(payload);
    setTitle("");
    setOpen(false);
    inputRef.current?.blur();
    onStarted?.();
  };

  if (running) {
    const color = entryColor(running, tasksById, projectsById);
    const project = running.projectId ? projectsById[running.projectId] : undefined;
    return (
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-xl border bg-card pl-3 pr-1 shadow-xs",
          compact ? "h-11 w-full" : "h-9 w-full max-w-md",
        )}
      >
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ backgroundColor: color }} />
        <button type="button" onClick={() => ui.openEntry({ entryId: running.id })} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium leading-tight">{running.title || "Sem descrição"}</span>
          {project && !compact && <span className="block truncate text-[10px] leading-tight text-muted-foreground">{project.name}</span>}
        </button>
        <span className="font-mono text-sm font-semibold tabular-nums">{elapsed}</span>
        <button
          type="button"
          onClick={() => stopTimer()}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-red-500 text-white transition hover:bg-red-600"
          aria-label="Parar cronômetro"
          title="Parar (atalho: s)"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("relative min-w-0", compact ? "w-full" : "w-full max-w-md")}>
      <div className={cn("flex items-center gap-1 rounded-xl border bg-card pl-3 pr-1 shadow-xs focus-within:ring-2 focus-within:ring-ring/40", compact ? "h-11" : "h-9")}>
        <input
          ref={inputRef}
          data-timer-input
          value={title}
          placeholder="O que você está fazendo?"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setTitle(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, suggestions.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (highlight > 0 && suggestions[highlight - 1]) {
                start(suggestions[highlight - 1].input);
              } else {
                start();
              }
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        <button
          type="button"
          onClick={() => start()}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/85"
          aria-label="Iniciar cronômetro"
          title="Iniciar cronômetro"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </button>
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-popover py-1 shadow-lg">
          {suggestions.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => start(s.input)}
                className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent", highlight === i + 1 && "bg-accent")}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="min-w-0 flex-1 truncate">{s.input.title}</span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  {s.kind === "recent" ? <History className="h-3 w-3" /> : <ListTodo className="h-3 w-3" />}
                  {s.hint}
                </span>
                <Play className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
