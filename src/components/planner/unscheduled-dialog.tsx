"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { randomColor, TASK_COLORS } from "@/lib/colors";
import { normalizeUrl } from "@/lib/utils";
import { ColorPicker, LinkField, PrioritySelector, TagSelector } from "./task-form-controls";
import type { Priority, RecurrenceKind, Subtask, Tag, Task, Weekday } from "@/types";

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const WEEKDAY_LABELS: { value: Weekday; label: string }[] = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

// For unscheduled tasks, "once" means a persistent backlog item (do it someday);
// recurring kinds mean a habit/chore that recurs but has no fixed time.
const RECURRENCE_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: "once", label: "Uma vez (fica na lista até concluir)" },
  { value: "everyday", label: "Todos os dias" },
  { value: "weekdays", label: "Dias úteis (Seg–Sex)" },
  { value: "weekends", label: "Fim de semana" },
  { value: "custom", label: "Dias específicos" },
];

interface UnscheduledDialogProps {
  open: boolean;
  editing?: Task;
  allTags: Tag[];
  onCreateTag: (label: string, color: string) => Tag;
  onClose: () => void;
  onSave: (fields: Omit<Task, "id" | "createdAt">, id?: string) => void;
  onDelete?: (id: string) => void;
}

export function UnscheduledDialog({
  open,
  editing,
  allTags,
  onCreateTag,
  onClose,
  onSave,
  onDelete,
}: UnscheduledDialogProps) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(TASK_COLORS[0]);
  const [priority, setPriority] = useState<Priority | undefined>("medium");
  const [tags, setTags] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSub, setNewSub] = useState("");
  const [kind, setKind] = useState<RecurrenceKind>("once");
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (editing) {
      setTitle(editing.title);
      setColor(editing.color);
      setPriority(editing.priority ?? "medium");
      setTags(editing.tags ?? []);
      setLink(editing.link ?? "");
      setDescription(editing.description ?? "");
      setSubtasks(editing.subtasks ?? []);
      setKind(editing.recurrence.kind);
      setWeekdays(editing.recurrence.weekdays ?? []);
    } else {
      setTitle("");
      setColor(randomColor());
      setPriority("medium");
      setTags([]);
      setLink("");
      setDescription("");
      setSubtasks([]);
      setKind("once");
      setWeekdays([]);
    }
    setNewSub("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editing]);

  const invalid = !title.trim() || (kind === "custom" && weekdays.length === 0);

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
        color,
        priority,
        tags: tags.length > 0 ? tags : undefined,
        link: normalizeUrl(link) ?? undefined,
        description: description.trim() || undefined,
        subtasks: subtasks.length > 0 ? subtasks : undefined,
        startMinute: null,
        endMinute: null,
        recurrence: {
          kind,
          weekdays: kind === "custom" ? weekdays : undefined,
        },
      },
      editing?.id,
    );
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar tarefa" : "Nova tarefa sem horário"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="u-title">Título</Label>
            <Input
              id="u-title"
              value={title}
              autoFocus
              placeholder="Ex: Ler artigo sobre React"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !invalid) handleSave(); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <PrioritySelector value={priority} onChange={setPriority} />
          </div>

          {/* Recurrence — lets an unscheduled task repeat (a habit/chore with no
              set time) instead of being a one-off. */}
          <div className="space-y-1.5">
            <Label>Repetição</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as RecurrenceKind)}>
              <SelectTrigger className="w-full">
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
            {kind === "custom" && (
              <div className="flex flex-wrap gap-1.5 pt-1">
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
            {kind !== "once" && (
              <p className="text-xs text-muted-foreground">
                Aparece a cada dia correspondente, para concluir sem horário fixo.
              </p>
            )}
          </div>

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

          <div className="space-y-1.5">
            <Label htmlFor="u-link">Link</Label>
            <LinkField id="u-link" value={link} onChange={setLink} />
          </div>

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Subtasks */}
          <div className="space-y-1.5">
            <Label>Subtarefas</Label>
            {subtasks.length > 0 && (
              <ul className="space-y-1">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm">
                    <span className="grid h-4 w-4 place-items-center rounded-full border border-muted-foreground/40">
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
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
              />
              <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={addSubtask}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {editing && onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => { onDelete(editing.id); onClose(); }}
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
