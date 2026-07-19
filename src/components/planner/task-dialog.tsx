"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, Eye, Info, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, normalizeUrl } from "@/lib/utils";
import { TASK_COLORS, randomColor } from "@/lib/colors";
import { dateKey, minutesToTime, nowMinutes, timeToMinutes } from "@/lib/time";
import { findConflicts } from "@/lib/conflicts";
import { Markdown } from "@/components/markdown";
import { ColorPicker, LinkField, PrioritySelector, TagSelector } from "./task-form-controls";
import type { Priority, RecurrenceKind, Subtask, Tag, Task, Weekday } from "@/types";

const WEEKDAY_LABELS: { value: Weekday; label: string }[] = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const RECURRENCE_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: "once", label: "Pontual (um dia)" },
  { value: "weekdays", label: "Dias úteis (Seg–Sex)" },
  { value: "weekends", label: "Fim de semana" },
  { value: "everyday", label: "Todos os dias" },
  { value: "custom", label: "Dias específicos" },
];

// Quick end-time presets (minutes of duration from start).
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

export interface TaskDraft {
  /** Prefill start time, or null to open as an unscheduled ("Sem horário") task. */
  startMinute: number | null;
  /** Prefill end time (e.g. from a drag-to-create interval on the timeline). */
  endMinute?: number;
  task?: Task;
}

interface TaskDialogProps {
  open: boolean;
  draft: TaskDraft | null;
  day: Date;
  existingTasks: Task[];
  allTags: Tag[];
  onCreateTag: (label: string, color: string) => Tag;
  defaultNotifyStart: number;
  defaultNotifyEnd: number;
  onClose: () => void;
  onSave: (task: Omit<Task, "id" | "createdAt">, id?: string) => void;
  onDelete?: (id: string) => void;
  /** When set, shows a back button (top-left) instead of just closing. */
  onBack?: () => void;
}

