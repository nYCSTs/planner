"use client";

import { useRef, useState } from "react";
import { GitFork, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
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
  onFork: () => void;
  onSetDayDescription: (description: string) => void;
  onAddSubtask: (title: string, scope: "global" | "day") => void;
  onRemoveSubtask: (subtaskId: string, scope: "global" | "day") => void;
  onRenameSubtask: (subtaskId: string, title: string, scope: "global" | "day") => void;
  onReorderSubtask: (subtaskId: string, newIndex: number, scope: "global" | "day") => void;
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
  dragging,
  onToggle,
  onRemove,
  onRename,
  onPointerDownGrip,
}: {
  sub: Subtask;
  done: boolean;
  dragging: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onRename: (title: string) => void;
  onPointerDownGrip: (e: React.PointerEvent) => void;
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
            if (e.key === "Escape") { setValue(sub.title); setEditing(false); }
          }}
          onBlur={save}
        />
        <Button size="sm" className="h-8" onClick={save}>Salvar</Button>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-2.5 py-0.5 transition-opacity",
        dragging && "opacity-40",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Arrastar para reordenar"
        onPointerDown={onPointerDownGrip}
        className="shrink-0 cursor-grab touch-none opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

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
        onClick={() => { setValue(sub.title); setEditing(true); }}
        className={cn(
          "min-w-0 flex-1 break-words text-left text-sm",
          done && "text-muted-foreground line-through",
        )}
      >
        {sub.title}
      </button>
      <button
        type="button"
        aria-label="Editar subtarefa"
        onClick={() => { setValue(sub.title); setEditing(true); }}
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

/**
 * Renders a list of subtasks with pointer-based drag-to-reorder.
 * Tracks drag state locally; commits new order via `onReorder(id, newIndex)`.
 */
function SortableSubtaskList({
  subtasks,
  isDone,
  onToggle,
  onRemove,
  onRename,
  onReorder,
}: {
  subtasks: Subtask[];
  isDone: (id: string) => boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onReorder: (id: string, newIndex: number) => void;
}) {
  // Local order for live preview during drag.
  const [localOrder, setLocalOrder] = useState<Subtask[] | null>(null);
  const dragId = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const displayed = localOrder ?? subtasks;

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    dragId.current = id;
    const startY = e.clientY;
    let currentOrder = [...subtasks];

    const onMove = (me: PointerEvent) => {
      const list = listRef.current;
      if (!list) return;
      const items = Array.from(list.children) as HTMLElement[];
      const mouseY = me.clientY;
      let targetIndex = items.length - 1;
      for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();
        if (mouseY < rect.top + rect.height / 2) { targetIndex = i; break; }
      }
      const fromIndex = currentOrder.findIndex((s) => s.id === id);
      if (fromIndex === -1) return;
      const next = [...currentOrder];
      const [item] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, item);
      currentOrder = next;
      setLocalOrder(next);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const finalIndex = currentOrder.findIndex((s) => s.id === id);
      if (finalIndex !== -1) onReorder(id, finalIndex);
      dragId.current = null;
      setLocalOrder(null);
      void startY; // suppress unused warning
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <ul ref={listRef}>
      {displayed.map((s) => (
        <SubtaskRow
          key={s.id}
          sub={s}
          done={isDone(s.id)}
          dragging={dragId.current === s.id}
          onToggle={() => onToggle(s.id)}
          onRemove={() => onRemove(s.id)}
          onRename={(t) => onRename(s.id, t)}
          onPointerDownGrip={(e) => handlePointerDown(e, s.id)}
        />
      ))}
    </ul>
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
  onFork,
  onSetDayDescription,
  onAddSubtask,
  onRemoveSubtask,
  onRenameSubtask,
  onReorderSubtask,
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
      {/* Top bar: actions (left) + close handled by the dialog's X (right) */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
        </Button>
        <Button size="sm" variant="ghost" onClick={onFork}>
          <GitFork className="mr-1 h-3.5 w-3.5" /> Duplicar p/ outro horário
        </Button>
      </div>

      <div className="flex items-start gap-2 pr-8">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: task.color }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-base font-semibold leading-tight">
            {task.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {occ.scheduled
              ? `${minutesToTime(occ.startMinute)}${
                  occ.openEnded ? " · em aberto" : ` – ${minutesToTime(occ.endMinute)}`
                } · `
              : "Sem horário · "}
            {recurrenceSummary(occ)}
          </p>
        </div>
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
            <SortableSubtaskList
              subtasks={globalSubs}
              isDone={isDone}
              onToggle={(id) => onToggleSubtask(id)}
              onRemove={(id) => onRemoveSubtask(id, "global")}
              onRename={(id, t) => onRenameSubtask(id, t, "global")}
              onReorder={(id, idx) => onReorderSubtask(id, idx, "global")}
            />
            <AddSubtask onAdd={(t) => onAddSubtask(t, "global")} />
          </section>
        )}

        {recurring && (
          <section>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Subtarefas — só hoje
            </p>
            <SortableSubtaskList
              subtasks={daySubs}
              isDone={isDone}
              onToggle={(id) => onToggleSubtask(id)}
              onRemove={(id) => onRemoveSubtask(id, "day")}
              onRename={(id, t) => onRenameSubtask(id, t, "day")}
              onReorder={(id, idx) => onReorderSubtask(id, idx, "day")}
            />
            <AddSubtask onAdd={(t) => onAddSubtask(t, "day")} />
          </section>
        )}
      </div>
    </div>
  );
}
