"use client";

import { useRef, useState } from "react";
import { BellRing, Check, ChevronDown, Download, Info, Monitor, Moon, Plus, Sun, Sunrise, Trash2, Upload, Volume2, X } from "lucide-react";
import { startAlarm } from "@/lib/sound";
import { minutesToTime, timeToMinutes } from "@/lib/time";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { TASK_COLORS, randomColor, rgba } from "@/lib/colors";
import type { Settings, SleepSchedule, Tag, Weekday } from "@/types";

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onExport: () => string;
  onImport: (json: string) => void;
  tags: Tag[];
  onAddTag: (label: string, color: string) => Tag;
  onUpdateTag: (id: string, patch: Partial<Omit<Tag, "id">>) => void;
  onDeleteTag: (id: string) => void;
}

const THEMES: { value: Settings["theme"]; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="flex-1 text-sm font-normal">
        <span className="block">{label}</span>
        {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      <NumberStepper
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        onChange={onChange}
        className="w-28 shrink-0"
      />
    </div>
  );
}

/** Compact color-swatch popover row used when creating/editing a tag. */
function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {TASK_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "grid h-5 w-5 place-items-center rounded-full transition hover:scale-110",
            value === c && "ring-2 ring-ring ring-offset-1 ring-offset-background",
          )}
          style={{ backgroundColor: c }}
          aria-label={`Cor ${c}`}
        >
          {value === c && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

function TagManager({
  tags,
  onAddTag,
  onUpdateTag,
  onDeleteTag,
}: {
  tags: Tag[];
  onAddTag: (label: string, color: string) => Tag;
  onUpdateTag: (id: string, patch: Partial<Omit<Tag, "id">>) => void;
  onDeleteTag: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(() => randomColor());
  const [editingId, setEditingId] = useState<string | null>(null);

  const submitNew = () => {
    const v = label.trim();
    if (v) onAddTag(v, color);
    setLabel("");
    setColor(randomColor());
    setCreating(false);
  };

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <ul className="space-y-1">
          {tags.map((t) => (
            <li key={t.id} className="rounded-lg border px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                <Input
                  value={t.label}
                  onChange={(e) => onUpdateTag(t.id, { label: e.target.value })}
                  className="h-7 flex-1 border-transparent bg-transparent px-1 text-sm focus-visible:border-input"
                />
                <button
                  type="button"
                  onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent"
                  aria-label="Mudar cor"
                  style={{ color: t.color }}
                >
                  <span className="h-3.5 w-3.5 rounded-full ring-2 ring-current" style={{ backgroundColor: rgba(t.color, 0.4) }} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteTag(t.id)}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label="Excluir etiqueta"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {editingId === t.id && (
                <div className="mt-2 border-t pt-2">
                  <ColorRow value={t.color} onChange={(c) => { onUpdateTag(t.id, { color: c }); }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <div className="space-y-2 rounded-lg border p-2.5">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <Input
              autoFocus
              value={label}
              placeholder="Nome da etiqueta"
              className="h-7 flex-1 text-sm"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitNew(); }
                if (e.key === "Escape") { setCreating(false); setLabel(""); }
              }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setCreating(false); setLabel(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ColorRow value={color} onChange={setColor} />
          <Button size="sm" className="h-7 w-full" onClick={submitNew} disabled={!label.trim()}>
            Criar etiqueta
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nova etiqueta
        </Button>
      )}
    </div>
  );
}

const SLEEP_WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

function SleepSettings({
  sleep,
  onChange,
}: {
  sleep: SleepSchedule;
  onChange: (patch: Partial<SleepSchedule>) => void;
}) {
  const [showPerDay, setShowPerDay] = useState(Boolean(sleep.perDay && Object.keys(sleep.perDay).length));

  const setPerDay = (wd: Weekday, field: "bedtime" | "wakeTime", value: number) => {
    const cur = sleep.perDay?.[wd] ?? { bedtime: sleep.bedtime, wakeTime: sleep.wakeTime };
    onChange({ perDay: { ...sleep.perDay, [wd]: { ...cur, [field]: value } } });
  };
  const clearPerDay = (wd: Weekday) => {
    const next = { ...sleep.perDay };
    delete next[wd];
    onChange({ perDay: next });
  };

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-normal">Ativar período de sono</span>
          <span className="block text-xs text-muted-foreground">
            Mostra uma faixa fixa de &quot;dormir&quot; na timeline, todos os dias.
          </span>
        </span>
        <Switch checked={sleep.enabled} onCheckedChange={(v) => onChange({ enabled: v })} />
      </label>

      {sleep.enabled && (
        <div className="space-y-3 rounded-lg border bg-indigo-500/[0.04] p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bedtime" className="flex items-center gap-1 text-xs">
                <Moon className="h-3 w-3" /> Dormir
              </Label>
              <Input
                id="bedtime"
                type="time"
                value={minutesToTime(sleep.bedtime)}
                onChange={(e) => e.target.value && onChange({ bedtime: timeToMinutes(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waketime" className="flex items-center gap-1 text-xs">
                <Sunrise className="h-3 w-3" /> Acordar
              </Label>
              <Input
                id="waketime"
                type="time"
                value={minutesToTime(sleep.wakeTime)}
                onChange={(e) => e.target.value && onChange({ wakeTime: timeToMinutes(e.target.value) })}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPerDay((s) => !s)}
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Horários por dia da semana
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showPerDay && "rotate-180")} />
          </button>

          {showPerDay && (
            <div className="space-y-1.5">
              {SLEEP_WEEKDAYS.map((w) => {
                const ov = sleep.perDay?.[w.value];
                return (
                  <div key={w.value} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">{w.label}</span>
                    <Input
                      type="time"
                      value={minutesToTime(ov?.bedtime ?? sleep.bedtime)}
                      onChange={(e) => e.target.value && setPerDay(w.value, "bedtime", timeToMinutes(e.target.value))}
                      className={cn("h-7 flex-1 text-xs", !ov && "text-muted-foreground")}
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="time"
                      value={minutesToTime(ov?.wakeTime ?? sleep.wakeTime)}
                      onChange={(e) => e.target.value && setPerDay(w.value, "wakeTime", timeToMinutes(e.target.value))}
                      className={cn("h-7 flex-1 text-xs", !ov && "text-muted-foreground")}
                    />
                    <button
                      type="button"
                      onClick={() => clearPerDay(w.value)}
                      disabled={!ov}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground transition hover:bg-accent disabled:opacity-30"
                      aria-label={`Redefinir ${w.label}`}
                      title="Voltar ao padrão"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">
                Dias em cinza usam o horário padrão. Ajuste um horário para
                sobrescrever aquele dia.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SettingsSheet({
  open,
  onOpenChange,
  settings,
  onChange,
  onExport,
  onImport,
  tags,
  onAddTag,
  onUpdateTag,
  onDeleteTag,
}: SettingsSheetProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleExport = () => {
    const json = onExport();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      onImport(text);
      setImportMsg("Backup importado com sucesso.");
    } catch (err) {
      setImportMsg(
        err instanceof Error ? `Falha: ${err.message}` : "Falha ao importar.",
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Configurações</SheetTitle>
          <SheetDescription>
            Tudo é salvo localmente no seu navegador.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tema
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => onChange({ theme: t.value })}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition",
                      settings.theme === t.value
                        ? "border-primary bg-accent"
                        : "hover:bg-accent/50",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notificações
            </h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="notif" className="text-sm font-normal">
                Ativar notificações
              </Label>
              <Switch
                id="notif"
                checked={settings.notificationsEnabled}
                onCheckedChange={(v) => onChange({ notificationsEnabled: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sound" className="text-sm font-normal">
                Som de alerta
              </Label>
              <Switch
                id="sound"
                checked={settings.soundEnabled}
                onCheckedChange={(v) => onChange({ soundEnabled: v })}
              />
            </div>

            {/* Alarm stop controls: the ringing alarm stops at whichever limit
                (duration or number of beeps) is reached first. */}
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-1.5">
                <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Parada do alarme
                </span>
              </div>
              <NumberField
                id="alarm-secs"
                label="Duração máxima"
                hint="0 = sem limite de tempo"
                value={settings.alarmMaxSeconds}
                min={0}
                max={1800}
                step={15}
                suffix="s"
                onChange={(v) => onChange({ alarmMaxSeconds: v })}
              />
              <NumberField
                id="alarm-beeps"
                label="Máximo de toques"
                hint="0 = sem limite de toques"
                value={settings.alarmMaxBeeps}
                min={0}
                max={100}
                suffix="×"
                onChange={(v) => onChange({ alarmMaxBeeps: v })}
              />
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  O alarme para no primeiro limite atingido. Com ambos em 0, toca
                  até você clicar em &quot;Parar alarme&quot;.
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  startAlarm({ maxSeconds: settings.alarmMaxSeconds, maxBeeps: settings.alarmMaxBeeps })
                }
              >
                <Volume2 className="mr-1 h-4 w-4" /> Testar alarme
              </Button>
            </div>

            <NumberField
              id="nbs"
              label="Avisar antes de iniciar"
              value={settings.notifyBeforeStart}
              min={0}
              max={1440}
              step={5}
              suffix="min"
              onChange={(v) => onChange({ notifyBeforeStart: v })}
            />
            <NumberField
              id="nbe"
              label="Avisar antes de terminar"
              value={settings.notifyBeforeEnd}
              min={0}
              max={1440}
              step={5}
              suffix="min"
              onChange={(v) => onChange({ notifyBeforeEnd: v })}
            />
            <p className="text-xs text-muted-foreground">
              Valores padrão. Cada tarefa pode sobrescrever no cadastro.
            </p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Moon className="h-3.5 w-3.5" /> Sono
            </h3>
            <SleepSettings
              sleep={settings.sleep}
              onChange={(patch) => onChange({ sleep: { ...settings.sleep, ...patch } })}
            />
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Etiquetas
            </h3>
            <p className="text-xs text-muted-foreground">
              Categorize tarefas com etiquetas coloridas. Use-as para filtrar na
              barra lateral.
            </p>
            <TagManager
              tags={tags}
              onAddTag={onAddTag}
              onUpdateTag={onUpdateTag}
              onDeleteTag={onDeleteTag}
            />
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pomodoro
            </h3>
            <NumberField
              id="pw"
              label="Foco (min)"
              value={settings.pomodoroWork}
              min={1}
              onChange={(v) => onChange({ pomodoroWork: Math.max(1, v) })}
            />
            <NumberField
              id="pb"
              label="Pausa (min)"
              value={settings.pomodoroBreak}
              min={1}
              onChange={(v) => onChange({ pomodoroBreak: Math.max(1, v) })}
            />
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Backup
            </h3>
            <p className="text-xs text-muted-foreground">
              Exporte suas tarefas para um arquivo, ou restaure de um backup.
              Importar substitui os dados atuais.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-1 h-4 w-4" /> Exportar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-1 h-4 w-4" /> Importar
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            {importMsg && (
              <p className="text-xs text-muted-foreground">{importMsg}</p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
