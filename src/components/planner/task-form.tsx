"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays } from "date-fns";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Eye,
  Info,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
import { Markdown } from "@/components/markdown";
import { cn, normalizeUrl } from "@/lib/utils";
import { randomColor } from "@/lib/colors";
import { uid } from "@/lib/id";
import { dateKey, minutesToTime, nowMinutes, timeToMinutes, formatMinutes } from "@/lib/time";
import { describeRecurrence, isRecurring, recurrenceFloor, WEEKDAY_SHORT } from "@/lib/recurrence";
import { findConflicts } from "@/lib/conflicts";
import {
  createTask,
  deleteTask,
  overrideOccurrence,
  splitSeries,
  updateTask,
  type TaskInput,
} from "@/lib/store/actions";
import { useOccurrence } from "@/lib/store/use-day";
import { useSettings, useTags, useTasks, useTasksById, useProjects } from "@/lib/store/hooks";
import { useUI } from "@/components/app/ui-context";
import { ColorPicker, LinkField, PrioritySelector, ProjectSelect, TagSelector } from "./task-form-controls";
import type { Priority, Recurrence, RecurrenceKind, Subtask, Weekday } from "@/types";

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

type RepeatOption =
  | "once"
  | "everyday"
  | "weekdays"
  | "weekends"
  | "custom"
  | "everyNDays"
  | "everyNWeeks"
  | "monthly"
  | "yearly"
  | "afterDone";

const REPEAT_OPTIONS: { value: RepeatOption; label: string }[] = [
  { value: "once", label: "Não repete" },
  { value: "everyday", label: "Todos os dias" },
  { value: "weekdays", label: "Dias úteis (seg–sex)" },
  { value: "weekends", label: "Fim de semana" },
  { value: "custom", label: "Dias da semana…" },
  { value: "everyNDays", label: "A cada N dias" },
  { value: "everyNWeeks", label: "A cada N semanas" },
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
  { value: "afterDone", label: "N dias após concluir" },
];

interface Draft {
  title: string;
  description: string;
  subtasks: Subtask[];
  color: string;
  priority?: Priority;
  tags: string[];
  projectId?: string;
  link: string;
  timed: boolean;
  start: string;
  hasEnd: boolean;
  end: string;
  repeat: RepeatOption;
  weekdays: Weekday[];
  interval: number;
  monthlyBy: "day" | "weekday";
  /** "once": the day (timed) or due date (untimed, may be empty). */
  date: string;
  startDate: string;
  hasEndDate: boolean;
  endDate: string;
  everyHour: boolean;
  everyHourInterval: number;
  everyHourDuration: number;
  notifyStart: number;
  notifyEnd: number;
  soundOn: boolean;
}

function repeatOf(rec: Recurrence): RepeatOption {
  if (rec.kind === "interval") {
    return rec.unit === "week" ? "everyNWeeks" : "everyNDays";
  }

  return rec.kind as RepeatOption;
}

function recurrenceOf(d: Draft): Recurrence {
  const kindMap: Record<RepeatOption, RecurrenceKind> = {
    once: "once",
    everyday: "everyday",
    weekdays: "weekdays",
    weekends: "weekends",
    custom: "custom",
    everyNDays: "interval",
    everyNWeeks: "interval",
    monthly: "monthly",
    yearly: "yearly",
    afterDone: "afterDone",
  };
  const kind = kindMap[d.repeat];
  if (kind === "once") {
    return { kind };
  }

  const hourly = d.timed && d.everyHour && kind !== "afterDone";
  const usesInterval = ["everyNDays", "everyNWeeks", "monthly", "afterDone"].includes(d.repeat);
  return {
    kind,
    weekdays: d.repeat === "custom" || d.repeat === "everyNWeeks" ? d.weekdays : undefined,
    startDate: d.startDate,
    endDate: d.hasEndDate ? d.endDate : undefined,
    interval: usesInterval ? Math.max(1, d.interval) : undefined,
    unit: d.repeat === "everyNWeeks" ? "week" : d.repeat === "everyNDays" ? "day" : undefined,
    monthlyBy: d.repeat === "monthly" ? d.monthlyBy : undefined,
    everyHour: hourly || undefined,
    everyHourInterval: hourly ? Math.max(1, d.everyHourInterval) : undefined,
    everyHourDuration: hourly ? Math.max(1, d.everyHourDuration) : undefined,
  };
}

