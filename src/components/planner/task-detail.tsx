"use client";

import { useRef, useState } from "react";
import { Ban, Check, ExternalLink, GitFork, GripVertical, Link as LinkIcon, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { cn, normalizeUrl, prettyUrl } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { dateKey, minutesToTime, isHourly } from "@/lib/time";
import { PriorityBadge, TagChip } from "./task-badges";
import type { DayOverride, ResolvedOccurrence, Subtask, Tag } from "@/types";

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
  completions: Record<string, number>;
  /** All tags, for resolving this task's tag chips. */
  allTags: Tag[];
  onEdit: () => void;
  onFork: () => void;
  /** Toggle this occurrence's completion (hidden for tracker logs). */
  onToggleDone: () => void;
  /** Delete the whole task. */
  onDelete: () => void;
  onToggleSkip: (reason?: string) => void;
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
  completions,
  allTags,
  onEdit,
  onFork,
  onToggleDone,
  onDelete,
  onToggleSkip,
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
  const [skipReasonOpen, setSkipReasonOpen] = useState(false);
  const [skipReasonText, setSkipReasonText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const globalSubs = task.subtasks ?? [];
  const daySubs = override?.subtasks ?? [];
  const globalDesc = task.description?.trim();
  const dayDesc = override?.description?.trim();
  const taskTags = (task.tags ?? [])
    .map((id) => allTags.find((t) => t.id === id))
    .filter(Boolean) as Tag[];
  const taskLink = task.link ? normalizeUrl(task.link) : null;

  const isDone = (subId: string) => Boolean(subtaskDone[`${subId}:${dk}`]);

  // For unscheduled tasks the completion value is the unix timestamp of when it
  // was marked done. The occurrence key handles both flavours (global for
  // "once", per-day for recurring).
  const unscheduledCompletedAt = !occ.scheduled && occ.completed
    ? completions[occ.key]
    : undefined;

  const isTracked = Boolean(task.tracked);

  return (
    <div className="space-y-4">
      {/* Primary action: complete / reopen (not for tracker logs). */}
      {!isTracked && (
        <div className="pr-8">
          {occ.completed ? (
            <Button
              variant="outline"
              className="w-full justify-center gap-1.5 border-green-500/40 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
              onClick={onToggleDone}
            >
              <RotateCcw className="h-4 w-4" /> Concluída — reabrir
            </Button>
          ) : (
            <Button
              className="w-full justify-center gap-1.5 bg-green-600 text-white hover:bg-green-700"
              onClick={onToggleDone}
            >
              <Check className="h-4 w-4" strokeWidth={2.5} /> Marcar como concluída
            </Button>
          )}
        </div>
      )}

      {/* Secondary actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
        </Button>
        <Button size="sm" variant="ghost" onClick={onFork}>
          <GitFork className="mr-1 h-3.5 w-3.5" /> Duplicar
        </Button>
        {!occ.completed && !isTracked && (
          occ.skipped ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => onToggleSkip()}
            >
              <Ban className="mr-1 h-3.5 w-3.5" /> Desfazer pulada
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-amber-600 hover:text-amber-700 dark:text-amber-500"
              onClick={() => { setSkipReasonText(""); setSkipReasonOpen((o) => !o); }}
            >
              <Ban className="mr-1 h-3.5 w-3.5" /> Pular
            </Button>
          )
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
        </Button>
      </div>

      {/* Inline delete confirmation */}
      {confirmDelete && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
          <span className="text-xs font-medium text-destructive">
            Excluir esta tarefa{recurring ? " e todas as suas repetições" : ""}?
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 bg-destructive text-white hover:bg-destructive/90"
              onClick={onDelete}
            >
              Excluir
            </Button>
          </div>
        </div>
      )}

      {/* Inline skip-reason form */}
      {skipReasonOpen && !occ.skipped && (
        <div className="flex items-center gap-2 rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
          <Input
            autoFocus
            value={skipReasonText}
            placeholder="Motivo (opcional)"
            className="h-8 flex-1 text-sm"
            onChange={(e) => setSkipReasonText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onToggleSkip(skipReasonText); setSkipReasonOpen(false); }
              if (e.key === "Escape") setSkipReasonOpen(false);
            }}
          />
          <Button
            size="sm"
            className="h-8 bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => { onToggleSkip(skipReasonText); setSkipReasonOpen(false); }}
          >
            Confirmar
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSkipReasonOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex items-start gap-2 pr-8">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: task.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-base font-semibold leading-tight">
              {task.title}
            </h2>
            {task.priority && <PriorityBadge priority={task.priority} />}
            {occ.skipped && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                Pulada
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {occ.scheduled
              ? `${minutesToTime(occ.startMinute)}${
                  occ.openEnded ? " · em aberto" : ` – ${minutesToTime(occ.endMinute)}`
                } · `
              : unscheduledCompletedAt
              ? `Concluída em ${format(new Date(unscheduledCompletedAt), "d 'de' MMM, HH:mm", { locale: ptBR })} · `
              : "Sem horário · "}
            {recurrenceSummary(occ)}
          </p>
          {taskTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {taskTags.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
          )}
          {occ.skipped && occ.skipReason && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Motivo: {occ.skipReason}
            </p>
          )}
        </div>
      </div>

      {/* Link — one tap opens it in a new tab. */}
      {taskLink && (
        <a
          href={taskLink}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <LinkIcon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium">Abrir link</span>
            <span className="block truncate text-xs text-muted-foreground">
              {prettyUrl(taskLink)}
            </span>
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </a>
      )}

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
