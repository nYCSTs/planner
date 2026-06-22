"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
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
import { dateKey, minutesToTime, timeToMinutes } from "@/lib/time";
import { findConflicts } from "@/lib/conflicts";
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
  { value: "hourly", label: "A cada hora" },
  { value: "weekdays", label: "Dias úteis" },
  { value: "weekends", label: "Fim de semana" },
  { value: "everyday", label: "Todos os dias" },
  { value: "custom", label: "Dias específicos" },
];

export interface TaskDraft {
  startMinute: number;
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
}: TaskDialogProps) {
  const editing = draft?.task;

  const [title, setTitle] = useState("");
  const [color, setColor] = useState(TASK_COLORS[0]);
  const [start, setStart] = useState("09:00");
  const [hasEnd, setHasEnd] = useState(true);
  const [end, setEnd] = useState("10:00");
  const [kind, setKind] = useState<RecurrenceKind>("once");
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [notifyStart, setNotifyStart] = useState<number>(defaultNotifyStart);
  const [notifyEnd, setNotifyEnd] = useState<number>(defaultNotifyEnd);

  // Reset form whenever a new draft opens.
  useEffect(() => {
    if (!open || !draft) return;
    if (editing) {
      setTitle(editing.title);
      setColor(editing.color);
      setStart(minutesToTime(editing.startMinute));
      setHasEnd(editing.endMinute !== null);
      setEnd(minutesToTime(editing.endMinute ?? editing.startMinute + 60));
      setKind(editing.recurrence.kind);
      setWeekdays(editing.recurrence.weekdays ?? []);
      setNotifyStart(editing.notifyBeforeStart ?? defaultNotifyStart);
      setNotifyEnd(editing.notifyBeforeEnd ?? defaultNotifyEnd);
    } else {
      setTitle("");
      setColor(randomColor());
      setStart(minutesToTime(draft.startMinute));
      setHasEnd(true);
      setEnd(minutesToTime(draft.startMinute + 60));
      setKind("once");
      setWeekdays([]);
      setNotifyStart(defaultNotifyStart);
      setNotifyEnd(defaultNotifyEnd);
    }
  }, [open, draft, editing, defaultNotifyStart, defaultNotifyEnd]);

  const startMinute = timeToMinutes(start);
  const endMinute = hasEnd ? timeToMinutes(end) : null;

  const candidate = useMemo(
    () => ({
      startMinute,
      endMinute,
      recurrence: { kind, weekdays: kind === "custom" ? weekdays : undefined },
      date: kind === "once" ? dateKey(day) : undefined,
    }),
    [startMinute, endMinute, kind, weekdays, day],
  );

  const conflicts = useMemo(
    () => findConflicts(candidate, existingTasks, editing?.id),
    [candidate, existingTasks, editing?.id],
  );

  const endBeforeStart = endMinute !== null && endMinute <= startMinute;
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
        color,
        startMinute,
        endMinute,
        recurrence: {
          kind,
          weekdays: kind === "custom" ? weekdays : undefined,
        },
        date: kind === "once" ? dateKey(day) : undefined,
        notifyBeforeStart: notifyStart,
        notifyBeforeEnd: notifyEnd,
      },
      editing?.id,
    );
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start">
                {kind === "hourly" ? "Minuto inicial" : "Início"}
              </Label>
              <Input
                id="start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="end">Término</Label>
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

          {!hasEnd && (
            <p className="text-xs text-muted-foreground">
              Sem término definido — você finaliza manualmente pela timeline.
            </p>
          )}
          {endBeforeStart && (
            <p className="text-xs text-destructive">
              O término precisa ser depois do início.
            </p>
          )}

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
              onClick={() => {
                onDelete(editing.id);
                onClose();
              }}
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
