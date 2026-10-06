"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Check,
  Copy,
  KeyRound,
  Laptop,
  LogOut,
  MonitorSmartphone,
  QrCode as QrIcon,
  RefreshCw,
  ScanQrCode,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { hasLocalData } from "@/lib/store/store";
import {
  createVault,
  defaultDeviceName,
  deleteServerData,
  joinWithCode,
  leave,
  listDevices,
  recoverVault,
  removeDevice,
  renameDevice,
  rotateRecovery,
  startPairing,
  syncNow,
  type Device,
} from "@/lib/sync/engine";
import { useUI } from "./ui-context";
import { usePendingPairCode, useSyncState } from "./use-sync";
import { QrCode } from "./qr-code";

type Mode = "merge" | "replace";

function formatCode(code: string): string {
  const c = code.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copiado" : "Copiar"}
    </Button>
  );
}

function deviceIcon(name: string) {
  return /iPhone|Android|iPad/.test(name) ? Smartphone : Laptop;
}

function RecoveryBox({ code, onDone }: { code: string; onDone: () => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-xs">
          <p className="font-semibold">Código de recuperação</p>
          <p className="text-muted-foreground">
            Guarde num lugar seguro. Ele é mostrado só agora e permite recuperar seus dados se você perder todos
            os aparelhos.
          </p>
        </div>
      </div>
      <p className="select-all rounded-lg bg-background px-3 py-2 text-center font-mono text-base font-semibold tracking-wider">
        {code}
      </p>
      <div className="flex gap-2">
        <CopyButton text={code} />
        <Button size="sm" className="ml-auto" onClick={onDone}>
          Já guardei
        </Button>
      </div>
    </div>
  );
}

function QrScanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!Detector) {
      return;
    }

    const detector = new Detector({ formats: ["qr_code"] });
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) {
          return;
        }

        video.current.srcObject = stream;
        await video.current.play();
        while (!stop && video.current) {
          const found = await detector.detect(video.current).catch(() => []);
          const raw = found[0]?.rawValue;
          const m = raw ? /pair=([A-Za-z0-9-]+)/.exec(raw) : null;
          if (m) {
            onCode(m[1]);
            return;
          }

          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError("Não foi possível abrir a câmera.");
      }
    })();

    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="space-y-2">
      <video ref={video} className="aspect-square w-full rounded-xl bg-black object-cover" muted playsInline />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
        Cancelar
      </Button>
    </div>
  );
}

