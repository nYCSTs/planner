"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { dateKey, minutesToTime, isHourly } from "@/lib/time";
import type { DayOverride, ResolvedOccurrence, Subtask } from "@/types";

const RECURRENCE_LABEL: Record<string, string> = {
  once: "Pontual",
  weekdays: "Dias úteis",
  weekends: "Fim de semana",
  everyday: "Todos os dias",
  custom: "Dias específicos",
};

interface TaskDetailProps {
  occ: ResolvedOccurrence;
  day: Date;
  override: DayOverride | undefined;
  subtaskDone: Record<string, boolean>;
  onEdit: () => void;
  onSetDayDescription: (description: string) => void;
  onAddSubtask: (title: string, scope: "global" | "day") => void;
  onRemoveSubtask: (subtaskId: string, scope: "global" | "day") => void;
  onRenameSubtask: (subtaskId: string, title: string, scope: "global" | "day") => void;
  onToggleSubtask: (subtaskId: string) => void;
}

function recurrenceSummary(occ: ResolvedOccurrence): string {
  const rec = occ.task.recurrence;
  const base = RECURRENCE_LABEL[rec.kind] ?? "";
  if (isHourly(rec)) {
    const n = rec.everyHourInterval ?? 1;
    return `${base} · a cada ${n === 1 ? "hora" : `${n} horas`}`;
  }
  return base;
}

function SubtaskRow({
  sub,
  done,
  onToggle,
  onRemove,
  onRename,
}: {
  sub: Subtask;
  done: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(sub.title);

  const save = () => {
    const v = value.trim();
    if (v && v !== sub.title) onRename(v);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="flex items-center gap-1.5 py-0.5">
        <Input
          autoFocus
          value={value}
          className="h-8 text-sm"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(sub.title);
              setEditing(false);
            }
          }}
          onBlur={save}
        />
        <Button size="sm" className="h-8" onClick={save}>
          Salvar
        </Button>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2.5 py-0.5">
      <button
        type="button"
        aria-label={done ? "Reabrir" : "Concluir"}
        onClick={onToggle}
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition",
          done ? "border-transparent" : "border-muted-foreground/50 hover:border-foreground",
        )}
      >
        {done && <span className="text-xs leading-none">✅</span>}
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(sub.title);
          setEditing(true);
        }}
        className={cn(
          "flex-1 truncate text-left text-sm",
          done && "text-muted-foreground line-through",
        )}
      >
        {sub.title}
      </button>
      <button
        type="button"
        aria-label="Editar subtarefa"
        onClick={() => {
          setValue(sub.title);
          setEditing(true);
        }}
        className="opacity-0 transition group-hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
      </button>
      <button
        type="button"
        aria-label="Remover subtarefa"
        onClick={onRemove}
        className="opacity-0 transition group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </li>
  );
}

function AddSubtask({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar subtarefa
      </button>
    );
  }

  const submit = () => {
    const v = value.trim();
    if (v) onAdd(v);
    setValue("");
    setOpen(false);
  };

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <Input
        autoFocus
        value={value}
        placeholder="Título da subtarefa"
        className="h-8 text-sm"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <Button size="sm" className="h-8" onClick={submit}>
        Adicionar
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={() => setOpen(false)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function TaskDetail({
  occ,
  day,
  override,
  subtaskDone,
  onEdit,
  onSetDayDescription,
  onAddSubtask,
  onRemoveSubtask,
  onRenameSubtask,
  onToggleSubtask,
}: TaskDetailProps) {
  const { task } = occ;
  const recurring = task.recurrence.kind !== "once";
  const dk = dateKey(day);
  const [editingDayNote, setEditingDayNote] = useState(false);
  const [dayNote, setDayNote] = useState(override?.description ?? "");

  const globalSubs = task.subtasks ?? [];
  const daySubs = override?.subtasks ?? [];
  const globalDesc = task.description?.trim();
  const dayDesc = override?.description?.trim();

  const isDone = (subId: string) => Boolean(subtaskDone[`${subId}:${dk}`]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: task.color }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{task.title}</h2>
          <p className="text-xs text-muted-foreground">
            {occ.scheduled
              ? `${minutesToTime(occ.startMinute)}${
                  occ.openEnded ? " · em aberto" : ` – ${minutesToTime(occ.endMinute)}`
                } · `
              : "Sem horário · "}
            {recurrenceSummary(occ)}
          </p>
        </div>
        <Button size="sm" variant="outline" className="mr-8" onClick={onEdit}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
        </Button>
      </div>

      {/* Descriptions */}
      <div className="space-y-3">
        {globalDesc && (
          <section>
            {recurring && (
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Descrição — geral
              </p>
            )}
            <Markdown>{globalDesc}</Markdown>
          </section>
        )}

        {/* Day-specific note: editable for recurring tasks. For "once" tasks the
            description lives on the task itself (edit via the form). */}
        {recurring &&
          (editingDayNote ? (
            <section className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Nota só de hoje (markdown)
              </p>
              <textarea
                autoFocus
                value={dayNote}
                rows={3}
                placeholder="Algo só para este dia…"
                onChange={(e) => setDayNote(e.target.value)}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    onSetDayDescription(dayNote);
                    setEditingDayNote(false);
                  }}
                >
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setDayNote(override?.description ?? "");
                    setEditingDayNote(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </section>
          ) : dayDesc ? (
            <section>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Nota só de hoje
                </p>
                <button
                  type="button"
                  onClick={() => setEditingDayNote(true)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  editar
                </button>
              </div>
              <Markdown>{dayDesc}</Markdown>
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setEditingDayNote(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar nota de hoje
            </button>
          ))}
      </div>

      {/* Subtasks */}
      <div className="space-y-3">
        {(globalSubs.length > 0 || !recurring) && (
          <section>
            {recurring && globalSubs.length > 0 && (
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Subtarefas — gerais
              </p>
            )}
            <ul>
              {globalSubs.map((s) => (
                <SubtaskRow
                  key={s.id}
                  sub={s}
                  done={isDone(s.id)}
                  onToggle={() => onToggleSubtask(s.id)}
                  onRemove={() => onRemoveSubtask(s.id, "global")}
                  onRename={(t) => onRenameSubtask(s.id, t, "global")}
                />
              ))}
            </ul>
            <AddSubtask onAdd={(t) => onAddSubtask(t, "global")} />
          </section>
        )}

        {recurring && (
          <section>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Subtarefas — só hoje
            </p>
            <ul>
              {daySubs.map((s) => (
                <SubtaskRow
                  key={s.id}
                  sub={s}
                  done={isDone(s.id)}
                  onToggle={() => onToggleSubtask(s.id)}
                  onRemove={() => onRemoveSubtask(s.id, "day")}
                  onRename={(t) => onRenameSubtask(s.id, t, "day")}
                />
              ))}
            </ul>
            <AddSubtask onAdd={(t) => onAddSubtask(t, "day")} />
          </section>
        )}
      </div>
    </div>
  );
}
