"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, Eye, Pencil, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TASK_COLORS, randomColor } from "@/lib/colors";
import { dateKey, minutesToTime, nowMinutes, timeToMinutes } from "@/lib/time";
import { findConflicts } from "@/lib/conflicts";
import { Markdown } from "@/components/markdown";
import type { RecurrenceKind, Task, Weekday } from "@/types";

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
  { value: "weekdays", label: "Dias úteis" },
  { value: "weekends", label: "Fim de semana" },
  { value: "everyday", label: "Todos os dias" },
  { value: "custom", label: "Dias específicos" },
];

export interface TaskDraft {
  /** Prefill start time, or null to open as an unscheduled ("Sem horário") task. */
  startMinute: number | null;
  task?: Task;
}

interface TaskDialogProps {
  open: boolean;
  draft: TaskDraft | null;
  day: Date;
  existingTasks: Task[];
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
  defaultNotifyStart,
  defaultNotifyEnd,
  onClose,
  onSave,
  onDelete,
  onBack,
}: TaskDialogProps) {
  const editing = draft?.task;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(TASK_COLORS[0]);
  const [hasTime, setHasTime] = useState(true);
  const [start, setStart] = useState("09:00");
  const [hasEnd, setHasEnd] = useState(true);
  const [end, setEnd] = useState("10:00");
  const [kind, setKind] = useState<RecurrenceKind>("once");
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [everyHour, setEveryHour] = useState(false);
  const [everyHourInterval, setEveryHourInterval] = useState(1);
  const [hideElapsed, setHideElapsed] = useState(false);
  const [notifyStart, setNotifyStart] = useState<number>(defaultNotifyStart);
  const [notifyEnd, setNotifyEnd] = useState<number>(defaultNotifyEnd);
  const [soundOn, setSoundOn] = useState(true);
  const [descPreview, setDescPreview] = useState(false);

  // Reset form whenever a new draft opens.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!open || !draft) return;
    if (editing) {
      const scheduled = editing.startMinute !== null;
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setColor(editing.color);
      setHasTime(scheduled);
      setStart(minutesToTime(editing.startMinute ?? 540));
      setHasEnd(editing.endMinute !== null);
      setEnd(minutesToTime(editing.endMinute ?? (editing.startMinute ?? 540) + 60));
      setKind(editing.recurrence.kind);
      setWeekdays(editing.recurrence.weekdays ?? []);
      setEveryHour(editing.recurrence.everyHour ?? false);
      setEveryHourInterval(editing.recurrence.everyHourInterval ?? 1);
      setHideElapsed(editing.hideElapsed ?? false);
      setNotifyStart(editing.notifyBeforeStart ?? defaultNotifyStart);
      setNotifyEnd(editing.notifyBeforeEnd ?? defaultNotifyEnd);
      setSoundOn(editing.soundEnabled ?? true);
      setDescPreview(Boolean(editing.description?.trim()));
    } else {
      setTitle("");
      setDescription("");
      setColor(randomColor());
      setHasTime(draft.startMinute !== null);
      setStart(minutesToTime(draft.startMinute ?? 540));
      setHasEnd(true);
      setEnd(minutesToTime((draft.startMinute ?? 540) + 60));
      setKind("once");
      setWeekdays([]);
      setEveryHour(false);
      setEveryHourInterval(1);
      setHideElapsed(false);
      setNotifyStart(defaultNotifyStart);
      setNotifyEnd(defaultNotifyEnd);
      setSoundOn(true);
      setDescPreview(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, draft, editing, defaultNotifyStart, defaultNotifyEnd]);

  // Without a time the task is unscheduled: no start/end, no hourly, no conflicts.
  const startMinute = hasTime ? timeToMinutes(start) : null;
  const endMinute = hasTime && hasEnd ? timeToMinutes(end) : null;

  // "Every hour" only makes sense on timed, recurring patterns.
  const hourly = hasTime && everyHour && kind !== "once";

  const candidate = useMemo(
    () => ({
      startMinute,
      endMinute,
      recurrence: {
        kind,
        weekdays: kind === "custom" ? weekdays : undefined,
        everyHour: hourly,
      },
      date: kind === "once" ? dateKey(day) : undefined,
    }),
    [startMinute, endMinute, kind, weekdays, hourly, day],
  );

  const conflicts = useMemo(
    () =>
      startMinute === null
        ? []
        : findConflicts(
            { ...candidate, startMinute },
            existingTasks,
            editing?.id,
          ),
    [candidate, startMinute, existingTasks, editing?.id],
  );

  const endBeforeStart =
    startMinute !== null && endMinute !== null && endMinute <= startMinute;
  const invalid = !title.trim() || endBeforeStart || (kind === "custom" && weekdays.length === 0);

  const toggleWeekday = (d: Weekday) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const handleSave = () => {
    if (invalid) return;
    onSave(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        // Subtasks are managed in the detail view; preserve them here.
        subtasks: editing?.subtasks,
        color,
        startMinute,
        endMinute,
        recurrence: {
          kind,
          weekdays: kind === "custom" ? weekdays : undefined,
          everyHour: hourly,
          everyHourInterval: hourly ? Math.max(1, everyHourInterval) : undefined,
        },
        date: kind === "once" ? dateKey(day) : undefined,
        hideElapsed: hourly ? false : hideElapsed,
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
          <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              autoFocus
              placeholder="Ex: Revisão de aprendizado"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {TASK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition",
                    color === c && "ring-2 ring-ring",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Descrição (markdown)</Label>
              <button
                type="button"
                onClick={() => setDescPreview((p) => !p)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {descPreview ? (
                  <>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" /> Pré-visualizar
                  </>
                )}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <textarea
                id="description"
                value={description}
                placeholder="Suporta markdown: **negrito**, listas, links…"
                rows={5}
                onChange={(e) => setDescription(e.target.value)}
                className={cn(
                  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  !descPreview && "sm:col-span-2",
                )}
              />
              {descPreview && (
                <div className="min-h-24 overflow-y-auto rounded-md border border-dashed bg-muted/30 px-3 py-2">
                  {description.trim() ? (
                    <Markdown>{description}</Markdown>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Pré-visualização aparece aqui.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Repetição</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as RecurrenceKind)}>
              <SelectTrigger>
                <SelectValue />
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

          {kind === "custom" && (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => toggleWeekday(w.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs transition",
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

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="hasTime" className="text-sm font-normal">
                Definir horário
              </Label>
              <p className="text-xs text-muted-foreground">
                Desligue para uma tarefa sem horário (não vai para a timeline).
              </p>
            </div>
            <Switch id="hasTime" checked={hasTime} onCheckedChange={setHasTime} />
          </div>

          {hasTime && kind !== "once" && (
            <div className="space-y-2 rounded-md border px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="everyHour" className="text-sm font-normal">
                    Repetir em intervalos de horas
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Repete a partir do horário de início, nos dias selecionados.
                  </p>
                </div>
                <Switch
                  id="everyHour"
                  checked={everyHour}
                  onCheckedChange={setEveryHour}
                />
              </div>
              {everyHour && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-sm text-muted-foreground">A cada</span>
                  <Input
                    id="everyHourInterval"
                    type="number"
                    min={1}
                    max={23}
                    value={everyHourInterval}
                    onChange={(e) =>
                      setEveryHourInterval(Math.max(1, Number(e.target.value)))
                    }
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">
                    hora{everyHourInterval === 1 ? "" : "s"}
                  </span>
                </div>
              )}
            </div>
          )}

          {hasTime && !everyHour && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="hideElapsed" className="text-sm font-normal">
                  Não considerar passado
                </Label>
                <p className="text-xs text-muted-foreground">
                  Esconde ocorrências já encerradas no dia de hoje.
                </p>
              </div>
              <Switch
                id="hideElapsed"
                checked={hideElapsed}
                onCheckedChange={setHideElapsed}
              />
            </div>
          )}

          {hasTime && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="soundOn" className="text-sm font-normal">
                  Som ao notificar
                </Label>
                <p className="text-xs text-muted-foreground">
                  Toca um alerta sonoro nas notificações desta tarefa.
                </p>
              </div>
              <Switch id="soundOn" checked={soundOn} onCheckedChange={setSoundOn} />
            </div>
          )}

          {hasTime && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="start">
                  {hourly ? "Primeiro horário" : "Início"}
                </Label>
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
                <Label htmlFor="end">
                  {hourly ? "Repetir até" : "Término"}
                </Label>
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
          )}

          {hasTime && hourly && (
            <p className="text-xs text-muted-foreground">
              Repete a partir do primeiro horário. "Repetir até" define quando parar
              — sem ele vai até o fim do dia. Ex: 14h a cada 2h até 20h → 14h, 16h, 18h.
            </p>
          )}
          {hasTime && !hasEnd && (
            <p className="text-xs text-muted-foreground">
              Sem término definido — você finaliza manualmente pela timeline.
            </p>
          )}
          {endBeforeStart && (
            <p className="text-xs text-destructive">
              O término precisa ser depois do início.
            </p>
          )}

          {hasTime && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns">Avisar antes de iniciar (min)</Label>
              <Input
                id="ns"
                type="number"
                min={0}
                value={notifyStart}
                onChange={(e) => setNotifyStart(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ne">Avisar antes de terminar (min)</Label>
              <Input
                id="ne"
                type="number"
                min={0}
                value={notifyEnd}
                disabled={!hasEnd}
                onChange={(e) => setNotifyEnd(Number(e.target.value))}
              />
            </div>
          </div>
          )}

          {conflicts.length > 0 && (
            <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium">Conflito de horário</p>
                <p className="text-muted-foreground">
                  Sobrepõe: {conflicts.map((c) => c.title).join(", ")}. Você pode
                  salvar mesmo assim.
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
