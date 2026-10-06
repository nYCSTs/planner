"use client";

import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUI } from "./ui-context";

export function SyncIndicator() {
  const ui = useUI();
  return (
    <Button variant="ghost" size="icon" onClick={() => ui.setSyncOpen(true)} aria-label="Sincronização" title="Sincronização">
      <CloudOff className="h-4 w-4 text-muted-foreground" />
    </Button>
  );
}
