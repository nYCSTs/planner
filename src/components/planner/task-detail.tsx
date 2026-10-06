"use client";

import { useMemo, useRef, useState } from "react";
import {
  Ban,
  CalendarX2,
  Check,
  Copy,
  ExternalLink,
  GripVertical,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { cn, normalizeUrl, prettyUrl } from "@/lib/utils";
import { addDaysKey, dayFromKey, dayStartMs, formatMinutes, minutesToTime } from "@/lib/time";
import { describeRecurrence, isRecurring, recurrenceFloor } from "@/lib/recurrence";
import { entryDuration } from "@/lib/entries";
import {
  addSubtask,
  clearOccurrenceOverride,
  deleteTask,
  endSeries,
  removeOccurrence,
  removeSubtask,
  renameSubtask,
  reorderSubtask,
  setDayNote,
  setSkipped,
  startTimer,
  stopTimer,
  toggleDone,
  toggleSubtaskDone,
  type SubtaskScope,
} from "@/lib/store/actions";
import {
  useEntries,
  useOccurrenceStates,
  useProjectsById,
  useRunningEntry,
  useTags,
  useTasks,
} from "@/lib/store/hooks";
import { useUI } from "@/components/app/ui-context";
import { useNowMs } from "@/hooks/use-now";
import { PriorityBadge, TagChip } from "./task-badges";
import { TaskHistory } from "./task-history";
import type { ResolvedOccurrence, Subtask, Tag } from "@/types";

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
    if (v && v !== sub.title) {
      onRename(v);
    }

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
            if (e.key === "Enter") {
              save();
            }

            if (e.key === "Escape") {
              setValue(sub.title);
              setEditing(false);
            }
          }}
          onBlur={save}
        />
      </li>
    );
  }

  return (
    <li className={cn("group flex items-center gap-2 py-1 transition-opacity", dragging && "opacity-40")}>
      <button
        type="button"
        aria-label="Arrastar para reordenar"
        onPointerDown={onPointerDownGrip}
        className="shrink-0 cursor-grab touch-none opacity-0 transition group-hover:opacity-100 active:cursor-grabbing max-md:opacity-60"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <button
        type="button"
        aria-label={done ? "Reabrir" : "Concluir"}
        onClick={onToggle}
        className={cn(
          "grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border-2 transition",
          done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/50 hover:border-foreground",
        )}
      >
        {done && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(sub.title);
          setEditing(true);
        }}
        className={cn("min-w-0 flex-1 break-words text-left text-sm", done && "text-muted-foreground line-through")}
      >
        {sub.title}
      </button>
      <button type="button" aria-label="Remover subtarefa" onClick={onRemove} className="opacity-0 transition group-hover:opacity-100 max-md:opacity-60">
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </li>
  );
}

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
  const [localOrder, setLocalOrder] = useState<Subtask[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const displayed = localOrder ?? subtasks;

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    setDragId(id);
    let order = [...subtasks];

    const onMove = (me: PointerEvent) => {
      const list = listRef.current;
      if (!list) {
        return;
      }

      const items = Array.from(list.children) as HTMLElement[];
      let target = items.length - 1;
      for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();
        if (me.clientY < rect.top + rect.height / 2) {
          target = i;
          break;
        }
      }

      const from = order.findIndex((s) => s.id === id);
      if (from === -1 || from === target) {
        return;
      }

      const next = [...order];
      const [item] = next.splice(from, 1);
      next.splice(target, 0, item);
      order = next;
      setLocalOrder(next);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const finalIndex = order.findIndex((s) => s.id === id);
      if (finalIndex !== -1) {
        onReorder(id, finalIndex);
      }

      setDragId(null);
      setLocalOrder(null);
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
          dragging={dragId === s.id}
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
      <button type="button" onClick={() => setOpen(true)} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Plus className="h-3.5 w-3.5" /> Adicionar subtarefa
      </button>
    );
  }

  const submit = () => {
    const v = value.trim();
    if (v) {
      onAdd(v);
    }

    setValue("");
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
          if (e.key === "Enter") {
            submit();
          }

          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <Button size="sm" className="h-8" onClick={submit}>
        Adicionar
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Fechar">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>;
}

