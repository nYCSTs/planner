"use client";

import { Cloud, CloudAlert, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUI } from "./ui-context";
import { useSyncState } from "./use-sync";

const LABEL: Record<string, string> = {
  off: "Sincronização desativada",
  idle: "Sincronizado",
  syncing: "Sincronizando…",
  offline: "Sem conexão — as mudanças ficam salvas aqui",
  error: "Erro ao sincronizar",
  revoked: "Aparelho removido da sincronização",
};

export function SyncIndicator() {
  const ui = useUI();
  const sync = useSyncState();
  const Icon =
    sync.status === "syncing"
      ? RefreshCw
      : sync.status === "idle"
        ? Cloud
        : sync.status === "error" || sync.status === "revoked"
          ? CloudAlert
          : CloudOff;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => ui.setSyncOpen(true)}
      aria-label={LABEL[sync.status]}
      title={sync.error ? `${LABEL[sync.status]}: ${sync.error}` : LABEL[sync.status]}
    >
      <Icon
        className={cn(
          "h-4 w-4",
          sync.status === "off" && "text-muted-foreground",
          sync.status === "syncing" && "animate-spin text-sky-500",
          sync.status === "offline" && "text-amber-500",
          (sync.status === "error" || sync.status === "revoked") && "text-red-500",
        )}
      />
      {sync.status === "idle" && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
    </Button>
  );
}
