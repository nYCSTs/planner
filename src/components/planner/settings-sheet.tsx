"use client";

import { useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BellRing,
  Check,
  ChevronDown,
  Download,
  Info,
  Keyboard,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Sun,
  Sunrise,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { startAlarm } from "@/lib/sound";
import { minutesToTime, timeToMinutes } from "@/lib/time";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { TASK_COLORS, randomColor } from "@/lib/colors";
import {
  addProject,
  addTag,
  deleteProject,
  deleteTag,
  exportData,
  importData,
  restoreTask,
  updateProject,
  updateSyncedSettings,
  updateTag,
} from "@/lib/store/actions";
import { setPrefs } from "@/lib/store/device";
import { useProjects, useSettings, useStore, useTags } from "@/lib/store/hooks";
import { useUI } from "@/components/app/ui-context";
import { useNowMs } from "@/hooks/use-now";
import { PushSettings } from "@/components/app/push-settings";
import { useInstallPrompt } from "@/components/app/use-pwa";
import type { Settings, SleepSchedule, Task, Weekday } from "@/types";

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
      <NumberStepper id={id} value={value} min={min} max={max} step={step} suffix={suffix} onChange={onChange} className="w-28 shrink-0" />
    </div>
  );
}

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

interface LabelItem {
  id: string;
  name: string;
  color: string;
  archived?: boolean;
}

