"use client";

import { useMemo, useState } from "react";
import { GitFork, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { minutesToTime } from "@/lib/time";
import type { Task } from "@/types";

interface ForkDialogProps {
  open: boolean;
  tasks: Task[];
  onClose: () => void;
  onPick: (taskId: string) => void;
}

export function ForkDialog({ open, tasks, onClose, onPick }: ForkDialogProps) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)); // most recent first
  }, [tasks, query]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="h-4 w-4" /> Duplicar de outra tarefa
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            placeholder="Buscar tarefa pelo nome…"
            className="pl-8"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="-mx-1 max-h-[50vh] overflow-y-auto px-1">
          {results.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma tarefa encontrada.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onPick(t.id)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent/50"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{t.title}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {t.startMinute === null
                          ? "Sem horário"
                          : minutesToTime(t.startMinute)}
                        {(t.subtasks?.length ?? 0) > 0 &&
                          ` · ${t.subtasks!.length} subtarefa${
                            t.subtasks!.length === 1 ? "" : "s"
                          }`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