export function TaskDialog({
  open,
  draft,
  day,
  existingTasks,
  allTags,
  onCreateTag,
  defaultNotifyStart,
  defaultNotifyEnd,
  onClose,
  onSave,
  onDelete,
  onBack,
}: TaskDialogProps) {
  const editing = draft?.task;
  const isTracked = Boolean(editing?.tracked);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(TASK_COLORS[0]);
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSub, setNewSub] = useState("");
  const [start, setStart] = useState("09:00");
  const [hasEnd, setHasEnd] = useState(true);
  const [end, setEnd] = useState("10:00");
  const [kind, setKind] = useState<RecurrenceKind>("once");
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  // Date the "once" task lives on (yyyy-MM-dd).
  const [onceDate, setOnceDate] = useState<string>(() => dateKey(day));
  // Recurrence window for repeating tasks.
  const [startDate, setStartDate] = useState<string>(() => dateKey(day));
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState<string>(() => dateKey(day));
  const [everyHour, setEveryHour] = useState(false);
  const [everyHourInterval, setEveryHourInterval] = useState(1);
  const [everyHourDuration, setEveryHourDuration] = useState<number | "">(60);
  const [notifyStart, setNotifyStart] = useState<number>(defaultNotifyStart);
  const [notifyEnd, setNotifyEnd] = useState<number>(defaultNotifyEnd);
  const [soundOn, setSoundOn] = useState(true);
  const [descPreview, setDescPreview] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset form whenever a new draft opens.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!open || !draft) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setColor(editing.color);
      setPriority(editing.priority);
      setTags(editing.tags ?? []);
      setLink(editing.link ?? "");
      setSubtasks(editing.subtasks ?? []);
      setStart(minutesToTime(editing.startMinute ?? 540));
      setHasEnd(editing.endMinute !== null);
      setEnd(minutesToTime(editing.endMinute ?? (editing.startMinute ?? 540) + 60));
      setKind(editing.recurrence.kind);
      setWeekdays(editing.recurrence.weekdays ?? []);
      setOnceDate(editing.date ?? dateKey(day));
      setStartDate(editing.recurrence.startDate ?? dateKey(new Date(editing.createdAt)));
      setHasEndDate(Boolean(editing.recurrence.endDate));
      setEndDate(editing.recurrence.endDate ?? dateKey(day));
      setEveryHour(editing.recurrence.everyHour ?? false);
      setEveryHourInterval(editing.recurrence.everyHourInterval ?? 1);
      setEveryHourDuration(editing.recurrence.everyHourDuration ?? 60);
      setNotifyStart(editing.notifyBeforeStart ?? defaultNotifyStart);
      setNotifyEnd(editing.notifyBeforeEnd ?? defaultNotifyEnd);
      setSoundOn(editing.soundEnabled ?? true);
      setDescPreview(false);
      setShowAdvanced(Boolean(editing.notifyBeforeStart !== undefined || editing.recurrence.endDate));
    } else {
      setTitle("");
      setDescription("");
      setColor(randomColor());
      setPriority(undefined);
      setTags([]);
      setLink("");
      setSubtasks([]);
      setStart(minutesToTime(draft.startMinute ?? 540));
      setHasEnd(true);
      setEnd(minutesToTime(draft.endMinute ?? (draft.startMinute ?? 540) + 60));
      setKind("once");
      setWeekdays([]);
      setOnceDate(dateKey(day));
      setStartDate(dateKey(day));
      setHasEndDate(false);
      setEndDate(dateKey(day));
      setEveryHour(false);
      setEveryHourInterval(1);
      setEveryHourDuration(60);
      setNotifyStart(defaultNotifyStart);
      setNotifyEnd(defaultNotifyEnd);
      // New tasks default to no alarm sound; the user can opt in per task.
      setSoundOn(false);
      setDescPreview(false);
      setShowAdvanced(false);
    }
    setNewSub("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, draft, editing, defaultNotifyStart, defaultNotifyEnd, day]);

  const startMinute = timeToMinutes(start);
  const endMinute = hasEnd ? timeToMinutes(end) : null;
  const durationMin = endMinute !== null ? endMinute - startMinute : null;

  // "Every hour" only makes sense on timed, recurring patterns.
  const hourly = everyHour && kind !== "once";
  const isRecurring = kind !== "once";

  const candidate = useMemo(
    () => ({
      startMinute,
      endMinute,
      recurrence: {
        kind,
        weekdays: kind === "custom" ? weekdays : undefined,
        everyHour: hourly,
        startDate: isRecurring ? startDate : undefined,
      },
      date: kind === "once" ? onceDate : undefined,
    }),
    [startMinute, endMinute, kind, weekdays, hourly, isRecurring, startDate, onceDate],
  );

  const conflicts = useMemo(
    () => findConflicts(candidate, existingTasks, editing?.id),
    [candidate, existingTasks, editing?.id],
  );

  const endBeforeStart = endMinute !== null && endMinute <= startMinute;
  const endDateBeforeStart = isRecurring && hasEndDate && endDate < startDate;

  // When creating (not editing), block past dates/times.
  const isInPast = !editing && (() => {
    const now = new Date();
    const todayKey = dateKey(now);
    if (kind === "once") {
      if (onceDate < todayKey) return true;
      if (onceDate === todayKey && startMinute < nowMinutes(now)) return true;
    }
    return false;
  })();

  const invalid =
    !title.trim() ||
    endBeforeStart ||
    endDateBeforeStart ||
    (kind === "custom" && weekdays.length === 0) ||
    isInPast;

  const toggleWeekday = (d: Weekday) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const addSubtask = () => {
    const v = newSub.trim();
    if (!v) return;
    setSubtasks((prev) => [...prev, { id: uid(), title: v }]);
    setNewSub("");
  };

  const handleSave = () => {
    if (invalid) return;
    onSave(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        subtasks: subtasks.length > 0 ? subtasks : undefined,
        color,
        priority,
        tags: tags.length > 0 ? tags : undefined,
        link: normalizeUrl(link) ?? undefined,
        startMinute,
        endMinute,
        recurrence: {
          kind,
          weekdays: kind === "custom" ? weekdays : undefined,
          startDate: isRecurring ? startDate : undefined,
          endDate: isRecurring && hasEndDate ? endDate : undefined,
          everyHour: hourly,
          everyHourInterval: hourly ? Math.max(1, everyHourInterval) : undefined,
          everyHourDuration:
            hourly && everyHourDuration !== "" ? Math.max(1, everyHourDuration) : undefined,
        },
        date: kind === "once" ? onceDate : undefined,
        notifyBeforeStart: notifyStart,
        notifyBeforeEnd: notifyEnd,
        soundEnabled: soundOn,
      },
      editing?.id,
    );
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-2xl">
        <DialogHeader>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Voltar
            </button>
          )}
          <DialogTitle>
            {isTracked ? "Editar registro" : editing ? "Editar tarefa" : "Nova tarefa"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Heads-up: editing a recurring task changes every occurrence. */}
          {editing && isRecurring && !isTracked && (
            <div className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Esta tarefa se repete. As alterações valem para <strong>todos os dias</strong>.
                Para mudar só um dia, use a nota/subtarefas do dia no detalhe.
              </span>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              autoFocus
              placeholder="Ex: Revisão de aprendizado"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !invalid) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>

          {/* Priority + color on one row */}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <PrioritySelector value={priority} onChange={setPriority} clearable />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Etiquetas</Label>
            <TagSelector
              allTags={allTags}
              selected={tags}
              onToggle={(id) =>
                setTags((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                )
              }
              onCreate={onCreateTag}
            />
          </div>

          {/* Link */}
          <div className="space-y-1.5">
            <Label htmlFor="link">Link</Label>
            <LinkField id="link" value={link} onChange={setLink} />
          </div>

          {/* Recurrence */}
          {!isTracked && (
            <div className="space-y-1.5">
              <Label>Repetição</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as RecurrenceKind)}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue>
                    {(v: RecurrenceKind) =>
                      RECURRENCE_OPTIONS.find((o) => o.value === v)?.label ?? v
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isTracked && kind === "custom" && (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => toggleWeekday(w.value)}
                  className={cn(
                    "h-8 w-11 rounded-lg border text-xs font-medium transition",
                    weekdays.includes(w.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          )}

          {/* Date — "once" gets a single date; recurring gets a start (and optional end). */}
          {!isTracked && (
            kind === "once" ? (
              <div className="space-y-1.5">
                <Label htmlFor="once-date">Data</Label>
                <Input
                  id="once-date"
                  type="date"
                  value={onceDate}
                  min={editing ? undefined : dateKey(new Date())}
                  onChange={(e) => e.target.value && setOnceDate(e.target.value)}
                  className="w-full sm:w-56"
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date">Começa a repetir em</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => e.target.value && setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="end-date">Termina em</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">definir</span>
                      <Switch checked={hasEndDate} onCheckedChange={setHasEndDate} />
                    </div>
                  </div>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    min={startDate}
                    disabled={!hasEndDate}
                    onChange={(e) => e.target.value && setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )
          )}

          {endDateBeforeStart && (
            <p className="text-xs text-destructive">
              A data de término precisa ser depois do início.
            </p>
          )}

          {/* Timing: start / end + duration presets */}
          <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="start">{hourly ? "Primeiro horário" : "Início"}</Label>
                  <button
                    type="button"
                    onClick={() => setStart(minutesToTime(nowMinutes()))}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    agora
                  </button>
                </div>
                <Input
                  id="start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="end">{hourly ? "Repetir até" : "Término"}</Label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">definir</span>
                    <Switch checked={hasEnd} onCheckedChange={setHasEnd} />
                  </div>
                </div>
                <Input
                  id="end"
                  type="time"
                  value={end}
                  disabled={!hasEnd}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>

            {/* Duration presets — only for non-hourly tasks with an end. */}
            {hasEnd && !hourly && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Duração:</span>
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEnd(minutesToTime(startMinute + d))}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs font-medium transition",
                      durationMin === d
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {formatDuration(d)}
                  </button>
                ))}
              </div>
            )}

            {endBeforeStart && (
              <p className="text-xs text-destructive">O término precisa ser depois do início.</p>
            )}
            {!hasEnd && !hourly && (
              <p className="text-xs text-muted-foreground">
                Sem término — você finaliza manualmente pela timeline.
              </p>
            )}
          </div>

          {/* Hourly options */}
          {!isTracked && hourly && (
            <div className="space-y-2.5 rounded-lg border px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">A cada</span>
                <NumberStepper
                  value={everyHourInterval}
                  min={1}
                  max={23}
                  suffix={everyHourInterval === 1 ? "hora" : "horas"}
                  onChange={setEveryHourInterval}
                  className="w-28"
                  aria-label="Intervalo em horas"
                />
                <span className="text-sm text-muted-foreground">por sessão de</span>
                <NumberStepper
                  value={everyHourDuration === "" ? 60 : everyHourDuration}
                  min={1}
                  max={1439}
                  step={5}
                  suffix="min"
                  onChange={setEveryHourDuration}
                  className="w-28"
                  aria-label="Duração de cada sessão em minutos"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Ex: início 14h, a cada 2h, até 20h, 30 min → sessões às 14h, 16h, 18h e 20h.
              </p>
            </div>
          )}

          {/* "Repeat hourly" toggle for recurring timed tasks */}
          {!isTracked && kind !== "once" && (
            <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5">
              <div>
                <span className="text-sm font-normal">Repetir em intervalos de horas</span>
                <p className="text-xs text-muted-foreground">
                  Cria várias sessões ao longo do dia a partir do início.
                </p>
              </div>
              <Switch checked={everyHour} onCheckedChange={setEveryHour} />
            </label>
          )}

          {/* Subtasks */}
          <div className="space-y-1.5">
            <Label>Subtarefas</Label>
            {subtasks.length > 0 && (
              <ul className="space-y-1">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm">
                    <span className="grid h-4 w-4 place-items-center rounded-full border border-muted-foreground/40 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <button
                      type="button"
                      onClick={() => setSubtasks((prev) => prev.filter((x) => x.id !== s.id))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remover subtarefa"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-1.5">
              <Input
                value={newSub}
                placeholder="Adicionar subtarefa e pressionar Enter"
                className="h-8 text-sm"
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addSubtask(); }
                }}
              />
              <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={addSubtask}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Descrição (markdown)</Label>
              <button
                type="button"
                onClick={() => setDescPreview((p) => !p)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {descPreview ? (
                  <><Pencil className="h-3.5 w-3.5" /> Editar</>
                ) : (
                  <><Eye className="h-3.5 w-3.5" /> Pré-visualizar</>
                )}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <textarea
                id="description"
                value={description}
                placeholder="Suporta markdown: **negrito**, listas, links…"
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
                className={cn(
                  "flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  !descPreview && "sm:col-span-2",
                )}
              />
              {descPreview && (
                <div className="min-h-24 overflow-y-auto rounded-lg border border-dashed bg-muted/30 px-3 py-2">
                  {description.trim() ? (
                    <Markdown>{description}</Markdown>
                  ) : (
                    <span className="text-xs text-muted-foreground">Pré-visualização aparece aqui.</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Advanced: notifications */}
          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setShowAdvanced((a) => !a)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
            >
              Notificações e som
              <ChevronLeft className={cn("h-4 w-4 transition-transform", showAdvanced ? "-rotate-90" : "rotate-0")} />
            </button>
            {showAdvanced && (
              <div className="space-y-3 border-t px-3 py-3">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-normal">Som ao notificar</span>
                    <span className="block text-xs text-muted-foreground">
                      Toca o alarme quando esta tarefa avisar.
                    </span>
                  </span>
                  <Switch checked={soundOn} onCheckedChange={setSoundOn} />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="ns" className="text-sm font-normal">Avisar antes de iniciar</Label>
                  <NumberStepper
                    id="ns"
                    value={notifyStart}
                    min={0}
                    max={1440}
                    step={5}
                    suffix="min"
                    onChange={setNotifyStart}
                    className="w-28"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="ne" className="text-sm font-normal">Avisar antes de terminar</Label>
                  <NumberStepper
                    id="ne"
                    value={notifyEnd}
                    min={0}
                    max={1440}
                    step={5}
                    suffix="min"
                    disabled={!hasEnd}
                    onChange={setNotifyEnd}
                    className="w-28"
                  />
                </div>
              </div>
            )}
          </div>

          {isInPast && (
            <p className="text-xs text-destructive">
              Não é possível criar tarefas no passado. Ajuste a data ou o horário.
            </p>
          )}

          {conflicts.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium">Conflito de horário</p>
                <p className="text-muted-foreground">
                  Sobrepõe: {conflicts.map((c) => c.title).join(", ")}. Você pode salvar mesmo assim.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {editing && onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => onDelete(editing.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={invalid} onClick={handleSave}>
              {editing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