function LabelManager({
  items,
  placeholder,
  createLabel,
  onAdd,
  onRename,
  onColor,
  onDelete,
  onArchive,
}: {
  items: LabelItem[];
  placeholder: string;
  createLabel: string;
  onAdd: (name: string, color: string) => void;
  onRename: (id: string, name: string) => void;
  onColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string, archived: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(() => randomColor());
  const [editingId, setEditingId] = useState<string | null>(null);

  const submitNew = () => {
    const v = label.trim();
    if (v) {
      onAdd(v, color);
    }

    setLabel("");
    setColor(randomColor());
    setCreating(false);
  };

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((t) => (
            <li key={t.id} className={cn("rounded-lg border px-2.5 py-1.5", t.archived && "opacity-60")}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-offset-1 ring-offset-background hover:ring-2 hover:ring-ring"
                  style={{ backgroundColor: t.color }}
                  aria-label="Mudar cor"
                />
                <Input
                  value={t.name}
                  onChange={(e) => onRename(t.id, e.target.value)}
                  className="h-7 flex-1 border-transparent bg-transparent px-1 text-sm focus-visible:border-input"
                />
                {onArchive && (
                  <button
                    type="button"
                    onClick={() => onArchive(t.id, !t.archived)}
                    className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent"
                    aria-label={t.archived ? "Desarquivar" : "Arquivar"}
                    title={t.archived ? "Desarquivar" : "Arquivar"}
                  >
                    {t.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {editingId === t.id && (
                <div className="mt-2 border-t pt-2">
                  <ColorRow value={t.color} onChange={(c) => onColor(t.id, c)} />
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
              placeholder={placeholder}
              className="h-7 flex-1 text-sm"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNew();
                }

                if (e.key === "Escape") {
                  setCreating(false);
                  setLabel("");
                }
              }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCreating(false)} aria-label="Cancelar">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ColorRow value={color} onChange={setColor} />
          <Button size="sm" className="h-7 w-full" onClick={submitNew} disabled={!label.trim()}>
            {createLabel}
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {createLabel}
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

function SleepSettings({ sleep, onChange }: { sleep: SleepSchedule; onChange: (patch: Partial<SleepSchedule>) => void }) {
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
          <span className="block text-sm font-normal">Mostrar período de sono</span>
          <span className="block text-xs text-muted-foreground">Faixa de &quot;dormir&quot; na timeline.</span>
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
              <Input id="bedtime" type="time" value={minutesToTime(sleep.bedtime)} onChange={(e) => e.target.value && onChange({ bedtime: timeToMinutes(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waketime" className="flex items-center gap-1 text-xs">
                <Sunrise className="h-3 w-3" /> Acordar
              </Label>
              <Input id="waketime" type="time" value={minutesToTime(sleep.wakeTime)} onChange={(e) => e.target.value && onChange({ wakeTime: timeToMinutes(e.target.value) })} />
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
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TRASH_DAYS = 30;

function Trash() {
  const deleted = useStore((s) => s.tasks);
  const nowMs = useNowMs(60_000);
  const items = useMemo(() => {
    const cutoff = nowMs - TRASH_DAYS * 24 * 60 * 60_000;
    return (Object.values(deleted) as Task[])
      .filter((t) => t.deletedAt && t.deletedAt > cutoff)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  }, [deleted, nowMs]);

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma tarefa excluída nos últimos {TRASH_DAYS} dias.</p>;
  }

  return (
    <ul className="space-y-1">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{t.title}</span>
            <span className="block text-[11px] text-muted-foreground">
              excluída em {format(new Date(t.deletedAt ?? 0), "d 'de' MMM, HH:mm", { locale: ptBR })}
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => restoreTask(t.id)}>
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsSheet() {
  const ui = useUI();
  const settings = useSettings();
  const tags = useTags();
  const projects = useProjects();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const install = useInstallPrompt();
  const isIos = typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent);
  const standalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

  const handleExport = () => {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmImport = () => {
    if (!pendingImport) {
      return;
    }

    try {
      const undo = importData(pendingImport);
      setPendingImport(null);
      setImportError(null);
      ui.toast("Backup importado", { label: "Desfazer", run: undo });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Falha ao importar.");
      setPendingImport(null);
    }
  };

  return (
    <Sheet open={ui.settingsOpen} onOpenChange={ui.setSettingsOpen}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Configurações</SheetTitle>
          <SheetDescription>Dados salvos neste aparelho e, se ativado, sincronizados.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => ui.setSyncOpen(true)}>
              <RefreshCw className="h-4 w-4" /> Sincronizar com outros aparelhos
            </Button>
            {install && (
              <Button variant="outline" className="w-full justify-start" onClick={() => void install()}>
                <Download className="h-4 w-4" /> Instalar como app
              </Button>
            )}
            {isIos && !standalone && (
              <p className="text-xs text-muted-foreground">
                No iPhone, instale pelo Safari: Compartilhar → Adicionar à Tela de Início. Isso também libera as
                notificações.
              </p>
            )}
          </div>

          <Section title="Tema">
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setPrefs({ theme: t.value })}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition",
                      settings.theme === t.value ? "border-primary bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Separator />

          <Section title="Notificações">
            <div className="flex items-center justify-between">
              <Label htmlFor="notif" className="text-sm font-normal">
                Avisos neste aparelho
              </Label>
              <Switch id="notif" checked={settings.notificationsEnabled} onCheckedChange={(v) => setPrefs({ notificationsEnabled: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sound" className="text-sm font-normal">
                Permitir alarme sonoro
              </Label>
              <Switch id="sound" checked={settings.soundEnabled} onCheckedChange={(v) => setPrefs({ soundEnabled: v })} />
            </div>
            <PushSettings />

            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-1.5">
                <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parada do alarme</span>
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
                onChange={(v) => setPrefs({ alarmMaxSeconds: v })}
              />
              <NumberField
                id="alarm-beeps"
                label="Máximo de toques"
                hint="0 = sem limite"
                value={settings.alarmMaxBeeps}
                min={0}
                max={100}
                suffix="×"
                onChange={(v) => setPrefs({ alarmMaxBeeps: v })}
              />
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>O alarme toca só nas tarefas com &quot;Tocar alarme&quot; ligado.</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => startAlarm({ maxSeconds: settings.alarmMaxSeconds, maxBeeps: settings.alarmMaxBeeps })}
              >
                <Volume2 className="h-4 w-4" /> Testar alarme
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
              onChange={(v) => updateSyncedSettings({ notifyBeforeStart: v })}
            />
            <NumberField
              id="nbe"
              label="Avisar antes de terminar"
              value={settings.notifyBeforeEnd}
              min={0}
              max={1440}
              step={5}
              suffix="min"
              onChange={(v) => updateSyncedSettings({ notifyBeforeEnd: v })}
            />
          </Section>

          <Separator />

          <Section title="Sono">
            <SleepSettings sleep={settings.sleep} onChange={(patch) => updateSyncedSettings({ sleep: { ...settings.sleep, ...patch } })} />
          </Section>

          <Separator />

          <Section title="Projetos">
            <LabelManager
              items={projects.map((p) => ({ id: p.id, name: p.name, color: p.color, archived: p.archived }))}
              placeholder="Nome do projeto"
              createLabel="Novo projeto"
              onAdd={(n, c) => addProject(n, c)}
              onRename={(id, name) => updateProject(id, { name })}
              onColor={(id, color) => updateProject(id, { color })}
              onArchive={(id, archived) => updateProject(id, { archived })}
              onDelete={(id) => ui.toast("Projeto excluído", { label: "Desfazer", run: deleteProject(id) })}
            />
          </Section>

          <Separator />

          <Section title="Etiquetas">
            <LabelManager
              items={tags.map((t) => ({ id: t.id, name: t.label, color: t.color }))}
              placeholder="Nome da etiqueta"
              createLabel="Nova etiqueta"
              onAdd={(n, c) => addTag(n, c)}
              onRename={(id, label) => updateTag(id, { label })}
              onColor={(id, color) => updateTag(id, { color })}
              onDelete={(id) => ui.toast("Etiqueta excluída", { label: "Desfazer", run: deleteTag(id) })}
            />
          </Section>

          <Separator />

          <Section title="Pomodoro">
            <NumberField id="pw" label="Foco (min)" value={settings.pomodoroWork} min={1} onChange={(v) => updateSyncedSettings({ pomodoroWork: Math.max(1, v) })} />
            <NumberField id="pb" label="Pausa (min)" value={settings.pomodoroBreak} min={1} onChange={(v) => updateSyncedSettings({ pomodoroBreak: Math.max(1, v) })} />
          </Section>

          <Separator />

          <Section title="Lixeira">
            <Trash />
          </Section>

          <Separator />

          <Section title="Backup">
            <p className="text-xs text-muted-foreground">Exporte tudo para um arquivo JSON, ou restaure um backup (inclusive os do formato antigo).</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4" /> Exportar
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Importar
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) {
                    setImportError(null);
                    setPendingImport(await file.text());
                  }
                }}
              />
            </div>
            {pendingImport && (
              <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
                <p className="font-medium">Substituir todos os dados atuais pelo backup?</p>
                <p className="text-muted-foreground">Você poderá desfazer logo em seguida.</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={confirmImport}>
                    Substituir
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            {importError && <p className="text-xs text-destructive">{importError}</p>}
          </Section>

          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => ui.setHelpOpen(true)}>
            <Keyboard className="h-4 w-4" /> Atalhos de teclado
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