function draftFrom(task: Partial<TaskInput> | undefined, day: string, notifyStart: number, notifyEnd: number): Draft {
  const rec = task?.recurrence ?? { kind: "once" as const };
  const startMinute = task?.startMinute === undefined ? nowRounded() : task.startMinute;
  const timed = startMinute !== null;
  const s = startMinute ?? 9 * 60;
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    subtasks: task?.subtasks ?? [],
    color: task?.color ?? randomColor(),
    priority: task?.priority,
    tags: task?.tags ?? [],
    projectId: task?.projectId,
    link: task?.link ?? "",
    timed,
    start: minutesToTime(s),
    hasEnd: task?.endMinute !== null || !timed,
    end: minutesToTime(task?.endMinute ?? Math.min(s + 60, 24 * 60 - 1)),
    repeat: repeatOf(rec),
    weekdays: rec.weekdays ?? [],
    interval: rec.interval ?? 2,
    monthlyBy: rec.monthlyBy ?? "day",
    date: task?.date ?? (timed ? day : ""),
    startDate: rec.startDate ?? day,
    hasEndDate: Boolean(rec.endDate),
    endDate: rec.endDate ?? day,
    everyHour: rec.everyHour ?? false,
    everyHourInterval: rec.everyHourInterval ?? 1,
    everyHourDuration: rec.everyHourDuration ?? 60,
    notifyStart: task?.notifyBeforeStart ?? notifyStart,
    notifyEnd: task?.notifyBeforeEnd ?? notifyEnd,
    soundOn: task?.soundEnabled ?? false,
  };
}

function nowRounded(): number {
  return Math.min(Math.ceil(nowMinutes() / 5) * 5, 24 * 60 - 60);
}

function inputFrom(d: Draft, defaults: { notifyStart: number; notifyEnd: number }): TaskInput {
  const recurrence = recurrenceOf(d);
  const startMinute = d.timed ? timeToMinutes(d.start) : null;
  const endMinute = d.timed && d.hasEnd ? timeToMinutes(d.end) : null;
  return {
    title: d.title.trim(),
    description: d.description.trim() || undefined,
    subtasks: d.subtasks.length ? d.subtasks : undefined,
    color: d.color,
    priority: d.priority,
    tags: d.tags.length ? d.tags : undefined,
    projectId: d.projectId,
    link: normalizeUrl(d.link) ?? undefined,
    startMinute,
    endMinute,
    recurrence,
    date: recurrence.kind === "once" ? d.date || undefined : undefined,
    notifyBeforeStart: d.notifyStart !== defaults.notifyStart ? d.notifyStart : undefined,
    notifyBeforeEnd: d.notifyEnd !== defaults.notifyEnd ? d.notifyEnd : undefined,
    soundEnabled: d.soundOn || undefined,
  };
}

