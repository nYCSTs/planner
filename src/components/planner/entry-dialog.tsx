"use client";

import { useEffect, useState } from "react";
import { Play, Square, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateKey, dayKeyOfMs, formatMinutes, minuteOfDay, minutesToTime, msAt, timeToMinutes } from "@/lib/time";
import { addEntry, continueEntry, deleteEntry, stopTimer, updateEntry } from "@/lib/store/actions";
import { useProjects, useStore, useTags, useTasksById } from "@/lib/store/hooks";
import { useUI } from "@/components/app/ui-context";
import { useNowMs } from "@/hooks/use-now";
import { ProjectSelect, TagSelector } from "./task-form-controls";

interface Draft {
  title: string;
  projectId?: string;
  tags: string[];
  note: string;
  date: string;
  start: string;
  end: string;
}

export function EntryDialog() {
  const ui = useUI();
  const req = ui.entry;
  const entry = useStore((s) => (req?.entryId ? s.entries[req.entryId] : undefined));
  const tasksById = useTasksById();
  const projects = useProjects();
  const tags = useTags();
  const [d, setD] = useState<Draft>({ title: "", tags: [], note: "", date: dateKey(new Date()), start: "09:00", end: "10:00" });

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!req) {
      return;
    }

    if (entry) {
      setD({
        title: entry.title,
        projectId: entry.projectId,
        tags: entry.tags ?? [],
        note: entry.note ?? "",
        date: dayKeyOfMs(entry.start),
        start: minutesToTime(minuteOfDay(entry.start)),
        end: minutesToTime(minuteOfDay(entry.end ?? Date.now())),
      });
      return;
    }

    const start = req.start ?? Date.now() - 30 * 60_000;
    const end = req.end ?? start + 30 * 60_000;
    const task = req.taskId ? tasksById[req.taskId] : undefined;
    setD({
      title: req.title ?? task?.title ?? "",
      projectId: task?.projectId,
      tags: task?.tags ?? [],
      note: "",
      date: dayKeyOfMs(start),
      start: minutesToTime(minuteOfDay(start)),
      end: minutesToTime(minuteOfDay(end)),
    });
    /* eslint-enable react-hooks/set-state-in-effect */
    // Reset only when a new request opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const running = entry?.end === null;
  const nowMs = useNowMs(1000, running);
  const startMs = msAt(d.date, timeToMinutes(d.start));
  let endMs = msAt(d.date, timeToMinutes(d.end));
  if (endMs <= startMs) {
    endMs += 24 * 60 * 60_000;
  }

  const durationMin = running ? (nowMs - startMs) / 60_000 : (endMs - startMs) / 60_000;
  const invalid = running ? startMs > nowMs : endMs <= startMs;

  const save = () => {
    if (invalid) {
      return;
    }

    const fields = {
      title: d.title.trim(),
      projectId: d.projectId,
      tags: d.tags.length ? d.tags : undefined,
      note: d.note.trim() || undefined,
      start: startMs,
    };

    if (entry) {
      updateEntry(entry.id, { ...fields, end: running ? null : endMs });
    } else {
      addEntry({ ...fields, taskId: req?.taskId, end: endMs });
      ui.toast("Registro adicionado");
    }

    ui.closeEntry();
  };

  return (
    <Dialog open={req !== null} onOpenChange={(o) => !o && ui.closeEntry()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {running && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
            {entry ? (running ? "Registro em andamento" : "Editar registro") : "Novo registro de tempo"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            autoFocus
            value={d.title}
            placeholder="O que você fez?"
            className="h-10 text-base font-medium"
            onChange={(e) => set("title", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                save();
              }
            }}
          />

          {entry?.taskId && tasksById[entry.taskId] && (
            <p className="text-xs text-muted-foreground">
              Ligado à tarefa <span className="font-medium text-foreground">{tasksById[entry.taskId].title}</span>
            </p>
          )}

          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="ed-date" className="text-xs text-muted-foreground">
                Dia
              </Label>
              <Input id="ed-date" type="date" value={d.date} onChange={(e) => e.target.value && set("date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-start" className="text-xs text-muted-foreground">
                Início
              </Label>
              <Input id="ed-start" type="time" value={d.start} onChange={(e) => e.target.value && set("start", e.target.value)} className="w-28" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-end" className="text-xs text-muted-foreground">
                Fim
              </Label>
              {running ? (
                <div className="flex h-8 w-28 items-center rounded-lg border border-dashed px-2.5 text-sm text-muted-foreground">agora</div>
              ) : (
                <Input id="ed-end" type="time" value={d.end} onChange={(e) => e.target.value && set("end", e.target.value)} className="w-28" />
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Duração: <span className="font-medium text-foreground tabular-nums">{formatMinutes(durationMin)}</span>
            {!running && endMs - startMs > 0 && dayKeyOfMs(endMs) !== d.date && " (termina no dia seguinte)"}
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Projeto</Label>
            <ProjectSelect projects={projects} value={d.projectId} onChange={(v) => set("projectId", v)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Etiquetas</Label>
            <TagSelector
              allTags={tags}
              selected={d.tags}
              onToggle={(id) => set("tags", d.tags.includes(id) ? d.tags.filter((x) => x !== id) : [...d.tags, id])}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-note" className="text-xs text-muted-foreground">
              Nota
            </Label>
            <textarea
              id="ed-note"
              value={d.note}
              rows={2}
              onChange={(e) => set("note", e.target.value)}
              className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 sm:justify-between">
          <div className="flex gap-1">
            {entry && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Excluir registro"
                onClick={() => {
                  const undo = deleteEntry(entry.id);
                  ui.closeEntry();
                  ui.toast("Registro excluído", { label: "Desfazer", run: undo });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {entry && running && (
              <Button
                variant="destructive"
                onClick={() => {
                  save();
                  stopTimer();
                }}
              >
                <Square className="h-3.5 w-3.5 fill-current" /> Parar
              </Button>
            )}
            {entry && !running && (
              <Button
                variant="outline"
                onClick={() => {
                  continueEntry(entry);
                  ui.closeEntry();
                }}
              >
                <Play className="h-3.5 w-3.5 fill-current" /> Continuar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={ui.closeEntry}>
              Cancelar
            </Button>
            <Button disabled={invalid} onClick={save}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
