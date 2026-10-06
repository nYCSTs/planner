"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { dayFromKey, minutesToTime } from "@/lib/time";
import { duplicateTask } from "@/lib/store/actions";
import { useTasks } from "@/lib/store/hooks";
import { useUI } from "@/components/app/ui-context";
import { cn } from "@/lib/utils";

export function ForkDialog() {
  const ui = useUI();
  const req = ui.duplicateFrom;
  const tasks = useTasks();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [lastReq, setLastReq] = useState(req);

  if (req !== lastReq) {
    setLastReq(req);
    setQuery("");
    setPicked(req?.taskId ?? null);
    setTarget(req?.date ?? "");
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      .slice(0, 60);
  }, [tasks, query]);

  const close = () => ui.setDuplicateFrom(null);

  const confirm = () => {
    if (!picked || !req || !target) {
      return;
    }

    const copy = duplicateTask(picked, req.date, target);
    close();
    ui.closeDetail();
    if (copy) {
      ui.toast("Cópia criada");
      ui.openForm({ taskId: copy.id });
    }
  };

  return (
    <Dialog open={req !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" /> Duplicar tarefa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Para o dia</Label>
          <div className="flex items-center gap-2">
            <Input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="w-44 text-sm" />
            {target && (
              <span className="block truncate text-sm text-muted-foreground first-letter:uppercase">
                {format(dayFromKey(target), "EEEE, d 'de' MMMM", { locale: ptBR })}
              </span>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus={!req?.taskId} value={query} placeholder="Buscar tarefa pelo nome…" className="pl-8" onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="-mx-1 max-h-[40dvh] overflow-y-auto px-1">
          {results.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(t.id)}
                    onDoubleClick={confirm}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent/50",
                      picked === t.id && "bg-accent ring-1 ring-primary/40",
                    )}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{t.title}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {t.startMinute === null ? "Sem horário" : minutesToTime(t.startMinute)}
                        {(t.subtasks?.length ?? 0) > 0 && ` · ${t.subtasks!.length} subtarefa${t.subtasks!.length === 1 ? "" : "s"}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={!picked || !target} onClick={confirm}>
            Duplicar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