function JoinForm({ initialCode, onDone }: { initialCode: string | null; onDone: () => void }) {
  const [code, setCode] = useState(initialCode ? formatCode(initialCode) : "");
  const [recovery, setRecovery] = useState(false);
  const [name, setName] = useState(defaultDeviceName);
  const [mode, setMode] = useState<Mode>("merge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const localData = hasLocalData();
  const canScan = typeof window !== "undefined" && "BarcodeDetector" in window;

  const onScanned = useCallback((c: string) => {
    setScanning(false);
    setCode(formatCode(c));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (recovery) {
        await recoverVault(code, name.trim() || "Aparelho", mode);
      } else {
        await joinWithCode(code, name.trim() || "Aparelho", mode);
      }

      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao conectar");
    } finally {
      setBusy(false);
    }
  };

  if (scanning) {
    return <QrScanner onCode={onScanned} onClose={() => setScanning(false)} />;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="join-code" className="text-xs text-muted-foreground">
          {recovery ? "Código de recuperação" : "Código mostrado no outro aparelho"}
        </Label>
        <div className="flex gap-2">
          <Input
            id="join-code"
            value={code}
            autoFocus={!initialCode}
            placeholder={recovery ? "XXXX-XXXX-XXXX-XXXX" : "XXXX-XXXX"}
            className="h-10 font-mono text-base tracking-wider uppercase"
            onChange={(e) => setCode(recovery ? e.target.value.toUpperCase() : formatCode(e.target.value))}
          />
          {canScan && !recovery && (
            <Button variant="outline" className="h-10" onClick={() => setScanning(true)} aria-label="Escanear QR">
              <ScanQrCode className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="join-name" className="text-xs text-muted-foreground">
          Nome deste aparelho
        </Label>
        <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {localData && (
        <div className="space-y-1.5 rounded-lg border p-2.5">
          <p className="text-xs font-medium">Este aparelho já tem tarefas. O que fazer com elas?</p>
          {([
            { id: "merge", label: "Juntar com as do outro aparelho", hint: "Recomendado. Nada é perdido." },
            { id: "replace", label: "Apagar as deste aparelho", hint: "Fica só o que está sincronizado." },
          ] as const).map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-accent">
              <input type="radio" name="join-mode" checked={mode === o.id} onChange={() => setMode(o.id)} className="mt-0.5" />
              <span>
                <span className="block text-sm">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full" disabled={busy || code.replace(/-/g, "").length < 8} onClick={() => void submit()}>
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MonitorSmartphone className="h-4 w-4" />}
        Conectar este aparelho
      </Button>
      <button
        type="button"
        onClick={() => {
          setRecovery((r) => !r);
          setCode("");
          setError(null);
        }}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
      >
        {recovery ? "Usar código de pareamento" : "Perdi os outros aparelhos — usar código de recuperação"}
      </button>
    </div>
  );
}

function PairPanel() {
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const generate = useCallback(async () => {
    setError(null);
    try {
      setPairing(await startPairing());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar código");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void generate();
  }, [generate]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  if (!pairing) {
    return <div className="mx-auto h-[200px] w-[200px] animate-pulse rounded-lg bg-muted" />;
  }

  const remaining = Math.max(0, pairing.expiresAt - now);
  const expired = remaining === 0;
  const url = `${location.origin}/#pair=${pairing.code}`;
  const mm = Math.floor(remaining / 60_000);
  const ss = String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0");

  return (
    <div className="space-y-3 text-center">
      <div className={cn("mx-auto w-fit rounded-xl border p-2", expired && "opacity-30 blur-[2px]")}>
        <QrCode value={url} size={200} />
      </div>
      <div>
        <p className="font-mono text-2xl font-semibold tracking-[0.2em]">{formatCode(pairing.code)}</p>
        <p className="text-xs text-muted-foreground">
          {expired ? "Código expirado." : `Válido por ${mm}:${ss} · uso único`}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        No celular, aponte a câmera para o QR. Em outro computador, abra o planner e digite o código em
        &quot;Conectar a um aparelho&quot;.
      </p>
      <Button size="sm" variant="outline" onClick={() => void generate()}>
        <RefreshCw className="h-3.5 w-3.5" /> Gerar outro código
      </Button>
    </div>
  );
}

function ConnectedPanel({ onRecovery }: { onRecovery: (code: string) => void }) {
  const ui = useUI();
  const sync = useSyncState();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "delete" | string | null>(null);
  const [name, setName] = useState(sync.session?.deviceName ?? "");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDevices(await listDevices());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar aparelhos");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha");
    }
  };

  const statusText =
    sync.status === "syncing"
      ? "Sincronizando…"
      : sync.status === "offline"
        ? "Sem conexão — as mudanças ficam salvas e sobem quando voltar."
        : sync.status === "error"
          ? `Erro: ${sync.error}`
          : sync.lastSync
            ? `Sincronizado ${formatDistanceToNow(sync.lastSync, { locale: ptBR, addSuffix: true })}`
            : "Conectado";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
        <ShieldCheck className={cn("h-5 w-5 shrink-0", sync.status === "error" ? "text-red-500" : "text-emerald-500")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Sincronização ativa</p>
          <p className="truncate text-xs text-muted-foreground">{statusText}</p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={() => void syncNow()} aria-label="Sincronizar agora" title="Sincronizar agora">
          <RefreshCw className={cn("h-4 w-4", sync.status === "syncing" && "animate-spin")} />
        </Button>
      </div>

      {adding ? (
        <div className="space-y-2">
          <PairPanel />
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setAdding(false);
              void refresh();
            }}
          >
            Concluir
          </Button>
        </div>
      ) : (
        <Button className="w-full" onClick={() => setAdding(true)}>
          <QrIcon className="h-4 w-4" /> Adicionar aparelho
        </Button>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aparelhos</h3>
        {!devices ? (
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        ) : (
          <ul className="space-y-1">
            {devices.map((d) => {
              const Icon = deviceIcon(d.name);
              return (
                <li key={d.id} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    {d.current ? (
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => name.trim() && name !== d.name && void run(() => renameDevice(name.trim()))}
                        className="h-7 border-transparent px-1 text-sm focus-visible:border-input"
                      />
                    ) : (
                      <p className="truncate text-sm">{d.name}</p>
                    )}
                    <p className="px-1 text-[11px] text-muted-foreground">
                      {d.current ? "Este aparelho" : `Visto ${formatDistanceToNow(d.lastSeenAt, { locale: ptBR, addSuffix: true })}`}
                    </p>
                  </div>
                  {!d.current &&
                    (confirm === d.id ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          void run(async () => {
                            await removeDevice(d.id);
                            setConfirm(null);
                            await refresh();
                          })
                        }
                      >
                        Remover
                      </Button>
                    ) : (
                      <Button size="icon-sm" variant="ghost" onClick={() => setConfirm(d.id)} aria-label={`Remover ${d.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Segurança</h3>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => void run(async () => onRecovery(await rotateRecovery()))}
        >
          <KeyRound className="h-4 w-4" /> Gerar novo código de recuperação
        </Button>
        {confirm === "leave" ? (
          <div className="space-y-2 rounded-lg border p-2.5 text-xs">
            <p>Parar de sincronizar neste aparelho? As tarefas continuam aqui, mas não recebem mais mudanças.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void run(async () => leave())}>
                Parar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setConfirm("leave")}>
            <LogOut className="h-4 w-4" /> Sair da sincronização neste aparelho
          </Button>
        )}
        {confirm === "delete" ? (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
            <p>
              Apagar todos os dados do servidor e desconectar todos os aparelhos? Cada aparelho mantém a cópia local.
              Não dá para desfazer.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  void run(async () => {
                    await deleteServerData();
                    ui.toast("Dados apagados do servidor");
                  })
                }
              >
                Apagar do servidor
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={() => setConfirm("delete")}
          >
            <Trash2 className="h-4 w-4" /> Apagar dados do servidor
          </Button>
        )}
      </section>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function SyncDialog() {
  const ui = useUI();
  const sync = useSyncState();
  const [pairCode, setPairCode] = usePendingPairCode();
  const [step, setStep] = useState<"intro" | "create" | "join">("intro");
  const [recovery, setRecovery] = useState<string | null>(null);
  const [name, setName] = useState(defaultDeviceName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = sync.session !== null;

  const close = () => {
    ui.setSyncOpen(false);
    setPairCode(null);
    setStep("intro");
    setError(null);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setRecovery(await createVault(name.trim() || "Aparelho"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ativar");
    } finally {
      setBusy(false);
    }
  };

  const effectiveStep = pairCode && !connected ? "join" : step;

  return (
    <Dialog open={ui.syncOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4" /> Sincronizar aparelhos
          </DialogTitle>
          {!connected && (
            <DialogDescription>
              Sem conta nem senha: um aparelho cria um cofre e os outros entram lendo um QR code.
            </DialogDescription>
          )}
        </DialogHeader>

        {sync.status === "revoked" && !connected && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            Este aparelho foi removido da sincronização. Os dados locais continuam aqui.
          </p>
        )}

        {recovery ? (
          <RecoveryBox code={recovery} onDone={() => setRecovery(null)} />
        ) : connected ? (
          <ConnectedPanel onRecovery={setRecovery} />
        ) : effectiveStep === "join" ? (
          <div className="space-y-3">
            <JoinForm
              initialCode={pairCode}
              onDone={() => {
                setPairCode(null);
                ui.toast("Aparelho conectado");
              }}
            />
            <Button variant="ghost" size="sm" className="w-full" onClick={() => { setPairCode(null); setStep("intro"); }}>
              Voltar
            </Button>
          </div>
        ) : effectiveStep === "create" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="vault-name" className="text-xs text-muted-foreground">
                Nome deste aparelho
              </Label>
              <Input id="vault-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Suas tarefas sobem para o servidor deste planner e ficam disponíveis para os aparelhos que você
              conectar. Você pode desconectar aparelhos ou apagar tudo do servidor quando quiser.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep("intro")}>
                Voltar
              </Button>
              <Button className="flex-1" disabled={busy} onClick={() => void create()}>
                {busy && <RefreshCw className="h-4 w-4 animate-spin" />} Ativar sincronização
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setStep("create")}
              className="flex items-start gap-3 rounded-xl border p-3 text-left transition hover:bg-accent"
            >
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <span>
                <span className="block text-sm font-medium">Ativar neste aparelho</span>
                <span className="block text-xs text-muted-foreground">
                  É o primeiro aparelho? Comece aqui e depois adicione os outros pelo QR.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStep("join")}
              className="flex items-start gap-3 rounded-xl border p-3 text-left transition hover:bg-accent"
            >
              <ScanQrCode className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
              <span>
                <span className="block text-sm font-medium">Conectar a um aparelho</span>
                <span className="block text-xs text-muted-foreground">
                  Já sincroniza em outro lugar? Leia o QR ou digite o código mostrado lá.
                </span>
              </span>
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
