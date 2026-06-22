"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Settings } from "@/types";

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

const THEMES: { value: Settings["theme"]; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20"
      />
    </div>
  );
}

export function SettingsSheet({
  open,
  onOpenChange,
  settings,
  onChange,
}: SettingsSheetProps) {
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
            <NumberField
              id="nbs"
              label="Avisar antes de iniciar (min)"
              value={settings.notifyBeforeStart}
              onChange={(v) => onChange({ notifyBeforeStart: v })}
            />
            <NumberField
              id="nbe"
              label="Avisar antes de terminar (min)"
              value={settings.notifyBeforeEnd}
              onChange={(v) => onChange({ notifyBeforeEnd: v })}
            />
            <p className="text-xs text-muted-foreground">
              Valores padrão. Cada tarefa pode sobrescrever no cadastro.
            </p>
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