const SERIES_FIELDS: (keyof TaskInput)[] = [
  "description",
  "subtasks",
  "color",
  "priority",
  "tags",
  "projectId",
  "link",
  "recurrence",
  "date",
  "notifyBeforeStart",
  "notifyBeforeEnd",
  "soundEnabled",
];

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function TaskForm() {
  const ui = useUI();
  const req = ui.form;
  const tasksById = useTasksById();
  const allTasks = useTasks();
  const tags = useTags();
  const projects = useProjects();
  const settings = useSettings();
  const editing = req?.taskId ? tasksById[req.taskId] : undefined;
  const occ = useOccurrence(req?.occ ?? null, new Date());
  const dayKey = dateKey(ui.day);

  const [d, setD] = useState<Draft>(() => draftFrom(undefined, dayKey, 5, 5));
  const [descPreview, setDescPreview] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = req !== null;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!req) {
      return;
    }

    const source = editing ?? req.initial;
    const base = draftFrom(source, req.initial?.date ?? dayKey, settings.notifyBeforeStart, settings.notifyBeforeEnd);
    if (editing && occ) {
      base.title = occ.title;
      if (occ.scheduled && occ.slot === undefined) {
        base.start = minutesToTime(occ.startMinute);
        base.hasEnd = !occ.openEnded;
        if (!occ.openEnded) {
          base.end = minutesToTime(occ.endMinute);
        }
      }
    }

    if (editing && isRecurring(editing)) {
      base.startDate = recurrenceFloor(editing);
    }

    setD(base);
    setDescPreview(false);
    setShowDetails(Boolean(base.description || base.subtasks.length));
    setShowMore(Boolean(editing && (editing.link || editing.notifyBeforeStart !== undefined || editing.soundEnabled)));
    setNewSub("");
    setConfirmDelete(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Reset only when a new request opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const input = useMemo(
    () => inputFrom(d, { notifyStart: settings.notifyBeforeStart, notifyEnd: settings.notifyBeforeEnd }),
    [d, settings.notifyBeforeStart, settings.notifyBeforeEnd],
  );

  const conflicts = useMemo(
    () =>
      open && d.timed
        ? findConflicts({ ...input, createdAt: editing?.createdAt ?? new Date().toISOString() }, allTasks, editing?.id)
        : [],
    [open, d.timed, input, allTasks, editing],
  );

  const startMinute = timeToMinutes(d.start);
  const endMinute = d.hasEnd ? timeToMinutes(d.end) : null;
  const durationMin = endMinute !== null ? endMinute - startMinute : null;
  const recurring = d.repeat !== "once";
  const hourly = recurring && d.timed && d.everyHour && d.repeat !== "afterDone";
  const todayKey = dateKey(new Date());

  const endBeforeStart = d.timed && endMinute !== null && endMinute <= startMinute;
  const endDateBeforeStart = recurring && d.hasEndDate && d.endDate < d.startDate;
  const needsWeekdays = d.repeat === "custom" && d.weekdays.length === 0;
  const isInPast =
    !editing &&
    d.repeat === "once" &&
    d.timed &&
    (d.date < todayKey || (d.date === todayKey && startMinute < nowMinutes() - 10));
  const invalid = !d.title.trim() || endBeforeStart || endDateBeforeStart || needsWeekdays || isInPast || (d.timed && !recurring && !d.date);

  const close = () => {
    const back = req?.returnToDetail && req.occ ? req.occ : null;
    ui.closeForm();
    if (back) {
      ui.openDetail(back);
    }
  };

  const handleSave = async () => {
    if (invalid || !req) {
      return;
    }

    if (!editing) {
      createTask(input);
      ui.toast(d.timed ? "Tarefa criada" : "Tarefa adicionada à lista");
      ui.closeForm();
      return;
    }

    const titleChanged = input.title !== (occ?.title ?? editing.title);
    const timeChanged =
      occ && occ.scheduled && occ.slot === undefined
        ? input.startMinute !== occ.startMinute || input.endMinute !== (occ.openEnded ? null : occ.endMinute)
        : input.startMinute !== editing.startMinute || input.endMinute !== editing.endMinute;
    const seriesChanged = SERIES_FIELDS.some((k) => !same(input[k], editing[k]));

    if (!titleChanged && !timeChanged && !seriesChanged) {
      close();
      return;
    }

    if (!isRecurring(editing) || !occ) {
      updateTask(editing.id, input);
      ui.toast("Tarefa atualizada");
      close();
      return;
    }

    const atFirst = occ.date <= recurrenceFloor(editing);
    const hourlyTime = timeChanged && occ.slot !== undefined;
    const allowThis = !seriesChanged && !hourlyTime;
    const scope =
      !allowThis && atFirst
        ? "all"
        : await ui.askScope({ title: "Aplicar alterações em", allowThis, allowFollowing: !atFirst });
    if (!scope) {
      return;
    }

    if (scope === "this") {
      overrideOccurrence(occ, {
        title: titleChanged ? input.title : undefined,
        startMinute: timeChanged ? input.startMinute ?? undefined : undefined,
        endMinute: timeChanged ? input.endMinute : undefined,
      });
      ui.toast("Alterado só neste dia");
    } else if (scope === "following") {
      const next = splitSeries(editing.id, occ.date, input);
      ui.toast("Alterado a partir deste dia");
      if (next && req.returnToDetail) {
        ui.closeForm();
        ui.openDetail({ key: occ.key.replace(editing.id, next.id), date: occ.date });
        return;
      }
    } else {
      updateTask(editing.id, input);
      ui.toast("Alterado em todos os dias");
    }

    close();
  };

  const handleDelete = () => {
    if (!editing) {
      return;
    }

    const undo = deleteTask(editing.id);
    ui.closeForm();
    ui.closeDetail();
    ui.toast("Tarefa excluída", { label: "Desfazer", run: undo });
  };

  const addSub = () => {
    const v = newSub.trim();
    if (!v) {
      return;
    }

    set("subtasks", [...d.subtasks, { id: uid(), title: v }]);
    setNewSub("");
  };

  const toggleWeekday = (w: Weekday) =>
    set("weekdays", d.weekdays.includes(w) ? d.weekdays.filter((x) => x !== w) : [...d.weekdays, w]);

  const tomorrowKey = dateKey(addDays(new Date(), 1));
  const previewRec = recurrenceOf(d);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto overflow-x-hidden sm:max-w-xl">
        <DialogHeader>
          {req?.returnToDetail && (
            <button
              type="button"
              onClick={close}
              className="-ml-1 flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Voltar
            </button>
          )}
          <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {editing && isRecurring(editing) && occ && (
            <div className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Tarefa recorrente: ao salvar você escolhe se a mudança vale só para este dia, daqui
                para frente ou para todos os dias.
              </span>
            </div>
          )}

          <Input
            value={d.title}
            autoFocus
            placeholder="O que precisa ser feito?"
            className="h-10 text-base font-medium"
            onChange={(e) => set("title", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !invalid) {
                e.preventDefault();
                void handleSave();
              }
            }}
          />

          {/* When */}
          <section className="space-y-3 rounded-xl border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">Horário</Label>
              <Switch checked={d.timed} onCheckedChange={(v) => setD((p) => ({ ...p, timed: v, date: v && !p.date ? dayKey : p.date }))} />
            </div>

            {d.timed && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="tf-start" className="text-xs text-muted-foreground">
                        {hourly ? "Primeiro horário" : "Início"}
                      </Label>
                      <button
                        type="button"
                        onClick={() => set("start", minutesToTime(nowMinutes()))}
                        className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                      >
                        agora
                      </button>
                    </div>
                    <Input id="tf-start" type="time" value={d.start} onChange={(e) => e.target.value && set("start", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="tf-end" className="text-xs text-muted-foreground">
                        {hourly ? "Repetir até" : "Término"}
                      </Label>
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        definir
                        <Switch checked={d.hasEnd} onCheckedChange={(v) => set("hasEnd", v)} />
                      </label>
                    </div>
                    <Input id="tf-end" type="time" value={d.end} disabled={!d.hasEnd} onChange={(e) => e.target.value && set("end", e.target.value)} />
                  </div>
                </div>
                {d.hasEnd && !hourly && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {DURATION_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set("end", minutesToTime(startMinute + m))}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs font-medium transition",
                          durationMin === m ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                        )}
                      >
                        {formatMinutes(m)}
                      </button>
                    ))}
                  </div>
                )}
                {!d.hasEnd && !hourly && (
                  <p className="text-xs text-muted-foreground">Sem término — você finaliza manualmente.</p>
                )}
                {endBeforeStart && <p className="text-xs text-destructive">O término precisa ser depois do início.</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Repetição</Label>
              <Select value={d.repeat} onValueChange={(v) => set("repeat", v as RepeatOption)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: RepeatOption) => REPEAT_OPTIONS.find((o) => o.value === v)?.label ?? v}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {REPEAT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(d.repeat === "custom" || d.repeat === "everyNWeeks") && (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => toggleWeekday(w)}
                    className={cn(
                      "h-8 w-11 rounded-lg border text-xs font-medium transition",
                      d.weekdays.includes(w) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                    )}
                  >
                    {WEEKDAY_SHORT[w]}
                  </button>
                ))}
              </div>
            )}

            {["everyNDays", "everyNWeeks", "monthly", "afterDone"].includes(d.repeat) && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{d.repeat === "afterDone" ? "Repetir" : "A cada"}</span>
                <NumberStepper
                  value={d.interval}
                  min={1}
                  max={365}
                  onChange={(v) => set("interval", v)}
                  suffix={
                    d.repeat === "everyNWeeks" ? "sem." : d.repeat === "monthly" ? "mês" : "dias"
                  }
                  className="w-32"
                  aria-label="Intervalo"
                />
                {d.repeat === "afterDone" && <span className="text-muted-foreground">depois de concluir</span>}
              </div>
            )}

            {d.repeat === "monthly" && (
              <div className="flex gap-1.5">
                {(["day", "weekday"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set("monthlyBy", m)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition",
                      d.monthlyBy === m ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                    )}
                  >
                    {m === "day" ? "Mesmo dia do mês" : "Mesmo dia da semana"}
                  </button>
                ))}
              </div>
            )}

            {d.repeat === "once" ? (
              <DateChips
                label={d.timed ? "Data" : "Prazo"}
                value={d.date}
                allowEmpty={!d.timed}
                minDate={editing ? undefined : todayKey}
                todayKey={todayKey}
                tomorrowKey={tomorrowKey}
                onChange={(v) => set("date", v)}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="tf-sd" className="text-xs text-muted-foreground">
                    Começa em
                  </Label>
                  <Input id="tf-sd" type="date" value={d.startDate} onChange={(e) => e.target.value && set("startDate", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tf-ed" className="text-xs text-muted-foreground">
                      Termina em
                    </Label>
                    <Switch checked={d.hasEndDate} onCheckedChange={(v) => set("hasEndDate", v)} />
                  </div>
                  <Input
                    id="tf-ed"
                    type="date"
                    value={d.endDate}
                    min={d.startDate}
                    disabled={!d.hasEndDate}
                    onChange={(e) => e.target.value && set("endDate", e.target.value)}
                  />
                </div>
              </div>
            )}

            {recurring && (
              <p className="text-xs text-muted-foreground">{describeRecurrence(previewRec)}</p>
            )}

            {recurring && d.timed && d.repeat !== "afterDone" && (
              <div className="space-y-2 rounded-lg border bg-background/60 px-3 py-2.5">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm">Repetir em intervalos de horas</span>
                    <span className="block text-xs text-muted-foreground">Várias sessões ao longo do dia.</span>
                  </span>
                  <Switch checked={d.everyHour} onCheckedChange={(v) => set("everyHour", v)} />
                </label>
                {d.everyHour && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">A cada</span>
                    <NumberStepper
                      value={d.everyHourInterval}
                      min={1}
                      max={23}
                      suffix={d.everyHourInterval === 1 ? "hora" : "horas"}
                      onChange={(v) => set("everyHourInterval", v)}
                      className="w-28"
                      aria-label="Intervalo em horas"
                    />
                    <span className="text-muted-foreground">por</span>
                    <NumberStepper
                      value={d.everyHourDuration}
                      min={1}
                      max={1439}
                      step={5}
                      suffix="min"
                      onChange={(v) => set("everyHourDuration", v)}
                      className="w-28"
                      aria-label="Duração de cada sessão"
                    />
                  </div>
                )}
              </div>
            )}

            {endDateBeforeStart && <p className="text-xs text-destructive">A data de término precisa ser depois do início.</p>}
            {needsWeekdays && <p className="text-xs text-destructive">Escolha pelo menos um dia da semana.</p>}
          </section>

          {/* Organize */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Projeto</Label>
              <ProjectSelect projects={projects} value={d.projectId} onChange={(v) => set("projectId", v)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Prioridade</Label>
              <PrioritySelector value={d.priority} onChange={(p) => set("priority", p)} clearable compact />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Etiquetas</Label>
              <TagSelector
                allTags={tags}
                selected={d.tags}
                onToggle={(id) => set("tags", d.tags.includes(id) ? d.tags.filter((x) => x !== id) : [...d.tags, id])}
              />
            </div>
          </section>

          <Collapsible
            title="Descrição e subtarefas"
            hint={[d.description.trim() && "descrição", d.subtasks.length && `${d.subtasks.length} subtarefa${d.subtasks.length > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
            open={showDetails}
            onToggle={() => setShowDetails((s) => !s)}
          >
            <div className="space-y-1.5">
              {d.subtasks.length > 0 && (
                <ul className="space-y-1">
                  {d.subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/50" />
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      <button
                        type="button"
                        onClick={() => set("subtasks", d.subtasks.filter((x) => x.id !== s.id))}
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
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSub();
                    }
                  }}
                />
                <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={addSub} aria-label="Adicionar subtarefa">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="tf-desc" className="text-xs text-muted-foreground">
                  Descrição (markdown)
                </Label>
                <button
                  type="button"
                  onClick={() => setDescPreview((p) => !p)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {descPreview ? <><Pencil className="h-3.5 w-3.5" /> Editar</> : <><Eye className="h-3.5 w-3.5" /> Pré-visualizar</>}
                </button>
              </div>
              {descPreview ? (
                <div className="min-h-24 rounded-lg border border-dashed bg-muted/30 px-3 py-2">
                  {d.description.trim() ? <Markdown>{d.description}</Markdown> : <span className="text-xs text-muted-foreground">Nada para mostrar.</span>}
                </div>
              ) : (
                <textarea
                  id="tf-desc"
                  value={d.description}
                  placeholder="Suporta markdown: **negrito**, listas, links…"
                  rows={4}
                  onChange={(e) => set("description", e.target.value)}
                  className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              )}
            </div>
          </Collapsible>

          <Collapsible title="Mais opções" hint="cor, link, avisos" open={showMore} onToggle={() => setShowMore((s) => !s)}>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cor</Label>
              <ColorPicker value={d.color} onChange={(c) => set("color", c)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tf-link" className="text-xs text-muted-foreground">
                Link
              </Label>
              <LinkField id="tf-link" value={d.link} onChange={(v) => set("link", v)} />
            </div>
            {d.timed && (
              <div className="space-y-3 rounded-lg border px-3 py-3">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm">Tocar alarme</span>
                    <span className="block text-xs text-muted-foreground">Som quando esta tarefa avisar.</span>
                  </span>
                  <Switch checked={d.soundOn} onCheckedChange={(v) => set("soundOn", v)} />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="tf-ns" className="text-sm font-normal">
                    Avisar antes de iniciar
                  </Label>
                  <NumberStepper id="tf-ns" value={d.notifyStart} min={0} max={1440} step={5} suffix="min" onChange={(v) => set("notifyStart", v)} className="w-28" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="tf-ne" className="text-sm font-normal">
                    Avisar antes de terminar
                  </Label>
                  <NumberStepper id="tf-ne" value={d.notifyEnd} min={0} max={1440} step={5} suffix="min" disabled={!d.hasEnd} onChange={(v) => set("notifyEnd", v)} className="w-28" />
                </div>
              </div>
            )}
          </Collapsible>

          {isInPast && (
            <p className="text-xs text-destructive">Não é possível criar tarefas no passado. Ajuste a data ou o horário.</p>
          )}

          {conflicts.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium">Conflito de horário</p>
                <p className="text-muted-foreground">
                  Sobrepõe: {conflicts.slice(0, 4).map((c) => c.title).join(", ")}. Você pode salvar mesmo assim.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          {editing ? (
            confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-destructive">Excluir?</span>
                <Button size="sm" variant="destructive" onClick={handleDelete}>
                  Sim
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Não
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirmDelete(true)} aria-label="Excluir tarefa">
                <Trash2 className="h-4 w-4" />
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button disabled={invalid} onClick={() => void handleSave()}>
              {editing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Collapsible({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
        <span className="text-sm font-medium">{title}</span>
        <span className="flex min-w-0 items-center gap-2">
          {hint && !open && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && <div className="space-y-3 border-t px-3 py-3">{children}</div>}
    </div>
  );
}

function DateChips({
  label,
  value,
  allowEmpty,
  minDate,
  todayKey,
  tomorrowKey,
  onChange,
}: {
  label: string;
  value: string;
  allowEmpty: boolean;
  minDate?: string;
  todayKey: string;
  tomorrowKey: string;
  onChange: (v: string) => void;
}) {
  const chip = (active: boolean) =>
    cn(
      "rounded-md border px-2.5 py-1 text-xs font-medium transition",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
    );

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chip(value === todayKey)} onClick={() => onChange(todayKey)}>
          Hoje
        </button>
        <button type="button" className={chip(value === tomorrowKey)} onClick={() => onChange(tomorrowKey)}>
          Amanhã
        </button>
        {allowEmpty && (
          <button type="button" className={chip(value === "")} onClick={() => onChange("")}>
            Sem prazo
          </button>
        )}
        <Input
          type="date"
          value={value}
          min={minDate}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-40 text-xs"
          aria-label={label}
        />
      </div>
    </div>
  );
}