export function TaskDetail({ occ }: { occ: ResolvedOccurrence }) {
  const ui = useUI();
  const { task } = occ;
  const tags = useTags();
  const tasks = useTasks();
  const occurrences = useOccurrenceStates();
  const projectsById = useProjectsById();
  const entries = useEntries();
  const running = useRunningEntry();
  const recurring = isRecurring(task);
  const dayState = occurrences[occ.dayKey];
  const [editingDayNote, setEditingDayNote] = useState(false);
  const [dayNote, setDayNoteText] = useState(dayState?.note ?? "");
  const [skipReasonOpen, setSkipReasonOpen] = useState(false);
  const [skipReasonText, setSkipReasonText] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const globalSubs = task.subtasks ?? [];
  const daySubs = dayState && !dayState.deletedAt ? dayState.subtasks ?? [] : [];
  const doneSet = new Set(dayState && !dayState.deletedAt ? dayState.subtaskDone ?? [] : []);
  const globalDesc = task.description?.trim();
  const dayDesc = dayState && !dayState.deletedAt ? dayState.note?.trim() : undefined;
  const taskTags = (task.tags ?? []).map((id) => tags.find((t) => t.id === id)).filter(Boolean) as Tag[];
  const project = task.projectId ? projectsById[task.projectId] : undefined;
  const taskLink = task.link ? normalizeUrl(task.link) : null;
  const runningHere = running?.taskId === task.id;
  const nowMs = useNowMs(30_000);

  const myEntries = useMemo(() => {
    const from = dayStartMs(occ.date);
    const to = from + 24 * 60 * 60_000;
    return entries
      .filter((e) => {
        if (e.taskId !== task.id) {
          return false;
        }

        if (e.occurrenceKey) {
          return e.occurrenceKey === occ.key || (!occ.scheduled && e.occurrenceKey === occ.dayKey);
        }

        return !occ.scheduled && occ.key === task.id ? true : e.start >= from && e.start < to;
      })
      .sort((a, b) => b.start - a.start);
  }, [entries, task.id, occ.key, occ.dayKey, occ.date, occ.scheduled]);

  const trackedMs = myEntries.reduce((sum, e) => sum + entryDuration(e, nowMs), 0);
  const plannedMin = occ.scheduled && !occ.openEnded ? occ.endMinute - occ.startMinute : 0;
  const trackedMin = trackedMs / 60_000;

  const subScopeLabel = occ.dayKey === task.id ? "" : "só hoje";

  const handleDelete = async () => {
    if (!recurring) {
      if (!confirmDelete) {
        setConfirmDelete(true);
        return;
      }

      const undo = deleteTask(task.id);
      ui.closeDetail();
      ui.toast("Tarefa excluída", { label: "Desfazer", run: undo });
      return;
    }

    const atFirst = occ.date <= recurrenceFloor(task);
    const scope = await ui.askScope({
      title: "Excluir tarefa recorrente",
      description: "Excluir \"Todos os dias\" apaga também o histórico. Para parar de repetir e manter o passado, use \"Este e os próximos\".",
      allowFollowing: !atFirst,
      labels: {
        this: "Só este dia",
        following: "Este e os próximos (mantém o histórico)",
        all: "Todos os dias (apaga o histórico)",
      },
      destructive: true,
    });
    if (!scope) {
      return;
    }

    ui.closeDetail();
    if (scope === "this") {
      ui.toast("Ocorrência removida", { label: "Desfazer", run: removeOccurrence(occ) });
    } else if (scope === "following") {
      ui.toast("Série encerrada — histórico mantido", { label: "Desfazer", run: endSeries(task.id, addDaysKey(occ.date, -1)) });
    } else {
      ui.toast("Tarefa excluída", { label: "Desfazer", run: deleteTask(task.id) });
    }
  };

  const handleEndSeries = () => {
    setMoreOpen(false);
    const undo = endSeries(task.id, occ.date);
    ui.toast(`Série encerrada em ${format(dayFromKey(occ.date), "d/MM")} — histórico mantido`, { label: "Desfazer", run: undo });
  };

  const toggleTimer = () => {
    if (runningHere) {
      stopTimer();
      return;
    }

    startTimer({ title: occ.title, taskId: task.id, occurrenceKey: occ.key, projectId: task.projectId, tags: task.tags });
    ui.toast(`Cronômetro iniciado: ${occ.title}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 pr-8">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: task.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-lg font-semibold leading-tight">{occ.title}</h2>
            {task.priority && <PriorityBadge priority={task.priority} />}
            {occ.skipped && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                Pulada
              </span>
            )}
            {occ.overdue && !occ.completed && (
              <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                Atrasada
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground first-letter:uppercase">
            {format(dayFromKey(occ.date), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {occ.scheduled
              ? `${minutesToTime(occ.startMinute)}${occ.openEnded ? " · em aberto" : ` – ${minutesToTime(occ.endMinute)}`} · `
              : occ.completed && occ.doneAt
                ? `Concluída em ${format(new Date(occ.doneAt), "d 'de' MMM, HH:mm", { locale: ptBR })} · `
                : task.date && !recurring
                  ? `Prazo ${format(dayFromKey(task.date), "d 'de' MMM", { locale: ptBR })} · `
                  : "Sem horário · "}
            {describeRecurrence(task.recurrence)}
          </p>
          {(project && !project.deletedAt) || taskTags.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {project && !project.deletedAt && (
                <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: project.color }} />
                  {project.name}
                </span>
              )}
              {taskTags.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
          ) : null}
          {occ.skipped && occ.skipReason && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Motivo: {occ.skipReason}</p>}
          {occ.overridden && (
            <p className="mt-1 flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400">
              Alterada só neste dia.
              <button type="button" className="underline underline-offset-2" onClick={() => clearOccurrenceOverride(occ)}>
                Voltar ao padrão
              </button>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        {occ.completed ? (
          <Button
            variant="outline"
            className="h-9 justify-center gap-1.5 border-green-500/40 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
            onClick={() => toggleDone(occ)}
          >
            <RotateCcw className="h-4 w-4" /> Concluída — reabrir
          </Button>
        ) : (
          <Button className="h-9 justify-center gap-1.5 bg-green-600 text-white hover:bg-green-700" onClick={() => toggleDone(occ)}>
            <Check className="h-4 w-4" strokeWidth={2.5} /> Concluir
          </Button>
        )}
        <Button variant={runningHere ? "destructive" : "outline"} className="h-9 gap-1.5" onClick={toggleTimer}>
          {runningHere ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          {runningHere ? "Parar" : "Cronômetro"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => ui.openForm({ taskId: task.id, occ: { key: occ.key, date: occ.date }, returnToDetail: true })}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ui.setDuplicateFrom({ taskId: task.id, date: occ.date })}>
          <Copy className="h-3.5 w-3.5" /> Duplicar
        </Button>
        {!occ.completed &&
          (occ.skipped ? (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setSkipped(occ, false)}>
              <Undo2 className="h-3.5 w-3.5" /> Desfazer pulada
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-amber-600 hover:text-amber-700 dark:text-amber-500"
              onClick={() => {
                setSkipReasonText("");
                setSkipReasonOpen((o) => !o);
              }}
            >
              <Ban className="h-3.5 w-3.5" /> Pular
            </Button>
          ))}
        <div className="relative ml-auto flex items-center gap-1">
          {recurring && (
            <Button size="icon-sm" variant="ghost" onClick={() => setMoreOpen((o) => !o)} aria-label="Mais ações">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg">
                <button type="button" onClick={handleEndSeries} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent">
                  <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-medium">Encerrar série neste dia</span>
                    <span className="block text-xs text-muted-foreground">Para de repetir depois daqui. O histórico fica.</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    ui.closeDetail();
                    ui.toast("Ocorrência removida", { label: "Desfazer", run: removeOccurrence(occ) });
                  }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent"
                >
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-medium">Remover só este dia</span>
                    <span className="block text-xs text-muted-foreground">A série continua nos outros dias.</span>
                  </span>
                </button>
              </div>
            </>
          )}
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void handleDelete()}>
            <Trash2 className="h-3.5 w-3.5" /> {confirmDelete ? "Confirmar" : "Excluir"}
          </Button>
        </div>
      </div>

      {skipReasonOpen && !occ.skipped && (
        <div className="flex items-center gap-2 rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
          <Input
            autoFocus
            value={skipReasonText}
            placeholder="Motivo (opcional)"
            className="h-8 flex-1 text-sm"
            onChange={(e) => setSkipReasonText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSkipped(occ, true, skipReasonText);
                setSkipReasonOpen(false);
              }

              if (e.key === "Escape") {
                setSkipReasonOpen(false);
              }
            }}
          />
          <Button
            size="sm"
            className="h-8 bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => {
              setSkipped(occ, true, skipReasonText);
              setSkipReasonOpen(false);
            }}
          >
            Confirmar
          </Button>
        </div>
      )}

      {(trackedMs > 0 || plannedMin > 0) && (
        <section className="rounded-lg border bg-muted/20 px-3 py-2.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium">Tempo registrado</span>
            <span className="tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{formatMinutes(trackedMin)}</span>
              {plannedMin > 0 && ` de ${formatMinutes(plannedMin)} planejados`}
            </span>
          </div>
          {plannedMin > 0 && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", trackedMin > plannedMin ? "bg-amber-500" : "bg-primary")}
                style={{ width: `${Math.min(100, (trackedMin / plannedMin) * 100)}%` }}
              />
            </div>
          )}
          {myEntries.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {myEntries.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => ui.openEntry({ entryId: e.id })}
                    className="flex w-full items-center justify-between rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                  >
                    <span className="tabular-nums">
                      {format(new Date(e.start), "d/MM HH:mm")}
                      {e.end ? ` – ${format(new Date(e.end), "HH:mm")}` : " · rodando"}
                    </span>
                    <span className="tabular-nums">{formatMinutes(entryDuration(e, nowMs) / 60_000)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
            <span className="block truncate text-xs text-muted-foreground">{prettyUrl(taskLink)}</span>
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </a>
      )}

      <div className="space-y-3">
        {globalDesc && (
          <section>
            {recurring && <SectionLabel>Descrição — geral</SectionLabel>}
            <Markdown>{globalDesc}</Markdown>
          </section>
        )}

        {recurring &&
          (editingDayNote ? (
            <section className="space-y-1.5">
              <SectionLabel>Nota só deste dia (markdown)</SectionLabel>
              <textarea
                autoFocus
                value={dayNote}
                rows={3}
                placeholder="Algo só para este dia…"
                onChange={(e) => setDayNoteText(e.target.value)}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setDayNote(occ, dayNote);
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
                    setDayNoteText(dayState?.note ?? "");
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
                <SectionLabel>Nota só deste dia</SectionLabel>
                <button
                  type="button"
                  onClick={() => {
                    setDayNoteText(dayState?.note ?? "");
                    setEditingDayNote(true);
                  }}
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
              <Plus className="h-3.5 w-3.5" /> Adicionar nota deste dia
            </button>
          ))}
      </div>

      <div className="space-y-3">
        {(globalSubs.length > 0 || !recurring) && (
          <section>
            {recurring && globalSubs.length > 0 && <SectionLabel>Subtarefas — gerais</SectionLabel>}
            {!recurring && globalSubs.length > 0 && <SectionLabel>Subtarefas</SectionLabel>}
            <SubtaskBlock occ={occ} subs={globalSubs} scope="global" doneSet={doneSet} />
          </section>
        )}

        {recurring && (
          <section>
            <SectionLabel>Subtarefas — {subScopeLabel || "deste dia"}</SectionLabel>
            <SubtaskBlock occ={occ} subs={daySubs} scope="day" doneSet={doneSet} />
          </section>
        )}
      </div>

      {recurring && <TaskHistory task={task} tasks={tasks} occurrences={occurrences} todayKey={todayKey} />}
    </div>
  );
}

function SubtaskBlock({
  occ,
  subs,
  scope,
  doneSet,
}: {
  occ: ResolvedOccurrence;
  subs: Subtask[];
  scope: SubtaskScope;
  doneSet: Set<string>;
}) {
  return (
    <>
      <SortableSubtaskList
        subtasks={subs}
        isDone={(id) => doneSet.has(id)}
        onToggle={(id) => toggleSubtaskDone(occ, id)}
        onRemove={(id) => removeSubtask(occ, id, scope)}
        onRename={(id, t) => renameSubtask(occ, id, t, scope)}
        onReorder={(id, idx) => reorderSubtask(occ, id, idx, scope)}
      />
      <AddSubtask onAdd={(t) => addSubtask(occ, t, scope)} />
    </>
  );
}
